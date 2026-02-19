// js/cart.js - LocalStorage cart logic (add, remove, total, count)
// See docs/CODING_PATTERNS.md §3 for full documentation.

/** Get cart from LocalStorage */
function getCart() {
  return JSON.parse(localStorage.getItem("cart")) || [];
}

/** Save cart to LocalStorage */
function saveCart(cart) {
  localStorage.setItem("cart", JSON.stringify(cart));
}

/** Add a product to cart (or increment quantity) */
function addToCart(product) {
  const cart = getCart();
  const existing = cart.find((item) => item.id === product.id);

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ ...product, quantity: 1 });
  }

  saveCart(cart);
  updateCartBadge();
  showToast(`"${product.name}" added to cart!`, "success");
}

/** Remove a product from cart by ID */
function removeFromCart(productId) {
  // Requirement: Array Method - .filter()
  const cart = getCart().filter((item) => item.id !== productId);
  saveCart(cart);
  updateCartBadge();
}

/** Update quantity for a cart item */
function updateQuantity(productId, delta) {
  const cart = getCart();
  const item = cart.find((i) => i.id === productId);
  if (!item) return;

  item.quantity += delta;
  if (item.quantity <= 0) {
    // Remove if quantity drops to 0
    saveCart(cart.filter((i) => i.id !== productId));
  } else {
    saveCart(cart);
  }
  updateCartBadge();
}

/** Calculate total price */
function getCartTotal() {
  // Requirement: Array Method - .reduce()
  return getCart().reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  );
}

/** Get number of items in cart (for navbar badge) */
function getCartCount() {
  return getCart().reduce((count, item) => count + item.quantity, 0);
}
