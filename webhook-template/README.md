# ДЗ Заняття 6 — Тестування webhooks

## Завдання

Реалізувати webhook endpoint з верифікацією підпису і ідемпотентною обробкою.
Написати три тести які покривають основні сценарії.

## Файли які треба змінити

| Файл                    | Що робити                                                                 |
| ----------------------- | ------------------------------------------------------------------------- |
| `src/webhook.ts`        | Реалізувати три TODO: верифікація підпису, ідемпотентність, обробка події |
| `tests/webhook.test.ts` | Написати три тести: валідний webhook, невалідний підпис, дублікат         |

## Файли які НЕ треба міняти

| Файл            | Опис                   |
| --------------- | ---------------------- |
| `src/server.ts` | Готовий Express сервер |
| `src/db.ts`     | In-memory база даних   |
| `package.json`  | Залежності             |

---

## Запуск

### Крок 1 — Встановити залежності

```bash
npm install
```

### Крок 2 — Налаштувати .env

```bash
cp .env.example .env
# Відкрити .env і вставити STRIPE_SECRET_KEY зі свого Stripe Dashboard
```

### Крок 3 — Запустити сервер (Термінал 1)

```bash
npm run dev
# Побачиш: Server running on http://localhost:3000
```

### Крок 4 — Підключити Stripe CLI (Термінал 2)

```bash
stripe listen --forward-to localhost:3000/webhooks
# Побачиш: Your webhook signing secret is whsec_...
# Скопіюй це значення в .env як STRIPE_WEBHOOK_SECRET
# Перезапусти сервер (Ctrl+C і npm run dev знову)
```

### Крок 5 — Перевірити що webhook приходить (Термінал 3)

```bash
stripe trigger payment_intent.succeeded
# У Терміналі 2 побачиш:
# --> payment_intent.succeeded [evt_xxx]
# <-- [200] POST http://localhost:3000/webhooks
```

---

## Запуск тестів

```bash
npm test
```

Очікуваний результат:

```
PASS tests/webhook.test.ts
  Webhook endpoint
    ✓ valid webhook returns 200 and updates transaction status
    ✓ invalid signature returns 401 and does not update DB
    ✓ duplicate webhook is processed only once

Tests: 3 passed
```

---

## Що здати

1. **Код** — заповнені `src/webhook.ts` і `tests/webhook.test.ts`
2. **Лог Stripe CLI** — скріншот або текст з терміналу де видно `<-- [200]`
3. **Лог тестів** — скріншот або текст з трьома зеленими тестами

---

## Типові проблеми

**Всі тести повертають 401:**
→ Перевір що `STRIPE_WEBHOOK_SECRET` в `.env` відповідає значенню з Stripe CLI

**Підпис не верифікується навіть з валідним ключем:**
→ Перевір порядок middleware в `server.ts` — `express.raw()` має бути ДО `express.json()`

**Третій тест падає (updateCount = 2 замість 1):**
→ Реалізуй ідемпотентність через `db.hasProcessedEvent()` в `webhook.ts`
