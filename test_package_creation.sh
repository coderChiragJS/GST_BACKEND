#!/bin/bash

# PhonePe Payment Gateway - Test Package Creation Script
# Production API URL (can be overridden with BASE_URL env variable)

BASE_URL="${BASE_URL:-https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev}"

echo "=========================================="
echo "PhonePe Package Creation Test"
echo "=========================================="
echo ""

# Step 1: Register Admin (if not already registered)
echo "Step 1: Register Admin User"
echo "----------------------------------------"
ADMIN_EMAIL="admin@test.com"
ADMIN_PASSWORD="admin123"
ADMIN_NAME="Test Admin"

REGISTER_RESPONSE=$(curl -s -X POST "${BASE_URL}/admin/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"${ADMIN_NAME}\",
    \"email\": \"${ADMIN_EMAIL}\",
    \"password\": \"${ADMIN_PASSWORD}\"
  }")

echo "Register Response: $REGISTER_RESPONSE"
echo ""

# Step 2: Login as Admin
echo "Step 2: Login as Admin"
echo "----------------------------------------"
LOGIN_RESPONSE=$(curl -s -X POST "${BASE_URL}/admin/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${ADMIN_EMAIL}\",
    \"password\": \"${ADMIN_PASSWORD}\"
  }")

echo "Login Response: $LOGIN_RESPONSE"
echo ""

# Extract token from response (assuming JSON response with 'token' field)
TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "ERROR: Could not extract token. Please check the login response."
  echo "You may need to manually extract the token and set it:"
  echo "export TOKEN='your-token-here'"
  exit 1
fi

echo "Token extracted: ${TOKEN:0:20}..."
echo ""

# Step 3: Create ₹1 Test Package
echo "Step 3: Create ₹1 Test Package"
echo "----------------------------------------"
CREATE_PACKAGE_RESPONSE=$(curl -s -X POST "${BASE_URL}/admin/packages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "name": "Test Package - ₹1",
    "price": 1,
    "invoiceLimit": 5,
    "quotationLimit": 5,
    "isActive": true
  }')

echo "Create Package Response:"
echo "$CREATE_PACKAGE_RESPONSE" | jq '.' 2>/dev/null || echo "$CREATE_PACKAGE_RESPONSE"
echo ""

# Extract packageId if available
PACKAGE_ID=$(echo $CREATE_PACKAGE_RESPONSE | grep -o '"packageId":"[^"]*' | cut -d'"' -f4)

if [ ! -z "$PACKAGE_ID" ]; then
  echo "✅ Package created successfully!"
  echo "Package ID: $PACKAGE_ID"
  echo ""
  
  # Step 4: List all packages to verify
  echo "Step 4: List All Packages (Verification)"
  echo "----------------------------------------"
  LIST_RESPONSE=$(curl -s -X GET "${BASE_URL}/admin/packages" \
    -H "Authorization: Bearer ${TOKEN}")
  
  echo "All Packages:"
  echo "$LIST_RESPONSE" | jq '.' 2>/dev/null || echo "$LIST_RESPONSE"
  echo ""
else
  echo "⚠️  Could not extract packageId. Check the response above."
fi

echo "=========================================="
echo "Test Complete!"
echo "=========================================="
