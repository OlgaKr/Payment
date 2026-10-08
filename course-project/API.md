# Merchant Payment Service — API Reference

The service runs at `http://localhost:3000` and speaks JSON, so send
`Content-Type: application/json` with every request that has a body. There's no authentication.

A few conventions used everywhere:

- Amounts are integers in cents: `5000` means $50.00. The only currency is `usd`.
- Payments and refunds have UUIDs, like `6f805049-2e90-4945-9a27-c6d02692d985`. Objects that
  come from Stripe keep Stripe's IDs (`pi_…`, `re_…`, `evt_…`).
- Timestamps are ISO 8601 in UTC, like `2026-10-08T10:00:00.000Z`.

The same API is also described in [`openapi.yaml`](openapi.yaml), which you can import into
Postman or Bruno (see the end of this page).

---

## Endpoints

| Method | Path                                                       | Purpose                                 |
| ------ | ---------------------------------------------------------- | --------------------------------------- |
| `POST` | [`/api/payments`](#post-apipayments)                       | Create (and confirm) a payment          |
| `GET`  | [`/api/payments`](#get-apipayments)                        | List payments                           |
| `GET`  | [`/api/payments/{id}`](#get-apipaymentsid)                 | Get one payment                         |
| `POST` | [`/api/payments/{id}/capture`](#post-apipaymentsidcapture) | Capture an authorized payment           |
| `POST` | [`/api/payments/{id}/refund`](#post-apipaymentsidrefund)   | Refund a payment                        |
| `POST` | [`/api/webhooks`](#post-apiwebhooks)                       | Receive Stripe events                   |
| `GET`  | [`/api/health`](#get-apihealth)                            | Service and database health             |
| `GET`  | [`/api/config`](#get-apiconfig)                            | Stripe publishable key for the frontend |

---

## Objects

### Payment

| Field             | Type               | Description                                                                          |
| ----------------- | ------------------ | ------------------------------------------------------------------------------------ |
| `id`              | string (UUID)      | Payment ID in this service                                                           |
| `stripe_pi_id`    | string             | Stripe PaymentIntent ID (`pi_…`). Use it to find the payment in the Stripe Dashboard |
| `amount`          | integer            | Amount in cents                                                                      |
| `currency`        | string             | Always `usd`                                                                         |
| `status`          | string             | See [Payment statuses](#payment-statuses)                                            |
| `capture_method`  | string             | `automatic` or `manual`                                                              |
| `customer_email`  | string \| null     | Customer email (also used as Stripe's receipt email)                                 |
| `description`     | string \| null     | Free text                                                                            |
| `metadata`        | object             | Reserved, currently always `{}`                                                      |
| `idempotency_key` | string \| null     | The key sent when the payment was created                                            |
| `created_at`      | string (date-time) | When the payment was created                                                         |
| `updated_at`      | string (date-time) | Last change                                                                          |

### Payment statuses

```
                  ┌──────────────────┐
  POST /payments ─┤ capture_method   │
                  └──────────────────┘
        automatic │          │ manual
                  ▼          ▼
            succeeded   requires_capture ──capture──▶ succeeded
                  │                                     │
               refund                                 refund
                  ▼                                     ▼
              refunded                              refunded

  3D Secure card ──▶ requires_action ──(customer completes)──▶ succeeded / requires_capture
                                     └─(customer fails)──────▶ failed
  Declined card  ──▶ failed
```

| `status`           | Meaning                                        | Allowed actions                          |
| ------------------ | ---------------------------------------------- | ---------------------------------------- |
| `succeeded`        | Paid: money captured                           | Refund                                   |
| `requires_capture` | Authorized only: money reserved, not captured  | Capture                                  |
| `requires_action`  | Waiting for the customer to complete 3D Secure | (none: the customer acts in the browser) |
| `failed`           | Declined, or 3D Secure failed                  | (none)                                   |
| `canceled`         | Canceled in Stripe                             | (none)                                   |
| `refunded`         | The full amount has been refunded              | (none)                                   |

`requires_action` payments are re-checked with Stripe whenever they're read
(`GET /api/payments`, `GET /api/payments/{id}`), so their status catches up after 3D Secure.

### Refund

| Field              | Type               | Description                 |
| ------------------ | ------------------ | --------------------------- |
| `id`               | string (UUID)      | Refund ID in this service   |
| `payment_id`       | string (UUID)      | The refunded payment        |
| `stripe_refund_id` | string             | Stripe Refund ID (`re_…`)   |
| `amount`           | integer            | Refunded amount in cents    |
| `status`           | string             | `succeeded`                 |
| `reason`           | string \| null     | Free text from the request  |
| `created_at`       | string (date-time) | When the refund was created |

### Error

Every error response has the same shape:

```json
{
  "error": {
    "type": "validation_error",
    "message": "amount must be a positive integer (in cents)"
  }
}
```

| HTTP | `error.type`       | When                                                                         | Extra fields           |
| ---- | ------------------ | ---------------------------------------------------------------------------- | ---------------------- |
| 400  | `validation_error` | Invalid input: missing or wrong field, invalid ID                            |                        |
| 400  | `invalid_state`    | The action isn't allowed for the payment's current status                    |                        |
| 400  | `invalid_request`  | Malformed JSON, or Stripe rejected the request (`message` comes from Stripe) |                        |
| 402  | `card_error`       | The card was declined                                                        | `code`, `decline_code` |
| 404  | `not_found`        | No payment with this ID, or unknown route                                    |                        |
| 500  | `server_error`     | Unexpected error: see `docker compose logs api`                              |                        |

---

## `POST /api/payments`

Creates a Stripe PaymentIntent and confirms it immediately with the given payment method.

### Request body

```json
{
  "amount": 5000,
  "currency": "usd",
  "payment_method": "pm_card_visa",
  "capture_method": "automatic",
  "customer_email": "test@example.com",
  "description": "Order #123",
  "idempotency_key": "order-123"
}
```

| Field             | Type    | Required | Rules                                                                                                                                                                                                           |
| ----------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `amount`          | integer | **yes**  | > 0, in cents. Stripe's minimum is `50` ($0.50)                                                                                                                                                                 |
| `currency`        | string  | no       | `usd` (default). Must be 3 letters; other currencies are rejected                                                                                                                                               |
| `payment_method`  | string  | **yes**  | A Stripe PaymentMethod ID. Test values: [Test payment methods](#test-payment-methods)                                                                                                                           |
| `capture_method`  | string  | no       | `automatic` (default): charge now. `manual`: only authorize; capture later with `/capture`                                                                                                                      |
| `customer_email`  | string  | no       | A valid email address                                                                                                                                                                                           |
| `description`     | string  | no       | Free text                                                                                                                                                                                                       |
| `idempotency_key` | string  | no       | A unique key for this _intended_ payment, e.g. an order ID. Clients may safely **retry** a request (after a timeout or network error) with the same key: a retried request must **not** create a second payment |

### Responses

**201 Created**: the [Payment](#payment) plus `client_secret` (a Stripe secret the checkout page
needs to run 3D Secure in the browser; it's only returned in this response).

```json
{
  "id": "6f805049-2e90-4945-9a27-c6d02692d985",
  "stripe_pi_id": "pi_3UNvqXQpcYDzu4Ef0gYInc7D",
  "client_secret": "pi_3UNvqXQpcYDzu4Ef0gYInc7D_secret_Rk3…",
  "amount": 5000,
  "currency": "usd",
  "status": "succeeded",
  "capture_method": "automatic",
  "customer_email": "test@example.com",
  "description": "Order #123",
  "metadata": {},
  "idempotency_key": "order-123",
  "created_at": "2026-10-08T10:00:00.000Z",
  "updated_at": "2026-10-08T10:00:00.000Z"
}
```

| `capture_method` / card | `status` in the response |
| ----------------------- | ------------------------ |
| `automatic`             | `succeeded`              |
| `manual`                | `requires_capture`       |
| 3D Secure card          | `requires_action`        |

**402 Payment Required**: the card was declined. The attempt is still recorded as a payment with
status `failed`.

```json
{
  "error": {
    "type": "card_error",
    "code": "card_declined",
    "message": "Your card was declined.",
    "decline_code": "insufficient_funds"
  }
}
```

**400 Bad Request**: examples:

| Request                             | `error.type`       | `error.message`                                  |
| ----------------------------------- | ------------------ | ------------------------------------------------ |
| `"amount": 0` or `10.5` or `"5000"` | `validation_error` | `amount must be a positive integer (in cents)`   |
| `"amount": 10`                      | `invalid_request`  | `Amount must be at least $0.50 USD`              |
| `"currency": "eur"`                 | `validation_error` | `Only usd is supported`                          |
| no `payment_method`                 | `validation_error` | `payment_method is required`                     |
| `"capture_method": "later"`         | `validation_error` | `capture_method must be "automatic" or "manual"` |
| `"customer_email": "not-an-email"`  | `invalid_request`  | `Invalid email address: not-an-email`            |
| body `{bad`                         | `invalid_request`  | `Invalid JSON body`                              |

---

## `GET /api/payments`

Lists payments, newest first.

### Query parameters

| Param    | Type    | Default | Rules                                               |
| -------- | ------- | ------- | --------------------------------------------------- |
| `page`   | integer | `1`     | ≥ 1 (smaller or invalid values → 1)                 |
| `limit`  | integer | `20`    | 1–100 (larger values → 100, invalid → 20)           |
| `status` | string  | (all)   | Only payments with this [status](#payment-statuses) |

Example: `GET /api/payments?page=2&limit=10&status=succeeded`

### Response

**200 OK**

```json
{
  "payments": [
    {
      "id": "6f805049-2e90-4945-9a27-c6d02692d985",
      "stripe_pi_id": "pi_3UNvqXQpcYDzu4Ef0gYInc7D",
      "amount": 5000,
      "currency": "usd",
      "status": "succeeded",
      "capture_method": "automatic",
      "customer_email": "test@example.com",
      "description": "Order #123",
      "metadata": {},
      "idempotency_key": "order-123",
      "created_at": "2026-10-08T10:00:00.000Z",
      "updated_at": "2026-10-08T10:00:00.000Z"
    }
  ],
  "total": 42,
  "page": 2,
  "limit": 10
}
```

| Field           | Description                                          |
| --------------- | ---------------------------------------------------- |
| `payments`      | [Payment](#payment) objects on this page             |
| `total`         | Number of payments matching the filter (all pages)   |
| `page`, `limit` | The values actually used (after defaults and limits) |

---

## `GET /api/payments/{id}`

| Path param | Rules        |
| ---------- | ------------ |
| `id`       | Payment UUID |

**200 OK**: the [Payment](#payment) (same fields as in the list).

| Error                      | When                     |
| -------------------------- | ------------------------ |
| **400** `validation_error` | `id` is not a valid UUID |
| **404** `not_found`        | No payment with this ID  |

---

## `POST /api/payments/{id}/capture`

Captures a payment that was only authorized (`capture_method: "manual"`, status
`requires_capture`).

### Request body (optional)

```json
{ "amount": 5000 }
```

| Field    | Type    | Required | Rules                                                                                                                                                                          |
| -------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `amount` | integer | no       | Amount to capture, in cents. Default: the full authorized amount. May be **less** than authorized (partial capture: the rest is released). May **not** be more than authorized |

### Responses

**200 OK**: the updated [Payment](#payment) (status `succeeded`, `amount` = the captured amount),
plus `captured_amount`.

```json
{
  "id": "6f805049-2e90-4945-9a27-c6d02692d985",
  "stripe_pi_id": "pi_3UNvqXQpcYDzu4Ef0gYInc7D",
  "amount": 5000,
  "currency": "usd",
  "status": "succeeded",
  "capture_method": "manual",
  "captured_amount": 5000,
  "…": "other Payment fields"
}
```

| Error                      | When                                                            |
| -------------------------- | --------------------------------------------------------------- |
| **400** `invalid_state`    | Payment status isn't `requires_capture` (e.g. already captured) |
| **400** `validation_error` | Invalid `id`, or `amount` not a positive integer                |
| **404** `not_found`        | No payment with this ID                                         |

---

## `POST /api/payments/{id}/refund`

Refunds a captured payment (status `succeeded`), fully or partially.

### Request body (optional)

```json
{ "amount": 3000, "reason": "Customer requested" }
```

| Field    | Type    | Required | Rules                                                                                                                                                                                      |
| -------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `amount` | integer | no       | Amount to refund, in cents. Default: the full amount. Partial refunds are allowed, and a payment can be refunded in several parts; the **total refunded can never exceed** the amount paid |
| `reason` | string  | no       | Free text, stored with the refund                                                                                                                                                          |

### Responses

**200 OK**: the [Refund](#refund).

```json
{
  "id": "0b1e6a5c-3f2d-4a8e-9c71-5d2f8e4b7a10",
  "payment_id": "6f805049-2e90-4945-9a27-c6d02692d985",
  "stripe_refund_id": "re_3UNvqXQpcYDzu4Ef0UlXA0k6",
  "amount": 3000,
  "status": "succeeded",
  "reason": "Customer requested",
  "created_at": "2026-10-08T10:05:00.000Z"
}
```

After a refund, the payment's status becomes `refunded` once the full amount has been
refunded.

| Error                      | When                                                                    |
| -------------------------- | ----------------------------------------------------------------------- |
| **400** `invalid_state`    | Payment can't be refunded in its current status (e.g. not captured yet) |
| **400** `validation_error` | Invalid `id`, or `amount` not a positive integer                        |
| **404** `not_found`        | No payment with this ID                                                 |

---

## `POST /api/webhooks`

This is where Stripe sends events. Stripe signs each event and puts the signature in the
`Stripe-Signature` header, so the receiver can check the event really came from Stripe
([how Stripe signs events](https://docs.stripe.com/webhooks#verify-events)).

### Headers

| Header             | Value                                           |
| ------------------ | ----------------------------------------------- |
| `Content-Type`     | `application/json`                              |
| `Stripe-Signature` | Set by Stripe, e.g. `t=1728381600,v1=5257a869…` |

### Request body: a Stripe Event

```json
{
  "id": "evt_3UNvqXQpcYDzu4Ef0abc",
  "object": "event",
  "type": "payment_intent.succeeded",
  "created": 1728381600,
  "data": {
    "object": {
      "id": "pi_3UNvqXQpcYDzu4Ef0gYInc7D",
      "object": "payment_intent",
      "amount": 5000,
      "status": "succeeded"
    }
  }
}
```

Full format: [Stripe Event object](https://docs.stripe.com/api/events/object).

### Handled events

| `type`                          | `data.object` is a…                    | Effect on the payment (found by its PaymentIntent ID) |
| ------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| `payment_intent.succeeded`      | PaymentIntent (`pi_…`)                 | status → `succeeded`                                  |
| `payment_intent.payment_failed` | PaymentIntent (`pi_…`)                 | status → `failed`                                     |
| `charge.refunded`               | Charge (`ch_…`, with `payment_intent`) | status → `refunded`                                   |

Every event the service receives is saved in the `webhook_events` table. Events of other types
are saved too, but don't change anything.

### Responses

| HTTP                       | Body                                           | When                     |
| -------------------------- | ---------------------------------------------- | ------------------------ |
| **200**                    | `{ "received": true }`                         | Event accepted           |
| **400** `validation_error` | `Invalid JSON body` / `Event type is required` | Body isn't a valid event |

---

## `GET /api/health`

**200 OK**

```json
{ "status": "ok", "db": "connected", "timestamp": "2026-10-08T10:00:00.000Z" }
```

**503 Service Unavailable**: the database is unreachable:

```json
{
  "status": "error",
  "db": "disconnected",
  "timestamp": "2026-10-08T10:00:00.000Z"
}
```

---

## `GET /api/config`

**200 OK**

```json
{ "publishableKey": "pk_test_51Abc…" }
```

The Stripe **publishable** key the checkout page uses to load Stripe Elements. Publishable keys
are meant to be public.

---

## Test payment methods

Use these as `payment_method` in `POST /api/payments`:

| `payment_method`                          | Result                                        |
| ----------------------------------------- | --------------------------------------------- |
| `pm_card_visa`                            | Success                                       |
| `pm_card_mastercard`                      | Success                                       |
| `pm_card_chargeDeclined`                  | 402: `card_declined` / `generic_decline`      |
| `pm_card_chargeDeclinedInsufficientFunds` | 402: `card_declined` / `insufficient_funds`   |
| `pm_card_chargeDeclinedLostCard`          | 402: `card_declined` / `lost_card`            |
| `pm_card_chargeDeclinedExpiredCard`       | 402: `expired_card` / `expired_card`          |
| `pm_card_chargeDeclinedIncorrectCvc`      | 402: `incorrect_cvc` / `incorrect_cvc`        |
| `pm_card_threeDSecure2Required`           | 201 with status `requires_action` (3D Secure) |

Card numbers for the web UI are in [README.md](README.md#4-stripe-test-cards). Full list:
https://docs.stripe.com/testing

---

## Examples (curl)

macOS / Linux. On Windows use Postman (import [`openapi.yaml`](openapi.yaml)) or `curl.exe` in
cmd.

```bash
# Create a payment
curl -X POST http://localhost:3000/api/payments \
  -H "Content-Type: application/json" \
  -d '{"amount": 5000, "payment_method": "pm_card_visa", "customer_email": "me@example.com", "idempotency_key": "order-1"}'

# Authorize only
curl -X POST http://localhost:3000/api/payments \
  -H "Content-Type: application/json" \
  -d '{"amount": 5000, "payment_method": "pm_card_visa", "capture_method": "manual"}'

# Capture it (full amount)
curl -X POST http://localhost:3000/api/payments/<id>/capture \
  -H "Content-Type: application/json" -d '{}'

# Refund $10
curl -X POST http://localhost:3000/api/payments/<id>/refund \
  -H "Content-Type: application/json" -d '{"amount": 1000, "reason": "Customer requested"}'

# List, 5 per page, only succeeded
curl "http://localhost:3000/api/payments?limit=5&status=succeeded"

# One payment
curl http://localhost:3000/api/payments/<id>
```

## Import into Postman or Bruno

**Postman:** click _Import_, select `openapi.yaml` from this folder, choose _Postman Collection_
and confirm. You get a collection with all the endpoints and example bodies. The base URL is in
the collection variable `baseUrl` (`http://localhost:3000`).

**Bruno:** choose _Import Collection → OpenAPI V3 Spec_, select `openapi.yaml`, and pick a folder
for the collection (not this one). Then select the environment _Local Docker stack_ in the
top-right corner, otherwise `{{baseUrl}}` stays empty. For requests with `:id`, fill in the `id`
on the _Params_ tab.
