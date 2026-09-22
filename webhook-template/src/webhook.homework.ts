// src/webhook.homework.ts
// HOMEWORK — Lesson 6
//
// Student template: fill in the three TODOs below.
// The reference solution lives in src/webhook.ts — don't peek until you're done!

import { Request, Response } from "express";
import Stripe from "stripe";
import { db } from "./db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

export async function handleWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  // ── TODO 1: Signature verification ──────────────────────────────
  //
  // What to do:
  //   1. Read the "stripe-signature" header from req.headers
  //   2. Read the webhook secret from process.env.STRIPE_WEBHOOK_SECRET
  //   3. Verify and parse the event with
  //        stripe.webhooks.constructEvent(req.body, signature, secret)
  //   4. If verification throws, respond 401 with
  //        { error: "Invalid signature" } and return
  //
  // Hint: req.body here is a raw Buffer, not a parsed object — see
  // server.ts, where express.raw() is used specifically for this route.

  let event!: Stripe.Event;

  // --- YOUR CODE HERE ---

  // --------------------

  // Respond with 200 immediately
  res.status(200).json({ received: true });

  // ── TODO 2: Idempotency ─────────────────────────────────────────
  //
  // What to do:
  //   1. Check db.hasProcessedEvent(event.id)
  //   2. If it has already been processed, log it and return —
  //      don't process the same event twice

  // --- YOUR CODE HERE ---

  // --------------------

  // ── TODO 3: Handle by event type ───────────────────────────────
  //
  // What to do:
  //   event.data.object holds the Stripe object (PaymentIntent, Charge, ...).
  //   Using a switch (event.type), handle at least:
  //     - "payment_intent.succeeded"      → db.upsertTransaction(obj.id, "succeeded", obj.amount)
  //     - "payment_intent.payment_failed" → db.upsertTransaction(obj.id, "failed", obj.amount)
  //     - "charge.refunded"               → db.upsertTransaction(obj.payment_intent, "refunded", obj.amount)
  //
  //   Don't forget to mark the event as processed once you're done:
  //     db.markEventProcessed(event.id)

  const obj = event.data.object as any;

  // --- YOUR CODE HERE ---

  // --------------------
}
