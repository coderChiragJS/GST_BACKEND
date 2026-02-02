#!/bin/bash

# Configuration
API_URL="https://rofkc8i0bl.execute-api.eu-north-1.amazonaws.com/dev"
TIMESTAMP=$(date +%s)
EMAIL="phase2_${TIMESTAMP}@example.com"
PASSWORD="password123"

echo "---------------------------------------------------"
echo "TEST 1: Register User ($EMAIL)"
curl -s -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Phase2 Tester\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" > register.json
cat register.json
echo ""

# Extract Token Logic (Requires manual step or jq, simplified here to just login and print)
echo "---------------------------------------------------"
echo "TEST 2: Login & Get Token"
curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" > login.json
cat login.json
echo ""

# Extract Token (Simple grep/cut hack for demo, ideally use jq)
TOKEN=$(cat login.json | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "Error: Failed to get token."
  exit 1
fi

echo "Auth Token: $TOKEN"

echo "---------------------------------------------------"
echo "TEST 3: Create Business"
curl -s -X POST "$API_URL/business" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "firmName": "Tech Solutions Ltd",
    "gstNumber": "27ABCDE1234F1Z5",
    "pan": "ABCDE1234F",
    "mobile": "9876543210",
    "email": "info@techsolutions.com",
    "address": { "street": "123 Main St", "city": "Mumbai" }
  }' > business_create.json
cat business_create.json
echo ""

echo "---------------------------------------------------"
echo "TEST 4: List Businesses"
curl -s -X GET "$API_URL/business" \
  -H "Authorization: Bearer $TOKEN" > business_list.json
cat business_list.json
echo ""
echo "---------------------------------------------------"
