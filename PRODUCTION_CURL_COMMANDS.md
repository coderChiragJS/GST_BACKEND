# Production API - Quick Curl Commands

## Production Base URL
```
https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev
```

---

## 1. Login as Admin

```bash
curl -X POST "https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev/admin/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.com",
    "password": "admin123"
  }'
```

**Save the token:**
```bash
export TOKEN="your-token-here"
```

---

## 2. Create ₹1 Package

```bash
curl -X POST "https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev/admin/packages" \
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

---

## 3. List All Packages

```bash
curl -X GET "https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev/admin/packages" \
  -H "Authorization: Bearer ${TOKEN}"
```

---

## 4. User Flow - List Available Packages

```bash
# First login as user and get USER_TOKEN
curl -X GET "https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev/packages" \
  -H "Authorization: Bearer ${USER_TOKEN}"
```

---

## 5. Initiate PhonePe Payment

```bash
curl -X POST "https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev/payments/phonepe/create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${USER_TOKEN}" \
  -d '{
    "packageId": "your-package-id-here"
  }'
```

**Response will include `checkoutUrl` - open this URL to complete payment.**

---

## 6. Check User Subscription

```bash
curl -X GET "https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev/user/subscription" \
  -H "Authorization: Bearer ${USER_TOKEN}"
```

---

## Quick Test Script

Run the automated script (uses production URL by default):

```bash
./test_package_creation.sh
```

---

## PhonePe Callback URL

Make sure PhonePe dashboard has callback URL configured as:
```
https://qn83jg9dc5.execute-api.us-east-1.amazonaws.com/dev/payments/phonepe/callback
```

With Basic Auth:
- Username: `DevAdmin`
- Password: `olivia123`
