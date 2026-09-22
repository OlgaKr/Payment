

# ────────────────────────────────────────────────────────────────
# Partial capture
# Крок 1: Авторизація на $100
# ────────────────────────────────────────────────────────────────

curl https://api.stripe.com/v1/payment_intents \
  -u $STRIPE_KEY: \
  -d amount=10000 \
  -d currency=usd \
  -d payment_method=pm_card_visa \
  -d confirm=true \
  -d capture_method=manual \
  -d "automatic_payment_methods[enabled]=true" \
  -d "automatic_payment_methods[allow_redirects]=never" \
  | python3 -m json.tool


# ────────────────────────────────────────────────────────────────
# Крок 2: Partial capture на $80
# Замінити PI_ID на id з відповіді вище
# ────────────────────────────────────────────────────────────────

curl https://api.stripe.com/v1/payment_intents/PI_ID/capture \
  -u $STRIPE_KEY: \
  -d amount_to_capture=8000 \
  | python3 -m json.tool


# ────────────────────────────────────────────────────────────────
# Крок 3 (додатковий): Спробувати capture решти $20
# Очікуємо помилку — amount_capturable вже 0
# ────────────────────────────────────────────────────────────────

curl https://api.stripe.com/v1/payment_intents/PI_ID/capture \
  -u $STRIPE_KEY: \
  -d amount_to_capture=2000 \
  | python3 -m json.tool

