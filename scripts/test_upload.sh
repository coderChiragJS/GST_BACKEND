#!/bin/bash

# Configuration - Update these if needed
API_URL="https://rofkc8i0bl.execute-api.eu-north-1.amazonaws.com/dev"
EMAIL="master_test_$(date +%s)@example.com"
PASSWORD="password123"

echo "==================================================="
echo "S3 Upload Verification Test"
echo "==================================================="

# 1. Register/Login to get Token
echo "Step 1: Registering/Logging in..."
curl -s -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Upload Tester\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" > /dev/null

curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" > login_upload.json

TOKEN=$(cat login_upload.json | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "Error: Failed to get auth token"
  exit 1
fi

echo "Auth Token obtained successfully."

# 2. Prepare/Select image file
TEST_FILE=$1
if [ -z "$TEST_FILE" ]; then
  echo "Step 2: Preparing dummy test image..."
  TEST_FILE="test_image.png"
  echo "This is a dummy image file" > "$TEST_FILE"
  IS_DUMMY=true
else
  echo "Step 2: Using provided image: $TEST_FILE"
  IS_DUMMY=false
fi

# 3. Upload the image
echo "Step 3: Uploading image to $API_URL/upload ..."
curl -v -X POST "$API_URL/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@$TEST_FILE" > upload_response.json

echo ""
echo "Upload Response:"
cat upload_response.json
echo ""

# 4. Extract URL and Verify
UPLOADED_URL=$(cat upload_response.json | grep -o '"url":"[^"]*' | cut -d'"' -f4)

if [ -z "$UPLOADED_URL" ]; then
  echo "Error: Upload failed, no URL returned."
  exit 1
fi

echo "---------------------------------------------------"
echo "SUCCESS: Image uploaded to S3!"
echo "Public URL: $UPLOADED_URL"
echo "---------------------------------------------------"

# Cleanup
if [ "$IS_DUMMY" = true ]; then
  rm "$TEST_FILE"
fi
rm login_upload.json upload_response.json
