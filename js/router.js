// js/router.js - URL query parameter helpers

/**
 * Get a query parameter value from the current URL.
 * Usage: const id = getParam('id'); // from product.html?id=5
 */
function getParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}
