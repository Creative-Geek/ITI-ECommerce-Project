// js/auth.js - Login, Register, Logout, session helpers
// See docs/CODING_PATTERNS.md §2 for full documentation.

/** Register a new user */
async function register(email, password) {
  try {
    const data = await apiPost("/auth/v1/signup", { email, password });
    showToast(
      "Registration successful! Check your email to confirm.",
      "success",
    );
    window.location.href = "login.html";
  } catch (error) {
    showToast("Registration failed: " + error.message, "error");
  }
}

/** Login an existing user */
async function login(email, password) {
  try {
    const data = await apiPost("/auth/v1/token?grant_type=password", {
      email,
      password,
    });

    // Requirement: LocalStorage - persist the session manually
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    localStorage.setItem("user", JSON.stringify(data.user));

    window.location.href = "index.html";
  } catch (error) {
    showToast("Login failed: " + error.message, "error");
  }
}

/** Logout - clear session from LocalStorage */
function logout() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user");
  window.location.href = "login.html";
}

/**
 * Redirect to login if user is not authenticated.
 * Call this at the top of protected pages (profile.html, checkout.html).
 */
function requireAuth() {
  if (!localStorage.getItem("access_token")) {
    window.location.href = "login.html";
  }
}

/**
 * Returns the logged-in user object, or null.
 */
function getCurrentUser() {
  const user = localStorage.getItem("user");
  return user ? JSON.parse(user) : null;
}
