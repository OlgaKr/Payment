// src/server.ts
// Server is ready as-is — nothing to change here.
// Your task is in src/webhook.homework.ts

import express from "express";
import { handleWebhook } from "./webhook";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT ?? 3000;

// IMPORTANT: the webhook endpoint must receive the RAW body.
// Stripe signs the raw request body string.
// If express.json() runs first, the body becomes a parsed object,
// the signature won't match, and verification will always return 401.
app.post("/webhooks", express.raw({ type: "application/json" }), handleWebhook);

app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/transactions/:id", (req, res) => {
  const { db } = require("./db");
  const tx = db.getTransaction(req.params.id);
  if (!tx) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  res.json(tx);
});

export const server = app.listen(PORT, () => {
  console.log(`\nServer started: http://localhost:${PORT}`);
  console.log(`Webhook endpoint:  http://localhost:${PORT}/webhooks`);
  console.log(`Health check:      http://localhost:${PORT}/health\n`);
  console.log("Next step — run Stripe CLI in a second terminal:");
  console.log("  stripe listen --forward-to localhost:3000/webhooks\n");
});

export { app };
