#!/bin/bash
# ════════════════════════════════════════════════════════════════
# Lesson 6
# Student setup guide: run the webhook server and trigger Stripe events
#
# This file is not meant to be executed top to bottom — copy commands
# into your terminal one section at a time, in order.
# ════════════════════════════════════════════════════════════════


# ════════════════════════════════════════════════════════════════
# STEP 0: CHECK YOUR TOOLING
# ════════════════════════════════════════════════════════════════

# Node.js (need version 18+)
node --version
# Expected: v18.x.x or v20.x.x

# npm
npm --version

# Stripe CLI
stripe --version
# Expected: stripe version x.x.x
# If missing:
#   macOS:   brew install stripe/stripe-cli/stripe
#   Linux:   https://docs.stripe.com/stripe-cli#install
#   Windows: scoop install stripe


# ════════════════════════════════════════════════════════════════
# STEP 1: LOG IN TO THE STRIPE CLI
# Do this ONCE (the session persists between terminal restarts)
# ════════════════════════════════════════════════════════════════

stripe login
# → A browser tab opens → click "Allow access" → Done
# → The terminal shows: "Your pairing code is: xxx-xxx-xxx"
# → Confirm the pairing code in the browser

# Verify:
stripe config --list
# Should show test_mode_api_key and account_id


# ════════════════════════════════════════════════════════════════
# STEP 2: SET UP THE WEBHOOK SERVER
# ════════════════════════════════════════════════════════════════

# Go to the webhook-template folder (from the repo root)
cd webhook-template

# Install dependencies
npm install

# Sanity-check that it starts:
npm run dev
# Expected: "Server started: http://localhost:3000"
# Ctrl+C to stop (we'll start it again for the real run in Step 5)


# ════════════════════════════════════════════════════════════════
# STEP 3: GET YOUR STRIPE TEST KEY
# ════════════════════════════════════════════════════════════════

export STRIPE_KEY=sk_test_YOUR_KEY

# Verify it works:
curl https://api.stripe.com/v1/payment_intents \
  -u $STRIPE_KEY: \
  -d amount=100 \
  -d currency=usd \
  -d "payment_method_types[]=card" \
  2>/dev/null | python3 -m json.tool | grep status
# Should show: "status": "requires_payment_method"


# ════════════════════════════════════════════════════════════════
# STEP 4: SET UP THE .env FILE
# ════════════════════════════════════════════════════════════════

# Inside webhook-template, copy the example file and fill in your own values:
cp .env.example .env

# Then edit .env and replace:
#   STRIPE_KEY=sk_test_YOUR_KEY               → your own test key from Step 3
#   STRIPE_WEBHOOK_SECRET=whsec_COPY_...       → the whsec_ from `stripe listen` (Step 5)

# .env is gitignored — your keys never get committed.
# STRIPE_WEBHOOK_SECRET changes every time you run `stripe listen`,
# so update it whenever you restart the listener (see Step 5).


# ════════════════════════════════════════════════════════════════
# STEP 5: RUN THE FULL FLOW
# Open 3 terminals and follow along
# ════════════════════════════════════════════════════════════════

# ──── TERMINAL 1: webhook server ────
cd webhook-template
npm run dev
# You should see: "Server started: http://localhost:3000"
# Keep this terminal open!

# ──── TERMINAL 2: Stripe CLI listener ────
stripe listen --forward-to localhost:3000/webhooks
# You should see:
#   > Ready! Your webhook signing secret is whsec_xxx...
#   (copy whsec_xxx into .env as STRIPE_WEBHOOK_SECRET, then restart Terminal 1)
# Keep this terminal open!

# ──── TERMINAL 3: trigger events ────

# Test 1: Successful payment
stripe trigger payment_intent.succeeded
# In Terminal 2 you should see:
#   2024-01-15 10:30:00   --> payment_intent.created [evt_xxx]
#   2024-01-15 10:30:00   --> charge.created [evt_xxx]
#   2024-01-15 10:30:00   --> payment_intent.succeeded [evt_xxx]
#   2024-01-15 10:30:00  <-- [200] POST http://localhost:3000/webhooks
# In Terminal 1 you should see your server's logs

# Test 2: Failed payment
stripe trigger payment_intent.payment_failed
# In Terminal 2:
#   --> payment_intent.payment_failed [evt_xxx]
#   <-- [200] POST http://localhost:3000/webhooks

# Test 3: Refund
stripe trigger charge.refunded
# In Terminal 2:
#   --> charge.refunded [evt_xxx]
#   <-- [200] POST http://localhost:3000/webhooks

# Test 4: Dispute
stripe trigger charge.dispute.created
# In Terminal 2:
#   --> charge.dispute.created [evt_xxx]
#   <-- [200] POST http://localhost:3000/webhooks

# Test 5: What happens if the server is down
# Stop Terminal 1 (Ctrl+C)
stripe trigger payment_intent.succeeded
# In Terminal 2:
#   --> payment_intent.succeeded [evt_xxx]
#   <-- [failed] POST http://localhost:3000/webhooks
# Start the server again in Terminal 1 — Stripe will retry the delivery


# ════════════════════════════════════════════════════════════════
# SELF-CHECK: AM I SET UP CORRECTLY?
# Run this before you start triggering real events
# ════════════════════════════════════════════════════════════════

echo "=== SELF-CHECK ==="
echo ""

# 1. Node.js works?
node --version && echo "OK: Node.js" || echo "FAIL: Node.js"

# 2. Stripe CLI works?
stripe --version && echo "OK: Stripe CLI" || echo "FAIL: Stripe CLI"

# 3. Stripe CLI logged in?
stripe config --list 2>/dev/null | grep -q "test_mode" && echo "OK: Stripe logged in" || echo "FAIL: run stripe login"

# 4. npm dependencies installed?
test -d node_modules && echo "OK: npm installed" || echo "FAIL: run npm install"

# 5. Port 3000 free?
lsof -i :3000 >/dev/null 2>&1 && echo "FAIL: Port 3000 busy" || echo "OK: Port 3000 free"

# 6. STRIPE_KEY set?
test -n "$STRIPE_KEY" && echo "OK: STRIPE_KEY set" || echo "FAIL: export STRIPE_KEY=..."

echo ""
echo "If everything above is OK — you're ready to go!"


# ════════════════════════════════════════════════════════════════
# PLAN B: IF THE STRIPE CLI DOESN'T WORK FOR YOU
# ════════════════════════════════════════════════════════════════

# Fallback: send fake webhooks with curl instead of the Stripe CLI
# Downside: no signature verification (no whsec_ secret)
# Upside:   always works, no CLI/login needed

# Send a fake "payment succeeded" webhook to your local server:
curl -X POST http://localhost:3000/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt_demo_001",
    "type": "payment_intent.succeeded",
    "created": 1705312800,
    "data": {
      "object": {
        "id": "pi_demo_001",
        "object": "payment_intent",
        "status": "succeeded",
        "amount": 15000,
        "currency": "usd"
      }
    }
  }'
# The server should handle it and return 200
# Note: with no Stripe-Signature header, signature verification will fail.
# To test without verification, temporarily comment out the signature check.

# Send a fake "payment failed" webhook:
curl -X POST http://localhost:3000/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt_demo_002",
    "type": "payment_intent.payment_failed",
    "created": 1705312900,
    "data": {
      "object": {
        "id": "pi_demo_002",
        "object": "payment_intent",
        "status": "requires_payment_method",
        "amount": 15000,
        "currency": "usd",
        "last_payment_error": {
          "code": "card_declined",
          "decline_code": "insufficient_funds",
          "message": "Your card has insufficient funds."
        }
      }
    }
  }'

# Idempotency test:
# Send the same evt_demo_001 a second time
curl -X POST http://localhost:3000/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt_demo_001",
    "type": "payment_intent.succeeded",
    "created": 1705312800,
    "data": {
      "object": {
        "id": "pi_demo_001",
        "status": "succeeded",
        "amount": 15000
      }
    }
  }'
# The server should respond 200 but NOT process it again.
# Look for a log line like: "Event evt_demo_001 already processed, skipping"


# ════════════════════════════════════════════════════════════════
# TROUBLESHOOTING
# ════════════════════════════════════════════════════════════════

# "stripe login" doesn't open a browser:
stripe login --interactive
# Or: stripe login --api-key sk_test_YOUR_KEY

# "stripe listen" shows an authorization error:
stripe login  # log in again

# Server won't start — port already in use:
kill -9 $(lsof -t -i :3000) 2>/dev/null
npm run dev

# "SignatureVerificationError":
# The whsec_ from `stripe listen` doesn't match the one in .env.
# Copy the new whsec_ from Terminal 2 → update .env → restart the server.

# Webhook arrives but the handler doesn't process it:
# Check: does server.ts have a /webhooks route?
# Check: does that route use express.raw() and not express.json()?

# "stripe trigger" returns an error:
stripe trigger --help  # see available events
stripe trigger payment_intent.succeeded --stripe-account default
