#!/bin/bash

# Configuration
API_URL="https://rofkc8i0bl.execute-api.eu-north-1.amazonaws.com/dev"
TIMESTAMP=$(date +%s)
EMAIL="prod_test_${TIMESTAMP}@example.com"
PASSWORD="password123"

echo "---------------------------------------------------"
echo "TEST 1: Register User ($EMAIL)"
curl -s -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Product Tester\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" > register.json
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
  echo "Error: Failed to get token. Make sure serverless-offline is running at $API_URL"
  exit 1
fi

echo "---------------------------------------------------"
echo "TEST 3: Create Business"
curl -s -X POST "$API_URL/business" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "firmName": "Product Test Business",
    "mobile": "9876543210",
    "address": { "city": "Test City", "state": "Test State" }
  }' > business_create.json
cat business_create.json
echo ""

BUSINESS_ID=$(cat business_create.json | grep -o '"businessId":"[^"]*' | cut -d'"' -f4)

if [ -z "$BUSINESS_ID" ]; then
  echo "Error: Failed to create business."
  exit 1
fi

echo "---------------------------------------------------"
echo "TEST 4: Create Product (COMPREHENSIVE) for Business $BUSINESS_ID"
curl -s -X POST "$API_URL/business/$BUSINESS_ID/products" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Heavy Duty Industrial Drill",
    "type": "product",
    "description": "Powerful 1200W drill for professional use with variable speed control.",
    "hsnSac": "8467",
    "unit": "Nos",
    "secondaryUnit": "Box",
    "conversionRate": 10,
    "salesPrice": 12500,
    "taxInclusive": false,
    "gstPercent": 18,
    "cessType": "Percentage",
    "cessValue": 1.5,
    "discountType": "amount",
    "discountValue": 500,
    "purchasePrice": 8500,
    "taxInclusivePurchase": true,
    "wholesalePrice": 11000,
    "minWholesaleQty": 5,
    "categoryId": "POWER_TOOLS",
    "imagePath": "https://s3.amazonaws.com/my-bucket/products/drill.jpg",
    "customFields": [
      { "name": "Warranty", "value": "2 Years" },
      { "name": "Power Source", "value": "Corded Electric" },
      { "name": "Weight", "value": "3.5kg" }
    ]
  }' > product_comprehensive.json
cat product_comprehensive.json
echo ""

echo "---------------------------------------------------"
echo "TEST 5: List Products for Business $BUSINESS_ID"
curl -s -X GET "$API_URL/business/$BUSINESS_ID/products" \
  -H "Authorization: Bearer $TOKEN" > product_list.json
cat product_list.json
echo ""

PRODUCT_ID=$(cat product_comprehensive.json | grep -o '"productId":"[^"]*' | cut -d'"' -f4)

echo "---------------------------------------------------"
echo "TEST 6: Get Product Details for $PRODUCT_ID"
curl -s -X GET "$API_URL/business/$BUSINESS_ID/products/$PRODUCT_ID" \
  -H "Authorization: Bearer $TOKEN" > product_get.json
cat product_get.json
echo ""

echo "---------------------------------------------------"
echo "TEST 7: Update Product for $PRODUCT_ID"
curl -s -X PUT "$API_URL/business/$BUSINESS_ID/products/$PRODUCT_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "salesPrice": 15000,
    "description": "UPDATED DESCRIPTION"
  }' > product_update.json
cat product_update.json
echo ""

echo "---------------------------------------------------"
echo "TEST 8: Delete Product for $PRODUCT_ID"
curl -s -X DELETE "$API_URL/business/$BUSINESS_ID/products/$PRODUCT_ID" \
  -H "Authorization: Bearer $TOKEN" > product_delete.json
cat product_delete.json
echo ""

echo "---------------------------------------------------"
echo "TEST 9: Verify Deletion in List"
curl -s -X GET "$API_URL/business/$BUSINESS_ID/products" \
  -H "Authorization: Bearer $TOKEN" > product_list_final.json
# Note: Delete is a soft-delete, so it might still appear in the list unless we filter by status.
# For now, we just check the response.
cat product_list_final.json
echo ""
echo "---------------------------------------------------"
