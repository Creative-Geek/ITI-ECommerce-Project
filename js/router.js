// js/router.js - URL query parameter helpers
// See docs/CODING_PATTERNS.md §5 for full documentation.

/**
 * Get a query parameter value from the current URL.
 * Usage: const id = getParam('id'); // from product.html?id=5
 */
function getParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}
