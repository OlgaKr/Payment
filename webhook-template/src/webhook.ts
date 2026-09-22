// src/webhook.ts
// Reference solution.
// Students work from src/webhook.homework.ts instead.

import { Request, Response } from "express";
import Stripe from "stripe";
import { db } from "./db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const processedEvents = new Set<string>();

export async function handleWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  // ── Step 1: Signature verification ──
  const sig = req.headers["stripe-signature"] as string;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  if (secret && sig) {
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err: any) {
      console.log(`\n Invalid signature: ${err.message}`);
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
  } else {
    event = JSON.parse(req.body.toString()) as Stripe.Event;
    console.log(`\n  Signature verification skipped`);
  }

  // Respond with 200 immediately
  res.status(200).json({ received: true });

  // ── Step 2: Idempotency ──
  if (processedEvents.has(event.id)) {
    console.log(`\n Event ${event.id} already processed — skipping\n`);
    return;
  }

  // ── Step 3: Handle by event type ──
  const obj = event.data.object as any;

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(` Event:   ${event.id}`);
  console.log(` Type:    ${event.type}`);

  switch (event.type) {
    case "payment_intent.created":
      console.log(` PaymentIntent created`);
      console.log(`   ID:      ${obj.id}`);
      console.log(`   Amount:  $${(obj.amount / 100).toFixed(2)}`);
      console.log(`   Status:  ${obj.status}`);
      db.upsertTransaction(obj.id, obj.status, obj.amount);
      break;

    case "payment_intent.succeeded":
      console.log(` Payment SUCCEEDED!`);
      console.log(`   ID:      ${obj.id}`);
      console.log(`   Amount:  $${(obj.amount / 100).toFixed(2)}`);
      console.log(`   Status:  ${obj.status}`);
      db.upsertTransaction(obj.id, "succeeded", obj.amount);
      console.log(`   → DB updated: order confirmed`);
      break;

    case "payment_intent.payment_failed":
      const error = obj.last_payment_error;
      console.log(` Payment FAILED`);
      console.log(`   ID:      ${obj.id}`);
      console.log(`   Amount:  $${(obj.amount / 100).toFixed(2)}`);
      console.log(`   Code:    ${error?.code ?? "unknown"}`);
      console.log(`   Decline: ${error?.decline_code ?? "unknown"}`);
      db.upsertTransaction(obj.id, "failed", obj.amount);
      console.log(`   → DB updated: order failed`);
      break;

    case "charge.succeeded":
      console.log(` Charge succeeded`);
      console.log(`   ID:      ${obj.id}`);
      console.log(`   Amount:  $${(obj.amount / 100).toFixed(2)}`);
      break;

    case "charge.refunded":
      console.log(`  Refund processed`);
      console.log(`   ID:      ${obj.id}`);
      console.log(`   Refund:  $${(obj.amount_refunded / 100).toFixed(2)}`);
      db.upsertTransaction(obj.payment_intent, "refunded", obj.amount);
      console.log(`   → DB updated: order refunded`);
      break;

    case "charge.dispute.created":
      console.log(`  DISPUTE opened!`);
      console.log(`   ID:      ${obj.id}`);
      console.log(`   Amount:  $${(obj.amount / 100).toFixed(2)}`);
      console.log(`   Reason:  ${obj.reason ?? "unknown"}`);
      console.log(`   → WARNING: evidence must be submitted!`);
      break;

    default:
      console.log(` Unknown type: ${event.type}`);
  }

  processedEvents.add(event.id);
  db.markEventProcessed(event.id);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}
