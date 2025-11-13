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
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
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
  "https://redditfixer.onrender.com",
  "https://reddit-posts-content-giver.vercel.app",
  "https://reddit-posts-content-giver-git-main-theboys-projects-3cf681c8.vercel.app",
  "https://reddit-posts-content-giver-8wf66t2sf-theboys-projects-3cf681c8.vercel.app",
  "https://reddit-posts-content-giver.onrender.com",
  process.env.FRONTEND_URL,
].filter(Boolean);

// ==========================================
// CORS MIDDLEWARE
// ==========================================
const corsOptions = {
  origin: (origin, callback) => {
    // allow requests with no origin (like server-to-server) or from our allowed list
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
};

// Be explicit about allowed methods/headers so preflight responses include them
// (helps when requests include Authorization or Content-Type headers)
corsOptions.methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
corsOptions.allowedHeaders = ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'];
corsOptions.optionsSuccessStatus = 200;

// Use the official `cors` middleware so it handles preflight (OPTIONS) properly
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
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

async function callGeminiAPI(prompt, temperature = 0.7, retries = 3) {
  if (!GEMINI_API_KEY) throw new Error("Gemini API key missing");

  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[Gemini API] Attempt ${attempt}/${retries} for prompt...`);
      
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
      
      console.log(`[Gemini API] ✅ Success on attempt ${attempt}`);
      return content;
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      const isRateLimited = status === 429;
      const isServerError = status >= 500;
      
      console.error(`[Gemini API] Attempt ${attempt} failed:`, {
        status,
        message: error.message,
        rateLimited: isRateLimited
      });

      // Retry on 429 (rate limit) or 5xx errors
      if ((isRateLimited || isServerError) && attempt < retries) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
        console.log(`[Gemini API] Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        break; // Don't retry on other errors or if out of retries
      }
    }
  }

  // All retries exhausted
  if (lastError?.response?.status === 429) {
    throw new Error("AI service is rate limited. Please try again in a moment.");
  } else if (lastError?.response?.status >= 500) {
    throw new Error("AI service is temporarily unavailable. Please try again later.");
  } else {
    throw lastError || new Error("Gemini API call failed");
  }
}

// ==========================================
// ROUTES
// ==========================================

// CORS diagnostic endpoint — helps debug origin/header issues
app.get("/api/cors-test", (req, res) => {
  const origin = req.headers.origin || "no origin header";
  const isAllowed = !origin || allowedOrigins.includes(origin);
  res.json({
    message: "✅ CORS test endpoint",
    requestOrigin: origin,
    isOriginAllowed: isAllowed,
    allowedOrigins: allowedOrigins,
    timestamp: new Date().toISOString(),
  });
});

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

    if (!subreddit || !topic) {
      return res.status(400).json({ success: false, error: "Missing subreddit or topic" });
    }

    const { data: plan } = await supabase
      .from("user_plans")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!plan) {
      return res.status(404).json({ success: false, error: "User plan not found" });
    }

    if (plan.credits_remaining <= 0) {
      return res.status(402).json({ success: false, error: "No credits remaining. Upgrade your plan." });
    }

    console.log(`\n[Generate Post] User: ${user.id}, Subreddit: ${subreddit}, Credits: ${plan.credits_remaining}`);

    const prompt = `Create a Reddit post for r/${subreddit}. Topic: ${topic}. Style: ${style}. Rules: ${rules}. Return ONLY JSON: {"title":"...","content":"..."}`;
    
    const generated = await callGeminiAPI(prompt, 0.8);
    const jsonMatch = generated.match(/\{[\s\S]*\}/);
    const post = jsonMatch ? JSON.parse(jsonMatch[0]) : { title: "Post", content: generated };

    // Deduct credit
    const updatedCredits = plan.credits_remaining - 1;
    await supabase
      .from("user_plans")
      .update({ credits_remaining: updatedCredits })
      .eq("user_id", user.id);

    // Log history
    await supabase.from("post_history").insert({
      user_id: user.id,
      subreddit,
      title: post.title,
      content: post.content,
      post_type: "generated"
    });

    console.log(`[Generate Post] ✅ Success! Credits remaining: ${updatedCredits}`);

    res.json({ success: true, post, creditsRemaining: updatedCredits });
  } catch (error) {
    console.error("[Generate Post] ❌ Error:", error.message);
    
    // Return user-friendly error messages
    const status = error.message.includes("rate limited") ? 429 : 500;
    res.status(status).json({ 
      success: false, 
      error: error.message || "Failed to generate post" 
    });
  }
});

// Optimize post
app.post("/api/optimize-post", async (req, res) => {
  try {
    const user = await getAuthUser(req);
    const { subreddit, content, style, rules } = req.body;

    if (!subreddit || !content) {
      return res.status(400).json({ success: false, error: "Missing subreddit or content" });
    }

    const { data: plan } = await supabase
      .from("user_plans")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!plan) {
      return res.status(404).json({ success: false, error: "User plan not found" });
    }

    if (plan.credits_remaining <= 0) {
      return res.status(402).json({ success: false, error: "No credits remaining. Upgrade your plan." });
    }

    console.log(`\n[Optimize Post] User: ${user.id}, Subreddit: ${subreddit}, Credits: ${plan.credits_remaining}`);

    const prompt = `Optimize for r/${subreddit}. Original: ${content}. Style: ${style}. Rules: ${rules}. Return only optimized text.`;
    const optimized = await callGeminiAPI(prompt, 0.7);

    // Deduct credit
    const updatedCredits = plan.credits_remaining - 1;
    await supabase
      .from("user_plans")
      .update({ credits_remaining: updatedCredits })
      .eq("user_id", user.id);

    console.log(`[Optimize Post] ✅ Success! Credits remaining: ${updatedCredits}`);

    res.json({ success: true, optimizedPost: optimized.trim(), creditsRemaining: updatedCredits });
  } catch (error) {
    console.error("[Optimize Post] ❌ Error:", error.message);
    
    const status = error.message.includes("rate limited") ? 429 : 500;
    res.status(status).json({ 
      success: false, 
      error: error.message || "Failed to optimize post" 
    });
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

// Payment success endpoint — fallback if webhook fails
// Call this from dashboard.html when redirected after payment
app.post("/api/payment/success", async (req, res) => {
  try {
    const { userId, sessionId, planType, billingCycle, amount, email } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: "Missing userId" });
    }

    console.log(`\n✅ Payment success endpoint called for user ${userId}`);
    console.log(`   Session ID: ${sessionId}`);
    console.log(`   Plan: ${planType}, Billing: ${billingCycle}`);

    // Set default values if missing
    const plan = planType || "starter";
    const cycle = billingCycle || "monthly";
    const planLimits = {
      starter: 150,
      professional: 250,
      enterprise: 300,
    };
    const credits = planLimits[plan] || 150;

    const expiryDate = new Date();
    if (cycle === "yearly") {
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    } else {
      expiryDate.setMonth(expiryDate.getMonth() + 1);
    }

    // Activate/update the plan
    const { data: planData, error: planError } = await supabase
      .from("user_plans")
      .upsert({
        user_id: userId,
        plan_type: plan,
        posts_per_month: credits,
        credits_remaining: credits,
        billing_cycle: cycle,
        status: "active",
        amount: amount || 0,
        activated_at: new Date().toISOString(),
        expires_at: expiryDate.toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" })
      .select()
      .single();

    if (planError) {
      console.error("❌ Plan activation error:", planError);
      return res.status(500).json({ success: false, error: planError.message });
    }

    console.log(`✅ Plan activated successfully for user ${userId}`);
    console.log(`   Credits: ${credits}, Expires: ${expiryDate.toISOString()}`);

    res.json({
      success: true,
      message: "Plan activated successfully",
      plan: planData,
    });
  } catch (error) {
    console.error("❌ Payment success error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Dodo webhook
// NOTE: webhook handling is implemented in `api/dodo/webhook.js` and
// mounted above with `app.post('/api/dodo/webhook', express.json(), webhookHandler)`.
// The inline handler was removed to avoid duplicate processing.

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
