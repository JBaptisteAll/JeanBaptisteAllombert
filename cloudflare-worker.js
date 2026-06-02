// ============================================================
// JB Portfolio — Cloudflare Worker (Gemini API Proxy)
// 1. Créer un Worker sur dash.cloudflare.com
// 2. Coller ce code
// 3. Settings → Variables → ajouter GEMINI_API_KEY (secret)
// 4. Déployer → copier l'URL
// ============================================================

const ALLOWED_ORIGIN = "https://jbaptisteall.github.io";
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60000;

const ipCounts = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = ipCounts.get(ip);
  if (!entry || now - entry.ts > RATE_LIMIT_WINDOW_MS) {
    ipCounts.set(ip, { count: 1, ts: now });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX) return true;
  entry.count++;
  return false;
}

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    const origin = request.headers.get("Origin") || "";
    if (!origin.startsWith(ALLOWED_ORIGIN)) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (isRateLimited(ip)) {
      return new Response(
        JSON.stringify({ error: "Trop de requêtes. Réessaie dans une minute." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Body invalide" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { messages } = body;
    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Format invalide" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Conversion format Gemini (role/parts) → OpenAI (role/content)
    // Le premier message est toujours le system prompt (envoyé comme "user" par chatbot.jsx)
    const openaiMessages = messages.map((m, i) => ({
      role: i === 0 ? "system" : m.role === "model" ? "assistant" : "user",
      content: m.parts?.[0]?.text || m.content || "",
    }));

    try {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: openaiMessages,
          max_tokens: 512,
          temperature: 0.7,
        }),
      });

      const data = await groqRes.json();

      if (!groqRes.ok || data.error) {
        const detail = data?.error?.message || JSON.stringify(data);
        return new Response(
          JSON.stringify({ error: `Groq [${groqRes.status}]: ${detail}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const text = data?.choices?.[0]?.message?.content
        || "Je n'ai pas pu générer de réponse.";

      return new Response(
        JSON.stringify({ reply: text }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: `Erreur réseau worker: ${err.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  },
};
