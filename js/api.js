// js/api.js - Raw fetch wrappers for Supabase REST API
// See docs/CODING_PATTERNS.md §1 for full documentation.

const SUPABASE_URL = "https://mhfuhsaaznvvjiqlpvpw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_YvjGdS1FpOvUv6W3GF7nOQ_nqEg0o09";

/**
 * Generic GET request to Supabase REST API.
 * @param {string} endpoint - e.g. "/rest/v1/products?select=*"
 * @param {string|null} accessToken - Pass user's JWT for protected routes, null for public.
 */
async function apiGet(endpoint, accessToken = null) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(`${SUPABASE_URL}${endpoint}`, { headers });

  if (!response.ok) {
    if (response.status === 401) {
      console.warn("Session expired — please log in again.");
      localStorage.removeItem("access_token");
    }
    throw new Error(`GET ${endpoint} failed: ${response.status}`);
  }
  return response.json();
}

/**
 * Generic POST request to Supabase REST API.
 * @param {string} endpoint - e.g. "/auth/v1/signup"
 * @param {object} body - JSON payload.
 * @param {string|null} accessToken - Pass user's JWT for protected routes, null for public.
 * @param {object} options - Extra options: { returnData: true } to get created row back.
 */
async function apiPost(endpoint, body, accessToken = null, options = {}) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };

  // If we need the created row back (e.g., to get the order ID)
  if (options.returnData) {
    headers["Prefer"] = "return=representation";
  }

  const response = await fetch(`${SUPABASE_URL}${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    if (response.status === 401) {
      console.warn("Session expired — please log in again.");
      localStorage.removeItem("access_token");
    }
    let errMsg = `POST ${endpoint} failed (${response.status})`;
    try {
      const err = await response.json();
      errMsg = err.error_description || err.msg || err.message || errMsg;
    } catch (_) {}
    throw new Error(errMsg);
  }

  // Some responses (204 No Content) have no body
  const text = await response.text();
  if (!text) return {};
  const data = JSON.parse(text);
  // return=representation wraps result in an array
  return Array.isArray(data) && options.returnData ? data[0] : data;
}
