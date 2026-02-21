// js/chatbot.js — byteStore AI Assistant (Egyptian Arabic) UI + client logic
// Requirements:
// - Visible on all pages (loaded via script tag)
// - Requires login (user-based rate limiting happens in Edge Function)
// - Conversation memory stored in localStorage
// - Session IDs tracked for database logging
// - Calls Supabase Edge Function which proxies Groq + executes tool use

(function () {
  const STORAGE_KEY = "bytestore_chat_history_v1";
  const UI_STATE_KEY = "bytestore_chat_ui_state_v1";
  const SESSION_ID_KEY = "bytestore_chat_session_id_v1";
  const PRODUCTS_KEY = "bytestore_chat_products_v1";

  // Inject marked.js for markdown rendering (fires immediately, before DOMContentLoaded)
  if (!document.getElementById("chatbot-marked-cdn")) {
    const s = document.createElement("script");
    s.id = "chatbot-marked-cdn";
    s.src = "https://cdn.jsdelivr.net/npm/marked@12/marked.min.js";
    document.head.appendChild(s);
  }

  // Allow overriding in dev (optional)
  const FUNCTION_URL =
    window.CHATBOT_FUNCTION_URL_OVERRIDE ||
    (typeof SUPABASE_URL !== "undefined" ?
      `${SUPABASE_URL}/functions/v1/chatbot`
    : null);

  const MAX_HISTORY_MESSAGES = 24; // user+assistant messages (client-side)

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function saveHistory(history) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (_) {}
  }

  function clearHistory() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SESSION_ID_KEY);
    localStorage.removeItem(PRODUCTS_KEY);
  }

  function loadProducts() {
    try {
      const raw = localStorage.getItem(PRODUCTS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function saveProducts(products) {
    try {
      localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products || []));
    } catch (_) {}
  }

  function renderMarkdown(content) {
    if (typeof window.marked !== "undefined") {
      try {
        return window.marked.parse(content, { breaks: true, gfm: true });
      } catch (_) {}
    }
    // Fallback: plain text
    return escapeHtml(content).replace(/\n/g, "<br>");
  }

  function getSessionId() {
    try {
      return localStorage.getItem(SESSION_ID_KEY) || null;
    } catch (_) {
      return null;
    }
  }

  function saveSessionId(sessionId) {
    try {
      if (sessionId) localStorage.setItem(SESSION_ID_KEY, sessionId);
    } catch (_) {}
  }

  function addToHistory(role, content) {
    const history = loadHistory();
    history.push({ role, content });
    // Keep last N messages
    const trimmed = history.slice(-MAX_HISTORY_MESSAGES);
    saveHistory(trimmed);
    return trimmed;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getEls() {
    return {
      fab: document.getElementById("chatbot-fab"),
      window: document.getElementById("chatbot-window"),
      overlay: document.getElementById("chatbot-overlay"),
      messages: document.getElementById("chatbot-messages"),
      products: document.getElementById("chatbot-products"),
      input: document.getElementById("chatbot-input"),
      sendBtn: document.getElementById("chatbot-send"),
      clearBtn: document.getElementById("chatbot-clear"),
      loginHint: document.getElementById("chatbot-login-hint"),
      typing: document.getElementById("chatbot-typing"),
    };
  }

  function setOpen(isOpen) {
    const { window: win, overlay } = getEls();
    if (!win || !overlay) return;
    win.classList.toggle("open", isOpen);
    overlay.classList.toggle("open", isOpen);
    try {
      localStorage.setItem(UI_STATE_KEY, JSON.stringify({ open: isOpen }));
    } catch (_) {}
  }

  function isOpen() {
    const { window: win } = getEls();
    return !!(win && win.classList.contains("open"));
  }

  function scrollMessagesToBottom() {
    const { messages } = getEls();
    if (!messages) return;
    messages.scrollTop = messages.scrollHeight;
  }

  function renderMessage(role, content) {
    const { messages } = getEls();
    if (!messages) return;

    const row = document.createElement("div");
    row.className = `chatbot-msg ${role}`;

    const bubble = document.createElement("div");
    bubble.className = "chatbot-bubble";
    bubble.setAttribute("dir", "auto");
    if (role === "assistant") {
      bubble.classList.add("markdown");
      bubble.innerHTML = renderMarkdown(content);
    } else {
      bubble.innerHTML = escapeHtml(content).replace(/\n/g, "<br>");
    }
    row.appendChild(bubble);
    messages.appendChild(row);

    scrollMessagesToBottom();
  }

  function renderHistory() {
    const { messages } = getEls();
    if (!messages) return;
    messages.innerHTML = "";

    const history = loadHistory();
    if (!history.length) {
      renderMessage(
        "assistant",
        "أهلاً! أنا Byte\nقولّي إنتَ بتدور على إيه (مثلاً: موبايل سامسونج تحت ١٥ ألف).",
      );
      return;
    }
    history.forEach((m) => {
      if (!m || (m.role !== "user" && m.role !== "assistant")) return;
      renderMessage(m.role, m.content || "");
    });

    // Restore last product suggestions
    const savedProducts = loadProducts();
    if (savedProducts.length) renderProducts(savedProducts, false);
  }

  function setTyping(isTyping) {
    const { typing } = getEls();
    if (!typing) return;
    typing.style.display = isTyping ? "flex" : "none";
    if (isTyping) scrollMessagesToBottom();
  }

  function renderProducts(products, persist = true) {
    const { products: wrap } = getEls();
    if (!wrap) return;
    wrap.innerHTML = "";

    if (!products || !products.length) {
      wrap.style.display = "none";
      if (persist) saveProducts([]);
      return;
    }

    if (persist) saveProducts(products);

    wrap.style.display = "block";
    const title = document.createElement("div");
    title.className = "chatbot-products-title";
    title.textContent = "اقتراحات من المتجر";
    wrap.appendChild(title);

    const list = document.createElement("div");
    list.className = "chatbot-products-list";

    products.slice(0, 5).forEach((p) => {
      const card = document.createElement("a");
      card.className = "chatbot-product-card";
      card.href = `product.html?id=${encodeURIComponent(p.id)}`;
      card.innerHTML = `
        <div class="chatbot-product-img">
          <img src="${escapeHtml(p.image_url || "")}" alt="${escapeHtml(p.name || "")}" onerror="this.src='https://placehold.co/80x80/e2e8f0/94a3b8?text=No+Image'" />
        </div>
        <div class="chatbot-product-info">
          <div class="chatbot-product-name">${escapeHtml(p.name || "")}</div>
          <div class="chatbot-product-meta">${escapeHtml(p.category || "")}${p.brand ? " · " + escapeHtml(p.brand) : ""}</div>
          <div class="chatbot-product-price">EGP ${Number(p.price || 0).toLocaleString()}</div>
        </div>
      `;
      list.appendChild(card);
    });

    wrap.appendChild(list);
  }

  function showLoginHint() {
    const { loginHint } = getEls();
    if (!loginHint) return;
    loginHint.style.display = "block";
  }

  function hideLoginHint() {
    const { loginHint } = getEls();
    if (!loginHint) return;
    loginHint.style.display = "none";
  }

  async function sendMessage() {
    const els = getEls();
    if (!els.input || !els.sendBtn) return;

    const text = els.input.value.trim();
    if (!text) return;

    // Important: send the previous history to the server, and pass the new user
    // message separately via `message`. This avoids duplicating the same user
    // message in the agent context.
    const historyForServer = loadHistory();

    if (!FUNCTION_URL) {
      renderMessage(
        "assistant",
        "في مشكلة في إعدادات الشات (مش لاقي رابط الـ Edge Function).",
      );
      return;
    }

    const token = localStorage.getItem("access_token");
    if (!token) {
      showLoginHint();
      renderMessage(
        "assistant",
        "لازم تسجل دخول الأول عشان تستخدم الشات. روح لصفحة تسجيل الدخول وبعدين ارجعلي.",
      );
      return;
    }

    // Supabase Functions gateway typically expects `apikey` too.
    const apikey =
      typeof SUPABASE_ANON_KEY !== "undefined" ? SUPABASE_ANON_KEY : null;
    hideLoginHint();

    // UI optimistic
    els.input.value = "";
    renderMessage("user", text);
    addToHistory("user", text);

    els.sendBtn.disabled = true;
    setTyping(true);

    try {
      const payload = {
        message: text,
        history: historyForServer
          .filter((m) => m && (m.role === "user" || m.role === "assistant"))
          .slice(-MAX_HISTORY_MESSAGES),
        session_id: getSessionId(),
      };

      const res = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(apikey ? { apikey } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        showLoginHint();
        renderMessage(
          "assistant",
          "السيشن انتهت أو مش مسجل دخول. سجّل دخول تاني وجرب.",
        );
        return;
      }

      if (res.status === 429) {
        let msg = "معلش، استخدمت الشات كتير بسرعة. جرّب كمان شوية.";
        try {
          const body = await res.json();
          if (body && body.message) msg = body.message;
        } catch (_) {}
        renderMessage("assistant", msg);
        return;
      }

      if (!res.ok) {
        const txt = await res.text();
        renderMessage(
          "assistant",
          `حصل خطأ في الشات (${res.status}). ${txt ? "تفاصيل: " + txt : ""}`,
        );
        return;
      }

      const data = await res.json();
      const reply = (data && data.reply) || "تمام.";
      const newSessionId = data && data.session_id;
      if (newSessionId) {
        saveSessionId(newSessionId);
      }
      renderMessage("assistant", reply);
      addToHistory("assistant", reply);
      renderProducts((data && data.products) || []);
    } catch (e) {
      console.error("Chatbot failed:", e);
      renderMessage(
        "assistant",
        "حصلت مشكلة في الاتصال. تأكد إن النت شغال وحاول تاني.",
      );
    } finally {
      setTyping(false);
      els.sendBtn.disabled = false;
      scrollMessagesToBottom();
    }
  }

  function injectWidget() {
    if (document.getElementById("chatbot-fab")) return;

    const overlay = document.createElement("div");
    overlay.id = "chatbot-overlay";
    overlay.className = "chatbot-overlay";
    overlay.addEventListener("click", () => setOpen(false));

    const fab = document.createElement("button");
    fab.id = "chatbot-fab";
    fab.className = "chatbot-fab";
    fab.setAttribute("aria-label", "Open chat");
    fab.innerHTML = `<i data-lucide="message-circle" class="h-5 w-5"></i>`;
    fab.addEventListener("click", () => {
      setOpen(!isOpen());
      const { input } = getEls();
      if (input) setTimeout(() => input.focus(), 50);
    });

    const win = document.createElement("section");
    win.id = "chatbot-window";
    win.className = "chatbot-window";
    win.setAttribute("aria-label", "byteStore Assistant");
    win.innerHTML = `
      <div class="chatbot-header">
        <div class="chatbot-title" dir="auto">
          <span class="chatbot-title-dot"></span>
          Byte
        </div>
        <div class="chatbot-actions">
          <button id="chatbot-clear" class="chatbot-icon-btn" title="مسح المحادثة" aria-label="Clear chat">
            <i data-lucide="trash-2" class="h-4 w-4"></i>
          </button>
          <button id="chatbot-close" class="chatbot-icon-btn" title="إغلاق" aria-label="Close chat">
            <i data-lucide="x" class="h-4 w-4"></i>
          </button>
        </div>
      </div>

      <div class="chatbot-body">
        <div id="chatbot-login-hint" class="chatbot-login-hint" style="display:none">
          لازم تسجل دخول عشان تستخدم الشات.
          <a href="login.html">تسجيل الدخول</a>
        </div>

        <div id="chatbot-messages" class="chatbot-messages" dir="rtl"></div>

        <div id="chatbot-typing" class="chatbot-typing" style="display:none" dir="rtl">
          <span class="chatbot-typing-dot"></span>
          <span class="chatbot-typing-dot"></span>
          <span class="chatbot-typing-dot"></span>
          <span class="chatbot-typing-text">بيفكر…</span>
        </div>

        <div id="chatbot-products" class="chatbot-products" style="display:none"></div>
      </div>

      <form class="chatbot-inputbar" onsubmit="return false;">
        <input
          id="chatbot-input"
          class="chatbot-input"
          type="text"
          dir="rtl"
          placeholder="اكتب سؤالك…"
          autocomplete="off"
        />
        <button id="chatbot-send" class="chatbot-send" type="button">إرسال</button>
      </form>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(win);
    document.body.appendChild(fab);

    // Wire actions
    const { input, sendBtn, clearBtn } = getEls();
    document
      .getElementById("chatbot-close")
      ?.addEventListener("click", () => setOpen(false));
    sendBtn?.addEventListener("click", sendMessage);
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    });
    clearBtn?.addEventListener("click", () => {
      if (!confirm("تمسح المحادثة؟")) return;
      clearHistory();
      renderProducts([], false);
      renderHistory();
    });

    // Restore previous open/closed state
    try {
      const raw = localStorage.getItem(UI_STATE_KEY);
      const st = raw ? JSON.parse(raw) : null;
      if (st && st.open) {
        setOpen(true);
        if (input) setTimeout(() => input.focus(), 80);
      }
    } catch (_) {}

    // Render initial history
    renderHistory();

    // Ensure lucide icons render for injected UI
    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }
  }

  document.addEventListener("DOMContentLoaded", injectWidget);
})();
