// js/admin.js — Admin Dashboard logic
// Guard, product CRUD, modal handling, search/filter

// ════════════════════════════════════════════════════════════════
// §1 · STATE
// ════════════════════════════════════════════════════════════════

let allProducts = [];
let editingProductId = null; // null = creating new, number = editing

// ════════════════════════════════════════════════════════════════
// §2 · LOAD PRODUCTS TABLE
// ════════════════════════════════════════════════════════════════

async function loadAdminProducts() {
  const tbody = document.getElementById("admin-product-tbody");
  const stats = document.getElementById("admin-stats");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="7" class="text-center py-8 text-muted-foreground">
        <i data-lucide="loader-2" class="h-5 w-5 inline animate-spin mr-2"></i>Loading products...
      </td>
    </tr>`;
  if (typeof lucide !== "undefined") lucide.createIcons();

  try {
    allProducts = await apiGet("/rest/v1/products?select=*&order=id");
    renderAdminTable(allProducts);
    renderStats(allProducts);
  } catch (e) {
    console.error("Failed to load products:", e);
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-8 text-red-500">
          Failed to load products. ${e.message}
        </td>
      </tr>`;
  }
}

function renderStats(products) {
  const stats = document.getElementById("admin-stats");
  if (!stats) return;
  const total = products.length;
  const totalValue = products.reduce((s, p) => s + Number(p.price), 0);
  const categories = [...new Set(products.map((p) => p.category))].length;
  const lowStock = products.filter((p) => (p.stock || 0) <= 5).length;

  stats.innerHTML = `
    <div class="uk-card uk-card-body p-4 flex items-center gap-3">
      <div class="stat-icon" style="background:hsl(var(--primary)/0.1)">
        <i data-lucide="package" class="h-5 w-5" style="color:hsl(var(--primary))"></i>
      </div>
      <div>
        <p class="text-2xl font-bold">${total}</p>
        <p class="text-xs text-muted-foreground">Total Products</p>
      </div>
    </div>
    <div class="uk-card uk-card-body p-4 flex items-center gap-3">
      <div class="stat-icon" style="background:hsl(142 71% 45%/0.1)">
        <i data-lucide="banknote" class="h-5 w-5" style="color:hsl(142 71% 45%)"></i>
      </div>
      <div>
        <p class="text-2xl font-bold">EGP ${totalValue.toLocaleString()}</p>
        <p class="text-xs text-muted-foreground">Total Inventory Value</p>
      </div>
    </div>
    <div class="uk-card uk-card-body p-4 flex items-center gap-3">
      <div class="stat-icon" style="background:hsl(221 83% 53%/0.1)">
        <i data-lucide="layers" class="h-5 w-5" style="color:hsl(221 83% 53%)"></i>
      </div>
      <div>
        <p class="text-2xl font-bold">${categories}</p>
        <p class="text-xs text-muted-foreground">Categories</p>
      </div>
    </div>
    <div class="uk-card uk-card-body p-4 flex items-center gap-3">
      <div class="stat-icon" style="background:hsl(0 84% 60%/0.1)">
        <i data-lucide="alert-triangle" class="h-5 w-5" style="color:hsl(0 84% 60%)"></i>
      </div>
      <div>
        <p class="text-2xl font-bold">${lowStock}</p>
        <p class="text-xs text-muted-foreground">Low Stock (≤5)</p>
      </div>
    </div>
  `;
  if (typeof lucide !== "undefined") lucide.createIcons();
}

function renderAdminTable(products) {
  const tbody = document.getElementById("admin-product-tbody");
  if (!tbody) return;

  if (!products || products.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-8 text-muted-foreground">
          No products found.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = products
    .map(
      (p) => `
    <tr class="admin-table-row">
      <td class="admin-td">
        <img src="${p.image_url}" alt="${p.name}" class="admin-thumb"
             onerror="this.src='https://placehold.co/48x48/e2e8f0/94a3b8?text=?'" />
      </td>
      <td class="admin-td">
        <span class="font-semibold text-sm">${p.name}</span>
        ${p.brand ? `<br><span class="text-xs text-muted-foreground">${p.brand}</span>` : ""}
      </td>
      <td class="admin-td">
        <span class="admin-category-badge admin-cat-${p.category}">${p.category}</span>
      </td>
      <td class="admin-td font-semibold" style="color:hsl(var(--primary))">
        EGP ${Number(p.price).toLocaleString()}
      </td>
      <td class="admin-td">
        <span class="${(p.stock || 0) <= 5 ? "text-red-500 font-semibold" : ""}">${p.stock ?? 0}</span>
      </td>
      <td class="admin-td">
        <div class="flex gap-1">
          <button onclick="openEditModal(${p.id})" class="uk-btn uk-btn-ghost uk-btn-icon uk-btn-xs" title="Edit">
            <i data-lucide="pencil" class="h-4 w-4"></i>
          </button>
          <button onclick="confirmDelete(${p.id}, '${p.name.replace(/'/g, "\\'")}')" class="uk-btn uk-btn-ghost uk-btn-icon uk-btn-xs text-red-500" title="Delete">
            <i data-lucide="trash-2" class="h-4 w-4"></i>
          </button>
        </div>
      </td>
    </tr>
  `,
    )
    .join("");

  if (typeof lucide !== "undefined") lucide.createIcons();
}

// ════════════════════════════════════════════════════════════════
// §3 · SEARCH / FILTER
// ════════════════════════════════════════════════════════════════

function filterProducts() {
  const query = (
    document.getElementById("admin-search")?.value || ""
  ).toLowerCase();
  const category =
    document.getElementById("admin-filter-category")?.value || "";

  let filtered = allProducts;

  if (query) {
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        (p.brand || "").toLowerCase().includes(query) ||
        (p.description || "").toLowerCase().includes(query),
    );
  }

  if (category) {
    filtered = filtered.filter((p) => p.category === category);
  }

  renderAdminTable(filtered);
}

// ════════════════════════════════════════════════════════════════
// §4 · PRODUCT MODAL (Add / Edit)
// ════════════════════════════════════════════════════════════════

function openAddModal() {
  editingProductId = null;
  document.getElementById("modal-title").textContent = "Add New Product";
  document.getElementById("product-form").reset();
  document.getElementById("product-modal").classList.remove("hidden");
}

function openEditModal(id) {
  const product = allProducts.find((p) => p.id === id);
  if (!product) return;

  editingProductId = id;
  document.getElementById("modal-title").textContent = "Edit Product";

  // Fill form
  document.getElementById("pf-name").value = product.name || "";
  document.getElementById("pf-description").value = product.description || "";
  document.getElementById("pf-price").value = product.price || "";
  document.getElementById("pf-category").value = product.category || "";
  document.getElementById("pf-brand").value = product.brand || "";
  document.getElementById("pf-specs").value = product.specs || "";
  document.getElementById("pf-stock").value = product.stock ?? 0;
  document.getElementById("pf-image").value = product.image_url || "";

  document.getElementById("product-modal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("product-modal").classList.add("hidden");
  editingProductId = null;
}

// ════════════════════════════════════════════════════════════════
// §4b · IMAGE UPLOAD TO SUPABASE STORAGE
// ════════════════════════════════════════════════════════════════

async function uploadProductImage(input) {
  const file = input?.files?.[0];
  if (!file) return;
  await uploadProductImageFile(file);
  // Reset file input so the same file can be re-selected after failure/success
  input.value = "";
}

async function uploadProductImageFile(file) {
  if (!file) return;
  if (!String(file.type || "").startsWith("image/")) {
    showToast("Please drop/select an image file.", "error");
    return;
  }

  const btn = document.getElementById("upload-image-btn");
  const statusEl = document.getElementById("upload-status");
  const fileInput = document.getElementById("pf-image-file");

  // Show uploading state
  btn.disabled = true;
  btn.innerHTML =
    '<i data-lucide="loader-2" class="h-4 w-4 inline animate-spin mr-1"></i> Uploading...';
  statusEl.textContent = "Uploading…";
  statusEl.className = "text-xs text-muted-foreground mt-1";
  statusEl.classList.remove("hidden");
  if (typeof lucide !== "undefined") lucide.createIcons();

  try {
    const token = localStorage.getItem("access_token");
    if (!token) throw new Error("Not authenticated — please log in again.");

    // Build a unique filename: timestamp + original name
    const ext = file.name.split(".").pop();
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const bucket = "product-images"; // Supabase storage bucket name

    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${bucket}/${filename}`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": file.type,
          "x-upsert": "false",
        },
        body: file,
      },
    );

    if (!uploadRes.ok) {
      let errMsg = `Upload failed (${uploadRes.status})`;
      try {
        const err = await uploadRes.json();
        errMsg = err.error || err.message || errMsg;
      } catch (_) {}
      throw new Error(errMsg);
    }

    // Build the public URL
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${filename}`;
    document.getElementById("pf-image").value = publicUrl;

    statusEl.textContent = "✓ Image uploaded successfully!";
    statusEl.className = "text-xs text-green-500 mt-1";
    showToast("Image uploaded!", "success");
  } catch (err) {
    console.error("Image upload failed:", err);
    statusEl.textContent = `✗ Upload failed: ${err.message}`;
    statusEl.className = "text-xs text-red-500 mt-1";
    showToast("Image upload failed: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML =
      '<i data-lucide="upload" class="h-4 w-4 inline mr-1"></i> Upload Image';
    // Reset file input so the same file can be re-selected after drag-drop
    if (fileInput) fileInput.value = "";
    if (typeof lucide !== "undefined") lucide.createIcons();
  }
}

function setupProductImageDragDrop() {
  const urlInput = document.getElementById("pf-image");
  const uploadBtn = document.getElementById("upload-image-btn");

  // Only set up when elements exist (admin page only)
  if (!urlInput || !uploadBtn) return;

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    await uploadProductImageFile(file);
  };

  // Allow dropping onto the image URL input and the upload button area
  urlInput.addEventListener("dragover", handleDragOver);
  urlInput.addEventListener("drop", handleDrop);
  uploadBtn.addEventListener("dragover", handleDragOver);
  uploadBtn.addEventListener("drop", handleDrop);
}

async function saveProduct(e) {
  e.preventDefault();

  const token = localStorage.getItem("access_token");
  const btn = document.getElementById("save-product-btn");
  const originalText = btn.innerHTML;
  btn.innerHTML =
    '<i data-lucide="loader-2" class="h-4 w-4 inline animate-spin mr-1"></i>Saving...';
  btn.disabled = true;

  const body = {
    name: document.getElementById("pf-name").value.trim(),
    description: document.getElementById("pf-description").value.trim(),
    price: parseFloat(document.getElementById("pf-price").value),
    category: document.getElementById("pf-category").value,
    brand: document.getElementById("pf-brand").value.trim() || null,
    specs: document.getElementById("pf-specs").value.trim() || null,
    stock: parseInt(document.getElementById("pf-stock").value) || 0,
    image_url: document.getElementById("pf-image").value.trim() || null,
  };

  try {
    if (editingProductId) {
      // UPDATE
      await apiPatch(
        `/rest/v1/products?id=eq.${editingProductId}`,
        body,
        token,
      );
      showToast("Product updated successfully!", "success");
    } else {
      // INSERT
      await apiPost("/rest/v1/products", body, token, { returnData: true });
      showToast("Product added successfully!", "success");
    }

    closeModal();
    await loadAdminProducts();
  } catch (err) {
    console.error("Save failed:", err);
    showToast("Failed to save: " + err.message, "error");
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
    if (typeof lucide !== "undefined") lucide.createIcons();
  }
}

// ════════════════════════════════════════════════════════════════
// §5 · DELETE PRODUCT
// ════════════════════════════════════════════════════════════════

function confirmDelete(id, name) {
  const modal = document.getElementById("delete-modal");
  document.getElementById("delete-product-name").textContent = name;
  document.getElementById("confirm-delete-btn").onclick = () =>
    deleteProduct(id);
  modal.classList.remove("hidden");
}

function closeDeleteModal() {
  document.getElementById("delete-modal").classList.add("hidden");
}

async function deleteProduct(id) {
  const token = localStorage.getItem("access_token");
  const btn = document.getElementById("confirm-delete-btn");
  btn.innerHTML =
    '<i data-lucide="loader-2" class="h-4 w-4 inline animate-spin mr-1"></i>Deleting...';
  btn.disabled = true;

  try {
    await apiDelete(`/rest/v1/products?id=eq.${id}`, token);
    showToast("Product deleted successfully!", "success");
    closeDeleteModal();
    await loadAdminProducts();
  } catch (err) {
    console.error("Delete failed:", err);
    showToast("Failed to delete: " + err.message, "error");
  } finally {
    btn.innerHTML = "Delete";
    btn.disabled = false;
  }
}

// ════════════════════════════════════════════════════════════════
// §6 · PAGE INIT
// ════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  requireAdmin();
  loadAdminProducts();

  // Search debounce
  let searchTimeout;
  document.getElementById("admin-search")?.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(filterProducts, 300);
  });

  document
    .getElementById("admin-filter-category")
    ?.addEventListener("change", filterProducts);

  // Product form submit
  document
    .getElementById("product-form")
    ?.addEventListener("submit", saveProduct);

  setupProductImageDragDrop();

  // Close modals on backdrop click
  document.getElementById("product-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "product-modal") closeModal();
  });
  document.getElementById("delete-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "delete-modal") closeDeleteModal();
  });

  // Close modals on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      closeDeleteModal();
    }
  });
});
