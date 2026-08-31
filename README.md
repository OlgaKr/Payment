# Payment Systems Testing — Course Repository

Course materials for QA Automation Engineers.

## Structure (current)

```
├── code/
│   └── lesson01-architecture/
│       └── failure-points.ts      # 4 payment failure zones — hands-on examples
│
├── demo-scripts/                  # empty for now — demo commands added lesson by lesson
├── test-data/                     # empty for now — homework fixtures added lesson by lesson
│
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

Lessons and their supporting materials are added incrementally, one at a
time, as we actually get to them in class — so what's in the repo always
runs, instead of being full of half-finished placeholders.

## Roadmap (planned, not added yet)

- `code/lesson09-antifraud/velocity-buggy.ts` — a velocity checker with
  intentional bugs (homework)
- `code/lesson11-test-architecture/test-buggy.ts` — a test file with
  structural problems to refactor (homework)
- `webhook-template/` — Express + TypeScript webhook handler template
  (Lesson 6)
- `demo-scripts/` — in-class demo commands for lessons 2, 4, 5, 6, 7, 9
- `test-data/lesson10-security/` — logs and API responses with PCI DSS
  violations to spot
- `test-data/lesson13-reconciliation/` — CSVs for a reconciliation exercise

## Getting started

```bash
# Clone the repo
git clone <url>
cd payment-testing-course

# Install dependencies
npm install

# Stripe API key (test mode)
export STRIPE_KEY=sk_test_YOUR_KEY
```

## Stripe test cards

| Card | Scenario |
|------|----------|
| `pm_card_visa` | Successful payment |
| `pm_card_chargeDeclined` | Decline |
| `pm_card_chargeDeclinedInsufficientFunds` | Insufficient funds |
| `pm_card_threeDSecureOptional` | 3DS frictionless |
| `pm_card_threeDSecure2Required` | 3DS challenge |
| `pm_card_radarBlock` | Stripe Radar block |
| `pm_card_riskLevelHighest` | High risk score |

## Code homework (coming with their lessons)

### Lesson 9 — velocity-buggy.ts
Find at least 4 problems in the `checkVelocity` function. Write tests and fix them.

### Lesson 11 — test-buggy.ts
Find at least 5 architectural problems in the test file. Refactor it.

### Lesson 6 — webhook-template
Implement a webhook handler with signature verification and idempotent processing.

## Course project

By the end of the course you'll get a demo service with intentional bugs
(Docker Compose). The task: find the bugs, write tests, and prepare bug
reports.
