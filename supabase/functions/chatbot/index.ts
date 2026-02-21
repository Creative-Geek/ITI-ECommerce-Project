// @ts-nocheck

// Supabase Edge Function: chatbot
// - Verifies logged-in user via JWT
// - Applies user-based rate limiting (via SQL RPC)
// - Calls Groq (openai/gpt-oss-120b) with tool use
// - Executes `search_products` tool against Supabase `products` table (limit 5)
// - Executes `show_products` tool to explicitly push curated product IDs to the UI

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type ChatMessage = { role: "user" | "assistant"; content: string };

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") || "openai/gpt-oss-120b";

/**
 * API key rotation:
 * - Preferred: GROQ_API_KEYS="key1,key2,key3" (comma-separated)
 * - Supported: GROQ_API_KEY_1 / GROQ_API_KEY_2 / GROQ_API_KEY_3
 * - Backward compatible: GROQ_API_KEY
 */
function getGroqApiKeys(): string[] {
    const uniq: string[] = [];
    const push = (k: string | null | undefined) => {
        const key = (k || "").trim();
        if (!key) return;
        if (!uniq.includes(key)) uniq.push(key);
    };

    const listRaw = Deno.env.get("GROQ_API_KEYS");
    if (listRaw) {
        for (const part of listRaw.split(",")) push(part);
    }

    // Indexed keys (explicit rotation order)
    push(Deno.env.get("GROQ_API_KEY_1"));
    push(Deno.env.get("GROQ_API_KEY_2"));
    push(Deno.env.get("GROQ_API_KEY_3"));

    // Legacy single key
    push(Deno.env.get("GROQ_API_KEY"));

    return uniq;
}

const GROQ_API_KEYS = getGroqApiKeys();

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    "";

// Rate limit: 20 requests / 10 minutes / user
const RL_WINDOW_SECONDS = 10 * 60;
const RL_MAX_COUNT = 20;

const MAX_HISTORY_MESSAGES = 24;
const MAX_AGENT_ITERS = 5;

function jsonResponse(body: unknown, status = 200, extraHeaders: HeadersInit = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            ...extraHeaders,
        },
    });
}

function textResponse(body: string, status = 200) {
    return new Response(body, {
        status,
        headers: {
            ...corsHeaders,
            "Content-Type": "text/plain; charset=utf-8",
        },
    });
}

function sanitizeQuery(q: string) {
    // Avoid breaking PostgREST filter strings.
    return q.replace(/[,%]/g, " ").trim();
}

async function groqChat(payload: unknown) {
    if (!Array.isArray(GROQ_API_KEYS) || GROQ_API_KEYS.length === 0) {
        throw new Error(
            "Missing Groq API key(s). Set GROQ_API_KEYS or GROQ_API_KEY/GROQ_API_KEY_1..3",
        );
    }

    const isRateLimit = (status: number, bodyText: string) => {
        const hay = `${bodyText}`.toLowerCase();
        return (
            status === 429 ||
            hay.includes("rate limit") ||
            hay.includes("rate_limit_exceeded")
        );
    };

    const isToolCallValidationFailure = (status: number, bodyText: string) => {
        if (status !== 400) return false;
        const hay = `${bodyText}`.toLowerCase();
        return (
            hay.includes("tool call validation failed") ||
            hay.includes("tool_use_failed") ||
            hay.includes("invalid_request_error")
        );
    };

    const tryParseGroqError = (bodyText: string) => {
        try {
            return JSON.parse(bodyText);
        } catch {
            return null;
        }
    };

    const withToolSchemaRepairHint = (origPayload: any, groqBodyText: string) => {
        // Add a corrective instruction to avoid sending nulls for optional tool parameters.
        // This addresses Groq-side tool validation failures like:
        //   expected string, but got null
        const errObj = tryParseGroqError(groqBodyText);
        const errMsg = errObj?.error?.message ? String(errObj.error.message) : "";

        const repairMsg = [
            "Tool call repair instruction:",
            "- When calling tools, NEVER send null for optional fields.",
            "- If a field is unknown, OMIT the key entirely.",
            "- Ensure argument types match the JSON schema exactly.",
            errMsg ? `Groq validation error was: ${errMsg}` : "",
        ]
            .filter(Boolean)
            .join("\n");

        const nextPayload = { ...origPayload };
        const msgs = Array.isArray(origPayload?.messages)
            ? [...origPayload.messages]
            : [];
        // Place near the end so it is freshest to the model.
        msgs.push({ role: "system", content: repairMsg });
        nextPayload.messages = msgs;
        return nextPayload;
    };

    let lastErr: string | null = null;

    for (let i = 0; i < GROQ_API_KEYS.length; i++) {
        const apiKey = GROQ_API_KEYS[i];

        // If Groq rejects tool calls due to schema mismatch, we retry once with a repair hint.
        let repairAttemptedForThisKey = false;

        let res: Response;
        try {
            const doFetch = async (bodyPayload: any) => {
                return await fetch(GROQ_ENDPOINT, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify(bodyPayload),
                });
            };

            res = await doFetch(payload);
            let text = await res.text();

            // Tool-call validation failures can happen when the model outputs `null` for optional args.
            // Retry once with an explicit repair instruction (same API key).
            if (
                !res.ok &&
                !repairAttemptedForThisKey &&
                isToolCallValidationFailure(res.status, text)
            ) {
                repairAttemptedForThisKey = true;
                const repairedPayload = withToolSchemaRepairHint(payload as any, text);
                res = await doFetch(repairedPayload);
                text = await res.text();
            }

            // From here on, use the final response body.
            if (res.ok) {
                try {
                    return JSON.parse(text);
                } catch (parseErr: any) {
                    throw new Error(
                        `Groq response JSON parse error: ${String(parseErr?.message || parseErr)}. Body: ${text}`,
                    );
                }
            }

            // Keep the *original* Groq body text intact in the error message for observability.
            lastErr = `Groq error (${res.status}): ${text}`;

            // Failsafe rotation: on rate limits, try the next API key.
            if (isRateLimit(res.status, text) && i < GROQ_API_KEYS.length - 1) {
                console.warn(`Groq rate limited with key #${i + 1}; rotating to next key`);
                continue;
            }

            throw new Error(lastErr);
        } catch (fetchErr: any) {
            // Network/DNS/etc. Keep last error and only rotate if we have another key.
            lastErr = `Groq fetch error: ${String(fetchErr?.message || fetchErr)}`;
            if (i < GROQ_API_KEYS.length - 1) {
                console.warn(`Groq request failed with key #${i + 1}; trying next key`);
                continue;
            }
            throw new Error(lastErr);
        }
    }

    throw new Error(lastErr || "Groq error: no usable API keys");
}

// Common tech term synonyms → what's actually in the DB
const QUERY_SYNONYMS: Record<string, string> = {
    // Stylus
    "stylus": "S Pen",
    "ستايلس": "S Pen",
    "قلم": "S Pen",
    // Foldable
    "foldable": "foldable",
    "فولدابل": "foldable",
    "قابل للطي": "foldable",
    // Audio
    "tws": "true wireless",
    "anc": "noise cancell",
    "noise cancelling": "noise cancell",
    "إلغاء الضوضاء": "noise cancell",
    "سماعة": "headphone",
    "سماعات": "headphone",
    "ايربودز": "earbuds",
    "ايربود": "earbuds",
    // Gaming
    "gaming": "gaming",
    "جيمينج": "gaming",
    "ألعاب": "gaming",
    // Accessories
    "شاحن": "charger",
    "كيبورد": "keyboard",
    "لوحة مفاتيح": "keyboard",
    "ماوس": "mouse",
    "فأرة": "mouse",
    "ماوس باد": "mouse pad",
    "كنترولر": "controller",
    "يد تحكم": "controller",
    "ويب كام": "webcam",
    "كاميرا": "webcam camera",
    "مايك": "microphone",
    "ميكروفون": "microphone",
    "هاب": "hub",
    // Common adjectives
    "سريع": "fast",
    "لاسلكي": "wireless",
    "سلكي": "wired",
    "ميكانيكي": "mechanical",
};

function expandQuery(q: string): string {
    const lower = q.toLowerCase().trim();

    // First, try exact match
    if (QUERY_SYNONYMS[lower]) {
        return QUERY_SYNONYMS[lower];
    }

    // Then try word-by-word expansion for multi-word queries
    const words = lower.split(/\s+/);
    const expandedWords = words.map(word => QUERY_SYNONYMS[word] || word);
    const expanded = expandedWords.join(" ");

    // Return expanded version if different from original, otherwise return original
    return expanded !== lower ? expanded : q;
}

// ── Tool handlers ──────────────────────────────────────────────

async function execSearchProducts(adminClient: any, args: any) {
    const rawQuery = args?.query ? sanitizeQuery(String(args.query)) : "";
    const query = rawQuery ? expandQuery(rawQuery) : "";
    const category = args?.category ? String(args.category) : null;
    const brand = args?.brand ? String(args.brand) : null;
    const minPrice = typeof args?.min_price === "number" ? args.min_price : null;
    const maxPrice = typeof args?.max_price === "number" ? args.max_price : null;
    const sort = args?.sort ? String(args.sort) : null;

    let q = adminClient
        .from("products")
        .select("id,name,price,category,brand,image_url")
        .limit(5);

    if (category) q = q.eq("category", category);
    if (brand) q = q.ilike("brand", `%${sanitizeQuery(brand)}%`);
    if (minPrice !== null) q = q.gte("price", minPrice);
    if (maxPrice !== null) q = q.lte("price", maxPrice);
    if (query) {
        // Split query into keywords for better matching
        const keywords = query.trim().split(/\s+/).filter(Boolean);

        if (keywords.length === 1) {
            // Single keyword: search as before
            q = q.or(
                `name.ilike.%${keywords[0]}%,description.ilike.%${keywords[0]}%,brand.ilike.%${keywords[0]}%,specs.ilike.%${keywords[0]}%`,
            );
        } else {
            // Multiple keywords: build OR conditions for each keyword across all fields
            const conditions = keywords.map(kw =>
                `name.ilike.%${kw}%,description.ilike.%${kw}%,brand.ilike.%${kw}%,specs.ilike.%${kw}%`
            ).join(",");
            q = q.or(conditions);
        }
    }
    if (sort === "price_asc") q = q.order("price", { ascending: true });
    else if (sort === "price_desc") q = q.order("price", { ascending: false });

    const { data: products, error: pErr } = await q;
    if (pErr) return { products: [], error: pErr.message };
    return { products: products || [] };
}

async function execGetPriceRange(adminClient: any, args: any) {
    const category = args?.category ? String(args.category) : null;

    // Cheapest product
    let qMin = adminClient
        .from("products")
        .select("price")
        .order("price", { ascending: true })
        .limit(1);
    if (category) qMin = qMin.eq("category", category);

    // Most expensive product
    let qMax = adminClient
        .from("products")
        .select("price")
        .order("price", { ascending: false })
        .limit(1);
    if (category) qMax = qMax.eq("category", category);

    // Total count
    let qCount = adminClient
        .from("products")
        .select("id", { count: "exact", head: true });
    if (category) qCount = qCount.eq("category", category);

    const [minRes, maxRes, countRes] = await Promise.all([qMin, qMax, qCount]);

    if (minRes.error || maxRes.error) {
        return { error: minRes.error?.message || maxRes.error?.message };
    }

    const minPrice = minRes.data?.[0]?.price ?? null;
    const maxPrice = maxRes.data?.[0]?.price ?? null;
    const totalCount = countRes.count ?? 0;

    return {
        min_price: minPrice,
        max_price: maxPrice,
        total_count: totalCount,
        category: category || "all",
    };
}

async function execShowProducts(adminClient: any, args: any) {
    const ids = Array.isArray(args?.ids)
        ? args.ids.map(String).filter(Boolean)
        : [];
    if (ids.length === 0) return { products: [] };

    const { data: products, error } = await adminClient
        .from("products")
        .select("id,name,price,category,brand,image_url")
        .in("id", ids);

    if (error) return { products: [], error: error.message };
    return { products: products || [] };
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return textResponse("Method Not Allowed", 405);
    }

    try {
        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            return jsonResponse(
                { message: "Missing SUPABASE_URL / SUPABASE_ANON_KEY in function env" },
                500,
            );
        }
        if (!SUPABASE_SERVICE_ROLE_KEY) {
            return jsonResponse(
                { message: "Missing SUPABASE_SERVICE_ROLE_KEY secret" },
                500,
            );
        }

        const authHeader = req.headers.get("Authorization") || "";
        const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();

        console.log(
            "auth header present:",
            !!authHeader,
            "startsWithBearer:",
            /^Bearer\s+/i.test(authHeader),
            "len:",
            authHeader.length,
        );

        const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Validate user
        if (!jwt) {
            return jsonResponse({ message: "Unauthorized", details: "Missing JWT" }, 401);
        }

        const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
        if (userErr || !userData?.user) {
            return jsonResponse(
                {
                    message: "Unauthorized",
                    details: userErr?.message || "auth.getUser failed",
                },
                401,
            );
        }
        const user = userData.user;

        // Rate limit
        const { data: rlData, error: rlErr } = await adminClient.rpc(
            "check_and_increment_chat_rate_limit",
            {
                p_user_id: user.id,
                p_window_seconds: RL_WINDOW_SECONDS,
                p_max_count: RL_MAX_COUNT,
            },
        );

        if (rlErr) {
            console.error("Rate limit RPC failed:", rlErr);
            return jsonResponse(
                { message: "Rate limiting backend error" },
                500,
            );
        }

        const rl = Array.isArray(rlData) ? rlData[0] : rlData;
        if (rl && rl.allowed === false) {
            const resetAt = rl.reset_at ? new Date(rl.reset_at).getTime() : 0;
            const retryAfter = resetAt
                ? Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
                : RL_WINDOW_SECONDS;
            return jsonResponse(
                {
                    message: "معلش، عدد الرسائل كتير قوي دلوقتي. جرّب تاني بعد شوية.",
                    retry_after: retryAfter,
                },
                429,
                { "Retry-After": String(retryAfter) },
            );
        }

        // Parse request
        const body = await req.json();
        const message = String(body?.message || "").trim();
        const history = (body?.history || []) as ChatMessage[];
        const sessionId = body?.session_id ? String(body.session_id) : null;

        if (!message) {
            return jsonResponse({ message: "Missing message" }, 400);
        }

        // Create or reuse chat session
        let currentSessionId = sessionId;
        if (!currentSessionId) {
            const { data: newSession, error: sessionErr } = await adminClient
                .from("chat_sessions")
                .insert({ user_id: user.id })
                .select("id")
                .single();
            if (sessionErr || !newSession) {
                console.error("Failed to create chat session:", sessionErr);
                return jsonResponse(
                    { message: "Failed to create chat session" },
                    500,
                );
            }
            currentSessionId = newSession.id;
        }

        // Log user message
        const { error: userMsgErr } = await adminClient
            .from("chat_messages")
            .insert({
                session_id: currentSessionId,
                role: "user",
                content: message,
            });
        if (userMsgErr) {
            console.error("Failed to log user message:", userMsgErr);
        }

        const trimmedHistory = Array.isArray(history)
            ? history
                .filter((m) => m && (m.role === "user" || m.role === "assistant"))
                .map((m) => ({ role: m.role, content: String(m.content || "") }))
                .slice(-MAX_HISTORY_MESSAGES)
            : [];

        // Tool definitions (Groq tool use compatible)
        const tools = [
            {
                type: "function",
                function: {
                    name: "search_products",
                    description:
                        "Search byteStore products by query and filters. Returns up to 5 matching products with id, name, price, category, brand, and image_url.",
                    parameters: {
                        type: "object",
                        properties: {
                            query: {
                                anyOf: [{ type: "string" }, { type: "null" }],
                                description:
                                    "Free text query to match against product name, brand, or description. Use Arabic or English keywords. Optional.",
                            },
                            category: {
                                anyOf: [
                                    {
                                        type: "string",
                                        enum: ["laptop", "phone", "audio", "accessory"],
                                    },
                                    { type: "null" },
                                ],
                                description: "Filter by product category.",
                            },
                            brand: {
                                anyOf: [{ type: "string" }, { type: "null" }],
                                description: "Filter by brand name (e.g., Apple, Samsung, Xiaomi). Case-insensitive partial match. Optional.",
                            },
                            min_price: {
                                anyOf: [{ type: "number" }, { type: "null" }],
                                description: "Minimum price in EGP (inclusive). Optional.",
                            },
                            max_price: {
                                anyOf: [{ type: "number" }, { type: "null" }],
                                description: "Maximum price in EGP (inclusive). Optional.",
                            },
                            sort: {
                                anyOf: [
                                    { type: "string", enum: ["price_asc", "price_desc"] },
                                    { type: "null" },
                                ],
                                description: "Sort results by price.",
                            },
                        },
                    },
                },
            },
            {
                type: "function",
                function: {
                    name: "get_price_range",
                    description:
                        "Get the minimum price, maximum price, and total product count for a given category or across the entire store. Use this when the user asks about price ranges, cheapest/most expensive products, or what's available.",
                    parameters: {
                        type: "object",
                        properties: {
                            category: {
                                anyOf: [
                                    {
                                        type: "string",
                                        enum: ["laptop", "phone", "audio", "accessory"],
                                    },
                                    { type: "null" },
                                ],
                                description:
                                    "Filter by product category. Omit to get store-wide stats.",
                            },
                        },
                    },
                },
            },
            {
                type: "function",
                function: {
                    name: "show_products",
                    description:
                        "Push a curated list of products as UI cards to the user. Call this after search_products with only the IDs you actually want to recommend — exclude any irrelevant results. Always call this before writing your final reply whenever you have products to show.",
                    parameters: {
                        type: "object",
                        properties: {
                            ids: {
                                type: "array",
                                items: { type: "string" },
                                description: "Product IDs to display (taken from search_products results). Pass only relevant matches. Max 5.",
                            },
                        },
                        required: ["ids"],
                    },
                },
            },
        ];

        const systemPrompt = [
            "إنت Byte — مساعد تسوّق لbyteStore، متجر إلكترونيات في مصر. اتكلم مصري عادي، خليك ودود ومختصر.",
            "",
            "القواعد الأساسية:",
            "1. ماتخترعش أي معلومة. كل المنتجات والأسعار لازم تيجي من الأدوات (tools).",
            "2. لو المستخدم ذكر أي تفصيلة عن منتج (نوع/براند/ميزة/فئة سعرية) → استخدم search_products فوراً.",
            "3. ماتسألش أسئلة كتير. لو عندك معلومة كافية للبحث، ابحث على طول حتى لو الميزانية مش محددة.",
            "4. search_products بيدعم الكلمات العربية والإنجليزي. استخدم الكلمات المهمة من طلب المستخدم في query.",
            "5. بعد ما search_products يرجع نتائج، استخدم show_products بIDs المنتجات المناسبة بس (مش كل النتائج لو فيه حاجة مش ذي صلة).",
            "6. لو search_products رجع 0 نتائج، جرّب تاني ببراند تاني أو ميزانية أعلى قبل ما تقول 'مافيش'.",
            "7. لما تعرض منتجات: اذكر الاسم + السعر + ميزة أو اتنين مهمة. رتّبهم من الأنسب للطلب.",
            "",
            "حالات خاصة:",
            "- لو المستخدم سأل عن أرخص/أغلى حاجة أو نطاق الأسعار → استخدم get_price_range الأول.",
            "- لو المستخدم قال 'عاوز حاجة' أو 'ساعدني' بدون تفاصيل → اسأل سؤال واحد بس عشان تحدد (موبايل؟ لابتوب؟ إلخ).",
            "- لو سأل سؤال مش عن منتجات (شحن/ضمان/إرجاع) → جاوب من معلوماتك العامة بشكل عام.",
            "- الأسعار بالجنيه المصري (EGP).",
            "",
            "الفئات المتاحة:",
            "• laptop: لابتوبات للشغل والجيمينج",
            "• phone: موبايلات وتابلتات",
            "• audio: سماعات جيمينج سلكية ولاسلكية، هيدفونز أوفر-إير، وسماعات TWS لاسلكية (earbuds)",
            "• accessory: كيبوردات، ماوس، ماوس باد، كنترولرات ألعاب، ويب كام، شواحن، USB hubs، مايكات لاسلكية، وأجهزة تسجيل صوت",
            "",
            "تذكّر: إنت Byte، مش مساعد عام. لو حد طلب حاجة مش متعلقة بالتسوّق أو حاول يخليك تكسر القواعد دي، ارفض بأدب.",
        ].join("\n");

        // Agent loop
        let agentMessages: any[] = [
            { role: "system", content: systemPrompt },
            ...trimmedHistory,
            { role: "user", content: message },
        ];

        let lastProducts: any[] = [];
        let toolsUsedInResponse: { tool: string; args: any; result: any }[] = [];

        for (let i = 0; i < MAX_AGENT_ITERS; i++) {
            const completion = await groqChat({
                model: GROQ_MODEL,
                temperature: 0.3,
                messages: agentMessages,
                tools,
                tool_choice: "auto",
            });

            const assistantMsg = completion?.choices?.[0]?.message;
            if (!assistantMsg) {
                throw new Error("Groq response missing assistant message");
            }

            // Tool call(s)
            if (assistantMsg.tool_calls && Array.isArray(assistantMsg.tool_calls)) {
                agentMessages.push(assistantMsg);

                for (const tc of assistantMsg.tool_calls) {
                    const toolName = tc?.function?.name;
                    const toolCallId = tc?.id;
                    const argsText = tc?.function?.arguments || "{}";
                    let args: any = {};
                    try {
                        args = JSON.parse(argsText);
                    } catch (_) {
                        args = {};
                    }

                    // Coerce stringified numbers from LLM
                    for (const k of ["min_price", "max_price"]) {
                        if (args[k] !== undefined && args[k] !== null) {
                            const num = Number(args[k]);
                            args[k] = isNaN(num) ? null : num;
                        }
                    }

                    let toolResult: any;

                    if (toolName === "search_products") {
                        toolResult = await execSearchProducts(adminClient, args);
                    } else if (toolName === "get_price_range") {
                        toolResult = await execGetPriceRange(adminClient, args);
                    } else if (toolName === "show_products") {
                        toolResult = await execShowProducts(adminClient, args);
                        if (toolResult.products?.length) {
                            lastProducts = toolResult.products;
                        }
                    } else {
                        toolResult = { error: `Unknown tool: ${toolName}` };
                    }

                    // Track full tool call: name + args + result
                    toolsUsedInResponse.push({ tool: toolName, args, result: toolResult });

                    agentMessages.push({
                        role: "tool",
                        tool_call_id: toolCallId,
                        name: toolName,
                        content: JSON.stringify(toolResult),
                    });
                }

                // Continue loop (send tool results back)
                continue;
            }

            // Final assistant content
            const finalText = (assistantMsg.content || "").toString().trim();
            const reply = finalText || "تمام.";

            // Log assistant message
            const { error: assistantMsgErr } = await adminClient
                .from("chat_messages")
                .insert({
                    session_id: currentSessionId,
                    role: "assistant",
                    content: reply,
                    tools_used: toolsUsedInResponse.length > 0 ? toolsUsedInResponse : null,
                    products_recommended: lastProducts.length > 0 ? lastProducts : null,
                });
            if (assistantMsgErr) {
                console.error("Failed to log assistant message:", assistantMsgErr);
            }

            // Update session timestamp
            const { error: updateErr } = await adminClient
                .from("chat_sessions")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", currentSessionId);
            if (updateErr) {
                console.error("Failed to update session:", updateErr);
            }

            return jsonResponse({
                reply,
                products: lastProducts,
                session_id: currentSessionId,
            });
        }

        // If we hit max iterations
        const maxIterReply =
            "معلش، حصلت لفة كتير في البحث. جرّب تسأل تاني بطريقة أبسط (مثلاً: نوع + ميزانية).";

        // Log max iterations message
        const { error: maxIterMsgErr } = await adminClient
            .from("chat_messages")
            .insert({
                session_id: currentSessionId,
                role: "assistant",
                content: maxIterReply,
                tools_used: toolsUsedInResponse.length > 0 ? toolsUsedInResponse : null,
                products_recommended: lastProducts.length > 0 ? lastProducts : null,
            });
        if (maxIterMsgErr) {
            console.error("Failed to log max iterations message:", maxIterMsgErr);
        }

        return jsonResponse({
            reply: maxIterReply,
            products: lastProducts,
            session_id: currentSessionId,
        });
    } catch (e: any) {
        console.error("chatbot function error:", e);
        return jsonResponse(
            { message: "Internal error", details: String(e?.message || e) },
            500,
        );
    }
});
