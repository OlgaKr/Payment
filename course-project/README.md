# Course Project — Merchant Payment Service

This folder has everything you need to run the Merchant Payment Service, the system you'll
test in the course project.

It's the payment backend of a small online shop. It takes card payments through Stripe in test
mode, stores them in PostgreSQL and has a simple web page for checkout. You run it as a
ready-made Docker image, without the source code, so you test it the way you would test a
service at work: from the outside.

---

## Contents

1. [What you need](#1-what-you-need)
2. [Start the service](#2-start-the-service)
3. [Use the web UI](#3-use-the-web-ui)
4. [Stripe test cards](#4-stripe-test-cards)
5. [API reference](#5-api-reference)
6. [Webhooks](#6-webhooks)
7. [Database access](#7-database-access)
8. [Logs and the Stripe Dashboard](#8-logs-and-the-stripe-dashboard)
9. [Stop, restart, reset](#9-stop-restart-reset)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. What you need

- **Docker Desktop** ([download](https://www.docker.com/products/docker-desktop/)) runs the
  service and its database. It works on macOS (Intel and Apple Silicon), Windows and Linux. On
  Windows it needs WSL 2, which the installer sets up for you.
- **A Stripe account.** It's free, and test mode needs no business details or real money
  ([sign up](https://dashboard.stripe.com/register)). The service charges test cards through your
  own account, so you can see every payment in your Stripe Dashboard.
- **A database client**, so you can look inside the database. We recommend
  [DBeaver Community](https://dbeaver.io/download/), but the terminal works too (section 7).
- **Postman, Bruno or curl** to call the API directly.

> Docker Desktop has to run Linux containers. That's the default, so you only need to act if you
> once switched it to Windows containers: right-click the Docker icon in the tray and choose
> _Switch to Linux containers_.

### Get your Stripe test keys

1. Log in to the [Stripe Dashboard](https://dashboard.stripe.com) and make sure **Test mode** is on
   (toggle at the top right).
2. Open **Developers → API keys**: https://dashboard.stripe.com/test/apikeys
3. Copy the **publishable key** (it starts with `pk_test_`) and the **secret key** (it starts
   with `sk_test_`; click _Reveal test key_ to see it).

> Only use test keys. Keys starting with `pk_live_` or `sk_live_` move real money. Keep your
> secret key to yourself and never commit it.

---

## 2. Start the service

### Step 1: Create your `.env` file

The `.env` file holds your Stripe keys. It has to be in this folder, next to `docker-compose.yml`:

```
course-project/
├── docker-compose.yml
├── .env.example
├── .env              ← you create this
└── README.md
```

Copy the template:

```bash
# macOS / Linux
cp .env.example .env

# Windows (PowerShell)
Copy-Item .env.example .env

# Windows (cmd)
copy .env.example .env
```

Open `.env` in any text editor and replace the placeholders with your keys:

```env
STRIPE_SECRET_KEY=sk_test_51Abc...
STRIPE_PUBLISHABLE_KEY=pk_test_51Abc...
```

> On macOS, files that start with a dot are hidden in Finder. Press **Cmd + Shift + .** to show
> them, or open the file from the terminal: `open -e .env`

### Step 2: Start it

In a terminal, from this folder, run:

```bash
docker compose up -d
```

The first time, Docker downloads the images (about 200 MB). Then check the status:

```bash
docker compose ps
```

Wait until `api` shows `healthy`. It takes 15–30 seconds:

```
NAME                   IMAGE                                  STATUS
course-project-api-1   ghcr.io/yyushchenko/merchant-api:1.0   Up 20 seconds (healthy)
course-project-db-1    postgres:16-alpine                     Up 25 seconds (healthy)
```

### Step 3: Check it works

Open http://localhost:3000/api/health. You should see:

```json
{ "status": "ok", "db": "connected", "timestamp": "2026-10-08T10:00:00.000Z" }
```

Then open the shop at http://localhost:3000/checkout.

> Always run `docker compose` commands from this folder. Docker uses the folder to find the
> project, so from anywhere else it won't see your containers.

---

## 3. Use the web UI

| Page         | URL                                        | What it does                                                                                                              |
| ------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **Checkout** | http://localhost:3000/checkout             | Pay with a test card. Tick **Manual capture** to only _authorize_ the payment (the money is reserved, and captured later) |
| **Success**  | http://localhost:3000/success?payment_id=… | Shown after paying: payment ID, amount, status                                                                            |
| **Payments** | http://localhost:3000/payments             | All payments, with **Refund** (for captured payments) and **Capture** (for authorized payments) buttons and pagination    |

Two things that help while testing:

- The Network tab in your browser's DevTools (F12) shows every API call the pages make, with
  the full request and response.
- Page elements have `data-testid` attributes for UI automation with Playwright or Cypress, for
  example
  `email`, `amount`, `pay-button`, `error-message`, `manual-capture`, `confirmation`, `payment-id`,
  `payments-table`, `payment-row`, `payment-status`, `refund-button`, `capture-button`,
  `prev-page`, `next-page`, `page-info`, `message`.

---

## 4. Stripe test cards

Use any expiry date in the future (e.g. `12/34`) and any 3-digit CVC.

| Card number           | Result                                                                     |
| --------------------- | -------------------------------------------------------------------------- |
| `4242 4242 4242 4242` | Success                                                                    |
| `4000 0566 5566 5556` | Success (Visa debit)                                                       |
| `5555 5555 5555 4444` | Success (Mastercard)                                                       |
| `4000 0000 0000 0002` | Declined: `generic_decline`                                                |
| `4000 0000 0000 9995` | Declined: `insufficient_funds`                                             |
| `4000 0000 0000 9987` | Declined: `lost_card`                                                      |
| `4000 0000 0000 0069` | Declined: `expired_card`                                                   |
| `4000 0000 0000 0127` | Declined: `incorrect_cvc`                                                  |
| `4000 0027 6000 3184` | **3D Secure**: a popup asks you to **Complete** or **Fail** authentication |

When you call the API directly, you don't send card numbers. You pass a test PaymentMethod ID in
the `payment_method` field instead:

| `payment_method`                          | Result                                     |
| ----------------------------------------- | ------------------------------------------ |
| `pm_card_visa`                            | Success                                    |
| `pm_card_mastercard`                      | Success                                    |
| `pm_card_chargeDeclined`                  | Declined: `generic_decline`                |
| `pm_card_chargeDeclinedInsufficientFunds` | Declined: `insufficient_funds`             |
| `pm_card_chargeDeclinedExpiredCard`       | Declined: `expired_card`                   |
| `pm_card_chargeDeclinedIncorrectCvc`      | Declined: `incorrect_cvc`                  |
| `pm_card_chargeDeclinedLostCard`          | Declined: `lost_card`                      |
| `pm_card_threeDSecure2Required`           | Needs 3D Secure → status `requires_action` |

Full list: https://docs.stripe.com/testing

---

## 5. API reference

The API is documented in two files in this folder:

- [**`API.md`**](API.md) describes each endpoint: request fields, responses, payment statuses,
  error codes and examples. Start here when writing test cases.
- [**`openapi.yaml`**](openapi.yaml) is the same API as an OpenAPI 3 file. Import it into
  Postman or Bruno to get all the requests ready to send, or open it in
  [Swagger Editor](https://editor.swagger.io).

Overview (base URL `http://localhost:3000`, amounts in cents):

| Method | Path                         | Purpose                                      |
| ------ | ---------------------------- | -------------------------------------------- |
| `POST` | `/api/payments`              | Create (and confirm) a payment               |
| `GET`  | `/api/payments`              | List payments (`page`, `limit`, `status`)    |
| `GET`  | `/api/payments/{id}`         | Get one payment                              |
| `POST` | `/api/payments/{id}/capture` | Capture an authorized payment                |
| `POST` | `/api/payments/{id}/refund`  | Refund a payment (fully or partially)        |
| `POST` | `/api/webhooks`              | Receive Stripe events                        |
| `GET`  | `/api/health`                | Service and database health                  |
| `GET`  | `/api/config`                | Stripe publishable key for the checkout page |

Quick start:

```bash
curl -X POST http://localhost:3000/api/payments \
  -H "Content-Type: application/json" \
  -d '{"amount": 5000, "payment_method": "pm_card_visa", "customer_email": "me@example.com"}'

curl "http://localhost:3000/api/payments?limit=5"
```

---

## 6. Webhooks

In production, Stripe sends events (payment succeeded, refunded, …) to the service's
`/api/webhooks` endpoint. Locally, Stripe can't reach your computer, so you have two options:

**Option A: forward real Stripe events with the Stripe CLI (included)**

```bash
docker compose --profile webhooks up -d
docker compose logs -f stripe-cli
```

The `stripe-cli` container listens to your Stripe account and forwards each event to the
service. Its logs show every delivery:

```
--> payment_intent.succeeded [evt_…]
<-- [200] POST http://api:3000/api/webhooks [evt_…]
```

**Option B: send events yourself** with Postman or curl to `POST http://localhost:3000/api/webhooks`
(details in [API.md](API.md#post-apiwebhooks)).
A Stripe event looks like this (abbreviated):

```json
{
  "id": "evt_1Abc...",
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "pi_3Abc...",
      "object": "payment_intent",
      "status": "succeeded",
      "amount": 5000
    }
  }
}
```

Event format reference: https://docs.stripe.com/api/events/object

---

## 7. Database access

The service keeps its data in PostgreSQL. You can connect to it from your computer:

| Setting      | Value                                          |
| ------------ | ---------------------------------------------- |
| Host         | `localhost`                                    |
| **Port**     | **`5433`** (not the default 5432)              |
| **Database** | **`payments_db`** (not `postgres`)             |
| User         | `payments`                                     |
| Password     | `payments`                                     |
| JDBC URL     | `jdbc:postgresql://localhost:5433/payments_db` |

### Tables

| Table            | Contents                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `payments`       | One row per payment: amount, status, Stripe PaymentIntent ID, customer email, …            |
| `refunds`        | One row per refund: `payment_id` → `payments.id`, amount, status, Stripe refund ID, reason |
| `webhook_events` | Every webhook the service received: event ID, type, full JSON payload                      |

### Option 1: DBeaver

1. **Database → New Database Connection → PostgreSQL → Next.**
2. **Main** tab: Host `localhost`, Port **`5433`**, Database **`payments_db`**, Username `payments`,
   Password `payments`.
3. **Test Connection.** On the first connection, DBeaver offers to download the PostgreSQL driver:
   accept. Then **Finish**.
4. In the **Database Navigator**, expand:
   ```
   your connection → Databases → payments_db → Schemas → public → Tables
   ```
5. Double-click a table → **Data** tab. Or open an SQL editor (**Ctrl + ]**) and run queries.

**Don't see any tables?**

- Make sure **Database** is `payments_db`. The default `postgres` database is empty.
- Make sure **Port** is `5433`. On 5432 you might be connecting to a different PostgreSQL
  installed on your computer.
- Select the connection and press **F5** (refresh). DBeaver caches the tree.
- Check you're expanding **payments_db** (not `postgres`) under **Databases**.
- Run this in the SQL editor: if it lists 3 tables, the connection is fine and only the tree view
  needs a refresh:
  ```sql
  SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
  ```

### Option 2: Terminal (no install)

```bash
docker compose exec db psql -U payments payments_db
```

```sql
\dt                      -- list tables
\d payments              -- columns of a table
SELECT id, status, amount, customer_email, created_at FROM payments ORDER BY created_at DESC LIMIT 10;
SELECT * FROM refunds ORDER BY created_at DESC LIMIT 10;
\x                       -- toggle vertical output (for wide rows)
\q                       -- quit
```

---

## 8. Logs and the Stripe Dashboard

### Service logs

```bash
docker compose logs api          # everything so far
docker compose logs -f api       # follow live (Ctrl+C to stop)
```

Each line has a timestamp:

```
[2026-10-08T10:00:00.000Z] POST /api/payments — amount=5000, currency=usd
[2026-10-08T10:00:01.000Z] Stripe PI created: pi_3Abc...
[2026-10-08T10:00:01.000Z] Payment saved: 6f805049-...
```

### Stripe Dashboard

Every payment the service makes also appears in your Stripe account, under
[Payments](https://dashboard.stripe.com/test/payments) in test mode. To compare what Stripe has
with what the service reports, search for the payment's `stripe_pi_id` (it starts with `pi_`).
The payment page in Stripe shows how much was captured and refunded, and a timeline of what
happened. [Developers → Events](https://dashboard.stripe.com/test/events) lists every event
Stripe sent.

> In test mode, every payment made with the same test card counts as the same card. So for a
> payment without an email, the Dashboard's "Charged to …" line may show an email you used
> earlier with that card. The payment's details section shows what was really sent.

---

## 9. Stop, restart, reset

### After restarting your computer

1. Start Docker Desktop and wait until it's running. If you don't want to do this every time,
   turn on _Settings → General → Start Docker Desktop when you sign in_.
2. Usually that's it. The service starts again on its own once Docker is running, and your data
   is still there. To check, run `docker compose ps` in this folder; `api` should be `healthy`.
3. If it's not running (for example, because you stopped it before shutting down), start it:
   ```bash
   docker compose up -d
   ```

You can run `docker compose up -d` at any time. It starts whatever isn't running and leaves
the rest alone. Your data stays until you run `docker compose down -v`.

### Commands

| Command (in this folder)                 | Effect                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `docker compose up -d`                   | Start (or resume) the service. Safe to run any time                               |
| `docker compose stop`                    | Stop. Data is kept. It stays stopped after a computer restart                     |
| `docker compose start`                   | Start again after `stop`                                                          |
| `docker compose down`                    | Stop and remove the containers. Data is kept                                      |
| `docker compose down -v`                 | Stop, remove containers **and delete all data** (fresh, empty database next time) |
| `docker compose pull`                    | Download a newer version of the service, if your instructor publishes one         |
| `docker compose --profile webhooks down` | Also stop `stripe-cli`, if you started it                                         |

---

## 10. Troubleshooting

| Problem                                                                             | Fix                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **http://localhost:3000 can't be reached**                                          | Is Docker Desktop running (e.g. after a computer restart)? Then run `docker compose ps` _in this folder_. If nothing is listed or `api` isn't running, run `docker compose up -d`. If `api` isn't `healthy`, check `docker compose logs api`               |
| **`port is already allocated`** (3000 or 5433)                                      | Something else uses the port: another copy of this project, or another app. Stop it, or change the left-hand port in `docker-compose.yml` (e.g. `"3001:3000"`, then use http://localhost:3001)                                                             |
| **Creating a payment returns 500**                                                  | Usually a wrong Stripe secret key. `docker compose logs api` shows `Invalid API Key provided`. Fix `STRIPE_SECRET_KEY` in `.env`, then `docker compose up -d` (it picks up the new keys)                                                                   |
| **Capture or refund returns 200, but nothing changes in the Stripe Dashboard**      | Check your Stripe key first: `docker compose logs api` shows lines like `Stripe capture error: Invalid API Key provided` or `Stripe refund error: Invalid API Key provided`. Fix `.env`, run `docker compose up -d`, then test again with **new** payments |
| **Checkout: clicking Pay shows an API-key error, or the card field doesn't appear** | Wrong or missing `STRIPE_PUBLISHABLE_KEY` in `.env` (it must start with `pk_test_`). Fix it, then `docker compose up -d`. Check with http://localhost:3000/api/config                                                                                      |
| **Not sure which keys Docker picked up**                                            | Run `docker compose config`. It prints the final configuration, including the values from `.env`                                                                                                                                                           |
| **`.env` seems ignored**                                                            | It must be named exactly `.env` (not `.env.txt`), and be in **this** folder. On Windows, enable _File name extensions_ in Explorer to see the real name                                                                                                    |
| **`no matching manifest` / `image not found`**                                      | Docker Desktop is in _Windows containers_ mode: switch to Linux containers (section 1)                                                                                                                                                                     |
| **`docker: command not found`**                                                     | Docker Desktop isn't installed, or not running: start it and wait until it's ready                                                                                                                                                                         |
| **DBeaver shows no tables**                                                         | See section 7, _Don't see any tables?_                                                                                                                                                                                                                     |
| **I want a clean start**                                                            | `docker compose down -v`, then `docker compose up -d`                                                                                                                                                                                                      |
