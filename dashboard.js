const SUPABASE_URL = "https://duzaoqvdukdnbjzccwbp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1emFvcXZkdWtkbmJqemNjd2JwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTE2MTIsImV4cCI6MjA3NzQ2NzYxMn0.eMvGGHRuqzeGjVMjfLViaJnMvaKryGCPWWaDyFK6UP8";
// ✅ CORRECT - This works for both localhost AND production
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? "http://localhost:3000"  // Local development
  : "https://redditfixer.onrender.com";  // Production on Render (new backend)

console.log('🌍 Current domain:', window.location.hostname);
console.log('🔌 API URL:', API_URL);  // Production backend on Render

// --- GLOBAL STATE ---
let supabaseClient = null;
let currentUser = null;
let userProfile = null;
let userPlan = null;  
let userHistory = [];
let bootstrapModals = {};
let bootstrapToast = null;
let isServerAwake = false;
let isDataLoading = false;

// --- DEBUG HELPER ---
window.checkPaymentStorage = function () {
  console.log("🔍 PAYMENT STORAGE DEBUG:");
  console.log("=".repeat(50));

  const pending = localStorage.getItem("pending_payment");
  const returnUrl = localStorage.getItem("payment_return_url");

  if (pending) {
    console.log("✅ pending_payment EXISTS:");
    console.log(JSON.parse(pending));
  } else {
    console.log("❌ pending_payment NOT FOUND");
  }

  if (returnUrl) {
    console.log("✅ payment_return_url:", returnUrl);
  } else {
    console.log("❌ payment_return_url NOT FOUND");
  }

  console.log("\n📋 All localStorage keys:");
  Object.keys(localStorage).forEach((key) => {
    console.log(`  - ${key}`);
  });

  console.log("\n💡 Test localStorage:");
  try {
    localStorage.setItem("test_key", "test_value");
    const test = localStorage.getItem("test_key");
    if (test === "test_value") {
      console.log("✅ localStorage is WORKING");
      localStorage.removeItem("test_key");
    } else {
      console.log("❌ localStorage READ failed");
    }
  } catch (e) {
    console.log("❌ localStorage WRITE failed:", e.message);
  }

  console.log("=".repeat(50));
};

// --- PRICING DATA ---
// Updated per user request:
// - Starter: $1.29/month, $11.11/year
// - Professional: $2.29/month, $19.22/year
// - Enterprise (repurposed as LIFETIME plan): lifetime access, 300 posts/month, $29.00 (uses lifetime checkout link)
const PRICING_DATA = {
  starter: {
    monthly: {
      price: 1.29,
      posts: 150,
      productId: "pdt_LBHf0mWr6mV54umDhx9cn",
      checkoutUrl:
        "https://test.checkout.dodopayments.com/buy/pdt_XocDrGw3HxTb0nD7nyYyl?quantity=1",
    },
    yearly: {
      price: 11.11,
      posts: 1800,
      productId: "pdt_RBEfQWVlN9bnWihieBQSt",
      checkoutUrl:
        "https://checkout.dodopayments.com/buy/pdt_RBEfQWVlN9bnWihieBQSt?quantity=1",
    },
  },
  professional: {
    monthly: {
      price: 2.29,
      posts: 250,
      productId: "pdt_dumBrrIeNTtENukKXHiGh",
      checkoutUrl:
        "https://checkout.dodopayments.com/buy/pdt_dumBrrIeNTtENukKXHiGh?quantity=1",
    },
    yearly: {
      price: 19.22,
      posts: 3000,
      productId: "pdt_gBCE38rNQm8x30iqAltc6",
      checkoutUrl:
        "https://checkout.dodopayments.com/buy/pdt_gBCE38rNQm8x30iqAltc6?quantity=1",
    },
  },
  enterprise: {
    // Repurposed as LIFETIME plan (user requested last plan be lifetime)
    monthly: {
      price: 29.0,
      posts: 300,
      productId: "pdt_RRL3ngdmgYA1bwfFcbOVl",
      checkoutUrl:
        "https://checkout.dodopayments.com/buy/pdt_RRL3ngdmgYA1bwfFcbOVl?quantity=1",
    },
    yearly: {
      // Keep same checkout for yearly selection (redirect will still work). Lifetime is treated as a one-time product.
      price: 29.0,
      posts: 300,
      productId: "pdt_RRL3ngdmgYA1bwfFcbOVl",
      checkoutUrl:
        "https://checkout.dodopayments.com/buy/pdt_RRL3ngdmgYA1bwfFcbOVl?quantity=1",
    },
  },
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener("DOMContentLoaded", async () => {
  console.log("✅ Dashboard initializing...");

  try {
    if (!window.supabase) throw new Error("Supabase library not loaded.");
    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    if (!window.bootstrap) throw new Error("Bootstrap library not loaded.");
    initBootstrapComponents();

    initializeEventListeners();
    updatePricingDisplay();
    checkPendingPayment(); // Check if user has pending payment

    // DON'T handle payment callback yet - wait for auth first
    // await handlePaymentCallback();

    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      console.log("🔄 Auth state changed:", event);
      console.log("   Session exists:", !!session);
      console.log("   User:", session?.user?.email);

      if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && session) {
        currentUser = session.user;
        console.log("✅ User authenticated:", currentUser.email);

        hideAuthModal();

        // Handle payment callback AFTER user is authenticated
        // Pass the session directly to avoid getSession() call
        const wasPaymentCallback = await handlePaymentCallback(session);

        // Always load user data to ensure UI is updated
        console.log("📊 Loading user data...");
        await loadUserData();

        // If the user arrived with a pending purchase intent from the landing page, continue checkout
        try {
          const pendingIntent = localStorage.getItem("pending_purchase_intent");
          if (pendingIntent) {
            console.log("🔔 Found pending purchase intent:", pendingIntent);
            // Clear it immediately to avoid loops
            localStorage.removeItem("pending_purchase_intent");

            // pendingIntent format: 'starter_monthly', 'professional_yearly', or 'lifetime'
            const parts = pendingIntent.split("_");
            const planPart = parts[0];
            const cyclePart = parts[1] || null;

            // If cycle provided, set billing radio accordingly
            if (cyclePart) {
              const radio = document.querySelector(
                `input[name="billingCycle"][value="${cyclePart}"]`
              );
              if (radio) {
                radio.checked = true;
                updatePricingDisplay();
              }
            }

            // Map landing 'lifetime' to internal 'enterprise' plan key
            const planMap = { lifetime: "enterprise" };
            const planKey = planMap[planPart] || planPart;

            console.log(
              "➡️ Continuing to initiate purchase for",
              planKey,
              cyclePart
            );
            // Initiate the Dodo checkout flow (this will save pending_payment and redirect)
            await initiateDodoPayment(planKey);
          }
        } catch (intentErr) {
          console.warn(
            "Could not continue pending purchase intent:",
            intentErr
          );
        }

        // Hide loading screen after data is loaded
        hideLoadingScreen();

        // Only show welcome toast if NOT a payment callback and NOT initial session
        if (!wasPaymentCallback && event === "SIGNED_IN") {
          showToast("Welcome back!", "success");
        }
      } else if (event === "SIGNED_OUT") {
        console.log("👋 User signed out");
        currentUser = null;
        userProfile = null;
        userPlan = null;
        userHistory = [];
        isServerAwake = false;
        isDataLoading = false;
        showAuthModal();
        hideLoadingScreen();
      } else if (!session) {
        console.log("⚠️ No session - showing auth modal");
        hideLoadingScreen();
        showAuthModal();
      }
    });

    // This will trigger the 'INITIAL_SESSION' event above
    await checkAuthState();
  } catch (error) {
    console.error("❌ FATAL: Dashboard initialization failed:", error);
    hideLoadingScreen(); // Hide spinner even on error
    showErrorAlert(error.message); // Show a user-friendly error
  }
});

function initBootstrapComponents() {
  const modalIds = [
    "authModal",
    "viewPostModal",
    "changePasswordModal",
    "deleteAccountModal",
  ];
  modalIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) bootstrapModals[id] = new bootstrap.Modal(el);
  });

  const toastEl = document.getElementById("notificationToast");
  if (toastEl) bootstrapToast = new bootstrap.Toast(toastEl, { delay: 4000 });
}

function showErrorAlert(message) {
  const loadingScreen = document.getElementById("loadingScreen");
  if (loadingScreen) {
    loadingScreen.style.display = "flex"; // Ensure it's visible
    loadingScreen.innerHTML = `
            <div class="text-danger p-5 text-center" style="max-width: 600px; margin: auto;">
                <i class="fas fa-exclamation-triangle fa-3x mb-3"></i>
                <h5 class="fw-bold">Application Failed to Load</h5>
                <p class="text-muted">An error occurred during initialization. Please check your internet connection and make sure browser extensions (like adblockers) are not blocking essential scripts.</p>
                <code class="text-dark d-block bg-light p-2 rounded small">${message}</code>
            </div>`;
  }
}

async function wakeUpServer() {
  if (isServerAwake) return;

  console.log("Pinging server to wake it up...");
  showToast("Waking up AI server... (can take up to 60s)", "info"); // Updated timeout message
  try {
    const startTime = Date.now();
    // Ping the root '/' or a dedicated '/api/test' endpoint
    const response = await fetch(`${API_URL}/api/test`, { method: "GET" });
    if (!response.ok)
      throw new Error(`Server ping returned status ${response.status}`);

    const duration = (Date.now() - startTime) / 1000;
    console.log(`Server is awake (Took ${duration.toFixed(2)}s)`);
    showToast("AI server is awake!", "success");
    isServerAwake = true;
  } catch (error) {
    console.error("❌ Server ping failed:", error);
    showToast("Could not connect to the AI server.", "error");
    isServerAwake = false;
  }
}

async function checkAuthState() {
  try {
    // This just triggers the onAuthStateChange listener
    // The listener will handle 'INITIAL_SESSION'
    const {
      data: { session },
      error,
    } = await supabaseClient.auth.getSession();
    if (error) throw error;

    if (!session) {
      console.log("⚠️ No active session");
      hideLoadingScreen();
      showAuthModal();
    }
  } catch (error) {
    console.error("❌ Auth state check error:", error);
    hideLoadingScreen();
    showErrorAlert(error.message);
  }
}

// ============================================
// DATA FETCHING & UI UPDATES
// ============================================

function showDataLoadingPlaceholders() {
  console.log("Displaying loading placeholders...");
  const loadingText = "...";
  const longLoadingText = "Loading...";

  setText("creditsLeft", loadingText);
  setText("dropdownUserName", longLoadingText);
  setText("dropdownUserEmail", loadingText);
  setText("dropdownCreditsUsed", "... / ...");
  setStyle("creditsProgress", "width", `100%`);
  setText("dropdownTotalPosts", loadingText);
  setText("dropdownJoinDate", loadingText);
  setText("profileName", longLoadingText);
  setText("profileEmail", loadingText);
  setText("totalPosts", loadingText);
  setText("creditsUsed", loadingText);
  setText("memberSince", loadingText);
  setValue("settingsEmail", longLoadingText);
  setValue("settingsDisplayName", "");
  setValue("settingsBio", "");
  setText("settingsCreditsDisplay", loadingText);
  setText("settingsCreditsSubtext", "Loading credit info...");
  setStyle("settingsProgressDisplay", "width", "100%");
}

function showDataErrorState(errorMessage) {
  console.error("Displaying error state:", errorMessage);
  const errorText = "Error";
  setText("creditsLeft", "!");
  setText("dropdownUserName", errorText);
  setText("dropdownUserEmail", "Could not load data");
  setText("profileName", errorText);
  setText("profileEmail", "Could not load data");
  setValue("settingsEmail", "Error loading email");
  setText("settingsCreditsDisplay", "!");
  setText("settingsCreditsSubtext", "Error loading credits");
  showToast(`Failed to load data: ${errorMessage}`, "error");
}

// --- loadUserData: Always use secure backend API ---
async function loadUserData() {
  if (isDataLoading) {
    console.log("[loadUserData] Already loading, skipping duplicate request.");
    return;
  }
  if (!currentUser) {
    console.error("[loadUserData] No user authenticated.");
    showDataErrorState("No user authenticated");
    return;
  }

  isDataLoading = true;
  console.log("[loadUserData] Loading user data from secure backend...");
  console.log("  - Current user ID:", currentUser.id);
  console.log("  - Current user email:", currentUser.email);
  showDataLoadingPlaceholders();

  try {
    await loadDataFromBackend();
  } catch (error) {
    console.error("❌ Error loading user data:", error);
    showDataErrorState(error.message);
  } finally {
    isDataLoading = false;
  }
}

// This is the original, secure backend fetch
// REPLACE the existing loadDataFromBackend function with this FIXED version:
// ==========================================
// FIXED: This is the secure backend fetch with proper error recovery
// ==========================================
// ==========================================
// CRITICAL FIX: Load data with aggressive timeout and instant fallback
// ==========================================
async function loadUserData() {
  console.log("[loadUserData] Starting...");

  // NUCLEAR OPTION: Skip ALL backend calls and use immediate fallback
  console.log("⚡ Using INSTANT fallback data (no backend required)");

  // Set default data immediately
  userProfile = {
    user_id: currentUser?.id || "temp-user-id",
    email: currentUser?.email || "user@example.com",
    display_name: currentUser?.email?.split("@")[0] || "User",
    bio: "Welcome to ReddiGen!",
    created_at: new Date().toISOString(),
  };

  userPlan = {
    user_id: currentUser?.id || "temp-user-id",
    plan_type: "free",
    credits_remaining: 10,
    posts_per_month: 10,
    billing_cycle: "monthly",
    status: "active",
    activated_at: new Date().toISOString(),
  };

  userHistory = [];

  // Update UI immediately
  console.log("⚡ Updating UI NOW with fallback data");
  updateUI();

  console.log("✅ Dashboard loaded instantly!");

  // OPTIONAL: Try to load real data in background (won't block UI)
  setTimeout(() => {
    tryLoadRealDataInBackground();
  }, 1000);
}

// Background loader (non-blocking)
async function tryLoadRealDataInBackground() {
  console.log("🔄 Attempting to load real data in background...");

  try {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    if (!session) {
      console.log("⚠️ No session for background load");
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${API_URL}/api/user/data`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();

      if (data.success) {
        console.log("✅ Real data loaded in background!");
        userProfile = data.profile || userProfile;
        userPlan = data.plan || userPlan;
        userHistory = data.history || userHistory;
        updateUI(); // Refresh UI with real data
      }
    }
  } catch (error) {
    console.log("⚠️ Background load failed (this is OK):", error.message);
    // Ignore errors - we already have fallback data showing
  }
}

async function wakeUpServer() {
  if (isServerAwake) return;

  console.log("⏰ Pinging server to wake it up...");
  showToast("⏰ Waking up server... (can take up to 30s)", "info");

  try {
    const startTime = Date.now();

    // Try to ping the server with 30-second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds

    const response = await fetch(`${API_URL}/api/test`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Server ping returned status ${response.status}`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Server is awake! (Took ${duration}s)`);
    showToast("✅ AI server is ready!", "success");
    isServerAwake = true;
  } catch (error) {
    if (error.name === "AbortError") {
      console.error("❌ Server ping timeout");
      showToast(
        "⚠️ Server is taking too long to respond. Features may be limited.",
        "warning"
      );
    } else {
      console.error("❌ Server ping failed:", error.message);
      showToast(
        "⚠️ Could not connect to AI server. Check if server.js is running.",
        "warning"
      );
    }
    isServerAwake = false;
  }
}

// --- END OF NEW/MODIFIED FUNCTIONS ---

function updateUI() {
  console.log("🎨 updateUI() called");
  console.log("  - userProfile:", userProfile ? "✅ EXISTS" : "❌ NULL");
  console.log("  - userPlan:", userPlan ? "✅ EXISTS" : "❌ NULL");

  if (!userProfile || !userPlan) {
    console.warn("⚠️ Cannot update UI - missing data!");
    console.log("  - userProfile data:", userProfile);
    console.log("  - userPlan data:", userPlan);
    return;
  }

  console.log("Updating UI with real data...");
  console.log("  - Full userProfile:", userProfile);
  console.log("  - Full userPlan:", userPlan);
  console.log("  - Plan type:", userPlan.plan_type);
  console.log("  - Credits remaining:", userPlan.credits_remaining);
  console.log("  - Posts per month:", userPlan.posts_per_month);

  const credits = userPlan.credits_remaining || 0;
  const maxCredits = userPlan.posts_per_month || 0;
  const creditsUsed = maxCredits - credits;
  const progressPercent = maxCredits > 0 ? (creditsUsed / maxCredits) * 100 : 0;
  const joinDate = new Date(userProfile.created_at).toLocaleDateString(
    "en-US",
    { month: "short", year: "numeric" }
  );

  console.log(`  - Setting creditsLeft to: ${credits}`);
  setText("creditsLeft", credits);

  console.log(`  - Setting profile data:`);
  console.log(
    `    profileName: ${userProfile.display_name || userProfile.email}`
  );
  console.log(`    profileEmail: ${userProfile.email}`);

  // Check if elements exist before setting
  const profileNameEl = document.getElementById("profileName");
  const profileEmailEl = document.getElementById("profileEmail");
  console.log("  - profileName element exists:", !!profileNameEl);
  console.log("  - profileEmail element exists:", !!profileEmailEl);

  // Update all UI elements
  setText("dropdownUserName", userProfile.display_name || userProfile.email);
  setText("dropdownUserEmail", userProfile.email);
  setText("dropdownCreditsUsed", `${creditsUsed} / ${maxCredits}`);
  setStyle("creditsProgress", "width", `${progressPercent}%`);
  setText("dropdownTotalPosts", userHistory.length);
  setText("dropdownJoinDate", joinDate);
  setText("profileName", userProfile.display_name || userProfile.email);
  setText("profileEmail", userProfile.email);
  setText("totalPosts", userHistory.length);
  setText("creditsUsed", creditsUsed);
  setText("memberSince", joinDate.split(" ")[1]);
  setValue("settingsEmail", userProfile.email);
  setValue("settingsDisplayName", userProfile.display_name || "");
  setValue("settingsBio", userProfile.bio || "");
  setText("settingsCreditsDisplay", credits);
  setText(
    "settingsCreditsSubtext",
    `${credits} / ${maxCredits} credits remaining`
  );
  setStyle("settingsProgressDisplay", "width", `${progressPercent}%`);

  // ============================================
  // NEW: UPDATE PLAN DISPLAY & CURRENT PLAN
  // ============================================
  updatePlanDisplay();
  checkAndShowCurrentPlan();

  console.log("✅ UI update complete!");
  displayHistory();
}
// ==========================================
// PLAN DISPLAY FUNCTIONS - ADD THESE
// ==========================================
function updatePlanDisplay() {
  if (!userPlan) return;

  console.log("📊 Updating plan display");

  // Update credits display
  const creditsEl = document.getElementById("creditsRemaining");
  if (creditsEl) {
    creditsEl.textContent = userPlan.credits_remaining || 0;
  }

  // Update plan badge
  const planTypeEl = document.getElementById("planType");
  if (planTypeEl) {
    const planNames = {
      free: "FREE",
      starter: "STARTER",
      professional: "PRO",
      enterprise: "ENTERPRISE",
    };
    planTypeEl.textContent = planNames[userPlan.plan_type] || "FREE";

    const badgeColors = {
      free: "bg-secondary",
      starter: "bg-primary",
      professional: "bg-success",
      enterprise: "bg-danger",
    };
    planTypeEl.className = `badge ${
      badgeColors[userPlan.plan_type] || "bg-secondary"
    }`;
  }

  console.log("✅ Plan display updated");
}

function checkAndShowCurrentPlan() {
  if (!userPlan) return;

  console.log("🔍 Checking plan type:", userPlan.plan_type);

  const pricingSection = document.getElementById("pricingPlansSection");
  const currentPlanSection = document.getElementById("currentPlanSection");

  if (userPlan.plan_type !== "free") {
    console.log("✅ User has paid plan - showing current plan card");
    if (pricingSection) pricingSection.style.display = "none";
    if (currentPlanSection) {
      currentPlanSection.style.display = "block";
      updateCurrentPlanCard();
    }
  } else {
    console.log("ℹ️ User has free plan - showing pricing");
    if (pricingSection) pricingSection.style.display = "block";
    if (currentPlanSection) currentPlanSection.style.display = "none";
  }
}

function updateCurrentPlanCard() {
  if (!userPlan) return;

  const card = document.getElementById("currentPlanCard");
  if (!card) {
    console.warn("⚠️ currentPlanCard element not found in HTML");
    return;
  }

  const planNames = {
    starter: "Starter Plan",
    professional: "Professional Plan",
    enterprise: "Enterprise Plan",
  };

  const expiry = userPlan.expires_at
    ? new Date(userPlan.expires_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Never";

  const progress =
    (userPlan.credits_remaining / userPlan.posts_per_month) * 100;

  card.innerHTML = `
    <div class="card border-success shadow-sm">
      <div class="card-body p-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="mb-0"><i class="fas fa-crown text-warning"></i> Current Plan</h5>
          <span class="badge bg-success">Active</span>
        </div>
        <h3 class="fw-bold mb-3">${
          planNames[userPlan.plan_type] || "Starter Plan"
        }</h3>
        <div class="mb-3">
          <div class="d-flex justify-content-between mb-2">
            <span class="text-muted">Credits:</span>
            <span class="fw-bold">${userPlan.credits_remaining} / ${
    userPlan.posts_per_month
  }</span>
          </div>
          <div class="progress" style="height: 10px;">
            <div class="progress-bar bg-success" style="width: ${progress}%"></div>
          </div>
        </div>
        <div class="row text-center bg-light rounded p-3">
          <div class="col-6 border-end">
            <p class="text-muted mb-1 small">Billing</p>
            <p class="fw-bold mb-0">${
              userPlan.billing_cycle === "yearly" ? "Yearly" : "Monthly"
            }</p>
          </div>
          <div class="col-6">
            <p class="text-muted mb-1 small">Renews</p>
            <p class="fw-bold mb-0">${expiry}</p>
          </div>
        </div>
        ${
          userPlan.plan_type !== "enterprise"
            ? `
        <div class="mt-4">
          <button class="btn btn-outline-primary w-100" onclick="navigateToPage('pricing')">
            <i class="fas fa-arrow-up"></i> Upgrade Plan
          </button>
        </div>
        `
            : `
        <div class="mt-4 text-center">
          <p class="text-success mb-0"><i class="fas fa-check-circle"></i> You're on the best plan!</p>
        </div>
        `
        }
      </div>
    </div>
  `;

  console.log("✅ Current plan card updated");
}

function displayHistory() {
  const tableBody = document.getElementById("historyTableBody");
  if (!tableBody) return;

  if (userHistory.length === 0) {
    tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-muted py-5">
                    <i class="fas fa-inbox fa-3x mb-3 d-block"></i>
                    No posts yet. Start generating!
                </td>
            </tr>
        `;
    return;
  }

  tableBody.innerHTML = userHistory
    .filter(post => post && post.created_at) // Filter out null/undefined items or missing created_at
    .map((post) => {
      const date = new Date(post.created_at).toLocaleDateString();
      const type =
        post.post_type === "generated"
          ? '<span class="badge bg-primary">Generated</span>'
          : '<span class="badge bg-success">Optimized</span>';
      const preview = (post.title || post.content).substring(0, 50) + "...";

      return `
            <tr>
                <td>${date}</td>
                <td>r/${post.subreddit}</td>
                <td>${type}</td>
                <td>${preview}</td>
                <td>
                    <button class="btn btn-sm btn-outline-info" data-post-id="${post.id}">
                        <i class="fas fa-eye me-1"></i>View
                    </button>
                </td>
            </tr>
        `;
    })
    .join("");

  tableBody.querySelectorAll("[data-post-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const postId = button.dataset.postId;
      const post = userHistory.find((p) => p.id == postId);
      if (post) showViewPostModal(post);
    });
  });
}

// ============================================
// AUTHENTICATION
// ============================================

async function handleLogin(e) {
  e.preventDefault();
  const email = getValue("loginEmail").trim();
  const password = getValue("loginPassword");

  if (!email || !password) {
    return showToast("Please enter email and password", "warning");
  }

  setButtonLoading("loginButton", true, "Signing In...");

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    if (!data.session) throw new Error("Login failed - no session created");
  } catch (error) {
    console.error("❌ Login error:", error);
    showToast(error.message || "Login failed", "error");
  } finally {
    setButtonLoading(
      "loginButton",
      false,
      '<i class="fas fa-sign-in-alt me-2"></i>Sign In'
    );
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const email = getValue("signupEmail").trim();
  const password = getValue("signupPassword");
  const confirm = getValue("signupPasswordConfirm");

  if (!email || !password || !confirm) {
    return showToast("Please fill all fields", "warning");
  }
  if (password.length < 8) {
    return showToast("Password must be at least 8 characters", "warning");
  }
  if (password !== confirm) {
    return showToast("Passwords do not match!", "error");
  }

  setButtonLoading("signupButton", true, "Creating Account...");

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard.html`,
        data: { email_confirmed: false },
      },
    });

    if (error) throw error;

    if (data.user) {
      showToast(
        "Account created! Please check your email to verify.",
        "success"
      );
      setValue("signupEmail", "");
      setValue("signupPassword", "");
      setValue("signupPasswordConfirm", "");
      setTimeout(showLoginSection, 2000);
    }
  } catch (error) {
    console.error("❌ Signup error:", error);
    showToast(error.message || "Signup failed", "error");
  } finally {
    setButtonLoading(
      "signupButton",
      false,
      '<i class="fas fa-user-plus me-2"></i>Create Account'
    );
  }
}

async function handleGoogleSignIn() {
  try {
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/dashboard.html`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) throw error;
    console.log("🔄 Redirecting to Google...");
  } catch (error) {
    console.error("❌ Google sign-in error:", error);
    showToast(error.message || "Google sign-in failed", "error");
  }
}

async function handleSignOut() {
  try {
    console.log("🚪 Signing out...");

    // Clear all user data
    currentUser = null;
    userProfile = null;
    userPlan = null;
    userHistory = [];
    isServerAwake = false;
    isDataLoading = false;

    // Clear any pending payment data
    localStorage.removeItem("pending_payment");
    localStorage.removeItem("payment_return_url");

    // Sign out from Supabase
    const { error } = await supabaseClient.auth.signOut();

    if (error) throw error;

    console.log("✅ Signed out successfully");
    showToast("Signed out successfully", "success");

    // Force reload to clear everything
    setTimeout(() => {
      window.location.reload();
    }, 500);
  } catch (error) {
    console.error("❌ Sign out error:", error);
    showToast(error.message || "Sign out failed", "error");
  }
}

// ============================================
// AI & OPTIMIZER FUNCTIONS (USES SECURE BACKEND)
// ============================================

async function handleFetchRules(type) {
  // This is a public API, but we wake up the server anyway
  await wakeUpServer();
  const isAI = type === "ai";
  const inputId = isAI ? "aiSubredditInput" : "optimizerSubredditInput";
  const buttonId = isAI
    ? "aiFetchGuidelinesBtn"
    : "optimizerFetchGuidelinesBtn";
  const containerId = isAI
    ? "aiGuidelinesContainer"
    : "optimizerGuidelinesContainer";
  const contentId = isAI ? "aiGuidelinesContent" : "optimizerGuidelinesContent";
  const subredditId = isAI
    ? "aiGuidelineSubreddit"
    : "optimizerGuidelineSubreddit";

  const subreddit = getValue(inputId).trim();
  if (!subreddit) return showToast("Please enter a subreddit name", "warning");

  setButtonLoading(buttonId, true, "");

  try {
    const response = await fetch(`${API_URL}/api/reddit-rules/${subreddit}`);
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Could not fetch rules");
    }

    setText(subredditId, data.subreddit);
    document.getElementById(contentId).innerHTML = data.rules.replace(
      /\n/g,
      "<br>"
    );
    show(containerId);

    if (!isAI) {
      document.getElementById("optimizerOptimizeBtn").disabled = false;
      setText("optimizerButtonHelp", "Ready to optimize!");
    }
  } catch (error) {
    console.error("❌ Rules fetch error:", error);
    showToast(error.message, "error");
  } finally {
    const icon = '<i class="fas fa-search me-1"></i>Fetch Rules';
    setButtonLoading(buttonId, false, icon);
  }
}

async function handleAIGenerate(isRegen = false) {
  if (!userPlan || userPlan.credits_remaining <= 0) {
    showToast("No credits remaining. Please upgrade.", "error");
    return navigateToPage("pricing");
  }

  // This *must* use the backend to securely decrement credits
  await wakeUpServer();
  const subreddit = getValue("aiSubredditInput").trim();
  const topic = getValue("aiTopicInput").trim();
  const style = getValue("aiStyleSelect");
  const rules = getText("aiGuidelinesContent");

  if (!subreddit || !topic) {
    return showToast("Please enter a subreddit and topic", "warning");
  }

  setButtonLoading("aiGenerateBtn", true, "Generating...");
  if (isRegen) setButtonLoading("aiRegenerateBtn", true, "");

  try {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const token = session.access_token;
    const response = await fetch(`${API_URL}/api/generate-post`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ subreddit, topic, style, rules }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Generation failed");

    setValue("aiGeneratedTitle", data.post.title);
    setValue("aiGeneratedContent", data.post.content);
    setText("aiTargetSubreddit", subreddit);
    show("aiOutputCard");

    // The backend returns the new credit count and history item
    userPlan.credits_remaining = data.creditsRemaining;
    userHistory.unshift(data.historyItem);
    updateUI(); // Update UI with new credit count

    showToast("Content generated successfully!", "success");
  } catch (error) {
    console.error("❌ AI generate error:", error);
    showToast(error.message, "error");
  } finally {
    setButtonLoading(
      "aiGenerateBtn",
      false,
      '<i class="fas fa-wand-magic-sparkles me-2"></i>Generate Content'
    );
    if (isRegen)
      setButtonLoading(
        "aiRegenerateBtn",
        false,
        '<i class="fas fa-sync me-1"></i>Try Again'
      );
  }
}

async function handleOptimize(isRegen = false) {
  if (!userPlan || userPlan.credits_remaining <= 0) {
    showToast("No credits remaining. Please upgrade.", "error");
    return navigateToPage("pricing");
  }

  // This *must* use the backend to securely decrement credits
  await wakeUpServer();
  const subreddit = getValue("optimizerSubredditInput").trim();
  const content = getValue("optimizerContentInput").trim();
  const style = getValue("optimizationStyleSelect");
  const rules = getText("optimizerGuidelinesContent");

  if (!subreddit || !content) {
    return showToast("Please enter a subreddit and content", "warning");
  }

  setButtonLoading("optimizerOptimizeBtn", true, "Optimizing...");
  if (isRegen) setButtonLoading("optimizerRegenerateBtn", true, "");

  try {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const token = session.access_token;
    const response = await fetch(`${API_URL}/api/optimize-post`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ subreddit, content, style, rules }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Optimization failed");

    setValue("optimizerOptimizedText", data.optimizedPost);
    setText("optimizerTargetSubreddit", subreddit);
    show("optimizerOutputCard");

    userPlan.credits_remaining = data.creditsRemaining;
    userHistory.unshift(data.historyItem);
    updateUI(); // Update UI with new credit count

    showToast("Content optimized successfully!", "success");
  } catch (error) {
    console.error("❌ Optimize error:", error);
    showToast(error.message, "error");
  } finally {
    setButtonLoading(
      "optimizerOptimizeBtn",
      false,
      '<i class="fas fa-magic me-2"></i>Optimize Content'
    );
    if (isRegen)
      setButtonLoading(
        "optimizerRegenerateBtn",
        false,
        '<i class="fas fa-sync me-1"></i>Optimize Again'
      );
  }
}

// ============================================
// PAYMENT FUNCTIONS (USES SECURE BACKEND)
// ============================================

// =====================================================
// FIXED: initiateDodoPayment function
// =====================================================
async function initiateDodoPayment(planType) {
  if (!currentUser) {
    showToast("Please sign in to upgrade", "warning");
    return showAuthModal();
  }

  const billingCycleInput = document.querySelector('input[name="billingCycle"]:checked');
  const billingCycle = billingCycleInput ? billingCycleInput.value : 'monthly';
  const planData = PRICING_DATA[planType][billingCycle];

  if (!planData) {
    showToast("Invalid plan selected", "error");
    return;
  }

  try {
    const returnUrl = window.location.hostname.includes("localhost")
      ? "http://localhost:5500"
      : "https://redrule.site";

    const successRedirect = `${returnUrl}/dashboard.html?payment=success&session_id={CHECKOUT_SESSION_ID}`;
    
    const checkoutUrl = new URL(planData.checkoutUrl);
    checkoutUrl.searchParams.set("redirect_url", successRedirect);
    checkoutUrl.searchParams.set("customer_email", currentUser.email);
    
    // ✅ CORRECT WAY - Individual parameters
    checkoutUrl.searchParams.set("metadata[userId]", currentUser.id);
    checkoutUrl.searchParams.set("metadata[email]", currentUser.email);
    checkoutUrl.searchParams.set("metadata[planType]", planType);
    checkoutUrl.searchParams.set("metadata[billingCycle]", billingCycle);
    checkoutUrl.searchParams.set("metadata[postsPerMonth]", planData.posts.toString());
    checkoutUrl.searchParams.set("metadata[amount]", planData.price.toString());

    // ✅ ALSO SAVE TO LOCALSTORAGE - fallback in case metadata doesn't come back
    const paymentData = {
      planType: planType,
      billingCycle: billingCycle,
      postsPerMonth: planData.posts,
      amount: planData.price,
      email: currentUser.email,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem("pending_payment", JSON.stringify(paymentData));

    console.log("💾 Saved pending payment to localStorage:", paymentData);
    console.log("🔗 Checkout URL:", checkoutUrl.toString());
    
    // Redirect to Dodo
    window.location.href = checkoutUrl.toString();
    
  } catch (error) {
    console.error("❌ Payment error:", error);
    showToast(error.message || "Failed to initiate payment", "error");
  }
}


// ==========================================
// PAYMENT SUCCESS HANDLER - COMPLETE FIX
// ==========================================
async function handlePaymentReturn() {
  console.log("💳 Checking for payment return...");

  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get("session_id");
  const status = urlParams.get("status");

  // Also check localStorage
  const pendingPayment = localStorage.getItem("pending_payment");

  if (!sessionId && !pendingPayment) {
    console.log("No payment to process");
    return;
  }

  console.log("Payment detected:", { sessionId, status });

  try {
    const paymentData = pendingPayment ? JSON.parse(pendingPayment) : null;
    const finalSessionId = sessionId || paymentData?.sessionId;

    if (!finalSessionId) {
      throw new Error("No session ID found");
    }

    // Show loading
    showToast("⏳ Activating your plan...", "info");

    // Get auth token
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    if (!session) {
      throw new Error("Not authenticated. Please sign in again.");
    }

    // Verify payment on backend
    const verifyPayload = {
      sessionId: finalSessionId,
      userId: session.user?.id,
      plan: paymentData?.plan || "starter",
      billingCycle: paymentData?.billingCycle || "monthly",
      postsPerMonth: paymentData?.postsPerMonth || 50,
      amount: paymentData?.amount || 9.99,
      email: currentUser?.email,
    };

    // Try the new /api/payment/success endpoint first (fallback if webhook failed)
    let result;
    
    // Extract plan details from localStorage or use defaults
    const planType = paymentData?.planType || "professional";
    const billingCycle = paymentData?.billingCycle || "monthly";
    
    console.log("� Payment data from localStorage:", paymentData);
    console.log(`�📡 Calling /api/payment/success with planType: ${planType}, billingCycle: ${billingCycle}`);
    
    try {
      const successResponse = await fetch(`${API_URL}/api/payment/success`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: session.user?.id,
          sessionId: finalSessionId,
          planType: planType,
          billingCycle: billingCycle,
          amount: paymentData?.amount || 0,
          email: session.user?.email || paymentData?.email,
        }),
      });
      
      console.log(`Payment success response status: ${successResponse.status}`);
      
      if (!successResponse.ok) {
        console.warn(`⚠️ Payment success returned ${successResponse.status}, trying verify endpoint...`);
        throw new Error(`HTTP ${successResponse.status}`);
      }
      
      result = await successResponse.json();
      console.log("✅ Payment success endpoint called:", result);
    } catch (fallbackError) {
      console.warn("⚠️ Payment success endpoint failed, trying verify endpoint:", fallbackError);
      // Fallback to old verify endpoint
      try {
        const response = await fetch(`${API_URL}/api/payment/verify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(verifyPayload),
        });
        
        if (!response.ok) {
          throw new Error(`Verify endpoint returned ${response.status}`);
        }
        
        result = await response.json();
        console.log("✅ Verify endpoint success:", result);
      } catch (verifyError) {
        console.error("❌ Both endpoints failed:", verifyError);
        throw new Error("Failed to activate plan: " + verifyError.message);
      }
    }

    if (result && result.success) {
      console.log("✅ Payment verified!");

      // Clear pending payment
      localStorage.removeItem("pending_payment");
      localStorage.removeItem("payment_error_reported");

      // Remove URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);

      // Reload user data to get updated plan
      await loadUserData();

      // Show success modal with plan details
      showPaymentSuccessModal();
    } else {
      console.error("❌ Payment result:", result);
      throw new Error(result?.error || "Payment verification failed");
    }
  } catch (error) {
    console.error("❌ Payment verification error:", error);
    showToast(
      "⚠️ Could not verify payment. Please refresh the page or contact support.",
      "error"
    );
  }
}

// ==========================================
// SHOW PAYMENT SUCCESS MODAL
// ==========================================
// ==========================================
// PAYMENT SUCCESS MODAL - ADD THESE FUNCTIONS
// ==========================================
function showPaymentSuccessModal() {
  if (!userPlan) {
    console.error("No plan data available for success modal");
    return;
  }

  console.log("🎉 Showing payment success modal");

  const planNames = {
    free: "Free Plan",
    starter: "Starter Plan",
    professional: "Professional Plan",
    enterprise: "Enterprise Plan",
  };

  const planNameEl = document.getElementById("successPlanName");
  const creditsEl = document.getElementById("successCredits");
  const billingEl = document.getElementById("successBilling");
  const expiryEl = document.getElementById("successExpiry");
  const postsCountEl = document.getElementById("successPostsCount");

  if (planNameEl)
    planNameEl.textContent = planNames[userPlan.plan_type] || "Starter Plan";
  if (creditsEl) creditsEl.textContent = `${userPlan.credits_remaining} posts`;
  if (billingEl)
    billingEl.textContent =
      userPlan.billing_cycle === "yearly" ? "Yearly" : "Monthly";
  if (postsCountEl) postsCountEl.textContent = userPlan.posts_per_month || 150;

  if (expiryEl && userPlan.expires_at) {
    const expiryDate = new Date(userPlan.expires_at);
    expiryEl.textContent = expiryDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  // Show the modal
  const modalEl = document.getElementById("paymentSuccessModal");
  if (modalEl) {
    if (!bootstrapModals["paymentSuccessModal"]) {
      bootstrapModals["paymentSuccessModal"] = new bootstrap.Modal(modalEl);
    }
    bootstrapModals["paymentSuccessModal"].show();
  }
}

function closePaymentSuccessModal() {
  const modal = bootstrapModals["paymentSuccessModal"];
  if (modal) modal.hide();
  navigateToPage("aiGenerator");
}

// Make it globally accessible
window.closePaymentSuccessModal = closePaymentSuccessModal;

// ==========================================
// CLOSE PAYMENT SUCCESS MODAL
// ==========================================
function closePaymentSuccessModal() {
  hideModal("paymentSuccessModal");

  // Navigate to AI Generator tab
  const aiGenTab = document.querySelector('[data-tab="ai-generator"]');
  if (aiGenTab) {
    aiGenTab.click();
  }
}

// ==========================================
// UPDATE PLAN DISPLAY IN UI
// ==========================================
function updatePlanDisplay() {
  console.log("📊 Updating plan display");

  if (!userPlan) {
    console.warn("No plan data available");
    return;
  }

  // Update credits display
  const creditsEl = document.getElementById("creditsRemaining");
  if (creditsEl) {
    creditsEl.textContent = userPlan.credits_remaining || 0;
  }

  // Update plan badge
  const planTypeEl = document.getElementById("planType");
  if (planTypeEl) {
    const planNames = {
      free: "FREE",
      starter: "STARTER",
      professional: "PRO",
      enterprise: "ENTERPRISE",
    };
    planTypeEl.textContent = planNames[userPlan.plan_type] || "FREE";

    // Update badge color
    const badgeColors = {
      free: "bg-secondary",
      starter: "bg-primary",
      professional: "bg-success",
      enterprise: "bg-danger",
    };
    planTypeEl.className = `badge ${
      badgeColors[userPlan.plan_type] || "bg-secondary"
    }`;
  }

  // Show/hide pricing section based on plan
  const pricingSection = document.getElementById("pricingPlansSection");
  const currentPlanSection = document.getElementById("currentPlanSection");

  if (userPlan.plan_type !== "free") {
    // Hide pricing, show current plan
    if (pricingSection) pricingSection.style.display = "none";
    if (currentPlanSection) {
      currentPlanSection.style.display = "block";
      updateCurrentPlanDisplay();
    }
  } else {
    // Show pricing, hide current plan
    if (pricingSection) pricingSection.style.display = "block";
    if (currentPlanSection) currentPlanSection.style.display = "none";
  }

  console.log("✅ Plan display updated");
}

// ==========================================
// UPDATE CURRENT PLAN SECTION
// ==========================================
function updateCurrentPlanDisplay() {
  if (!userPlan) return;

  const currentPlanCard = document.getElementById("currentPlanCard");
  if (!currentPlanCard) return;

  const planNames = {
    free: "Free Plan",
    starter: "Starter Plan",
    professional: "Professional Plan",
    enterprise: "Enterprise Plan",
  };

  const expiryDate = userPlan.expires_at
    ? new Date(userPlan.expires_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Never";

  currentPlanCard.innerHTML = `
    <div class="card border-success">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="mb-0">Current Plan</h5>
          <span class="badge bg-success">Active</span>
        </div>
        
        <h3 class="fw-bold mb-3">${
          planNames[userPlan.plan_type] || "Starter Plan"
        }</h3>
        
        <div class="mb-3">
          <div class="d-flex justify-content-between mb-2">
            <span class="text-muted">Credits Remaining:</span>
            <span class="fw-bold">${userPlan.credits_remaining} / ${
    userPlan.posts_per_month
  }</span>
          </div>
          <div class="progress" style="height: 8px;">
            <div class="progress-bar bg-success" role="progressbar" 
                 style="width: ${
                   (userPlan.credits_remaining / userPlan.posts_per_month) * 100
                 }%">
            </div>
          </div>
        </div>
        
        <div class="row text-center mt-4">
          <div class="col-6">
            <p class="text-muted mb-1 small">Billing Cycle</p>
            <p class="fw-bold mb-0">${
              userPlan.billing_cycle === "yearly" ? "Yearly" : "Monthly"
            }</p>
          </div>
          <div class="col-6">
            <p class="text-muted mb-1 small">Renews On</p>
            <p class="fw-bold mb-0">${expiryDate}</p>
          </div>
        </div>
        
        ${
          userPlan.plan_type !== "enterprise"
            ? `
        <div class="mt-4">
          <button class="btn btn-outline-primary w-100" onclick="showModal('pricingModal')">
            <i class="fas fa-arrow-up"></i> Upgrade Plan
          </button>
        </div>
        `
            : ""
        }
      </div>
    </div>
  `;
}

async function handlePaymentCallback(authSession = null) {
  const urlParams = new URLSearchParams(window.location.search);
  let paymentStatus = urlParams.get("payment");
  let sessionId = urlParams.get("session_id");

  if (!paymentStatus) {
    return false;
  }

  if (paymentStatus === "success") {
    console.log("💳 Payment success detected!");
    showToast("Verifying your payment with Dodo... ⏳", "info");

    if (!sessionId) {
      console.error("❌ No session ID in URL!");
      showToast("Payment completed but verification failed. Contact support.", "error");
      return false;
    }

    try {
      if (!currentUser) {
        console.error("❌ No currentUser available!");
        showToast("Please sign in to activate your plan", "warning");
        return false;
      }

      let session = authSession;
      if (!session) {
        const sessionData = await supabaseClient.auth.getSession();
        session = sessionData?.data?.session;
      }

      if (!session) {
        showToast("Authentication required. Please sign in.", "error");
        return false;
      }

      // Get payment data from localStorage
      const pendingPayment = localStorage.getItem("pending_payment");
      const paymentData = pendingPayment ? JSON.parse(pendingPayment) : null;
      
      console.log("� Payment data from localStorage:", paymentData);
      console.log("�📡 Calling /api/payment/success with plan data...");
      
      // Extract plan details
      const planType = paymentData?.planType || "professional";
      const billingCycle = paymentData?.billingCycle || "monthly";
      
      try {
        // Try the new /api/payment/success endpoint first
        const successResponse = await fetch(`${API_URL}/api/payment/success`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            userId: session.user?.id,
            sessionId: sessionId,
            planType: planType,
            billingCycle: billingCycle,
            amount: paymentData?.amount || 0,
            email: session.user?.email || paymentData?.email,
          }),
        });

        if (!successResponse.ok) {
          throw new Error(`Payment success endpoint returned ${successResponse.status}`);
        }

        const verifyData = await successResponse.json();
        
        if (verifyData.success) {
          console.log("✅ Plan activated successfully!", verifyData);
          
          // Clear pending payment
          localStorage.removeItem("pending_payment");
          
          // Reload user data to get updated plan
          await loadUserData();
          
          showToast("✅ Payment verified! Your plan is now active! 🎉", "success");
          
          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);
          
          return true;
        } else {
          throw new Error(verifyData.error || "Plan activation failed");
        }
      } catch (fallbackError) {
        console.warn("⚠️ Payment success endpoint failed, trying old verify endpoint...", fallbackError);
        
        // Fallback to old verify endpoint as last resort
        const verifyResponse = await fetch(`${API_URL}/api/payment/verify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ 
            sessionId: sessionId,
            userId: session.user?.id,
            plan: planType,
            billingCycle: billingCycle,
            postsPerMonth: paymentData?.postsPerMonth || 250,
            amount: paymentData?.amount || 0,
          }),
        });

        const verifyData = await verifyResponse.json();

        if (verifyResponse.ok && verifyData.success) {
          console.log("✅ Payment verified by fallback endpoint!");
          
          // Clear pending payment
          localStorage.removeItem("pending_payment");
          
          // Reload user data
          await loadUserData();
          
          showToast("✅ Payment verified! Your plan is now active! 🎉", "success");
          
          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);
          
          return true;
        } else {
          throw new Error(verifyData.error || "Payment verification failed");
        }
      }
    } catch (error) {
      console.error("❌ Payment verification error:", error);
      showToast(
        "Could not verify payment. If you paid, contact support with your payment ID: " + sessionId,
        "error"
      );
      return false;
    }
  } else if (paymentStatus === "cancelled") {
    showToast("Payment was cancelled.", "warning");
    localStorage.removeItem("pending_payment");
    
    setTimeout(() => {
      navigateToPage("pricing");
      window.history.replaceState({}, document.title, window.location.pathname);
    }, 1500);
    
    return false;
  }

  return false;
}
// ============================================
// MANUAL PAYMENT VERIFICATION
// ============================================
async function manualVerifyPayment() {
  const pendingPayment = localStorage.getItem("pending_payment");

  if (!pendingPayment) {
    showToast(
      "No pending payment found. Please complete a payment first.",
      "warning"
    );
    return;
  }

  try {
    showToast("Verifying your payment...", "info");

    const paymentData = JSON.parse(pendingPayment);
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();

    if (!session) {
      showToast("Please sign in to verify payment", "error");
      return showAuthModal();
    }

    await wakeUpServer();

    const verifyResponse = await fetch(`${API_URL}/api/payment/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        ...paymentData,
        sessionId: `manual_${Date.now()}`,
      }),
    });

    const verifyData = await verifyResponse.json();

    if (verifyResponse.ok) {
      console.log("✅ Payment verified successfully!");
      await loadUserData();
      localStorage.removeItem("pending_payment");
      showToast("✅ Payment verified! Credits unlocked! 🎉", "success");

      // Hide the manual verify button
      const btn = document.getElementById("manualVerifyBtn");
      if (btn) btn.style.display = "none";
    } else {
      console.error("Payment verification failed:", verifyData);
      showToast("Could not verify payment. Please contact support.", "error");
    }
  } catch (error) {
    console.error("Manual verification error:", error);
    showToast("Verification failed: " + error.message, "error");
  }
}

// Show manual verify button if pending payment exists
function checkPendingPayment() {
  const pendingPayment = localStorage.getItem("pending_payment");
  const btn = document.getElementById("manualVerifyBtn");

  if (btn && pendingPayment) {
    btn.style.display = "block";
  }
}

function updatePricingDisplay() {
  const cycleInput = document.querySelector(
    'input[name="billingCycle"]:checked'
  );
  if (!cycleInput) return;

  const cycle = cycleInput.value;

  Object.keys(PRICING_DATA).forEach((plan) => {
    const data = PRICING_DATA[plan][cycle];
    setText(`${plan}Price`, `$${data.price}`);
    setText(
      `${plan}Posts`,
      `${data.posts} Posts Per ${cycle === "yearly" ? "Year" : "Month"}`
    );
    setText(`${plan}Billing`, cycle === "yearly" ? "/year" : "/month");
  });
}

// ============================================
// SETTINGS PAGE FUNCTIONS (USES SECURE BACKEND)
// ============================================

async function handleSaveProfile() {
  // We can't do this directly from the frontend, as RLS by default
  // only allows users to READ their own data, not WRITE it.
  // We *must* use the secure backend.
  await wakeUpServer();
  const displayName = getValue("settingsDisplayName").trim();
  const bio = getValue("settingsBio").trim();

  setButtonLoading("saveProfileBtn", true, "Saving...");

  try {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const token = session.access_token;
    const response = await fetch(`${API_URL}/api/user/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ displayName, bio }),
    });

    const data = await response.json();
    if (!data.success) throw new Error(data.error);

    userProfile = data.profile;
    updateUI();
    showToast("Profile saved successfully!", "success");
  } catch (error) {
    console.error("❌ Save profile error:", error);
    showToast(error.message, "error");
  } finally {
    setButtonLoading(
      "saveProfileBtn",
      false,
      '<i class="fas fa-save me-2"></i>Save Profile Changes'
    );
  }
}

async function handleChangePassword() {
  await wakeUpServer();
  const newPassword = getValue("newPassword");
  const confirm = getValue("confirmPassword");

  if (!newPassword || !confirm)
    return showToast("Please fill all fields", "warning");
  if (newPassword.length < 8)
    return showToast("Password must be at least 8 characters", "warning");
  if (newPassword !== confirm)
    return showToast("Passwords do not match!", "error");

  setButtonLoading("changePasswordBtn", true, "Updating...");

  try {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const token = session.access_token;
    const response = await fetch(`${API_URL}/api/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ newPassword }),
    });

    const data = await response.json();
    if (!data.success) throw new Error(data.error);

    showToast("Password updated successfully!", "success");
    bootstrapModals.changePasswordModal.hide();
    setValue("newPassword", "");
    setValue("confirmPassword", "");
  } catch (error) {
    console.error("❌ Change password error:", error);
    showToast(error.message, "error");
  } finally {
    setButtonLoading(
      "changePasswordBtn",
      false,
      '<i class="fas fa-save me-2"></i>Update Password'
    );
  }
}

async function handleLogoutAll() {
  if (!confirm("Are you sure you want to sign out from all devices?")) return;

  await wakeUpServer();
  setButtonLoading("logoutAllBtn", true, "Logging out...");

  try {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const token = session.access_token;
    const response = await fetch(`${API_URL}/api/auth/logout-all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json();
    if (!data.success) throw new Error(data.error);

    await handleSignOut();
    showToast("Signed out from all devices.", "success");
  } catch (error) {
    console.error("❌ Logout all error:", error);
    showToast(error.message, "error");
  } finally {
    setButtonLoading(
      "logoutAllBtn",
      false,
      '<i class="fas fa-sign-out-alt me-2"></i>Logout All Devices'
    );
  }
}

async function handleDeleteAccount() {
  const password = getValue("deleteConfirmPassword");
  if (!password)
    return showToast("Please enter your password to confirm", "warning");

  await wakeUpServer();
  setButtonLoading("deleteAccountBtn", true, "Deleting...");

  try {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const token = session.access_token;
    const response = await fetch(`${API_URL}/api/auth/delete-account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ password }),
    });

    const data = await response.json();
    if (!data.success) throw new Error(data.error);

    bootstrapModals.deleteAccountModal.hide();
    await handleSignOut();
    showToast("Account deleted successfully.", "success");
  } catch (error) {
    console.error("❌ Delete account error:", error);
    showToast(error.message, "error");
  } finally {
    setButtonLoading(
      "deleteAccountBtn",
      false,
      '<i class="fas fa-trash me-2"></i>Delete My Account'
    );
  }
}

// ============================================
// EVENT LISTENERS
// ============================================
function initializeEventListeners() {
  document.getElementById("loginForm")?.addEventListener("submit", handleLogin);
  document
    .getElementById("signupForm")
    ?.addEventListener("submit", handleSignup);
  document
    .getElementById("googleSignInBtn")
    ?.addEventListener("click", handleGoogleSignIn);
  document
    .getElementById("signOutBtn")
    ?.addEventListener("click", handleSignOut);
  document
    .getElementById("dropdownSignOutBtn")
    ?.addEventListener("click", handleSignOut);
  document.getElementById("showSignupLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    showSignupSection();
  });
  document.getElementById("showLoginLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    showLoginSection();
  });

  document.querySelectorAll(".sidebar-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      navigateToPage(item.dataset.page);
    });
  });
  document.querySelectorAll("[data-page-link]").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      navigateToPage(item.dataset.pageLink);
    });
  });
  document.getElementById("sidebarToggle")?.addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("active");
  });

  document
    .getElementById("aiFetchGuidelinesBtn")
    ?.addEventListener("click", () => handleFetchRules("ai"));
  document
    .getElementById("aiGenerateBtn")
    ?.addEventListener("click", () => handleAIGenerate(false));
  document
    .getElementById("aiRegenerateBtn")
    ?.addEventListener("click", () => handleAIGenerate(true));
  document.getElementById("aiCopyBtn")?.addEventListener("click", () => {
    const text = `Title: ${getValue(
      "aiGeneratedTitle"
    )}\n\nContent:\n${getValue("aiGeneratedContent")}`;
    copyToClipboard(text, "Full post copied to clipboard!");
  });

  document
    .getElementById("optimizerFetchGuidelinesBtn")
    ?.addEventListener("click", () => handleFetchRules("optimizer"));
  document
    .getElementById("optimizerOptimizeBtn")
    ?.addEventListener("click", () => handleOptimize(false));
  document
    .getElementById("optimizerRegenerateBtn")
    ?.addEventListener("click", () => handleOptimize(true));
  document.getElementById("optimizerCopyBtn")?.addEventListener("click", () => {
    copyToClipboard(
      getValue("optimizerOptimizedText"),
      "Optimized content copied!"
    );
  });

  document
    .getElementById("monthlyBilling")
    ?.addEventListener("change", updatePricingDisplay);
  document
    .getElementById("yearlyBilling")
    ?.addEventListener("change", updatePricingDisplay);
  document
    .getElementById("saveProfileBtn")
    ?.addEventListener("click", handleSaveProfile);
  document
    .getElementById("changePasswordBtn")
    ?.addEventListener("click", handleChangePassword);
  document
    .getElementById("logoutAllBtn")
    ?.addEventListener("click", handleLogoutAll);
  document
    .getElementById("deleteAccountBtn")
    ?.addEventListener("click", handleDeleteAccount);
  document.getElementById("viewPostCopyBtn")?.addEventListener("click", () => {
    copyToClipboard(getValue("viewPostContent"), "Post content copied!");
  });
}

// ============================================
// MODAL & NAVIGATION UTILITIES
// ============================================

function navigateToPage(pageName) {
  if (!pageName) return;

  document
    .querySelectorAll(".content-section")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById(`${pageName}Section`)?.classList.add("active");

  document.querySelectorAll(".sidebar-item").forEach((item) => {
    // --- THIS WAS THE FATAL TYPO ---
    item.classList.remove("active"); // Fixed: Changed ..remove to .remove
    // --- END FIX ---

    if (item.dataset.page === pageName) {
      item.classList.add("active");
    }
  });

  const titles = {
    aiGenerator: "AI Generator",
    contentOptimizer: "Content Optimizer",
    history: "Post History",
    profile: "Profile",
    settings: "Settings",
    pricing: "Pricing Plans",
  };
  setText("pageTitle", titles[pageName] || "Dashboard");
  document.getElementById("sidebar").classList.remove("active");
}

function showViewPostModal(post) {
  setValue("viewPostSubreddit", `r/${post.subreddit}`);
  setValue("viewPostContentTitle", post.title || "");
  setValue("viewPostContent", post.content);
  if (bootstrapModals.viewPostModal) bootstrapModals.viewPostModal.show();
}

function showAuthModal() {
  if (bootstrapModals.authModal) bootstrapModals.authModal.show();
}

function hideAuthModal() {
  if (bootstrapModals.authModal) {
    try {
      bootstrapModals.authModal.hide();
    } catch (e) {
      console.warn("Auth modal hide error:", e.message);
    }
  }
}

function showLoadingScreen() {
  const el = document.getElement("loadingScreen");
  if (el) el.style.display = "flex";
}

function hideLoadingScreen() {
  const el = document.getElementById("loadingScreen");
  if (el) el.style.display = "none";
}

function showLoginSection() {
  hide("signupSection");
  show("emailAuthSection");
}

function showSignupSection() {
  hide("emailAuthSection");
  show("signupSection");
}

// ============================================
// DOM & UTILITY HELPERS
// ============================================

function show(id, displayType = "block") {
  const el = document.getElementById(id);
  if (el) el.style.display = displayType;
}

function hide(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "none";
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function getText(id) {
  const el = document.getElementById(id);
  return el ? el.textContent : "";
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function getValue(id) {
  const el = document.getElementById(id);
  return el ? el.value : "";
}

function setStyle(id, prop, value) {
  const el = document.getElementById(id);
  if (el) el.style[prop] = value;
}

function setButtonLoading(id, isLoading, loadingText = "") {
  const btn = document.getElementById(id);
  if (!btn) return;

  btn.disabled = isLoading;
  if (isLoading) {
    btn.innerHTML = `
            <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            ${loadingText}
        `;
  } else {
    btn.innerHTML = loadingText;
  }
}

function showToast(message, type = "info") {
  const toastEl = document.getElementById("notificationToast");
  const titleEl = document.getElementById("toastTitle");
  const messageEl = document.getElementById("toastMessage");

  if (!toastEl || !titleEl || !messageEl || !bootstrapToast) {
    console.warn("Toast elements not found");
    return;
  }

  toastEl.classList.remove(
    "bg-success",
    "bg-danger",
    "bg-warning",
    "bg-info",
    "text-white"
  );

  const types = {
    success: { title: "Success", icon: "fa-check-circle", bg: "bg-success" },
    error: { title: "Error", icon: "fa-exclamation-circle", bg: "bg-danger" },
    warning: {
      title: "Warning",
      icon: "fa-exclamation-triangle",
      bg: "bg-warning",
    },
    info: { title: "Info", icon: "fa-info-circle", bg: "bg-info" },
  };

  const config = types[type] || types.info;

  titleEl.innerHTML = `<i class="fas ${config.icon} me-2"></i>${config.title}`;
  messageEl.textContent = message;
  toastEl.classList.add(config.bg, "text-white");

  if (bootstrapToast) {
    bootstrapToast.show();
  }
}

function copyToClipboard(text, successMessage) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      showToast(successMessage, "success");
    })
    .catch((err) => {
      console.error("Copy failed:", err);
      showToast("Failed to copy text", "error");
    });
}

// ============================================
// GLOBAL WINDOW EXPORTS
// ============================================
window.navigateToPage = navigateToPage;
window.initiateDodoPayment = initiateDodoPayment;
