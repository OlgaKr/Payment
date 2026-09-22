// tests/webhook.test.ts
//
// Homework Lesson 6 — Testing webhooks
//
// Your task: implement the three tests marked as TODO.
// Helpers and setup are already in place — use them.

import request from "supertest";
import Stripe from "stripe";
import "dotenv/config";
import { app } from "../src/server";
import { db } from "../src/db";

// ── Setup ─────────────────────────────────────────────────────────────

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

// ── Helper: create a valid signature ─────────────────────────────────
//
// stripe.webhooks.generateTestHeaderString() generates the
// "Stripe-Signature" header exactly the same way Stripe does.
// Use it in tests to simulate a valid webhook.

function createValidSignature(payload: string): string {
  return stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
}

// ── Helper: create a webhook event body ──────────────────────────────

function createWebhookPayload(
  eventId: string,
  type: string,
  paymentIntentId: string,
  amount = 1500,
): string {
  return JSON.stringify({
    id: eventId,
    type,
    data: {
      object: {
        id: paymentIntentId,
        status: type === "payment_intent.succeeded" ? "succeeded" : "failed",
        amount,
      },
    },
  });
}

beforeEach(() => {
  db.clear(); // reset state before each test
});

// ══════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════

describe("Webhook endpoint", () => {
  // ── TODO 1 ───────────────────────────────────────────────────────
  //
  // Test: valid webhook → 200 and transaction status updated in DB
  //
  // What to do:
  //   1. Create a payload with a "payment_intent.succeeded" event
  //      (use createWebhookPayload above)
  //   2. Sign the payload (use createValidSignature)
  //   3. Send POST /webhooks via supertest
  //   4. Check that the response is 200
  //   5. Check that db.getTransaction(paymentIntentId)?.status === "succeeded"

  it("valid webhook returns 200 and updates transaction status", async () => {
    // --- YOUR CODE HERE ---
    // --------------------
  });

  // ── TODO 2 ───────────────────────────────────────────────────────
  //
  // Test: invalid signature → 401
  //
  // What to do:
  //   1. Create a payload
  //   2. Send a request with an INVALID signature: "t=123,v1=fakehash"
  //   3. Check that the response is 401
  //   4. Check that the transaction was NOT saved in the DB

  it("invalid signature returns 401 and does not update DB", async () => {
    // --- YOUR CODE HERE ---
    // --------------------
  });

  // ── TODO 3 ───────────────────────────────────────────────────────
  //
  // Test: duplicate webhook → idempotent processing
  //
  // What to do:
  //   1. Create a payload with a unique eventId
  //   2. Send the same webhook TWICE (identical payload and signature)
  //   3. Check that db.getUpdateCount(paymentIntentId) === 1
  //      (the transaction was updated exactly once, not twice)
  //
  // Hint: the second request also returns 200 (that's expected)
  //       but the DB should not be updated a second time

  it("duplicate webhook is processed only once", async () => {
    // --- YOUR CODE HERE ---
    // --------------------
  });

  // ── BONUS (optional) ────────────────────────────────────────────
  //
  // Idea for an extra test if you want to go deeper:
  // Test: webhook "payment_intent.payment_failed" → status "failed"
});
