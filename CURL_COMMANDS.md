# PhonePe Payment Gateway - Curl Commands

## Base URL
**Production API URL**: `https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev`

For local testing, override with:
```bash
export BASE_URL="http://localhost:3000"
```

---

## Step 1: Register Admin (if not already registered)

```bash
BASE_URL="https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev"

curl -X POST "${BASE_URL}/admin/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Admin",
    "email": "admin@test.com",
    "password": "admin123"
  }'
```

**Response:**
```json
{
  "message": "Admin user registered successfully.",
  "userId": "uuid-here"
}
```

---

## Step 2: Login as Admin

```bash
curl -X POST "${BASE_URL}/admin/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.com",
    "password": "admin123"
  }'
```

**Response:**
```json
{
  "message": "Admin login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": "uuid",
    "name": "Test Admin",
    "email": "admin@test.com",
    "role": "ADMIN"
  }
}
```

**Save the token:**
```bash
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Step 3: Create ₹1 Test Package

```bash
curl -X POST "${BASE_URL}/admin/packages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "name": "Test Package - ₹1",
    "price": 1,
    "invoiceLimit": 5,
    "quotationLimit": 5,
    "isActive": true
  }'
```

**Response:**
```json
{
  "package": {
    "packageId": "uuid-here",
    "name": "Test Package - ₹1",
    "price": 1,
    "invoiceLimit": 5,
    "quotationLimit": 5,
    "validityDays": null,
    "isActive": true,
    "createdAt": "2026-02-09T...",
    "updatedAt": "2026-02-09T..."
  }
}
```

**Save the packageId:**
```bash
export PACKAGE_ID="uuid-here"
```

---

## Step 4: List All Packages (Verification)

```bash
curl -X GET "${BASE_URL}/admin/packages" \
  -H "Authorization: Bearer ${TOKEN}"
```

---

## Step 5: Test Payment Flow (User Side)

### 5.1 Register a Regular User

```bash
curl -X POST "${BASE_URL}/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "user@test.com",
    "password": "user123"
  }'
```

### 5.2 Login as Regular User

```bash
curl -X POST "${BASE_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@test.com",
    "password": "user123"
  }'
```

**Save user token:**
```bash
export USER_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### 5.3 List Available Packages (User View)

```bash
curl -X GET "${BASE_URL}/packages" \
  -H "Authorization: Bearer ${USER_TOKEN}"
```

### 5.4 Initiate PhonePe Payment

```bash
curl -X POST "${BASE_URL}/payments/phonepe/create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${USER_TOKEN}" \
  -d "{
    \"packageId\": \"${PACKAGE_ID}\"
  }"
```

**Response:**
```json
{
  "paymentId": "ORD_abc123...",
  "checkoutUrl": "https://mercury-uat.phonepe.com/transact/...",
  "phonePeOrderId": "phonepe-order-id"
}
```

**Open `checkoutUrl` in browser to complete payment.**

---

## Step 6: Check User Subscription (After Payment)

```bash
curl -X GET "${BASE_URL}/user/subscription" \
  -H "Authorization: Bearer ${USER_TOKEN}"
```

**Response (after successful payment):**
```json
{
  "hasActiveSubscription": true,
  "subscription": {
    "subscriptionId": "uuid",
    "packageId": "uuid",
    "packageName": "Test Package - ₹1",
    "invoiceLimit": 5,
    "quotationLimit": 5,
    "invoicesUsed": 0,
    "quotationsUsed": 0,
    "startDate": "2026-02-09T...",
    "endDate": null
  },
  "remainingInvoices": 5,
  "remainingQuotations": 5
}
```

---

## Complete Test Script

Run the automated script (uses production URL by default):

```bash
chmod +x test_package_creation.sh
./test_package_creation.sh
```

Or override with a different URL:

```bash
BASE_URL="http://localhost:3000" ./test_package_creation.sh
```

---

## Notes

1. **PhonePe Callback**: The callback endpoint `/payments/phonepe/callback` is called automatically by PhonePe after payment. You don't need to call it manually.

2. **Environment**: Make sure `PHONEPE_ENV` is set to `SANDBOX` for testing or `PRODUCTION` for live payments.

3. **Minimum Amount**: PhonePe requires minimum ₹1 (100 paise) for payments.

4. **Callback URL**: Configure the callback URL in PhonePe dashboard to point to:
   ```
   ${BASE_URL}/payments/phonepe/callback
   ```

5. **Webhook Auth**: The callback uses Basic Auth with:
   - Username: `PHONEPE_WEBHOOK_USERNAME` (from .env)
   - Password: `PHONEPE_WEBHOOK_PASSWORD` (from .env)
