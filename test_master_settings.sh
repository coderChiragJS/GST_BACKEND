#!/bin/bash

# Configuration
API_URL="https://rofkc8i0bl.execute-api.eu-north-1.amazonaws.com/dev"
TIMESTAMP=$(date +%s)
EMAIL="master_test_${TIMESTAMP}@example.com"
PASSWORD="password123"

echo "==================================================="
echo "Master Settings Test Suite"
echo "==================================================="

echo "---------------------------------------------------"
echo "TEST 1: Register User ($EMAIL)"
curl -s -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Master Settings Tester\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" > register.json
cat register.json
echo ""

echo "---------------------------------------------------"
echo "TEST 2: Login & Get Token"
curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" > login.json
cat login.json
echo ""

TOKEN=$(cat login.json | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "Error: Failed to get token"
  exit 1
fi

echo "---------------------------------------------------"
echo "TEST 3: Create Business with Bank Accounts"
curl -s -X POST "$API_URL/business" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "firmName": "Master Settings Test Co",
    "mobile": "9876543210",
    "address": { 
      "city": "Bangalore", 
      "state": "Karnataka" 
    },
    "bankAccounts": [
      {
        "id": "ba-001",
        "accountName": "Master Settings Test Co",
        "bankName": "HDFC Bank",
        "accountNumber": "50100123456789",
        "ifscCode": "HDFC0001234",
        "branch": "Koramangala Branch",
        "upiId": "test@hdfc",
        "isDefault": true
      },
      {
        "id": "ba-002",
        "accountName": "Master Settings Test Co",
        "bankName": "ICICI Bank",
        "accountNumber": "012345678901",
        "ifscCode": "ICIC0001234",
        "branch": "MG Road",
        "upiId": "test@icici",
        "isDefault": false
      }
    ]
  }' > business_create.json
cat business_create.json
echo ""

BUSINESS_ID=$(cat business_create.json | grep -o '"businessId":"[^"]*' | cut -d'"' -f4)

if [ -z "$BUSINESS_ID" ]; then
  echo "Error: Failed to create business"
  exit 1
fi

echo "---------------------------------------------------"
echo "TEST 4: Update Business - Add Transporters"
curl -s -X PUT "$API_URL/business/$BUSINESS_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "transporters": [
      {
        "id": "tr-001",
        "transporterId": "TR123",
        "name": "Fast Logistics Pvt Ltd",
        "isDefault": true
      },
      {
        "id": "tr-002",
        "transporterId": "TR456",
        "name": "Quick Transport Services",
        "isDefault": false
      }
    ]
  }' > business_update_transporters.json
cat business_update_transporters.json
echo ""

echo "---------------------------------------------------"
echo "TEST 5: Update Business - Add Terms Templates"
curl -s -X PUT "$API_URL/business/$BUSINESS_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "termsTemplates": [
      {
        "id": "tt-001",
        "name": "Standard Terms",
        "terms": [
          "Payment due within 30 days",
          "Late payment subject to 2% monthly interest",
          "All disputes subject to Bangalore jurisdiction"
        ],
        "isDefault": true
      },
      {
        "id": "tt-002",
        "name": "Export Terms",
        "terms": [
          "Payment via LC only",
          "Shipping FOB",
          "All disputes subject to international arbitration"
        ],
        "isDefault": false
      }
    ]
  }' > business_update_terms.json
cat business_update_terms.json
echo ""

echo "---------------------------------------------------"
echo "TEST 6: Update Business - Add Signature & Stamp URLs"
curl -s -X PUT "$API_URL/business/$BUSINESS_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "defaultSignatureUrl": "https://s3.amazonaws.com/bucket/signatures/test-sign.png",
    "defaultStampUrl": "https://s3.amazonaws.com/bucket/stamps/test-stamp.png"
  }' > business_update_urls.json
cat business_update_urls.json
echo ""

echo "---------------------------------------------------"
echo "TEST 7: Get Business - Verify All Master Settings"
curl -s -X GET "$API_URL/business" \
  -H "Authorization: Bearer $TOKEN" > business_final.json
cat business_final.json
echo ""

echo "---------------------------------------------------"
echo "TEST 8: Validation Test - Invalid IFSC Code"
curl -s -X PUT "$API_URL/business/$BUSINESS_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "bankAccounts": [
      {
        "id": "ba-003",
        "accountName": "Test",
        "bankName": "Test Bank",
        "accountNumber": "123456",
        "ifscCode": "INVALID",
        "isDefault": false
      }
    ]
  }' > validation_error.json
cat validation_error.json
echo ""

echo "==================================================="
echo "Test Suite Complete"
echo "==================================================="
