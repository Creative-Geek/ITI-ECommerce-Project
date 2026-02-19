// js/ui.js — Shared UI: Navbar, Footer, Renderers, Toast, Theme Toggle
// This is loaded on every page via <script src="js/ui.js"></script>

// ════════════════════════════════════════════════════════════════
// §0 · PRODUCT CACHE (safe add-to-cart without inline JSON)
// ════════════════════════════════════════════════════════════════

// Keyed by product id — avoids embedding JSON with quotes into HTML attributes.
const _productCache = {};

function addToCartById(id) {
  const product = _productCache[id];
  if (product) addToCart(product);
}

// ════════════════════════════════════════════════════════════════
// §1 · THEME TOGGLE
// ════════════════════════════════════════════════════════════════

function getTheme() {
  return localStorage.getItem("theme") || "light";
}

function setTheme(mode) {
  localStorage.setItem("theme", mode);
  if (mode === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
  // Update toggle icon
  const icon = document.getElementById("theme-icon");
  if (icon) icon.setAttribute("data-lucide", mode === "dark" ? "sun" : "moon");
  if (typeof lucide !== "undefined") lucide.createIcons();
}

function toggleTheme() {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}

// Apply saved theme immediately (called in <head> via inline script ideally, but also here as fallback)
(function () {
  const saved = localStorage.getItem("theme");
  if (saved === "dark") document.documentElement.classList.add("dark");
})();

// ════════════════════════════════════════════════════════════════
// §2 · TOAST NOTIFICATIONS
// ════════════════════════════════════════════════════════════════

function showToast(message, type = "info") {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

// ════════════════════════════════════════════════════════════════
// §3 · SHARED NAVBAR
// ════════════════════════════════════════════════════════════════

function injectNavbar() {
  const currentPage = window.location.pathname.split("/").pop() || "index.html";

  const nav = document.createElement("header");
  nav.className = "site-navbar";
  nav.innerHTML = `
    <div class="uk-container py-3">
      <div class="flex items-center justify-between">
        <!-- Logo -->
        <a href="index.html" class="no-underline flex items-center">
          <img src="assets/bytestorelogo.svg" alt="byteStore" width="140" height="39" style="height:39px;width:auto;display:block;" />
        </a>

        <!-- Desktop Nav -->
        <nav class="desktop-nav flex items-center gap-6">
          <a href="index.html" class="nav-link ${currentPage === "index.html" ? "active" : ""}">Home</a>
          <a href="shop.html" class="nav-link ${currentPage === "shop.html" ? "active" : ""}">Shop</a>
          <a href="about.html" class="nav-link ${currentPage === "about.html" ? "active" : ""}">About</a>
          <a href="contact.html" class="nav-link ${currentPage === "contact.html" ? "active" : ""}">Contact</a>
        </nav>

        <!-- Right Actions -->
        <div class="flex items-center gap-3">
          <!-- Theme Toggle -->
          <button onclick="toggleTheme()" class="uk-btn uk-btn-ghost uk-btn-icon uk-btn-sm" aria-label="Toggle theme">
            <i id="theme-icon" data-lucide="${getTheme() === "dark" ? "sun" : "moon"}" class="h-4 w-4"></i>
          </button>

          <!-- Cart -->
          <a href="cart.html" class="uk-btn uk-btn-ghost uk-btn-icon uk-btn-sm relative" aria-label="Cart">
            <i data-lucide="shopping-cart" class="h-4 w-4"></i>
            <span id="cart-badge" class="cart-badge" style="display:none;">0</span>
          </a>

          <!-- Auth: Logged Out -->
          <a href="login.html" id="nav-login" class="uk-btn uk-btn-default uk-btn-sm">
            Sign In
          </a>

          <!-- Auth: Logged In -->
          <div id="nav-user-area" class="flex items-center gap-2" style="display:none;">
            <a href="profile.html" class="uk-btn uk-btn-ghost uk-btn-sm" id="nav-user-email">User</a>
            <button onclick="logout()" class="uk-btn uk-btn-ghost uk-btn-icon uk-btn-sm" aria-label="Logout">
              <i data-lucide="log-out" class="h-4 w-4"></i>
            </button>
          </div>

          <!-- Mobile Menu Toggle -->
          <button class="mobile-nav-toggle uk-btn uk-btn-ghost uk-btn-icon uk-btn-sm" aria-label="Menu" onclick="document.getElementById('mobile-menu').classList.toggle('hidden')">
            <i data-lucide="menu" class="h-5 w-5"></i>
          </button>
        </div>
      </div>

      <!-- Mobile Nav -->
      <nav id="mobile-menu" class="hidden mt-3 pb-3 flex flex-col gap-2 border-t pt-3" style="border-color: hsl(var(--border) / 0.5);">
        <a href="index.html" class="nav-link ${currentPage === "index.html" ? "active" : ""}">Home</a>
        <a href="shop.html" class="nav-link ${currentPage === "shop.html" ? "active" : ""}">Shop</a>
        <a href="about.html" class="nav-link ${currentPage === "about.html" ? "active" : ""}">About</a>
        <a href="contact.html" class="nav-link ${currentPage === "contact.html" ? "active" : ""}">Contact</a>
      </nav>
    </div>
  `;

  document.body.prepend(nav);
}

// ════════════════════════════════════════════════════════════════
// §4 · SHARED FOOTER
// ════════════════════════════════════════════════════════════════

function injectFooter() {
  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML = `
    <div class="uk-container py-10">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        <!-- Brand -->
        <div>
          <img src="assets/bytestorelogo.svg" alt="byteStore" width="120" style="height:auto;display:block;margin-bottom:0.5rem;" />
          <p class="text-sm text-muted-foreground">Your one-stop shop for the latest tech products in Egypt.</p>
        </div>
        <!-- Quick Links -->
        <div>
          <h4 class="font-semibold text-sm mb-3 text-foreground">Quick Links</h4>
          <ul class="space-y-2 text-sm">
            <li><a href="shop.html" class="text-muted-foreground hover:text-foreground transition-colors">Shop</a></li>
            <li><a href="about.html" class="text-muted-foreground hover:text-foreground transition-colors">About Us</a></li>
            <li><a href="contact.html" class="text-muted-foreground hover:text-foreground transition-colors">Contact</a></li>
          </ul>
        </div>
        <!-- Account -->
        <div>
          <h4 class="font-semibold text-sm mb-3 text-foreground">Account</h4>
          <ul class="space-y-2 text-sm">
            <li><a href="profile.html" class="text-muted-foreground hover:text-foreground transition-colors">My Profile</a></li>
            <li><a href="cart.html" class="text-muted-foreground hover:text-foreground transition-colors">Cart</a></li>
            <li><a href="login.html" class="text-muted-foreground hover:text-foreground transition-colors">Sign In</a></li>
          </ul>
        </div>
      </div>
      <div class="border-t mt-8 pt-6 text-center text-xs text-muted-foreground" style="border-color:hsl(var(--border)/0.5)">
        © ${new Date().getFullYear()} byteStore. Built with ❤ for ITI.
      </div>
    </div>
  `;

  document.body.appendChild(footer);
}

// ════════════════════════════════════════════════════════════════
// §5 · AUTH STATE UI
// ════════════════════════════════════════════════════════════════

function updateNavAuth() {
  const user = getCurrentUser();
  const loginLink = document.getElementById("nav-login");
  const userArea = document.getElementById("nav-user-area");
  const userEmail = document.getElementById("nav-user-email");

  if (user) {
    if (loginLink) loginLink.style.display = "none";
    if (userArea) userArea.style.display = "flex";
    if (userEmail) userEmail.textContent = user.email.split("@")[0];
  } else {
    if (loginLink) loginLink.style.display = "";
    if (userArea) userArea.style.display = "none";
  }
}

// ════════════════════════════════════════════════════════════════
// §6 · CART BADGE
// ════════════════════════════════════════════════════════════════

function updateCartBadge() {
  const badge = document.getElementById("cart-badge");
  if (!badge) return;
  const count = getCartCount();
  badge.textContent = count;
  badge.style.display = count > 0 ? "flex" : "none";
}

// ════════════════════════════════════════════════════════════════
// §7 · PRODUCT RENDERING
// ════════════════════════════════════════════════════════════════

function renderProducts(products, containerId = "product-grid") {
  const grid = document.getElementById(containerId);
  if (!grid) return;

  if (!products || products.length === 0) {
    grid.innerHTML = `
      <div class="empty-state col-span-full">
        <i data-lucide="package-x" class="h-12 w-12 mx-auto"></i>
        <p class="mt-2 text-lg font-medium">No products found</p>
        <p class="text-sm">Try a different search or category.</p>
      </div>`;
    if (typeof lucide !== "undefined") lucide.createIcons();
    return;
  }

  // Requirement: Array Method — .map() for rendering lists
  // Store products in cache so buttons can reference by id (avoids quote-breaking inline JSON)
  products.forEach((p) => { _productCache[p.id] = p; });

  grid.innerHTML = products
    .map(
      (product) => `
    <a href="product.html?id=${product.id}" class="uk-card product-card block no-underline text-foreground">
      <div class="product-card-image overflow-hidden rounded-t-lg p-4 flex items-center justify-center" style="height:200px">
        <img src="${product.image_url}" alt="${product.name}" 
             class="max-h-full max-w-full object-contain" 
             loading="lazy"
             onerror="this.src='https://placehold.co/300x200/e2e8f0/94a3b8?text=No+Image'" />
      </div>
      <div class="uk-card-body p-4">
        <p class="text-xs uppercase tracking-wide text-muted-foreground mb-1">${product.category}</p>
        <h3 class="uk-card-title text-sm font-semibold leading-tight line-clamp-2 min-h-[2.5rem]">${product.name}</h3>
        <div class="flex items-center justify-between mt-3">
          <span class="text-lg font-bold text-primary" style="color:hsl(var(--primary))">EGP ${Number(product.price).toLocaleString()}</span>
          <button
            onclick="event.preventDefault(); event.stopPropagation(); addToCartById(${product.id});"
            class="uk-btn uk-btn-primary uk-btn-xs">
            <i data-lucide="shopping-cart" class="h-3.5 w-3.5 mr-1"></i> Add
          </button>
        </div>
      </div>
    </a>
  `,
    )
    .join("");

  if (typeof lucide !== "undefined") lucide.createIcons();

  // Trigger scroll animations for newly rendered cards
  if (typeof refreshScrollAnimations === "function") refreshScrollAnimations();
}

function renderProductSkeleton(containerId = "product-grid", count = 8) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  grid.innerHTML = Array(count)
    .fill(
      `<div class="uk-card product-card">
        <div class="skeleton" style="height:200px;border-radius:0.5rem 0.5rem 0 0"></div>
        <div class="p-4">
          <div class="skeleton" style="height:12px;width:60px;margin-bottom:8px"></div>
          <div class="skeleton" style="height:16px;width:100%;margin-bottom:4px"></div>
          <div class="skeleton" style="height:16px;width:70%;margin-bottom:16px"></div>
          <div class="flex justify-between items-center">
            <div class="skeleton" style="height:20px;width:80px"></div>
            <div class="skeleton" style="height:32px;width:60px;border-radius:6px"></div>
          </div>
        </div>
      </div>`,
    )
    .join("");
}

// ════════════════════════════════════════════════════════════════
// §8 · PRODUCT DETAIL
// ════════════════════════════════════════════════════════════════

function renderProductDetail(product) {
  const container = document.getElementById("product-detail");
  if (!container) return;

  // Cache product for safe cart lookup
  _productCache[product.id] = product;

  // Parse markdown description using marked.js
  const descHTML =
    typeof marked !== "undefined" && product.description ?
      marked.parse(product.description)
    : product.description || "";

  // Parse markdown specs table using marked.js
  const specsHTML =
    typeof marked !== "undefined" && product.specs ?
      marked.parse(product.specs)
    : "";

  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
      <!-- Image -->
      <div class="uk-card p-6 flex items-center justify-center product-card-image rounded-lg" style="min-height:350px">
        <img src="${product.image_url}" alt="${product.name}" 
             class="max-w-full object-contain md:max-h-[28rem] max-h-80"
             onerror="this.src='https://placehold.co/400x300/e2e8f0/94a3b8?text=No+Image'" />
      </div>
      <!-- Info -->
      <div>
        <p class="text-xs uppercase tracking-wide text-muted-foreground mb-2">${product.category}${product.brand ? ` · ${product.brand}` : ""}</p>
        <h1 class="text-2xl font-bold text-foreground mb-4">${product.name}</h1>
        <p class="text-3xl font-bold mb-6" style="color:hsl(var(--primary))">EGP ${Number(product.price).toLocaleString()}</p>
        
        <div class="flex gap-3 mb-8">
          <button onclick="addToCartById(${product.id})"
                  class="uk-btn uk-btn-primary uk-btn-md flex-1">
            <i data-lucide="shopping-cart" class="h-4 w-4 mr-2"></i> Add to Cart
          </button>
        </div>

        ${product.stock !== undefined ? `<p class="text-sm text-muted-foreground mb-6"><i data-lucide="package" class="h-4 w-4 inline mr-1"></i> ${product.stock > 0 ? product.stock + " in stock" : "Out of stock"}</p>` : ""}

        ${specsHTML ? `
        <!-- Specifications -->
        <div class="mb-8">
          <h2 class="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
            <i data-lucide="cpu" class="h-5 w-5"></i> Specifications
          </h2>
          <div class="prose specs-table">${specsHTML}</div>
        </div>` : ""}

        <!-- Description rendered from markdown -->
        <div class="prose">${descHTML}</div>
      </div>
    </div>

    <!-- Reviews Section -->
    <div id="product-reviews" class="mt-12">
      <h2 class="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
        <i data-lucide="message-square" class="h-5 w-5"></i> Customer Reviews
      </h2>
      <div id="reviews-list" class="space-y-4">
        <div class="text-sm text-muted-foreground">Loading reviews...</div>
      </div>
    </div>
  `;

  if (typeof lucide !== "undefined") lucide.createIcons();

  // Fetch and render reviews
  loadProductReviews(product.id);
}

// ════════════════════════════════════════════════════════════════
// §8b · PRODUCT REVIEWS
// ════════════════════════════════════════════════════════════════

async function loadProductReviews(productId) {
  const container = document.getElementById("reviews-list");
  if (!container) return;

  try {
    const reviews = await apiGet(
      `/rest/v1/reviews?product_id=eq.${productId}&select=*&order=created_at.desc`
    );

    if (!reviews || reviews.length === 0) {
      container.innerHTML = `<p class="text-sm text-muted-foreground">No reviews yet.</p>`;
      return;
    }

    // Calculate average rating
    const avgRating = (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1);

    container.innerHTML = `
      <div class="flex items-center gap-3 mb-6 p-4 rounded-lg" style="background:hsl(var(--muted)/0.3)">
        <span class="text-3xl font-bold text-foreground">${avgRating}</span>
        <div>
          <div class="flex text-yellow-500">${generateStarHTML(avgRating)}</div>
          <p class="text-xs text-muted-foreground mt-1">Based on ${reviews.length} review${reviews.length !== 1 ? "s" : ""}</p>
        </div>
      </div>
      ${reviews.map(review => `
        <div class="uk-card uk-card-body p-4">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-primary-foreground" style="background:hsl(var(--primary))">
                ${review.reviewer_name.charAt(0)}
              </div>
              <span class="font-semibold text-sm text-foreground">${review.reviewer_name}</span>
            </div>
            <div class="flex text-yellow-500 text-xs">${generateStarHTML(review.rating)}</div>
          </div>
          <p class="text-sm text-muted-foreground">${review.review_text}</p>
        </div>
      `).join("")}
    `;

    if (typeof lucide !== "undefined") lucide.createIcons();
  } catch (e) {
    console.error("Failed to load reviews:", e);
    container.innerHTML = `<p class="text-sm text-muted-foreground">Could not load reviews.</p>`;
  }
}

function generateStarHTML(rating) {
  const fullStars = Math.floor(rating);
  const hasHalfStar = (rating % 1) >= 0.5;
  let html = "";
  for (let i = 0; i < fullStars; i++) {
    html += '<i data-lucide="star" class="h-4 w-4 fill-current"></i>';
  }
  if (hasHalfStar) {
    html += '<i data-lucide="star-half" class="h-4 w-4 fill-current"></i>';
  }
  const empty = 5 - fullStars - (hasHalfStar ? 1 : 0);
  for (let i = 0; i < empty; i++) {
    html += '<i data-lucide="star" class="h-4 w-4 text-gray-300"></i>';
  }
  return html;
}

// ════════════════════════════════════════════════════════════════
// §9 · CART RENDERING
// ════════════════════════════════════════════════════════════════

function renderCart() {
  const container = document.getElementById("cart-items");
  const summaryEl = document.getElementById("cart-summary");
  if (!container) return;

  const cart = getCart();

  if (cart.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="shopping-cart" class="h-16 w-16 mx-auto"></i>
        <p class="mt-4 text-xl font-semibold">Your cart is empty</p>
        <p class="text-sm mt-1">Browse our products and add something you like!</p>
        <a href="shop.html" class="uk-btn uk-btn-primary uk-btn-sm mt-4">Start Shopping</a>
      </div>`;
    if (summaryEl) summaryEl.innerHTML = "";
    if (typeof lucide !== "undefined") lucide.createIcons();
    return;
  }

  container.innerHTML = cart
    .map(
      (item) => `
    <div class="uk-card uk-card-body flex flex-col sm:flex-row items-center gap-4 mb-3">
      <img src="${item.image_url}" alt="${item.name}" class="h-20 w-20 object-contain rounded"
           onerror="this.src='https://placehold.co/80x80/e2e8f0/94a3b8?text=No+Image'" />
      <div class="flex-1 min-w-0">
        <h4 class="font-semibold text-sm truncate text-foreground">${item.name}</h4>
        <p class="text-xs text-muted-foreground">${item.category || ""}</p>
        <p class="font-bold mt-1" style="color:hsl(var(--primary))">EGP ${Number(item.price).toLocaleString()}</p>
      </div>
      <div class="flex items-center gap-2">
        <button class="qty-btn" onclick="updateQuantity(${item.id}, -1); renderCart();">−</button>
        <span class="w-8 text-center font-semibold">${item.quantity}</span>
        <button class="qty-btn" onclick="updateQuantity(${item.id}, 1); renderCart();">+</button>
      </div>
      <button onclick="removeFromCart(${item.id}); renderCart();" 
              class="uk-btn uk-btn-ghost uk-btn-icon uk-btn-sm text-muted-foreground hover:text-destructive">
        <i data-lucide="trash-2" class="h-4 w-4"></i>
      </button>
    </div>
  `,
    )
    .join("");

  if (summaryEl) {
    const total = getCartTotal();
    const count = getCartCount();
    summaryEl.innerHTML = `
      <div class="uk-card uk-card-body">
        <h3 class="font-semibold text-lg mb-4">Order Summary</h3>
        <div class="flex justify-between text-sm mb-2">
          <span class="text-muted-foreground">Items (${count})</span>
          <span>EGP ${total.toLocaleString()}</span>
        </div>
        <div class="flex justify-between text-sm mb-2">
          <span class="text-muted-foreground">Shipping</span>
          <span class="text-green-500">Free</span>
        </div>
        <div class="border-t my-3" style="border-color:hsl(var(--border)/0.5)"></div>
        <div class="flex justify-between font-bold text-lg mb-4">
          <span>Total</span>
          <span style="color:hsl(var(--primary))">EGP ${total.toLocaleString()}</span>
        </div>
        <a href="checkout.html" class="uk-btn uk-btn-primary w-full">
          Proceed to Checkout
        </a>
      </div>
    `;
  }

  if (typeof lucide !== "undefined") lucide.createIcons();
}

// ════════════════════════════════════════════════════════════════
// §10 · ORDER HISTORY (Profile Page)
// ════════════════════════════════════════════════════════════════

function renderOrderHistory(orders) {
  const container = document.getElementById("order-history");
  if (!container) return;

  if (!orders || orders.length === 0) {
    container.innerHTML = `
      <div class="empty-state py-8">
        <i data-lucide="receipt" class="h-10 w-10 mx-auto"></i>
        <p class="mt-2 font-medium">No orders yet</p>
        <p class="text-sm">Your order history will appear here.</p>
      </div>`;
    if (typeof lucide !== "undefined") lucide.createIcons();
    return;
  }

  container.innerHTML = orders
    .map(
      (order) => `
    <div class="uk-card uk-card-body mb-3">
      <div class="flex justify-between items-start flex-wrap gap-2">
        <div>
          <p class="font-semibold text-sm">Order #${order.id}</p>
          <p class="text-xs text-muted-foreground">${new Date(order.created_at).toLocaleDateString("en-EG", { year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
        <div class="text-right">
          <span class="uk-badge">${order.status || "Pending"}</span>
          <p class="font-bold mt-1" style="color:hsl(var(--primary))">EGP ${Number(order.total_amount).toLocaleString()}</p>
        </div>
      </div>
    </div>
  `,
    )
    .join("");

  if (typeof lucide !== "undefined") lucide.createIcons();
}

// ════════════════════════════════════════════════════════════════
// §11 · PAGE INIT — runs on every page DOMContentLoaded
// ════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", function () {
  injectNavbar();
  injectFooter();
  updateNavAuth();
  updateCartBadge();

  // Re-init Lucide icons after DOM injection
  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }

  // Set up scroll-triggered entrance animations
  initScrollAnimations();
});

// ════════════════════════════════════════════════════════════════
// §12 · SCROLL ANIMATIONS (IntersectionObserver)
// ════════════════════════════════════════════════════════════════

function initScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target); // animate only once
        }
      });
    },
    { threshold: 0.1 }
  );

  // Observe all product cards, uk-card elements, and sections
  document
    .querySelectorAll(".product-card, section, .uk-card")
    .forEach((el) => {
      el.classList.add("animate-on-scroll");
      observer.observe(el);
    });
}

// Re-apply scroll animations after dynamic content loads (e.g., renderProducts)
function refreshScrollAnimations() {
  // Small delay to let DOM update
  setTimeout(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    document
      .querySelectorAll(".product-card:not(.visible), .uk-card:not(.visible)")
      .forEach((el) => {
        if (!el.classList.contains("animate-on-scroll")) {
          el.classList.add("animate-on-scroll");
        }
        observer.observe(el);
      });
  }, 50);
}
