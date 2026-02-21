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
const MAX_AGENT_ITERS = 3;

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
        const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: {
                headers: {
                    Authorization: authHeader,
                },
            },
        });

        const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Validate user
        const { data: userData, error: userErr } = await userClient.auth.getUser();
        if (userErr || !userData?.user) {
            return jsonResponse(
                { message: "Unauthorized" },
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

        if (!message) {
            return jsonResponse({ message: "Missing message" }, 400);
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
                        "Search byteStore products by query and filters and return up to 5 products.",
                    parameters: {
                        type: "object",
                        properties: {
                            query: {
                                type: "string",
                                description:
                                    "Free text query. Use Arabic or English keywords. Optional.",
                            },
                            category: {
                                type: "string",
                                description:
                                    "Product category. One of: laptop, phone, audio, accessory",
                                enum: ["laptop", "phone", "audio", "accessory"],
                            },
                            brand: {
                                type: "string",
                                description: "Brand name (e.g., Apple, Samsung). Optional.",
                            },
                            min_price: {
                                type: "number",
                                description: "Minimum price in EGP. Optional.",
                            },
                            max_price: {
                                type: "number",
                                description: "Maximum price in EGP. Optional.",
                            },
                            sort: {
                                type: "string",
                                description: "Sorting option.",
                                enum: ["price_asc", "price_desc"],
                            },
                        },
                    },
                },
            },
        ];

        const systemPrompt =
            "إنت مساعد تسوّق لbyteStore (متجر إلكترونيات في مصر). اتكلم بالمصري. " +
            "ماتخترعش منتجات. أي ترشيحات لازم تيجي من نتائج أداة search_products. " +
            "لو السؤال ناقصه معلومة مهمة (ميزانية/نوع/استخدام)، اسأل سؤال واحد واضح. " +
            "لما ترشح، رجّع 3-5 اختيارات وباختصار ليه كل اختيار مناسب.";

        // Agent loop
        let agentMessages: any[] = [
            { role: "system", content: systemPrompt },
            ...trimmedHistory,
            { role: "user", content: message },
        ];

        let lastProducts: any[] = [];

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

                    if (toolName !== "search_products") {
                        agentMessages.push({
                            role: "tool",
                            tool_call_id: toolCallId,
                            name: toolName,
                            content: JSON.stringify({ error: "Unknown tool" }),
                        });
                        continue;
                    }

                    // Execute tool: search in products table
                    const query = args?.query ? sanitizeQuery(String(args.query)) : "";
                    const category = args?.category ? String(args.category) : null;
                    const brand = args?.brand ? String(args.brand) : null;
                    const minPrice = typeof args?.min_price === "number"
                        ? args.min_price
                        : null;
                    const maxPrice = typeof args?.max_price === "number"
                        ? args.max_price
                        : null;
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
                        // name/brand/description OR search
                        q = q.or(
                            `name.ilike.%${query}%,description.ilike.%${query}%,brand.ilike.%${query}%`,
                        );
                    }
                    if (sort === "price_asc") q = q.order("price", { ascending: true });
                    if (sort === "price_desc") q = q.order("price", { ascending: false });

                    const { data: products, error: pErr } = await q;
                    const toolResult = pErr
                        ? { products: [], error: pErr.message }
                        : { products: products || [] };

                    if (toolResult.products?.length) {
                        lastProducts = toolResult.products;
                    }

                    agentMessages.push({
                        role: "tool",
                        tool_call_id: toolCallId,
                        name: "search_products",
                        content: JSON.stringify(toolResult),
                    });
                }

                // Continue loop (send tool results back)
                continue;
            }

            // Final assistant content
            const finalText = (assistantMsg.content || "").toString().trim();
            return jsonResponse({ reply: finalText || "تمام.", products: lastProducts });
        }

        // If we hit max iterations
        return jsonResponse({
            reply:
                "معلش، حصلت لفة كتير في البحث. جرّب تسأل تاني بطريقة أبسط (مثلاً: نوع + ميزانية).",
            products: lastProducts,
        });
    } catch (e: any) {
        console.error("chatbot function error:", e);
        return jsonResponse(
            { message: "Internal error", details: String(e?.message || e) },
            500,
        );
    }
});
