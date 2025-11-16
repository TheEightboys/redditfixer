/* ============================================
   SUPABASE CONFIGURATION
   ============================================ */
// TODO: Replace with your Supabase credentials
const SUPABASE_URL = "https://duzaoqvdukdnbjzccwbp.supabase.co"; // e.g., 'https://xxxxx.supabase.co'
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1emFvcXZkdWtkbmJqemNjd2JwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTE2MTIsImV4cCI6MjA3NzQ2NzYxMn0.eMvGGHRuqzeGjVMjfLViaJnMvaKryGCPWWaDyFK6UP8 "; // Your anon/public key

// Initialize Supabase client
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ============================================
   GLOBAL STATE
   ============================================ */
let currentUser = null;
let userCredits = 5;
let postHistory = [];

/* ============================================
   INITIALIZATION
   ============================================ */
document.addEventListener("DOMContentLoaded", async () => {
  // Hide loading screen
  setTimeout(() => {
    const loadingScreen = document.getElementById("loadingScreen");
    if (loadingScreen) {
      loadingScreen.classList.add("hidden");
    }
  }, 500);

  // Check if user is already logged in
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (session) {
    currentUser = session.user;
    hideAuthModal();
    updateUIAfterAuth();
    loadUserData();
  } else {
    showAuthModal();
  }

  // Initialize event listeners
  initializeEventListeners();

  // Initialize enhanced UI features
  initializeEnhancedFeatures();

  // Listen for auth state changes
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN") {
      currentUser = session.user;
      hideAuthModal();
      updateUIAfterAuth();
      loadUserData();
    } else if (event === "SIGNED_OUT") {
      currentUser = null;
      showAuthModal();
    }
  });
});

/* ============================================
   EVENT LISTENERS
   ============================================ */
function initializeEventListeners() {
  // Login Form
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  // Signup Form
  const signupForm = document.getElementById("signupForm");
  if (signupForm) {
    signupForm.addEventListener("submit", handleSignup);
  }

  // Google Sign In
  const googleSignInBtn = document.getElementById("googleSignInBtn");
  if (googleSignInBtn) {
    googleSignInBtn.addEventListener("click", handleGoogleSignIn);
  }

  // Toggle between login and signup
  const showSignupLink = document.getElementById("showSignupLink");
  if (showSignupLink) {
    showSignupLink.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("emailAuthSection").style.display = "none";
      document.getElementById("signupSection").style.display = "block";
    });
  }

  const showLoginLink = document.getElementById("showLoginLink");
  if (showLoginLink) {
    showLoginLink.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("signupSection").style.display = "none";
      document.getElementById("emailAuthSection").style.display = "block";
    });
  }

  // Sign Out (both buttons)
  const signOutBtn = document.getElementById("signOutBtn");
  if (signOutBtn) {
    signOutBtn.addEventListener("click", handleSignOut);
  }

  const dropdownSignOutBtn = document.getElementById("dropdownSignOutBtn");
  if (dropdownSignOutBtn) {
    dropdownSignOutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handleSignOut();
    });
  }

  // Sidebar Navigation
  document.querySelectorAll(".sidebar-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const page = item.getAttribute("data-page");
      navigateToPage(page);
    });
  });

  // Profile Dropdown Menu Navigation
  document.querySelectorAll(".dropdown-menu [data-page]").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const page = item.getAttribute("data-page");
      navigateToPage(page);
      // Close dropdown
      const dropdown = document.getElementById("userProfileDropdown");
      const bsDropdown = bootstrap.Dropdown.getInstance(dropdown);
      if (bsDropdown) bsDropdown.hide();
    });
  });

  // Sidebar toggle for mobile
  const sidebarToggle = document.getElementById("sidebarToggle");
  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
      document.getElementById("sidebar").classList.toggle("active");
    });
  }

  // Optimize Button
  const optimizeBtn = document.getElementById("optimizeBtn");
  if (optimizeBtn) {
    optimizeBtn.addEventListener("click", handleOptimize);
  }

  // Copy Button
  const copyBtn = document.getElementById("copyBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      copyToClipboard("optimizedText");
    });
  }

  // Regenerate Button
  const regenerateBtn = document.getElementById("regenerateBtn");
  if (regenerateBtn) {
    regenerateBtn.addEventListener("click", handleOptimize);
  }
}
/* ============================================
   SCROLL PROGRESS BAR
   ============================================ */
document.addEventListener("DOMContentLoaded", () => {
  createScrollProgressBar();
  initializeNavbarScrollEffect();
  initializeMagneticButtons();
  initializeRippleEffect();
});

function createScrollProgressBar() {
  const progressBar = document.createElement("div");
  progressBar.className = "scroll-progress";
  document.body.appendChild(progressBar);

  window.addEventListener("scroll", () => {
    const windowHeight =
      document.documentElement.scrollHeight -
      document.documentElement.clientHeight;
    const scrolled = (window.scrollY / windowHeight) * 100;
    progressBar.style.width = scrolled + "%";
  });
}

function initializeNavbarScrollEffect() {
  const navbar = document.querySelector(".navbar");
  if (!navbar) return;

  window.addEventListener("scroll", () => {
    if (window.scrollY > 50) {
      navbar.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)";
    } else {
      navbar.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.08)";
    }
  });
}

function initializeMagneticButtons() {
  document
    .querySelectorAll(".btn-reddit, .btn-outline-dark")
    .forEach((button) => {
      button.addEventListener("mousemove", (e) => {
        const rect = button.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        button.style.transform = `translate(${x * 0.2}px, ${
          y * 0.2
        }px) scale(1.02)`;
      });

      button.addEventListener("mouseleave", () => {
        button.style.transform = "translate(0, 0) scale(1)";
      });
    });
}

function initializeRippleEffect() {
  document.querySelectorAll(".btn").forEach((button) => {
    button.addEventListener("click", function (e) {
      const ripple = document.createElement("span");
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      ripple.style.width = ripple.style.height = size + "px";
      ripple.style.left = x + "px";
      ripple.style.top = y + "px";
      ripple.classList.add("ripple-effect");

      this.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  });
}

console.log(
  "%c🚀 Redrule Loaded!",
  "color: #ff4500; font-size: 20px; font-weight: bold;"
);

/* ============================================
   AUTHENTICATION - SUPABASE
   ============================================ */
async function handleLogin(e) {
  e.preventDefault();

  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  const loadingBtn = e.target.querySelector('button[type="submit"]');
  const originalText = loadingBtn.innerHTML;
  loadingBtn.innerHTML =
    '<span class="spinner-border spinner-border-sm me-2"></span>Signing in...';
  loadingBtn.disabled = true;

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) throw error;

    currentUser = data.user;
    hideAuthModal();
    updateUIAfterAuth();
    loadUserData();
    showToast("Welcome back!", "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    loadingBtn.innerHTML = originalText;
    loadingBtn.disabled = false;
  }
}

async function handleSignup(e) {
  e.preventDefault();

  const email = document.getElementById("signupEmail").value;
  const password = document.getElementById("signupPassword").value;
  const passwordConfirm = document.getElementById(
    "signupPasswordConfirm"
  ).value;

  if (password !== passwordConfirm) {
    showToast("Passwords do not match", "error");
    return;
  }

  if (password.length < 6) {
    showToast("Password must be at least 6 characters", "error");
    return;
  }

  const loadingBtn = e.target.querySelector('button[type="submit"]');
  const originalText = loadingBtn.innerHTML;
  loadingBtn.innerHTML =
    '<span class="spinner-border spinner-border-sm me-2"></span>Creating account...';
  loadingBtn.disabled = true;

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email: email,
      password: password,
    });

    if (error) throw error;

    showToast("Account created successfully! Redirecting to dashboard...", "success");

    // Redirect to dashboard after signup
    setTimeout(() => {
      window.location.href = "/dashboard.html";
    }, 1500);
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    loadingBtn.innerHTML = originalText;
    loadingBtn.disabled = false;
  }
}

async function handleGoogleSignIn() {
  try {
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + "/dashboard.html",
      },
    });

    if (error) throw error;
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function handleSignOut() {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;

    currentUser = null;
    showAuthModal();
    showToast("Signed out successfully", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

function showAuthModal() {
  const authModal = new bootstrap.Modal(document.getElementById("authModal"));
  authModal.show();
}

function hideAuthModal() {
  const authModal = bootstrap.Modal.getInstance(
    document.getElementById("authModal")
  );
  if (authModal) {
    authModal.hide();
  }
}

/* ============================================
   CONTENT OPTIMIZATION
   ============================================ */
async function handleOptimize() {
  const subreddit = document.getElementById("subredditInput").value.trim();
  const originalContent = document
    .getElementById("originalContent")
    .value.trim();
  const style = document.getElementById("styleSelect").value;

  // Validation
  if (!subreddit) {
    showToast("Please enter a subreddit name", "error");
    return;
  }

  if (!originalContent) {
    showToast("Please paste your content", "error");
    return;
  }

  // Check credits
  if (userCredits <= 0) {
    showToast("No credits remaining. Please upgrade your plan.", "error");
    return;
  }

  // Show loading
  const optimizeBtn = document.getElementById("optimizeBtn");
  const originalBtnText = optimizeBtn.innerHTML;
  optimizeBtn.innerHTML =
    '<span class="spinner-border spinner-border-sm me-2"></span>Optimizing...';
  optimizeBtn.disabled = true;

  try {
    // Call AI optimization function
    const optimizedContent = await optimizeContent(
      subreddit,
      originalContent,
      style
    );

    // Display result
    document.getElementById("optimizedText").textContent = optimizedContent;
    document.getElementById("targetSubreddit").textContent = subreddit;
    document.getElementById("outputCard").style.display = "block";

    // Scroll to result
    document
      .getElementById("outputCard")
      .scrollIntoView({ behavior: "smooth", block: "nearest" });

    // Update credits
    userCredits--;
    updateCreditsDisplay();
    updateStatsDisplay();

    // Save to history
    saveToHistory(subreddit, originalContent, optimizedContent, style);

    showToast("Content optimized successfully!", "success");
    createConfetti();
  } catch (error) {
    showToast("Error optimizing content. Please try again.", "error");
    console.error(error);
  } finally {
    optimizeBtn.innerHTML = originalBtnText;
    optimizeBtn.disabled = false;
  }
}

/* ============================================
   AI OPTIMIZATION (Gemini/Grok API)
   ============================================ */
async function optimizeContent(subreddit, content, style) {
  // Simulating API delay
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Placeholder optimized content
  const styleMessages = {
    improve: "improved and polished",
    casual: "made more casual and friendly",
    formal: "made more formal and professional",
    engaging: "made more engaging",
    concise: "made more concise",
  };

  return `Hey r/${subreddit}! 👋

${content}

[AI has optimized this content to follow r/${subreddit} guidelines. Content has been ${styleMessages[style]} for maximum engagement.]

Hope this helps! Let me know what you think.`;

  /*
    // ACTUAL GEMINI IMPLEMENTATION (Uncomment and add your API key):
    const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: `Optimize this Reddit post for r/${subreddit}. Style: ${style}. Original content: "${content}". Make it follow all subreddit rules.`
                }]
            }]
        })
    });
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
    */
}

/* ============================================
   NAVIGATION
   ============================================ */
function navigateToPage(page) {
  // Update active state
  document.querySelectorAll(".sidebar-item").forEach((item) => {
    item.classList.remove("active");
  });
  const activeItem = document.querySelector(`[data-page="${page}"]`);
  if (activeItem) {
    activeItem.classList.add("active");
  }

  // Hide all sections
  document.querySelectorAll(".content-section").forEach((section) => {
    section.classList.remove("active");
  });

  // Show selected section
  const sectionMap = {
    optimizer: "optimizerSection",
    history: "historySection",
    // 'profile' now points to settings (profile removed as separate section)
    profile: "settingsSection",
    settings: "settingsSection",
  };

  const sectionId = sectionMap[page];
  if (sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
      section.classList.add("active");
    }
    updatePageTitle(page);
  }

  // Close mobile sidebar
  if (window.innerWidth < 992) {
    document.getElementById("sidebar").classList.remove("active");
  }
}

function updatePageTitle(page) {
  const titles = {
    optimizer: "Content Optimizer",
    history: "Post History",
    profile: "Your Profile", // kept for backward compatibility
    settings: "Settings",
  };
  const titleElement = document.getElementById("pageTitle");
  if (titleElement) {
    titleElement.textContent = titles[page] || "Dashboard";
  }
}

/* ============================================
   UI UPDATE FUNCTIONS
   ============================================ */
function updateUIAfterAuth() {
  if (currentUser) {
    // Get user name from email (before @)
    const userName = currentUser.email.split("@")[0];

    // Update Profile Section
    const profileName = document.getElementById("profileName");
    const profileEmail = document.getElementById("profileEmail");

    if (profileName) profileName.textContent = userName;
    if (profileEmail) profileEmail.textContent = currentUser.email;

    // Update Dropdown Info
    const dropdownUserName = document.getElementById("dropdownUserName");
    const dropdownUserEmail = document.getElementById("dropdownUserEmail");

    if (dropdownUserName) dropdownUserName.textContent = userName;
    if (dropdownUserEmail) dropdownUserEmail.textContent = currentUser.email;

    // Check for avatar from Google OAuth
    if (currentUser.user_metadata?.avatar_url) {
      const userAvatar = document.getElementById("userAvatar");
      const profileAvatarLarge = document.getElementById("profileAvatarLarge");

      if (userAvatar) {
        userAvatar.innerHTML = `<img src="${currentUser.user_metadata.avatar_url}" alt="User">`;
      }
      if (profileAvatarLarge) {
        profileAvatarLarge.innerHTML = `<img src="${currentUser.user_metadata.avatar_url}" alt="User">`;
      }
    }

    // Update all stats in dropdown and profile
    updateStatsDisplay();
  }
}

function updateStatsDisplay() {
  // Calculate credits used
  const creditsUsed = 5 - userCredits;
  const creditsPercent = (creditsUsed / 5) * 100;

  // Update Dropdown Credits
  const dropdownCreditsUsed = document.getElementById("dropdownCreditsUsed");
  if (dropdownCreditsUsed) {
    dropdownCreditsUsed.textContent = `${creditsUsed} / 5`;
  }

  // Update Credits Progress Bar
  const creditsProgress = document.getElementById("creditsProgress");
  if (creditsProgress) {
    creditsProgress.style.width = creditsPercent + "%";
  }

  // Update Dropdown Total Posts
  const dropdownTotalPosts = document.getElementById("dropdownTotalPosts");
  if (dropdownTotalPosts) {
    dropdownTotalPosts.textContent = postHistory.length;
  }

  // Update Join Date
  const dropdownJoinDate = document.getElementById("dropdownJoinDate");
  if (dropdownJoinDate && currentUser) {
    const joinDate = new Date(currentUser.created_at);
    dropdownJoinDate.textContent = joinDate.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  }

  // Update Profile Section
  const totalPosts = document.getElementById("totalPosts");
  const creditsUsedProfile = document.getElementById("creditsUsed");
  const memberSince = document.getElementById("memberSince");

  if (totalPosts) totalPosts.textContent = postHistory.length;
  if (creditsUsedProfile) creditsUsedProfile.textContent = creditsUsed;
  if (memberSince && currentUser) {
    memberSince.textContent = new Date(currentUser.created_at).getFullYear();
  }

  // Update sidebar credits display
  const creditsDisplay = document.getElementById("creditsDisplay");
  if (creditsDisplay) {
    creditsDisplay.textContent = `${userCredits} / 5`;
  }
}

/* ============================================
   POST HISTORY FUNCTIONS
   ============================================ */
function saveToHistory(subreddit, original, optimized, style) {
  const historyItem = {
    id: Date.now(),
    date: new Date().toLocaleDateString(),
    subreddit: subreddit,
    original: original.substring(0, 100) + "...",
    optimized: optimized.substring(0, 100) + "...",
    style: style,
    fullOptimized: optimized,
  };

  postHistory.unshift(historyItem);
  updateHistoryTable();
  saveToLocalStorage();
}

function updateHistoryTable() {
  const tbody = document.getElementById("historyTableBody");

  if (!tbody) return;

  if (postHistory.length === 0) {
    tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-muted py-5">
                    <i class="fas fa-inbox fa-3x mb-3 d-block"></i>
                    No posts optimized yet. Start creating!
                </td>
            </tr>
        `;
    return;
  }

  tbody.innerHTML = postHistory
    .map(
      (item) => `
        <tr>
            <td>${item.date}</td>
            <td><span class="badge bg-reddit">r/${item.subreddit}</span></td>
            <td>${item.optimized}</td>
            <td><span class="badge bg-primary">${item.style}</span></td>
            <td>
                <button class="btn btn-sm btn-outline-secondary" onclick="viewPost(${item.id})">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `
    )
    .join("");
}

function viewPost(id) {
  const post = postHistory.find((p) => p.id === id);
  if (post) {
    alert(post.fullOptimized); // Replace with a proper modal in production
  }
}

/* ============================================
   UTILITY FUNCTIONS
   ============================================ */
function copyToClipboard(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const text = element.textContent;
  navigator.clipboard
    .writeText(text)
    .then(() => {
      showToast("Copied to clipboard!", "success");
    })
    .catch(() => {
      showToast("Failed to copy", "error");
    });
}

function showToast(message, type = "info") {
  const toast = document.getElementById("notificationToast");
  const toastMessage = document.getElementById("toastMessage");

  if (!toast || !toastMessage) return;

  toastMessage.textContent = message;

  const bsToast = new bootstrap.Toast(toast);
  bsToast.show();
}

function updateCreditsDisplay() {
  const creditsDisplay = document.getElementById("creditsDisplay");
  if (creditsDisplay) {
    creditsDisplay.textContent = `${userCredits} / 5`;
  }
  saveToLocalStorage();
}

/* ============================================
   LOCAL STORAGE
   ============================================ */
function saveToLocalStorage() {
  localStorage.setItem("redruleCredits", userCredits);
  localStorage.setItem("redruleHistory", JSON.stringify(postHistory));
}

async function loadUserData() {
  const savedCredits = localStorage.getItem("redruleCredits");
  const savedHistory = localStorage.getItem("redruleHistory");

  if (savedCredits) {
    userCredits = parseInt(savedCredits);
    updateCreditsDisplay();
  }

  if (savedHistory) {
    postHistory = JSON.parse(savedHistory);
    updateHistoryTable();
  }

  // Update all stats display
  updateStatsDisplay();
}

/* ============================================
   ENHANCED UI FEATURES
   ============================================ */
function initializeEnhancedFeatures() {
  createScrollProgressBar();
  initializeNavbarScrollEffect();
  initializeSmoothScrolling();
  initializeMagneticButtons();
  initializeRippleEffect();
}

/* ============================================
   SCROLL PROGRESS BAR
   ============================================ */
function createScrollProgressBar() {
  const progressBar = document.createElement("div");
  progressBar.className = "scroll-progress";
  document.body.appendChild(progressBar);

  window.addEventListener("scroll", () => {
    const windowHeight =
      document.documentElement.scrollHeight -
      document.documentElement.clientHeight;
    const scrolled = (window.scrollY / windowHeight) * 100;
    progressBar.style.width = scrolled + "%";
  });
}

/* ============================================
   NAVBAR SCROLL EFFECT
   ============================================ */
function initializeNavbarScrollEffect() {
  const topNavbar = document.querySelector(".top-navbar");
  if (!topNavbar) return;

  window.addEventListener("scroll", () => {
    if (window.scrollY > 50) {
      topNavbar.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)";
    } else {
      topNavbar.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.08)";
    }
  });
}

/* ============================================
   SMOOTH SCROLLING
   ============================================ */
function initializeSmoothScrolling() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      const href = this.getAttribute("href");
      if (href !== "#" && href.length > 1) {
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      }
    });
  });
}

/* ============================================
   MAGNETIC BUTTON EFFECT
   ============================================ */
function initializeMagneticButtons() {
  document
    .querySelectorAll(".btn-reddit, .btn-outline-reddit")
    .forEach((button) => {
      button.addEventListener("mousemove", (e) => {
        const rect = button.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;

        button.style.transform = `translate(${x * 0.2}px, ${
          y * 0.2
        }px) scale(1.02)`;
      });

      button.addEventListener("mouseleave", () => {
        button.style.transform = "translate(0, 0) scale(1)";
      });
    });
}

/* ============================================
   RIPPLE EFFECT ON CLICK
   ============================================ */
function initializeRippleEffect() {
  document.querySelectorAll(".btn").forEach((button) => {
    button.addEventListener("click", function (e) {
      const ripple = document.createElement("span");
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      ripple.style.width = ripple.style.height = size + "px";
      ripple.style.left = x + "px";
      ripple.style.top = y + "px";
      ripple.classList.add("ripple-effect");

      this.appendChild(ripple);

      setTimeout(() => ripple.remove(), 600);
    });
  });

  // Add CSS for ripple
  const style = document.createElement("style");
  style.textContent = `
        .ripple-effect {
            position: absolute;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.6);
            transform: scale(0);
            animation: ripple 0.6s ease-out;
            pointer-events: none;
        }
        
        @keyframes ripple {
            to {
                transform: scale(4);
                opacity: 0;
            }
        }
        
        .btn {
            position: relative;
            overflow: hidden;
        }
    `;
  document.head.appendChild(style);
}

/* ============================================
   CONFETTI ANIMATION ON SUCCESS
   ============================================ */
function createConfetti() {
  const colors = ["#ff4500", "#ff5722", "#ff6f43", "#ffa500"];
  const confettiCount = 50;

  for (let i = 0; i < confettiCount; i++) {
    const confetti = document.createElement("div");
    confetti.style.cssText = `
            position: fixed;
            width: 10px;
            height: 10px;
            background: ${colors[Math.floor(Math.random() * colors.length)]};
            left: ${Math.random() * 100}%;
            top: -10px;
            opacity: 1;
            transform: rotate(${Math.random() * 360}deg);
            pointer-events: none;
            z-index: 9999;
            animation: confetti-fall ${2 + Math.random() * 2}s linear forwards;
        `;

    document.body.appendChild(confetti);

    setTimeout(() => confetti.remove(), 4000);
  }

  // Add confetti animation
  if (!document.getElementById("confetti-style")) {
    const style = document.createElement("style");
    style.id = "confetti-style";
    style.textContent = `
            @keyframes confetti-fall {
                0% {
                    top: -10px;
                    opacity: 1;
                }
                100% {
                    top: 100vh;
                    opacity: 0;
                    transform: translateX(${
                      Math.random() * 200 - 100
                    }px) rotate(${Math.random() * 720}deg);
                }
            }
        `;
    document.head.appendChild(style);
  }
}

/* ============================================
   CONSOLE LOG
   ============================================ */
console.log(
  "%c🚀 Redrule Dashboard Loaded!",
  "color: #ff4500; font-size: 20px; font-weight: bold;"
);
console.log(
  "%cVersion 2.0 - With Supabase Auth & Advanced Animations",
  "color: #ff5722; font-size: 14px;"
);
console.log(
  "%c✅ Supabase Authentication Active",
  "color: #00d084; font-size: 12px;"
);
