<p align="center">
  <img src="assets/bytestorelogo.svg" alt="byteStore Logo" width="80" />
</p>

<h1 align="center">byteStore</h1>

<p align="center">
  A modern e-commerce store for tech products — built with vanilla JavaScript and powered by Supabase.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white" alt="HTML5" />
  <img src="https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white" alt="CSS3" />
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black" alt="JavaScript" />
  <img src="https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
</p>

---

## What is byteStore?

**byteStore** is a fully functional online electronics store where users can browse laptops, phones, audio gear, and accessories — add items to their cart — and complete a checkout flow, all without leaving the browser.

It's built entirely with **HTML, CSS, and vanilla JavaScript** (no React, Vue, or Angular). The backend is powered by **Supabase**, accessed purely through the Fetch API.

---

## ✨ Features

| Feature                 | Description                                                                      |
| ----------------------- | -------------------------------------------------------------------------------- |
| 🛍️ **Product Browsing** | Browse 128+ products across 4 categories with images, specs, and reviews         |
| 🔍 **Search & Filters** | Search by name, filter by category, brand, and price range                       |
| 🛒 **Shopping Cart**    | Add/remove items, adjust quantities, see live totals — all saved in your browser |
| 💳 **Checkout**         | Complete checkout form with address and phone validation                         |
| 🔐 **User Accounts**    | Register, log in, and manage your profile                                        |
| 🌙 **Dark Mode**        | Toggle between light and dark themes                                             |
| 📱 **Responsive**       | Looks great on desktop, tablet, and mobile                                       |
| ⭐ **Product Reviews**  | Each product has customer reviews and ratings                                    |
| 🔧 **Admin Dashboard**  | Manage products (add, edit, delete) with image uploads                           |
| 🎨 **Modern Design**    | Smooth animations, hover effects, and a brand logo carousel                      |

---

## 📄 Pages

| Page                           | Description                                    |
| ------------------------------ | ---------------------------------------------- |
| **Home** (`index.html`)        | Hero banner, featured products, brand carousel |
| **Shop** (`shop.html`)         | Full product catalog with filters and search   |
| **Product** (`product.html`)   | Product details, specs table, and reviews      |
| **Cart** (`cart.html`)         | Cart summary with quantity controls            |
| **Checkout** (`checkout.html`) | Shipping form and order placement              |
| **Login** (`login.html`)       | User authentication                            |
| **Register** (`register.html`) | New account creation                           |
| **Profile** (`profile.html`)   | User profile and order history                 |
| **About** (`about.html`)       | About the store and team                       |
| **Contact** (`contact.html`)   | Contact form                                   |
| **Admin** (`admin.html`)       | Product management dashboard                   |

---

## 🛠️ Tech Stack

- **HTML5** — Semantic markup for all pages
- **CSS3 / Tailwind CSS** — Utility-first styling via CDN (no build step)
- **Franken UI** — Pre-built UI components with a modern shadcn-like aesthetic
- **Vanilla JavaScript (ES6+)** — All interactivity, no frameworks
- **Supabase** — PostgreSQL database + Auth, accessed via REST API using `fetch()`
- **Lucide Icons** — Clean, customizable icon set

---

## 🚀 Getting Started

1. **Clone the repo:**

   ```bash
   git clone https://github.com/Creative-Geek/byteStore.git
   cd byteStore
   ```

2. **Open in your browser:**

   ```bash
   # Simply open index.html — no build step or server required!
   # Or use a local server for best results:
   npx serve .
   ```

3. **That's it!** The app connects to a hosted Supabase backend — no setup required for browsing.

---

## 🤖 AI Chatbot (Groq + Supabase Edge Function)

This project includes an **Egyptian Arabic** chatbot that helps users find products.

### How it works

- Frontend widget: `js/chatbot.js` (conversation is saved in `localStorage`)
- Backend: Supabase **Edge Function** at `/functions/v1/chatbot`
- LLM: **Groq** model `llama-3.3-70b-versatile` using **tool use / function calling**
- The model can call a tool `search_products` to query your actual `products` table (max **5** results)

> Security: the Groq API key is stored as a Supabase secret and never exposed to the browser.

### Requirements

- User must be **logged in** to use the chatbot
- Rate limit: **20 messages / 10 minutes / user** (configurable in the Edge Function)

### Setup (Supabase)

1. Create the rate limit function/table by running the migration SQL:

`supabase/migrations/20260221000000_chatbot_rate_limit.sql`

2. Set Edge Function secrets:

```bash
supabase secrets set GROQ_API_KEY=YOUR_GROQ_KEY
supabase secrets set GROQ_MODEL=llama-3.3-70b-versatile
```

> The Edge Function also requires `SUPABASE_SERVICE_ROLE_KEY` in its environment.
> If you deploy through Supabase CLI, this is typically available to functions automatically.
> If not, set it as a secret too:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

3. Deploy the function:

```bash
supabase functions deploy chatbot
```

### Frontend integration

All pages already load:

- `css/style.css` (contains widget styles)
- `js/chatbot.js` (injects the floating icon + chat window)

---

## 📁 Project Structure

```
byteStore/
├── assets/            # Images, logos, and brand assets
├── css/
│   └── style.css      # Custom styles and Tailwind overrides
├── docs/              # Project documentation
│   ├── architecture.md
│   ├── features.md
│   └── api-reference.md
├── js/
│   ├── api.js         # Fetch wrappers for Supabase REST API
│   ├── auth.js        # Login, register, logout, session management
│   ├── cart.js        # LocalStorage-based cart logic
│   ├── admin.js       # Admin dashboard functionality
│   ├── ui.js          # DOM rendering and UI components
│   └── router.js      # URL parameter helpers
├── index.html         # Home page
├── shop.html          # Product catalog
├── product.html       # Product detail page
├── cart.html          # Shopping cart
├── checkout.html      # Checkout flow
├── login.html         # Login
├── register.html      # Registration
├── profile.html       # User profile
├── about.html         # About us
├── contact.html       # Contact form
├── admin.html         # Admin dashboard
└── README.md
```

---

## 📚 Documentation

For more details, check out the [docs](docs/) folder:

- [**Architecture**](docs/architecture.md) — How the app is structured and how data flows
- [**Features**](docs/features.md) — Detailed breakdown of every feature
- [**API Reference**](docs/api-reference.md) — All Supabase endpoints used by the app

---

## 📝 License

This project was built as part of an academic assignment at **ITI** (Information Technology Institute).
