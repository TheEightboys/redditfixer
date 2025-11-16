# Redrule - AI-Powered Reddit Post Generator

A full-stack application that uses AI (Google Gemini) to generate and optimize Reddit posts that follow subreddit rules. Users can create accounts, manage credit-based plans, and purchase upgrades via Dodo Payments.

---

## 🎯 Project Overview

**What it does:**

- Users sign up and log in via Supabase authentication
- Browse and fetch subreddit rules automatically from Reddit
- Generate new Reddit posts using AI, customizable by style and topic
- Optimize existing Reddit posts to follow subreddit guidelines
- Manage post history and account settings
- Purchase plan upgrades (Starter, Professional, Enterprise) via Dodo Payments
- Track credits and usage across their account

**Tech Stack:**

- **Frontend:** HTML, CSS, JavaScript, Bootstrap 5, Supabase (client-side)
- **Backend:** Node.js, Express, Supabase (service key), Google Generative Language API (Gemini)
- **Database:** Supabase (PostgreSQL + Auth)
- **Payments:** Dodo Payments (checkout links + webhooks)
- **Hosting:** Deploy to Render, Vercel, or any Node.js host

---

## 📋 Prerequisites

Before running the project locally, ensure you have:

1. **Node.js** >= 18.0.0 ([download](https://nodejs.org/))
2. **npm** (comes with Node.js)
3. **Supabase Account** ([sign up free](https://supabase.com))
4. **Google Generative Language API Key** ([get here](https://makersuite.google.com/app/apikey))
5. **Dodo Payments Account** (optional, for payments) ([sign up](https://dodopayments.com))

---

## 🚀 Setup Instructions

### 1. Clone / Open the Project

```bash
cd c:\fiverr projects\redrules-main
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Create Environment Variables

Create a `.env` file in the project root:

```bash
# Supabase Configuration (REQUIRED)
SUPABASE_URL=https://your-supabase-url.supabase.co
SUPABASE_SERVICE_KEY=your-supabase-service-key-here

# Google Gemini API (REQUIRED for AI features)
GEMINI_API_KEY=your-google-api-key-here

# Dodo Payments (OPTIONAL, for payment features)
DODO_API_KEY=your-dodo-api-key
DODO_MODE=production

# Frontend & Backend URLs (optional, defaults provided)
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:3000

# Server Port (optional, default: 3000)
PORT=3000
```

#### How to get each key:

**Supabase:**

1. Go to [supabase.com](https://supabase.com) and sign up
2. Create a new project
3. Go to Settings → API → Copy `Project URL` (SUPABASE_URL)
4. Copy the `Service Role Key` (SUPABASE_SERVICE_KEY)

**Google Gemini API:**

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the key (GEMINI_API_KEY)

**Dodo Payments (Optional):**

1. Sign up at [dodopayments.com](https://dodopayments.com)
2. Get your API key from the dashboard

### 4. Set Up Supabase Database

Run the SQL commands in your Supabase console (SQL Editor) to create required tables:

```sql
-- User Profiles Table
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    display_name TEXT,
    bio TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- User Plans Table
CREATE TABLE user_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_type TEXT DEFAULT 'free',
    posts_per_month INTEGER DEFAULT 10,
    credits_remaining INTEGER DEFAULT 10,
    billing_cycle TEXT DEFAULT 'monthly',
    status TEXT DEFAULT 'active',
    amount DECIMAL(10, 2) DEFAULT 0,
    activated_at TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Post History Table
CREATE TABLE post_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subreddit TEXT NOT NULL,
    title TEXT,
    content TEXT,
    post_type TEXT DEFAULT 'generated',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Payments Table
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    transaction_id TEXT UNIQUE,
    plan_type TEXT,
    amount DECIMAL(10, 2),
    posts_per_month INTEGER,
    billing_cycle TEXT,
    status TEXT DEFAULT 'pending',
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Optional: Indexes for performance
CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX idx_user_plans_user_id ON user_plans(user_id);
CREATE INDEX idx_post_history_user_id ON post_history(user_id);
CREATE INDEX idx_payments_user_id ON payments(user_id);

-- Optional: Enable RLS (Row Level Security)
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
```

### 5. Start the Server

**Development (with auto-restart):**

```bash
npm run dev
```

**Production:**

```bash
npm start
```

The server will run on `http://localhost:3000` (or your configured PORT).

---

## 📖 Available API Endpoints

### Health & Status

- **GET** `/api/test` — Check if server is running
- **GET** `/` — Server info

### Reddit Rules

- **GET** `/api/reddit-rules/:subreddit` — Fetch rules for a subreddit (e.g., `/api/reddit-rules/programming`)

### User Management (requires Bearer token)

- **GET** `/api/user/data` — Get user profile, plan, and post history
- **PUT** `/api/user/profile` — Update display name and bio
- **POST** `/api/auth/change-password` — Change password
- **POST** `/api/auth/logout-all` — Sign out from all devices
- **POST** `/api/auth/delete-account` — Delete account permanently

### AI Generation (requires Bearer token)

- **POST** `/api/generate-post` — Generate a new Reddit post
  - Body: `{ subreddit, topic, style, rules }`
- **POST** `/api/optimize-post` — Optimize an existing post
  - Body: `{ subreddit, content, style, rules }`

### Payments (requires Bearer token)

- **POST** `/api/payment/verify` — Verify and activate a payment
  - Body: `{ plan, billingCycle, postsPerMonth, amount, sessionId }`
- **POST** `/api/dodo/webhook` — Webhook handler for Dodo Payments

---

## 🔐 Authentication

All API endpoints (except `/api/test`, `/`, and `/api/reddit-rules/:subreddit`) require a Bearer token:

```
Authorization: Bearer <supabase_access_token>
```

Get the token from the frontend after login via Supabase.

---

## 📝 Example Usage (cURL)

### Test the server

```bash
curl http://localhost:3000/api/test
```

### Fetch subreddit rules

```bash
curl http://localhost:3000/api/reddit-rules/programming
```

### Generate a post (requires auth token)

```bash
curl -X POST http://localhost:3000/api/generate-post \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subreddit": "programming",
    "topic": "How to learn web development",
    "style": "casual",
    "rules": "Be respectful and helpful"
  }'
```

---

## 🐛 Troubleshooting

### "Supabase credentials not configured"

- Check your `.env` file has `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
- Ensure the values are correct (no extra spaces)

### "Gemini API key not configured"

- Check your `.env` file has `GEMINI_API_KEY`
- Verify the key is valid at [Google AI Studio](https://makersuite.google.com/app/apikey)

### "Could not verify user plan"

- Ensure the user_plans table exists in Supabase
- Run the SQL setup commands above

### "Authentication failed"

- Ensure the Bearer token is valid and not expired
- Check the token format: `Authorization: Bearer <token>`

### CORS errors

- Check that your frontend origin is in the `allowedOrigins` list in `server.js`
- Add `http://localhost:3000` if developing locally

---

## 🎨 Frontend Setup

The frontend files are included:

- `index.html` — Marketing landing page
- `pricing.html` — Pricing page
- `dashboard.html` — User dashboard
- `dashboard.js` — Dashboard logic (Supabase auth, API calls)
- `main.js` — Landing page interactions

**To use the frontend:**

1. Update the Supabase anon key in `dashboard.js` (around line 10)
2. Update API_URL to match your backend URL
3. Open `index.html` in a browser or serve via Express (already configured)

---

## 📦 Deployment

### Deploy to Render

1. Push code to GitHub
2. Go to [render.com](https://render.com) and create a new Web Service
3. Connect your GitHub repo
4. Set environment variables in Render dashboard
5. Deploy

### Deploy to Vercel

1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com) and import your repo
3. Set environment variables
4. Deploy

---

## 🤝 Contributing

Feel free to fork, improve, and submit pull requests!

---

## 📄 License

MIT License — see LICENSE file for details

---

## ❓ Support

For issues or questions:

- Check the troubleshooting section above
- Review API endpoint documentation
- Test endpoints with cURL before debugging frontend code

---

**Happy coding! 🚀**
