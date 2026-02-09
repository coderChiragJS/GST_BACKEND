#!/bin/bash

# End-to-end script:
# 1. Login as admin (or register if needed)
# 2. Create a ₹1 plan ("One Rupee Plan")
# 3. Login as user (or register if needed)
# 4. Initiate PhonePe payment for that exact plan
#
# Uses production API URL by default; override with BASE_URL if needed.

set -e

BASE_URL="${BASE_URL:-https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev}"

echo "=========================================="
echo "One Rupee Plan – Create & Buy Flow"
echo "Base URL: $BASE_URL"
echo "=========================================="
echo ""

############################################
# Admin: ensure we have an admin token
############################################

ADMIN_EMAIL="admin@test.com"
ADMIN_PASSWORD="admin123"
ADMIN_NAME="Test Admin"

echo "Step A1: (Optional) Register admin if not exists"
echo "----------------------------------------"
ADMIN_REGISTER_RES=$(curl -s -X POST "$BASE_URL/admin/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"${ADMIN_NAME}\",
    \"email\": \"${ADMIN_EMAIL}\",
    \"password\": \"${ADMIN_PASSWORD}\"
  }" || true)

echo "Admin register response: $ADMIN_REGISTER_RES"
echo ""

echo "Step A2: Login as admin"
echo "----------------------------------------"
ADMIN_LOGIN_RES=$(curl -s -X POST "$BASE_URL/admin/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${ADMIN_EMAIL}\",
    \"password\": \"${ADMIN_PASSWORD}\"
  }")

echo "Admin login response: $ADMIN_LOGIN_RES"
echo ""

ADMIN_TOKEN=$(echo "$ADMIN_LOGIN_RES" | grep -o '\"token\":\"[^\"]*' | cut -d'"' -f4)

if [ -z "$ADMIN_TOKEN" ]; then
  echo "❌ Could not extract admin token. Please check admin login response."
  exit 1
fi

echo "✅ Admin token acquired."
echo ""

############################################
# Admin: create ₹1 plan
############################################

PLAN_NAME="One Rupee Plan"
PLAN_PRICE=1
PLAN_INVOICE_LIMIT=10
PLAN_QUOTATION_LIMIT=10

echo "Step B1: Create ₹1 plan: '${PLAN_NAME}'"
echo "----------------------------------------"

CREATE_PLAN_RES=$(curl -s -X POST "$BASE_URL/admin/packages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d "{
    \"name\": \"${PLAN_NAME}\",
    \"price\": ${PLAN_PRICE},
    \"invoiceLimit\": ${PLAN_INVOICE_LIMIT},
    \"quotationLimit\": ${PLAN_QUOTATION_LIMIT},
    \"isActive\": true
  }")

echo "Create plan response:"
echo "$CREATE_PLAN_RES"
echo ""

PLAN_ID=$(echo "$CREATE_PLAN_RES" | grep -o '\"packageId\":\"[^\"]*' | cut -d'"' -f4)

if [ -z "$PLAN_ID" ]; then
  echo "⚠️  Could not extract packageId from create response. Trying to find it from admin packages list..."
  LIST_ADMIN_PACKAGES=$(curl -s -X GET "$BASE_URL/admin/packages" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  PLAN_ID=$(echo "$LIST_ADMIN_PACKAGES" | grep -B5 "\"name\":\"${PLAN_NAME}\"" | grep -o '\"packageId\":\"[^\"]*' | head -1 | cut -d'"' -f4)
fi

if [ -z "$PLAN_ID" ]; then
  echo "❌ Could not resolve One Rupee Plan packageId. Abort."
  exit 1
fi

echo "✅ One Rupee Plan created/resolved with packageId: $PLAN_ID"
echo ""

############################################
# User: ensure we have a user token
############################################

USER_EMAIL="user@test.com"
USER_PASSWORD="user123"
USER_NAME="Test User"

echo "Step C1: (Optional) Register user if not exists"
echo "----------------------------------------"
USER_REGISTER_RES=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"${USER_NAME}\",
    \"email\": \"${USER_EMAIL}\",
    \"password\": \"${USER_PASSWORD}\"
  }" || true)

echo "User register response: $USER_REGISTER_RES"
echo ""

echo "Step C2: Login as user"
echo "----------------------------------------"
USER_LOGIN_RES=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${USER_EMAIL}\",
    \"password\": \"${USER_PASSWORD}\"
  }")

echo "User login response: $USER_LOGIN_RES"
echo ""

USER_TOKEN=$(echo "$USER_LOGIN_RES" | grep -o '\"token\":\"[^\"]*' | cut -d'"' -f4)

if [ -z "$USER_TOKEN" ]; then
  echo "❌ Could not extract user token. Please check user login response."
  exit 1
fi

echo "✅ User token acquired."
echo ""

############################################
# User: initiate payment for that exact plan
############################################

echo "Step D1: Initiate PhonePe payment for One Rupee Plan"
echo "----------------------------------------"

PAYMENT_RES=$(curl -s -X POST "$BASE_URL/payments/phonepe/create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d "{
    \"packageId\": \"${PLAN_ID}\"
  }")

echo "Payment initiation response:"
echo "$PAYMENT_RES"
echo ""

CHECKOUT_URL=$(echo "$PAYMENT_RES" | grep -o '\"checkoutUrl\":\"[^\"]*' | cut -d'"' -f4)
PAYMENT_ID=$(echo "$PAYMENT_RES" | grep -o '\"paymentId\":\"[^\"]*' | cut -d'"' -f4)

if [ -z "$CHECKOUT_URL" ]; then
  echo "❌ Could not extract checkoutUrl. Please check the payment response above."
  exit 1
fi

echo "✅ Payment created."
echo "Payment ID: $PAYMENT_ID"
echo ""
echo "👉 Open this URL in your browser / PhonePe to pay ₹${PLAN_PRICE}:"
echo "$CHECKOUT_URL"
echo ""

echo "After successful payment + callback, you can verify subscription with:"
echo ""
echo "curl -X GET \"$BASE_URL/user/subscription\" \\"
echo "  -H \"Authorization: Bearer $USER_TOKEN\""
echo ""

echo "=========================================="
echo "Flow Complete – Plan created & payment initiated"
echo "=========================================="

