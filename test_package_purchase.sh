#!/bin/bash

# PhonePe Payment Gateway - Test Package Purchase Flow
# Production API URL

BASE_URL="${BASE_URL:-https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev}"

echo "=========================================="
echo "PhonePe Package Purchase Test Flow"
echo "=========================================="
echo ""

# Step 1: Register Regular User
echo "Step 1: Register Regular User"
echo "----------------------------------------"
USER_EMAIL="user@test.com"
USER_PASSWORD="user123"
USER_NAME="Test User"

REGISTER_RESPONSE=$(curl -s -X POST "${BASE_URL}/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"${USER_NAME}\",
    \"email\": \"${USER_EMAIL}\",
    \"password\": \"${USER_PASSWORD}\"
  }")

echo "Register Response: $REGISTER_RESPONSE"
echo ""

# Step 2: Login as User
echo "Step 2: Login as User"
echo "----------------------------------------"
LOGIN_RESPONSE=$(curl -s -X POST "${BASE_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${USER_EMAIL}\",
    \"password\": \"${USER_PASSWORD}\"
  }")

echo "Login Response: $LOGIN_RESPONSE"
echo ""

# Extract token
USER_TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$USER_TOKEN" ]; then
  echo "ERROR: Could not extract user token. Please check the login response."
  exit 1
fi

echo "User Token extracted: ${USER_TOKEN:0:20}..."
echo ""

# Step 3: List Available Packages
echo "Step 3: List Available Packages"
echo "----------------------------------------"
PACKAGES_RESPONSE=$(curl -s -X GET "${BASE_URL}/packages" \
  -H "Authorization: Bearer ${USER_TOKEN}")

echo "Available Packages:"
echo "$PACKAGES_RESPONSE" | jq '.' 2>/dev/null || echo "$PACKAGES_RESPONSE"
echo ""

# Extract first package ID
PACKAGE_ID=$(echo $PACKAGES_RESPONSE | grep -o '"packageId":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$PACKAGE_ID" ]; then
  echo "⚠️  No packages found. Please create a package first using admin API."
  echo "Run: ./test_package_creation.sh"
  exit 1
fi

echo "Selected Package ID: $PACKAGE_ID"
echo ""

# Step 4: Check Current Subscription Status
echo "Step 4: Check Current Subscription Status"
echo "----------------------------------------"
SUBSCRIPTION_RESPONSE=$(curl -s -X GET "${BASE_URL}/user/subscription" \
  -H "Authorization: Bearer ${USER_TOKEN}")

echo "Current Subscription:"
echo "$SUBSCRIPTION_RESPONSE" | jq '.' 2>/dev/null || echo "$SUBSCRIPTION_RESPONSE"
echo ""

# Step 5: Initiate PhonePe Payment
echo "Step 5: Initiate PhonePe Payment"
echo "----------------------------------------"
PAYMENT_RESPONSE=$(curl -s -X POST "${BASE_URL}/payments/phonepe/create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${USER_TOKEN}" \
  -d "{
    \"packageId\": \"${PACKAGE_ID}\"
  }")

echo "Payment Initiation Response:"
echo "$PAYMENT_RESPONSE" | jq '.' 2>/dev/null || echo "$PAYMENT_RESPONSE"
echo ""

# Extract checkout URL
CHECKOUT_URL=$(echo $PAYMENT_RESPONSE | grep -o '"checkoutUrl":"[^"]*' | cut -d'"' -f4)
PAYMENT_ID=$(echo $PAYMENT_RESPONSE | grep -o '"paymentId":"[^"]*' | cut -d'"' -f4)

if [ ! -z "$CHECKOUT_URL" ]; then
  echo "✅ Payment initiated successfully!"
  echo "Payment ID: $PAYMENT_ID"
  echo ""
  echo "📱 Next Steps:"
  echo "1. Open this URL in your browser to complete payment:"
  echo "   $CHECKOUT_URL"
  echo ""
  echo "2. After payment, PhonePe will call the callback endpoint automatically"
  echo ""
  echo "3. Then check subscription status again:"
  echo "   curl -X GET \"${BASE_URL}/user/subscription\" \\"
  echo "     -H \"Authorization: Bearer ${USER_TOKEN}\""
  echo ""
else
  echo "⚠️  Could not extract checkout URL. Check the response above."
fi

echo "=========================================="
echo "Test Complete!"
echo "=========================================="
