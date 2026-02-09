# Buy Package - Complete Curl Commands

## Production API URL
```
https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev
```

---

## Complete Purchase Flow

### Step 1: Register a Regular User

```bash
curl -X POST "https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "user@test.com",
    "password": "user123"
  }'
```

**Response:**
```json
{
  "message": "User registered successfully",
  "userId": "uuid-here"
}
```

---

### Step 2: Login as User

```bash
curl -X POST "https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@test.com",
    "password": "user123"
  }'
```

**Response:**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": "uuid",
    "name": "Test User",
    "email": "user@test.com"
  }
}
```

**Save the token:**
```bash
export USER_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### Step 3: List Available Packages

```bash
curl -X GET "https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev/packages" \
  -H "Authorization: Bearer ${USER_TOKEN}"
```

**Response:**
```json
{
  "packages": [
    {
      "packageId": "uuid-here",
      "name": "Test Package - ₹1",
      "price": 1,
      "invoiceLimit": 5,
      "quotationLimit": 5,
      "isActive": true,
      "createdAt": "2026-02-09T...",
      "updatedAt": "2026-02-09T..."
    }
  ]
}
```

**Save the packageId:**
```bash
export PACKAGE_ID="uuid-here"
```

---

### Step 4: Check Current Subscription Status

```bash
curl -X GET "https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev/user/subscription" \
  -H "Authorization: Bearer ${USER_TOKEN}"
```

**Response (before purchase):**
```json
{
  "hasActiveSubscription": false,
  "subscription": null,
  "remainingInvoices": 0,
  "remainingQuotations": 0
}
```

---

### Step 5: Initiate PhonePe Payment

```bash
curl -X POST "https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev/payments/phonepe/create" \
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

**📱 Open `checkoutUrl` in browser to complete payment**

---

### Step 6: Complete Payment

1. **Open the `checkoutUrl`** from Step 5 in your browser
2. **Complete payment** using PhonePe (test mode or real payment)
3. PhonePe will automatically call your callback endpoint
4. Your subscription will be credited automatically

---

### Step 7: Verify Subscription After Payment

```bash
curl -X GET "https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev/user/subscription" \
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

## Quick Test Script

Run the automated purchase flow:

```bash
chmod +x test_package_purchase.sh
./test_package_purchase.sh
```

This script will:
1. Register a test user
2. Login and get token
3. List available packages
4. Check current subscription
5. Initiate PhonePe payment
6. Show you the checkout URL to complete payment

---

## Notes

1. **Payment Flow**: After initiating payment, you'll get a `checkoutUrl`. Open this URL to complete the payment.

2. **Callback**: PhonePe will automatically call `/payments/phonepe/callback` after payment. You don't need to call it manually.

3. **Subscription Credit**: The subscription is credited automatically when PhonePe confirms successful payment via callback.

4. **Testing**: For testing, you can use PhonePe's test mode or sandbox environment.

5. **Multiple Purchases**: If you buy another package, the limits will be added cumulatively to your existing subscription.
