// src/db.ts
// Simple in-memory database

export interface Transaction {
  id: string;
  status: string;
  amount: number;
  updatedAt: Date;
  updateCount: number; // for idempotency checks in tests
}

// Transaction storage
const transactions = new Map<string, Transaction>();

// Storage of already processed webhook events (for idempotency)
const processedEvents = new Set<string>();

export const db = {
  // Create or update a transaction
  upsertTransaction(id: string, status: string, amount = 0): void {
    const existing = transactions.get(id);
    transactions.set(id, {
      id,
      status,
      amount: existing?.amount ?? amount,
      updatedAt: new Date(),
      updateCount: (existing?.updateCount ?? 0) + 1,
    });
  },

  // Get a transaction
  getTransaction(id: string): Transaction | undefined {
    return transactions.get(id);
  },

  // How many times the transaction was updated — for idempotency checks
  getUpdateCount(id: string): number {
    return transactions.get(id)?.updateCount ?? 0;
  },

  // Idempotency: has this webhook event already been processed?
  hasProcessedEvent(eventId: string): boolean {
    return processedEvents.has(eventId);
  },

  // Mark an event as processed
  markEventProcessed(eventId: string): void {
    processedEvents.add(eventId);
  },

  // Reset all state — used in test beforeEach
  clear(): void {
    transactions.clear();
    processedEvents.clear();
  },
};
