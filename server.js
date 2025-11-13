const express = require("express");
const cors = require("cors");
const path = require("path");
const axios = require("axios");
const webhookHandler = require('./api/dodo/webhook');
require("dotenv").config();

const app = express();

// ==========================================
// CONFIGURATION
// ==========================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent";
const PORT = process.env.PORT || 3000;

// ==========================================
// ALLOWED ORIGINS
// ==========================================
const allowedOrigins = [
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://localhost:3000",
   "https://www.redrule.site",           // ✅ ADD THIS - Your new domain with www
  "https://redrule.site", 
  "https://reddit-posts-content-giver.vercel.app",
  "https://reddit-posts-content-giver-git-main-theboys-projects-3cf681c8.vercel.app",
  "https://reddit-posts-content-giver-8wf66t2sf-theboys-projects-3cf681c8.vercel.app",
  "https://reddit-posts-content-giver.onrender.com",
  process.env.FRONTEND_URL,
].filter(Boolean);

// ==========================================
// CORS MIDDLEWARE
// ==========================================
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || allowedOrigins[0]);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(null, false);
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.post('/api/dodo/webhook', express.json(), webhookHandler);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// ==========================================
// SUPABASE
// ==========================================
const { createClient } = require("@supabase/supabase-js");

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error("❌ Supabase credentials missing!");
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

// ==========================================
// HELPERS
// ==========================================
const getAuthUser = async (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Missing authorization");
  
  const token = authHeader.split(" ")[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) throw new Error("Authentication failed");
  return user;
};

async function callGeminiAPI(prompt, temperature = 0.7) {
  if (!GEMINI_API_KEY) throw new Error("Gemini API key missing");

  const response = await axios.post(
    `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, topK: 40, topP: 0.95, maxOutputTokens: 2048 }
    },
    { timeout: 60000 }
  );

  const content = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("Invalid Gemini response");
  return content;
}

// ==========================================
// ROUTES
// ==========================================
app.get("/api/test", (req, res) => {
  res.json({ message: "✅ Server working!", timestamp: new Date().toISOString() });
});

app.get("/", (req, res) => {
  res.json({ message: "ReddiGen API", status: "online" });
});

// Get user data
app.get("/api/user/data", async (req, res) => {
  try {
    const user = await getAuthUser(req);
    
    let { data: profile } = await supabase.from("user_profiles").select("*").eq("user_id", user.id).single();
    if (!profile) {
      const { data: newProfile } = await supabase.from("user_profiles").insert({
        user_id: user.id,
        email: user.email,
        display_name: user.email.split("@")[0]
      }).select().single();
      profile = newProfile;
    }

    let { data: plan } = await supabase.from("user_plans").select("*").eq("user_id", user.id).single();
    if (!plan) {
      const { data: newPlan } = await supabase.from("user_plans").insert({
        user_id: user.id,
        plan_type: "free",
        posts_per_month: 10,
        credits_remaining: 10,
        status: "active"
      }).select().single();
      plan = newPlan;
    }

    const { data: history } = await supabase
      .from("post_history")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    res.json({ success: true, profile, plan, history: history || [] });
  } catch (error) {
    res.status(401).json({ success: false, error: error.message });
  }
});

// Update profile
app.put("/api/user/profile", async (req, res) => {
  try {
    const user = await getAuthUser(req);
    const { displayName, bio } = req.body;

    const { data } = await supabase.from("user_profiles").update({
      display_name: displayName,
      bio
    }).eq("user_id", user.id).select().single();

    res.json({ success: true, profile: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reddit rules
app.get("/api/reddit-rules/:subreddit", async (req, res) => {
  try {
    const subreddit = req.params.subreddit.toLowerCase().replace(/^r\//, '');
    const response = await axios.get(
      `https://www.reddit.com/r/${subreddit}/about/rules.json`,
      { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 10000 }
    );

    let rulesText = "";
    if (response.data.rules) {
      response.data.rules.forEach((rule, i) => {
        rulesText += `**Rule ${i + 1}: ${rule.short_name}**\n${rule.description}\n\n`;
      });
    }

    res.json({ subreddit, rules: rulesText || "Standard Reddit etiquette", success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch rules", success: false });
  }
});

// Generate post
app.post("/api/generate-post", async (req, res) => {
  try {
    const user = await getAuthUser(req);
    const { subreddit, topic, style, rules } = req.body;

    const { data: plan } = await supabase
      .from("user_plans")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (plan.credits_remaining <= 0) {
      return res.status(402).json({ success: false, error: "No credits remaining" });
    }

    const prompt = `Create a Reddit post for r/${subreddit}. Topic: ${topic}. Style: ${style}. Rules: ${rules}. Return ONLY JSON: {"title":"...","content":"..."}`;
    
    const generated = await callGeminiAPI(prompt, 0.8);
    const jsonMatch = generated.match(/\{[\s\S]*\}/);
    const post = jsonMatch ? JSON.parse(jsonMatch[0]) : { title: "Post", content: generated };

    await supabase
      .from("user_plans")
      .update({ credits_remaining: plan.credits_remaining - 1 })
      .eq("user_id", user.id);

    await supabase.from("post_history").insert({
      user_id: user.id,
      subreddit,
      title: post.title,
      content: post.content,
      post_type: "generated"
    });

    res.json({ success: true, post, creditsRemaining: plan.credits_remaining - 1 });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Optimize post
app.post("/api/optimize-post", async (req, res) => {
  try {
    const user = await getAuthUser(req);
    const { subreddit, content, style, rules } = req.body;

    const { data: plan } = await supabase.from("user_plans").select("*").eq("user_id", user.id).single();
    if (plan.credits_remaining <= 0) {
      return res.status(402).json({ error: "No credits" });
    }

    const prompt = `Optimize for r/${subreddit}. Original: ${content}. Style: ${style}. Rules: ${rules}. Return only optimized text.`;
    const optimized = await callGeminiAPI(prompt, 0.7);

    await supabase.from("user_plans").update({ credits_remaining: plan.credits_remaining - 1 }).eq("user_id", user.id);

    res.json({ success: true, optimizedPost: optimized.trim(), creditsRemaining: plan.credits_remaining - 1 });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Payment verification
app.post("/api/payment/verify", async (req, res) => {
  try {
    const { userId, plan, billingCycle, postsPerMonth, amount } = req.body;

    const expiryDate = new Date();
    if (billingCycle === "yearly") expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    else expiryDate.setMonth(expiryDate.getMonth() + 1);

    await supabase.from("user_plans").upsert({
      user_id: userId,
      plan_type: plan,
      posts_per_month: parseInt(postsPerMonth),
      credits_remaining: parseInt(postsPerMonth),
      billing_cycle: billingCycle,
      status: "active",
      expires_at: expiryDate.toISOString()
    }, { onConflict: "user_id" });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Dodo webhook
app.post("/api/dodo/webhook", async (req, res) => {
  try {
    const event = req.body;
    if (event.type === "checkout.session.completed") {
      const metadata = event.data?.object?.metadata || {};
      if (metadata.userId) {
        const expiryDate = new Date();
        if (metadata.billingCycle === "yearly") expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        else expiryDate.setMonth(expiryDate.getMonth() + 1);

        await supabase.from("user_plans").upsert({
          user_id: metadata.userId,
          plan_type: metadata.planType,
          posts_per_month: parseInt(metadata.postsPerMonth),
          credits_remaining: parseInt(metadata.postsPerMonth),
          billing_cycle: metadata.billingCycle,
          status: "active",
          expires_at: expiryDate.toISOString()
        }, { onConflict: "user_id" });
      }
    }
    res.json({ received: true });
  } catch (error) {
    res.status(500).json({ error: "Webhook failed" });
  }
});

// ==========================================
// ERROR HANDLING
// ==========================================
app.use((err, req, res, next) => {
  console.error("❌", err);
  res.status(500).json({ error: err.message });
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return res.status(404).json({ error: "Not found" });
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

// ==========================================
// START
// ==========================================
app.listen(PORT, () => {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`✅ ReddiGen RUNNING on port ${PORT}`);
  console.log(`🌐 Origins: ${allowedOrigins.length}`);
  console.log(`${"=".repeat(60)}\n`);
});

module.exports = app;
