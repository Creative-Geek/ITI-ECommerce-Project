# API Reference

All data in byteStore flows through Supabase's REST API. This document lists every endpoint the app uses.

> **Base URL:** `https://<PROJECT_REF>.supabase.co`
>
> **Required headers on every request:**
>
> - `apikey: <SUPABASE_ANON_KEY>` — identifies the project
> - `Authorization: Bearer <token>` — either the anon key (public) or user JWT (authenticated)
> - `Content-Type: application/json`

---

## Products

### Get All Products

```
GET /rest/v1/products?select=*
```

Returns all products. Used on the shop page and homepage.

### Get a Single Product

```
GET /rest/v1/products?id=eq.{id}&select=*
```

Returns one product by its ID. Used on the product detail page.

### Search Products by Name

```
GET /rest/v1/products?name=ilike.*{query}*&select=*
```

Case-insensitive search. Used by the search bar.

### Filter by Category

```
GET /rest/v1/products?category=eq.{category}&select=*
```

Returns products in a specific category (e.g., `Laptops`, `Phones`, `Audio`, `Accessories`).

### Create a Product (Admin)

```
POST /rest/v1/products
```

**Auth required:** Admin JWT in the `Authorization` header.

**Body:**

```json
{
  "name": "Product Name",
  "description": "Description text",
  "price": 999.99,
  "category": "Laptops",
  "brand": "Brand Name",
  "image_url": "https://...",
  "stock": 10,
  "specs": "Markdown-formatted specs"
}
```

### Update a Product (Admin)

```
PATCH /rest/v1/products?id=eq.{id}
```

**Auth required:** Admin JWT.

**Body:** Only the fields being updated.

### Delete a Product (Admin)

```
DELETE /rest/v1/products?id=eq.{id}
```

**Auth required:** Admin JWT.

---

## Authentication

### Register a New User

```
POST /auth/v1/signup
```

**Body:**

```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:** Returns the new user object. A confirmation email is sent.

### Log In

```
POST /auth/v1/token?grant_type=password
```

**Body:**

```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:** Returns `access_token`, `refresh_token`, and `user` object. These are stored in `localStorage` for session persistence.

### Refresh Token

```
POST /auth/v1/token?grant_type=refresh_token
```

**Body:**

```json
{
  "refresh_token": "<stored_refresh_token>"
}
```

Used to get a new access token when the current one expires.

---

## Orders

### Place an Order

```
POST /rest/v1/orders
```

**Auth required:** User JWT.

**Headers:** `Prefer: return=representation` (to get the created order back with its ID).

**Body:**

```json
{
  "user_id": "<user_uuid>",
  "total_amount": 1299.99,
  "shipping_address": "123 Main St, Cairo"
}
```

### Add Order Items

```
POST /rest/v1/order_items
```

**Auth required:** User JWT.

**Body:**

```json
{
  "order_id": 1,
  "product_id": 42,
  "quantity": 2,
  "price_at_purchase": 649.99
}
```

### Get User's Orders

```
GET /rest/v1/orders?user_id=eq.{user_id}&select=*
```

**Auth required:** User JWT. RLS ensures users can only see their own orders.

---

## Reviews

### Get Reviews for a Product

```
GET /rest/v1/reviews?product_id=eq.{id}&select=*
```

Returns all reviews for a specific product. Public access (no auth required).

---

## Chatbot (Edge Function)

### Send Message to AI Assistant

```
POST /functions/v1/chatbot
```

**Auth required:** User JWT in the `Authorization` header.

**Headers:**

```json
{
  "Authorization": "Bearer <user_jwt>",
  "apikey": "<SUPABASE_ANON_KEY>",
  "Content-Type": "application/json"
}
```

**Body:**

```json
{
  "message": "عاوز موبايل سامسونج تحت 15 ألف",
  "history": [
    { "role": "user", "content": "السلام عليكم" },
    {
      "role": "assistant",
      "content": "أهلاً! أنا Byte\nقولّي إنتَ بتدور على إيه..."
    }
  ],
  "session_id": "uuid-string-optional"
}
```

**Request Fields:**

- `message` (required) — The user's message to the chatbot (Arabic or English)
- `history` (optional) — Array of previous messages in the conversation (max 24 messages)
  - Each message has `role` ("user" or "assistant") and `content` (string)
- `session_id` (optional) — UUID of existing chat session. If omitted, a new session is created

**Response (Success):**

```json
{
  "reply": "لقيت ليك كام اختيار من سامسونج في الميزانية دي:\n\n1. Samsung Galaxy A54...",
  "products": [
    {
      "id": 123,
      "name": "Samsung Galaxy A54 5G",
      "price": 14999,
      "category": "phone",
      "brand": "Samsung",
      "image_url": "https://..."
    }
  ],
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response Fields:**

- `reply` — The chatbot's text response
- `products` — Array of product objects to display as cards (0-5 products)
- `session_id` — UUID of the chat session for this conversation

**Error Responses:**

**401 Unauthorized:**

```json
{
  "message": "Unauthorized",
  "details": "Missing JWT"
}
```

**429 Too Many Requests (Rate Limited):**

```json
{
  "message": "معلش، عدد الرسائل كتير قوي دلوقتي. جرّب تاني بعد شوية.",
  "retry_after": 600
}
```

**Headers:** `Retry-After: 600` (seconds until the rate limit resets)

**500 Internal Server Error:**

```json
{
  "message": "Internal error",
  "details": "Groq error (500): ..."
}
```

### How the Chatbot Works

1. **Authentication** — Verifies the user's JWT token
2. **Rate Limiting** — Checks if the user has exceeded 20 messages in the last 10 minutes
3. **Query Expansion** — Translates Arabic keywords to English (شاحن → charger, كيبورد → keyboard)
4. **Function Calling** — Sends the message to Groq's LLM with three available tools:
   - `search_products` — Search the products table by query, category, brand, price
   - `get_price_range` — Get min/max prices and counts for categories
   - `show_products` — Display specific product IDs as UI cards
5. **Tool Execution** — When the LLM calls a tool, the Edge Function queries the database
6. **Response Generation** — The LLM generates a natural language reply based on tool results
7. **Logging** — Conversation is saved to `chat_sessions` and `chat_messages` tables

### Tools Available to the LLM

**search_products:**

```json
{
  "query": "charger fast",
  "category": "accessory",
  "brand": "Anker",
  "min_price": 2000,
  "max_price": 5000,
  "sort": "price_asc"
}
```

**get_price_range:**

```json
{
  "category": "laptop"
}
```

**show_products:**

```json
{
  "ids": ["123", "456", "789"]
}
```

---

## Storage (Image Upload)

### Upload a Product Image (Admin)

```
POST /storage/v1/object/product-images/{filename}
```

**Auth required:** Admin JWT.

**Headers:** `Content-Type: image/*` (the actual MIME type of the image).

**Body:** Raw file binary.

**Response:** Returns the storage path. The public URL is constructed as:

```
https://<PROJECT_REF>.supabase.co/storage/v1/object/public/product-images/{filename}
```

---

## Error Handling

All API wrappers in `js/api.js` follow the same pattern:

1. If the response status is `401` (Unauthorized), the access token is cleared from `localStorage` and the user is prompted to log in again
2. For other errors, the response body is parsed for a descriptive error message
3. Errors are thrown as `Error` objects and caught by the calling code, which displays them as toast notifications
