# ══════════════════════════════════════════════════════════════════
# Заняття 4
# WireMock — створення stubs і перевірка
# 
#
# Pre-conditions
#   1. Docker Desktop запущений (іконка кита у верхній панелі)
#   2. Запустити WireMock:
#      docker run -d --name wiremock -p 8080:8080 wiremock/wiremock:3.3.1
#   3. Якщо контейнер вже існує:
#      docker start wiremock
# ══════════════════════════════════════════════════════════════════


# ────────────────────────────────────────────────────────────────
# 0: Перевірити що WireMock біжить
# ────────────────────────────────────────────────────────────────

curl http://localhost:8080/__admin/mappings | python3 -m json.tool


# ────────────────────────────────────────────────────────────────
# 1: Створити stub — Success (200)
# ────────────────────────────────────────────────────────────────

curl -X POST http://localhost:8080/__admin/mappings \
  -H "Content-Type: application/json" \
  -d '{
    "request": {
      "method": "POST",
      "url": "/v1/payment_intents"
    },
    "response": {
      "status": 200,
      "headers": { "Content-Type": "application/json" },
      "jsonBody": {
        "id": "pi_mock_001",
        "status": "requires_capture",
        "amount": 15000,
        "currency": "usd"
      }
    }
  }'


# Перевірити:

curl -X POST http://localhost:8080/v1/payment_intents | python3 -m json.tool


# ────────────────────────────────────────────────────────────────
# 2: Створити stub — Decline (402)
# ────────────────────────────────────────────────────────────────

curl -X POST http://localhost:8080/__admin/mappings \
  -H "Content-Type: application/json" \
  -d '{
    "request": {
      "method": "POST",
      "url": "/v1/payment_intents/declined"
    },
    "response": {
      "status": 402,
      "headers": { "Content-Type": "application/json" },
      "jsonBody": {
        "error": {
          "code": "card_declined",
          "decline_code": "insufficient_funds",
          "message": "Your card has insufficient funds."
        }
      }
    }
  }'


# Перевірити:

curl -X POST http://localhost:8080/v1/payment_intents/declined | python3 -m json.tool


# ────────────────────────────────────────────────────────────────
# 3: Створити stub — Timeout (10 секунд)
# При перевірці буде чекати 10 секунд — це нормально!
# ────────────────────────────────────────────────────────────────

curl -X POST http://localhost:8080/__admin/mappings \
  -H "Content-Type: application/json" \
  -d '{
    "request": {
      "method": "POST",
      "url": "/v1/payment_intents/timeout"
    },
    "response": {
      "status": 200,
      "fixedDelayMilliseconds": 10000,
      "headers": { "Content-Type": "application/json" },
      "jsonBody": {
        "id": "pi_mock_timeout",
        "status": "requires_capture"
      }
    }
  }'


# Перевірити (буде чекати 10 секунд):

curl -X POST http://localhost:8080/v1/payment_intents/timeout | python3 -m json.tool


# ────────────────────────────────────────────────────────────────
# 4: Створити stub — Server Error (503)
# ────────────────────────────────────────────────────────────────

curl -X POST http://localhost:8080/__admin/mappings \
  -H "Content-Type: application/json" \
  -d '{
    "request": {
      "method": "POST",
      "url": "/v1/payment_intents/error"
    },
    "response": {
      "status": 503,
      "headers": { "Content-Type": "application/json" },
      "jsonBody": {
        "error": {
          "type": "api_error",
          "message": "The server is currently unable to handle the request."
        }
      }
    }
  }'


# Перевірити:

curl -X POST http://localhost:8080/v1/payment_intents/error | python3 -m json.tool


# ────────────────────────────────────────────────────────────────
# 5: Всі stubs які створені
# ────────────────────────────────────────────────────────────────

curl http://localhost:8080/__admin/mappings | python3 -m json.tool


# ────────────────────────────────────────────────────────────────
# зупинити WireMock:

# docker stop wiremock
# docker rm wiremock