/**
 * Failure points in the payment flow — hands-on examples
 * Lesson 1 · Payment Systems Testing
 *
 * This file has a TypeScript snippet for each failure zone we talked about
 * during the lecture. We use it together with WireMock to simulate the failures (we will have a separate lecture dedicated to mocks
 * it will get clearer)
 *
 * Run it:   npx ts-node failure-points.ts
 */

import axios, { AxiosError } from "axios";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const PSP_BASE_URL = process.env.PSP_URL ?? "http://localhost:8080"; // WireMock
const TIMEOUT_MS   = 5_000;
const MAX_RETRIES  = 3;

interface PaymentIntent {
  id:     string;
  status: "requires_capture" | "succeeded" | "canceled" | "failed";
  amount: number;
}

interface ChargeParams {
  amount:         number;
  currency:       string;
  idempotencyKey: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ZONE 1: Merchant → Stripe
// The problem: the request times out with no response, so the merchant has
// no idea whether it actually went through on Stripe's side.
// The fix: retry using the exact same idempotency key.
// ─────────────────────────────────────────────────────────────────────────────

export class PspClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(baseUrl = PSP_BASE_URL, timeoutMs = TIMEOUT_MS, maxRetries = MAX_RETRIES) {
    this.baseUrl    = baseUrl;
    this.timeoutMs  = timeoutMs;
    this.maxRetries = maxRetries;
  }

  /**
   * Creates a PaymentIntent and retries automatically on timeout.
   *
   * The important part here: idempotencyKey stays the same across every
   * attempt. That's what tells Stripe "this is a retry of the same charge,
   * not a new one" — so it just returns the original result instead of
   * charging the card twice.
   *
   * WireMock stub to simulate a timeout:
   * {
   *   "request": { "method": "POST", "url": "/v1/payment_intents" },
   *   "response": { "fixedDelayMilliseconds": 10000 }
   * }
   */
  async createPaymentIntent(params: ChargeParams): Promise<PaymentIntent> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await axios.post<PaymentIntent>(
          `${this.baseUrl}/v1/payment_intents`,
          { amount: params.amount, currency: params.currency },
          {
            timeout: this.timeoutMs,
            headers: {
              // same idempotency key on every attempt for this payment
              "Idempotency-Key": params.idempotencyKey,
              "Content-Type":    "application/json",
            },
          }
        );

        return response.data;

      } catch (error) {
        const axiosErr = error as AxiosError;

        if (axiosErr.code === "ECONNABORTED") {
          // Timeout — safe to retry, we're reusing the same idempotency key
          lastError = new Error(
            `PSP timeout (attempt ${attempt}/${this.maxRetries})`
          );
          console.warn(lastError.message);

          // Exponential backoff: 200ms, 400ms, 800ms...
          if (attempt < this.maxRetries) {
            await sleep(2 ** attempt * 100);
          }
          continue;
        }

        if (axiosErr.response?.status === 402) {
          // The issuer declined the card — don't retry, it's on the customer now
          throw new CardDeclinedError(
            axiosErr.response.data as DeclineResponse
          );
        }

        // Any other error (4xx) — not something a retry would fix
        throw error;
      }
    }

    throw new Error(`PSP unreachable after ${this.maxRetries} attempts`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ZONE 2: Stripe → Card Network
// The problem: the PSP accepts the request but then answers with a 500,
// so we're left not knowing what actually happened to the payment.
// The fix: poll the status with GET instead of trusting the webhook alone.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Polls until the transaction moves out of "pending" into a final state.
 *
 * WireMock stub to simulate pending → succeeded:
 * First GET returns:  { "status": "processing" }
 * Second GET returns: { "status": "requires_capture" }
 */
export async function pollPaymentStatus(
  paymentIntentId: string,
  options: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<PaymentIntent> {
  const { intervalMs = 1_000, timeoutMs = 30_000 } = options;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await axios.get<PaymentIntent>(
      `${PSP_BASE_URL}/v1/payment_intents/${paymentIntentId}`
    );

    const { status } = response.data;

    // Reached a final state — we're done, return it
    if (["requires_capture", "succeeded", "canceled", "failed"].includes(status)) {
      return response.data;
    }

    // Still in progress — wait a bit and check again
    await sleep(intervalMs);
  }

  throw new Error(
    `Timeout: payment ${paymentIntentId} didn't finish within ${timeoutMs}ms`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ZONE 3: Card Network → Issuer
// The problem: not every decline code should be treated the same way —
// some are worth retrying, some definitely aren't.
// The fix: look at the code and decide whether a retry makes sense.
// ─────────────────────────────────────────────────────────────────────────────

interface DeclineResponse {
  error: {
    code:         string;
    decline_code: string;
    message:      string;
  };
}

export class CardDeclinedError extends Error {
  readonly declineCode:  string;
  readonly errorCode:    string;
  readonly canRetry:     boolean;

  constructor(response: DeclineResponse) {
    super(response.error.message);
    this.errorCode   = response.error.code;
    this.declineCode = response.error.decline_code;
    this.canRetry    = isRetryableDecline(response.error.decline_code);
  }
}

/**
 * Visa's retry rules — which decline codes are safe to retry automatically.
 *
 *  Retryable (looks like a technical hiccup, might just work next time):
 *   - issuer_unavailable: the issuer's system was temporarily down
 *   - processing_error:   something glitched at the network level
 *
 *  Non-retryable (nothing changes unless the customer does something):
 *   - insufficient_funds (51): no money on the card — retrying won't add any
 *   - do_not_honor (05):       issuer said no for an unknown reason, and Visa
 *                              bans retries on this one for 30 days
 *   - card_velocity_exceeded:  too many attempts already, hit the limit
 *   - expired_card:            the card itself needs replacing
 *
 * Ignore these rules and retry anyway, and you risk a penalty from Visa's
 * fraud-monitoring program (VAMP — Visa Acquirer Monitoring Program).
 */
export function isRetryableDecline(declineCode: string): boolean {
  const RETRYABLE = new Set([
    "issuer_unavailable",
    "processing_error",
    "try_again_later",
  ]);

  const NON_RETRYABLE = new Set([
    "insufficient_funds",      // Visa code 51
    "do_not_honor",            // Visa code 05 — no retries for 30 days
    "card_velocity_exceeded",  // Visa code 61
    "expired_card",            // Visa code 54
    "invalid_card_number",     // Visa code 14
    "lost_card",               // Visa code 41
    "stolen_card",             // Visa code 43
    "card_not_supported",      // Visa code 57
  ]);

  if (NON_RETRYABLE.has(declineCode)) return false;
  if (RETRYABLE.has(declineCode))     return true;

  // Don't recognize this code — better to play it safe and not retry
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// ZONE 4: Webhook delivery
// The problem: a webhook can fail to arrive at all, or arrive twice.
// The fix: make the handler idempotent, and always check the HMAC signature.
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from "crypto";

interface StripeWebhookEvent {
  id:   string;
  type: string;
  data: { object: PaymentIntent };
}

/**
 * Verifies the HMAC-SHA256 signature on an incoming Stripe webhook.
 *
 * Skip this check and anyone could send a fake webhook to your endpoint
 * and flip a transaction to "succeeded" without an actual payment happening.
 *
 * Example test case (bad signature → should be rejected):
 * const result = verifyWebhookSignature(payload, "invalid_sig", secret);
 * expect(result).toBe(false);
 */
export function verifyWebhookSignature(
  payload:   string,
  signature: string, // Stripe-Signature header
  secret:    string
): boolean {
  try {
    // Stripe sends it as "t=timestamp,v1=hash"
    const parts     = Object.fromEntries(
      signature.split(",").map(p => p.split("=") as [string, string])
    );
    const timestamp = parts["t"];
    const hash      = parts["v1"];

    if (!timestamp || !hash) return false;

    // Reject anything older than 5 minutes — protects against replay attacks
    const webhookAge = Date.now() / 1000 - Number(timestamp);
    if (webhookAge > 300) {
      console.warn("Webhook rejected: timestamp is too old (possible replay attack)");
      return false;
    }

    // Recompute the hash and compare it to what was sent
    const expectedHash = createHmac("sha256", secret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");

    // timingSafeEqual instead of === — guards against timing attacks
    return timingSafeEqual(
      Buffer.from(hash,         "hex"),
      Buffer.from(expectedHash, "hex")
    );

  } catch {
    return false;
  }
}

/**
 * Handles a webhook idempotently.
 *
 * Stripe will resend the same webhook if it doesn't get a 200 back (e.g.
 * after a 500), so the same event can land on your endpoint more than once.
 * Without an idempotency check you'd end up updating the status twice,
 * emailing the customer twice, and so on.
 *
 * Example test case (same webhook sent twice → only handled once):
 * await handleWebhook(event);
 * await handleWebhook(event); // same event.id as above
 * expect(db.updateCount).toBe(1);
 */
export async function handleWebhookIdempotently(
  event:            StripeWebhookEvent,
  db:               WebhookDatabase
): Promise<"processed" | "duplicate" | "ignored"> {
  // Have we already handled this exact event?
  const alreadyProcessed = await db.hasProcessedEvent(event.id);
  if (alreadyProcessed) {
    console.log(`Webhook ${event.id} was already processed — skipping`);
    return "duplicate";
  }

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object;

    await db.updateTransactionStatus(paymentIntent.id, "succeeded");
    await db.markEventProcessed(event.id);

    return "processed";
  }

  return "ignored";
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER TYPES AND FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

interface WebhookDatabase {
  hasProcessedEvent:      (eventId: string)                          => Promise<boolean>;
  markEventProcessed:     (eventId: string)                          => Promise<void>;
  updateTransactionStatus:(txId: string, status: string)             => Promise<void>;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// USAGE EXAMPLE
// ─────────────────────────────────────────────────────────────────────────────

async function example(): Promise<void> {
  const client = new PspClient();

  // The idempotency key is tied to the order, not to a single attempt
  const idempotencyKey = `charge:order-${Date.now()}`;

  try {
    const intent = await client.createPaymentIntent({
      amount:         15000, // $150.00, in cents
      currency:       "usd",
      idempotencyKey,
    });

    console.log("PaymentIntent created:", intent.id);

    // Poll for the result instead of relying only on the webhook
    const final = await pollPaymentStatus(intent.id);
    console.log("Final status:", final.status);

  } catch (error) {
    if (error instanceof CardDeclinedError) {
      console.error(`Decline: ${error.declineCode}`);

      if (error.canRetry) {
        console.log("Retry is allowed — try again later");
      } else {
        console.log("Retry is not allowed — the customer needs to take action");
        // Visa's retry rules: do_not_honor blocks retries for 30 days
      }
    } else {
      throw error;
    }
  }
}
