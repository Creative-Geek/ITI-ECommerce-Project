// js/api.js - Raw fetch wrappers for Supabase REST API

const SUPABASE_URL = "https://mhfuhsaaznvvjiqlpvpw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_YvjGdS1FpOvUv6W3GF7nOQ_nqEg0o09";

/**
 * Check if the access token is expired or about to expire.
 * Returns true if token should be refreshed (expired or expires within 5 minutes).
 */
function isTokenExpired() {
  const token = localStorage.getItem("access_token");
  if (!token) return true;

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const now = Math.floor(Date.now() / 1000);
    // Refresh if expired or will expire within 5 minutes
    return !payload.exp || payload.exp - now < 300;
  } catch (e) {
    return true; // If we can't parse, treat as expired
  }
}

/**
 * Refresh the access token using the refresh token.
 * Returns the new access token if successful, null otherwise.
 */
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) {
    return null;
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      },
    );

    if (!response.ok) {
      console.warn("Token refresh failed:", response.status);
      // Token refresh failed - user needs to log in again
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("user");
      return null;
    }

    const data = await response.json();

    // Update localStorage with new tokens
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    localStorage.setItem("user", JSON.stringify(data.user));

    return data.access_token;
  } catch (error) {
    console.error("Token refresh error:", error);
    return null;
  }
}

/**
 * Get a valid access token, refreshing if necessary.
 * Returns the valid token or null if refresh failed.
 */
async function getValidToken() {
  // Check if we have a token
  const currentToken = localStorage.getItem("access_token");
  if (!currentToken) {
    return null;
  }

  // If token is expired or about to expire, try to refresh
  if (isTokenExpired()) {
    const newToken = await refreshAccessToken();
    if (!newToken) {
      return null;
    }
    return newToken;
  }

  return currentToken;
}

/**
 * Generic GET request to Supabase REST API.
 * @param {string} endpoint - e.g. "/rest/v1/products?select=*"
 * @param {string|null} accessToken - Pass user's JWT for protected routes, null for public.
 * @param {boolean} autoRefresh - If true, will attempt to refresh token on 401.
 */
async function apiGet(endpoint, accessToken = null, autoRefresh = true) {
  let token = accessToken;

  // If autoRefresh is true and no token provided, try to get a valid token
  if (autoRefresh && !token) {
    token = await getValidToken();
  }

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(`${SUPABASE_URL}${endpoint}`, { headers });

  if (!response.ok) {
    // If 401 and we haven't tried refreshing yet, try refreshing and retry once
    if (response.status === 401 && autoRefresh && !accessToken) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        // Retry with new token
        return apiGet(endpoint, newToken, false);
      }
      // If refresh failed, show session expired
      console.warn("Session expired — please log in again.");
      return { _session_expired: true };
    }

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
 * @param {boolean} autoRefresh - If true, will attempt to refresh token on 401.
 */
async function apiPost(
  endpoint,
  body,
  accessToken = null,
  options = {},
  autoRefresh = true,
) {
  let token = accessToken;

  // If autoRefresh is true and no token provided, try to get a valid token
  if (autoRefresh && !token) {
    token = await getValidToken();
  }

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
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
    // If 401 and we haven't tried refreshing yet, try refreshing and retry once
    if (response.status === 401 && autoRefresh && !accessToken) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        // Retry with new token
        return apiPost(endpoint, body, newToken, options, false);
      }
    }

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

/**
 * Generic PATCH request to Supabase REST API.
 * @param {string} endpoint - e.g. "/rest/v1/products?id=eq.5"
 * @param {object} body - JSON payload with fields to update.
 * @param {string|null} accessToken - Pass user's JWT for protected routes.
 */
async function apiPatch(endpoint, body, accessToken = null) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const response = await fetch(`${SUPABASE_URL}${endpoint}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    if (response.status === 401) {
      console.warn("Session expired — please log in again.");
      localStorage.removeItem("access_token");
    }
    let errMsg = `PATCH ${endpoint} failed (${response.status})`;
    try {
      const err = await response.json();
      errMsg = err.error_description || err.msg || err.message || errMsg;
    } catch (_) {}
    throw new Error(errMsg);
  }

  const text = await response.text();
  if (!text) return {};
  const data = JSON.parse(text);
  return Array.isArray(data) ? data[0] : data;
}

/**
 * Generic DELETE request to Supabase REST API.
 * @param {string} endpoint - e.g. "/rest/v1/products?id=eq.5"
 * @param {string|null} accessToken - Pass user's JWT for protected routes.
 */
async function apiDelete(endpoint, accessToken = null) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(`${SUPABASE_URL}${endpoint}`, {
    method: "DELETE",
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      console.warn("Session expired — please log in again.");
      localStorage.removeItem("access_token");
    }
    let errMsg = `DELETE ${endpoint} failed (${response.status})`;
    try {
      const err = await response.json();
      errMsg = err.error_description || err.msg || err.message || errMsg;
    } catch (_) {}
    throw new Error(errMsg);
  }
  return true;
}
