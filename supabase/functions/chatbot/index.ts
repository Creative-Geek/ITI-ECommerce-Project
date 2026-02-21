// @ts-nocheck

// Supabase Edge Function: chatbot
// - Verifies logged-in user via JWT
// - Applies user-based rate limiting (via SQL RPC)
// - Calls Groq (llama-3.3-70b-versatile) with tool use
// - Executes `search_products` tool against Supabase `products` table (limit 5)

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
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";

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
    if (!GROQ_API_KEY) {
        throw new Error("Missing GROQ_API_KEY secret");
    }
    const res = await fetch(GROQ_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`Groq error (${res.status}): ${text}`);
    }
    return JSON.parse(text);
}

// ── Tool handlers ──────────────────────────────────────────────

async function execSearchProducts(adminClient: any, args: any) {
    const query = args?.query ? sanitizeQuery(String(args.query)) : "";
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
        q = q.or(
            `name.ilike.%${query}%,description.ilike.%${query}%,brand.ilike.%${query}%`,
        );
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
                                type: "string",
                                description:
                                    "Free text query to match against product name, brand, or description. Use Arabic or English keywords. Optional.",
                            },
                            category: {
                                type: "string",
                                description:
                                    "Filter by product category.",
                                enum: ["laptop", "phone", "audio", "accessory"],
                            },
                            brand: {
                                type: "string",
                                description: "Filter by brand name (e.g., Apple, Samsung, Xiaomi). Case-insensitive partial match. Optional.",
                            },
                            min_price: {
                                type: "number",
                                description: "Minimum price in EGP (inclusive). Optional.",
                            },
                            max_price: {
                                type: "number",
                                description: "Maximum price in EGP (inclusive). Optional.",
                            },
                            sort: {
                                type: "string",
                                description: "Sort results by price.",
                                enum: ["price_asc", "price_desc"],
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
                                type: "string",
                                description:
                                    "Filter by product category. Omit to get store-wide stats.",
                                enum: ["laptop", "phone", "audio", "accessory"],
                            },
                        },
                    },
                },
            },
        ];

        const systemPrompt = [
            "إنت مساعد تسوّق لbyteStore — متجر إلكترونيات أونلاين في مصر. اتكلم مصري دايماً وخليك ودود ومختصر.",
            "",
            "القواعد:",
            "1. ماتخترعش منتجات أو أسعار أو توافر أبداً. كل المعلومات لازم تيجي من الأدوات.",
            "2. لو المستخدم ذكر أي تفصيلة (نوع/براند/ميزة/فئة) → استخدم search_products فوراً بدون ما تسأل. غياب الميزانية مش سبب كافي لتأخير البحث.",
            "3. لو المستخدم سأل عن نطاق الأسعار أو أرخص/أغلى منتج → استخدم get_price_range.",
            "4. اسأل سؤال واحد بس لو الطلب مبهم تماماً (مثلاً: 'عاوز حاجة' بدون أي تفاصيل).",
            "5. ممنوع تقول 'مش متوفر' أو 'مافيش' إلا بعد ما search_products ترجع 0 نتائج فعلاً.",
            "6. لما تعرض منتجات: اذكر الاسم + السعر + ميزة مهمة. اعرض 3-5 اختيارات.",
            "7. لو search_products رجعت 0 نتائج: قول كده بوضوح واقترح تعديل (ميزانية أعلى/فئة تانية/براند تاني).",
            "8. لو المستخدم سأل سؤال مش عن منتجات (مثلاً: سياسة الشحن)، جاوب من معلوماتك العامة.",
            "",
            "الفئات المتاحة: laptop, phone, audio, accessory.",
            "العملة: جنيه مصري (EGP).",
        ].join("\n");

        // Agent loop
        let agentMessages: any[] = [
            { role: "system", content: systemPrompt },
            ...trimmedHistory,
            { role: "user", content: message },
        ];

        let lastProducts: any[] = [];
        let toolsUsedInResponse: string[] = [];

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

                    // Track tool usage
                    if (toolName && !toolsUsedInResponse.includes(toolName)) {
                        toolsUsedInResponse.push(toolName);
                    }

                    if (toolName === "search_products") {
                        toolResult = await execSearchProducts(adminClient, args);
                        if (toolResult.products?.length) {
                            lastProducts = toolResult.products;
                        }
                    } else if (toolName === "get_price_range") {
                        toolResult = await execGetPriceRange(adminClient, args);
                    } else {
                        toolResult = { error: `Unknown tool: ${toolName}` };
                    }

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
