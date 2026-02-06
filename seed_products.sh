#!/bin/bash

API_URL="https://rofkc8i0bl.execute-api.eu-north-1.amazonaws.com/dev"
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkNDg1YjlmNS02ZDYwLTQ5NGItODhjOC0zMmFmMzBlYTZkZTgiLCJlbWFpbCI6ImNoaXJhZ3Rhbmt3YWxAZ21haWwuY29tIiwicm9sZSI6IlVTRVIiLCJpYXQiOjE3NzAyMDQ2MzAsImV4cCI6MTc3MDI5MTAzMH0.RhSoA3CDmaVfBYyjMAQlKmRXqqkKx0vQKOPJDl1ur3s"
BUSINESS_ID="af7ac168-3a1c-46a7-ba8e-24513b3366b4"

create_product() {
  local name=$1
  local price=$2
  local gst=$3
  
  echo "Creating product: $name"
  curl -s -X POST "$API_URL/business/$BUSINESS_ID/products" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
      \"name\": \"$name\",
      \"type\": \"product\",
      \"unit\": \"Nos\",
      \"salesPrice\": $price,
      \"gstPercent\": $gst,
      \"cessType\": \"Percentage\",
      \"cessValue\": 0,
      \"categoryId\": \"General\",
      \"imagePath\": null
    }"
  echo -e "\n-----------------------------------"
}

create_product "Gaming Laptop X1" 85000 18
create_product "Wireless Mouse" 1200 12
create_product "Mechanical Keyboard" 4500 18

echo "Seeding complete. Fetching updated list..."
curl -s -X GET "$API_URL/business/$BUSINESS_ID/products" \
  -H "Authorization: Bearer $TOKEN" | grep -o '"count":[0-9]*'
