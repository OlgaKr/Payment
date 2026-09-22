#!/bin/bash
# ════════════════════════════════════════════════════════════════
# Альтернативні payment methods — SEPA, iDEAL, BLIK
# Курс: Тестування платіжних систем
#
# Перед початком:
#   export STRIPE_KEY=sk_test_YOUR_KEY
#
# Порівняння з картковими платежами:
#   Картка:   confirm → succeeded (одразу)
#   SEPA DD:  confirm → processing 
#   iDEAL:    confirm → requires_action (redirect на банк)
#   BLIK:     confirm → succeeded (одразу, як картка)
# ════════════════════════════════════════════════════════════════


# ════════════════════════════════════════════════════════════════
# 1. SEPA DIRECT DEBIT
#    Pull модель — merchant списує з рахунку клієнта
#    Потребує: customer + payment_method (IBAN) + mandate
#    Результат: processing (не succeeded!)
#    Settlement: 5-14 робочих днів
# ════════════════════════════════════════════════════════════════

# ── Крок 1: Створити customer (SEPA DD вимагає) ──
curl https://api.stripe.com/v1/customers \
  -u $STRIPE_KEY: \
  -d name="Test User" \
  -d email="test@example.com"

# → Запам'ятати cus_XXX

# ── Крок 2: Створити payment method з тестовим IBAN ──
# DE89370400440532013000 — success
# DE62370400440532013001 — decline (insufficient funds)
curl https://api.stripe.com/v1/payment_methods \
  -u $STRIPE_KEY: \
  -d type=sepa_debit \
  -d "sepa_debit[iban]=DE89370400440532013000" \
  -d "billing_details[name]=Test User" \
  -d "billing_details[email]=test@example.com"

# → Запам'ятати pm_XXX

# ── Крок 3: Створити PaymentIntent з mandate ──
# Замінити cus_XXX і pm_XXX на реальні ID з кроків 1 і 2
curl https://api.stripe.com/v1/payment_intents \
  -u $STRIPE_KEY: \
  -d amount=15000 \
  -d currency=eur \
  -d customer=cus_XXX \
  -d payment_method=pm_XXX \
  -d "payment_method_types[]=sepa_debit" \
  -d confirm=true \
  -d "mandate_data[customer_acceptance][type]=online" \
  -d "mandate_data[customer_acceptance][online][ip_address]=127.0.0.1" \
  -d "mandate_data[customer_acceptance][online][user_agent]=test"

# → Очікуваний результат: status = "processing"
# → НЕ succeeded! Банк ще не підтвердив.
# → У test mode через кілька хвилин → succeeded (webhook)
# → У production: 5-14 робочих днів

# ── Крок 4: Перевірити статус (polling) ──
# Замінити pi_XXX на реальний ID
curl https://api.stripe.com/v1/payment_intents/pi_XXX \
  -u $STRIPE_KEY: \
  | python3 -m json.tool | grep -E '"status"|"amount_received"'


# ════════════════════════════════════════════════════════════════
# 2. iDEAL (Нідерланди)
#    Redirect модель — клієнт переходить на сайт банку
#    Результат: requires_action (redirect URL)
#    Після redirect: succeeded або failed
# ════════════════════════════════════════════════════════════════

curl https://api.stripe.com/v1/payment_intents \
  -u $STRIPE_KEY: \
  -d amount=15000 \
  -d currency=eur \
  -d "payment_method_types[]=ideal" \
  -d "payment_method_data[type]=ideal" \
  -d "payment_method_data[ideal][bank]=abn_amro" \
  -d confirm=true \
  -d "return_url=https://example.com/return"

# → Очікуваний результат: status = "requires_action"
# → У відповіді буде: next_action.redirect_to_url.url
# → Відкрити цей URL у браузері → тестова сторінка Stripe:
#     "Authorize test payment" → succeeded
#     "Fail test payment" → failed
# → Після натискання → redirect на return_url

# Доступні банки для iDEAL:
# abn_amro, asn_bank, bunq, ing, knab, rabobank,
# regiobank, revolut, sns_bank, triodos_bank, van_lanschot


# ════════════════════════════════════════════════════════════════
# 3. BLIK (Польща)
#    Код з банківського додатку — 6 цифр
#    Валюта: ТІЛЬКИ PLN (злотий)
#    Результат: succeeded одразу (як картка)
# ════════════════════════════════════════════════════════════════

# ── Success (будь-який 6-значний код у test mode) ──
curl https://api.stripe.com/v1/payment_intents \
  -u $STRIPE_KEY: \
  -d amount=5000 \
  -d currency=pln \
  -d "payment_method_types[]=blik" \
  -d "payment_method_data[type]=blik" \
  -d confirm=true \
  -d "payment_method_options[blik][code]=777123" \
  -d "return_url=https://example.com/return"

# → Очікуваний результат: status = "succeeded"

# ── Fail: неправильна валюта (EUR замість PLN) ──
curl https://api.stripe.com/v1/payment_intents \
  -u $STRIPE_KEY: \
  -d amount=5000 \
  -d currency=eur \
  -d "payment_method_types[]=blik" \
  -d "payment_method_data[type]=blik" \
  -d confirm=true \
  -d "payment_method_options[blik][code]=777123" \
  -d "return_url=https://example.com/return"

# → Очікуваний результат: помилка — BLIK тільки PLN

# ── Fail: невалідний код (менше 6 цифр) ──
curl https://api.stripe.com/v1/payment_intents \
  -u $STRIPE_KEY: \
  -d amount=5000 \
  -d currency=pln \
  -d "payment_method_types[]=blik" \
  -d "payment_method_data[type]=blik" \
  -d confirm=true \
  -d "payment_method_options[blik][code]=123" \
  -d "return_url=https://example.com/return"

# → Очікуваний результат: помилка — код має бути 6 цифр


# ════════════════════════════════════════════════════════════════
# 4. PRZELEWY24 (Польща)
#    Redirect модель (як iDEAL але для Польщі)
#    Валюта: PLN або EUR
# ════════════════════════════════════════════════════════════════

curl https://api.stripe.com/v1/payment_intents \
  -u $STRIPE_KEY: \
  -d amount=5000 \
  -d currency=pln \
  -d "payment_method_types[]=p24" \
  -d "payment_method_data[type]=p24" \
  -d "payment_method_data[billing_details][email]=test@example.com" \
  -d confirm=true \
  -d "return_url=https://example.com/return"

# → Очікуваний результат: status = "requires_action"
# → Відкрити redirect URL → тестова сторінка → Authorize/Fail


# ════════════════════════════════════════════════════════════════
# 5. BANCONTACT (Бельгія)
#    Redirect модель
#    Валюта: EUR
# ════════════════════════════════════════════════════════════════

curl https://api.stripe.com/v1/payment_intents \
  -u $STRIPE_KEY: \
  -d amount=15000 \
  -d currency=eur \
  -d "payment_method_types[]=bancontact" \
  -d "payment_method_data[type]=bancontact" \
  -d "payment_method_data[billing_details][name]=Test User" \
  -d confirm=true \
  -d "return_url=https://example.com/return"

# → Очікуваний результат: status = "requires_action" → redirect


# ════════════════════════════════════════════════════════════════
# ПОРІВНЯЛЬНА ТАБЛИЦЯ
# ════════════════════════════════════════════════════════════════
#
# | Method     | Валюта  | Після confirm    | Чекати          |
# |------------|---------|------------------|-----------------|
# | card       | будь-яка| succeeded        | Ні              |
# | sepa_debit | EUR     | processing       | Дні (webhook)   |
# | ideal      | EUR     | requires_action  | Redirect (сек)  |
# | blik       | PLN     | succeeded        | Ні              |
# | p24        | PLN/EUR | requires_action  | Redirect (сек)  |
# | bancontact | EUR     | requires_action  | Redirect (сек)  |
#
# ════════════════════════════════════════════════════════════════
