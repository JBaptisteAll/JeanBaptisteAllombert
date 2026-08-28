// ============================================================
// JB Portfolio — Cloudflare Worker (Mistral API Proxy)
// 1. Créer un Worker sur dash.cloudflare.com
// 2. Coller ce code
// 3. Settings → Variables → ajouter MISTRAL_API_KEY (secret)
// 4. Déployer → copier l'URL
//
// ── Log des questions (optionnel mais recommandé) ──
// 5. Storage & Databases → KV → créer un namespace "jb-chat-logs"
// 6. Worker → Settings → Bindings → KV Namespace :
//      nom de variable : CHAT_LOGS → namespace "jb-chat-logs"
// 7. Settings → Variables → ajouter LOGS_TOKEN (secret) : une
//    longue chaîne aléatoire de ton choix
// 8. Consulter les logs dans le navigateur :
//      https://<worker-url>/?logs=<LOGS_TOKEN>
// Sans les bindings CHAT_LOGS / LOGS_TOKEN, le worker fonctionne
// normalement, simplement sans logging.
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

// Enregistre la question dans KV sans bloquer la réponse.
// Clé : q:<horodatage ISO>:<suffixe aléatoire> → tri chronologique naturel.
// La question vit dans les métadonnées (lisibles via list(), sans get()
// par clé, donc consultation des logs quasi gratuite). TTL 90 jours.
function logQuestion(env, ctx, request, messages) {
  if (!env.CHAT_LOGS) return;
  const question = messages[messages.length - 1]?.parts?.[0]?.text || "";
  if (!question || messages.length < 2) return; // ignore le system prompt seul
  const key = `q:${new Date().toISOString()}:${crypto.randomUUID().slice(0, 8)}`;
  ctx.waitUntil(
    env.CHAT_LOGS.put(key, "1", {
      metadata: {
        q: question.slice(0, 480),
        country: request.cf?.country || "?",
      },
      expirationTtl: 90 * 24 * 60 * 60,
    }).catch(() => {}) // un échec de log ne doit jamais casser le chat
  );
}

// Restitue toutes les questions loggées, de la plus récente à la
// plus ancienne, en JSON. Accès protégé par le secret LOGS_TOKEN.
async function serveLogs(env, url, corsHeaders) {
  const token = url.searchParams.get("logs");
  if (!env.LOGS_TOKEN || !token || token !== env.LOGS_TOKEN) {
    return new Response("Not found", { status: 404, headers: corsHeaders });
  }
  if (!env.CHAT_LOGS) {
    return new Response(
      JSON.stringify({ error: "Binding KV CHAT_LOGS manquant" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  const keys = [];
  let cursor;
  do {
    const page = await env.CHAT_LOGS.list({ prefix: "q:", cursor });
    keys.push(...page.keys);
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  const rows = keys
    .map(k => ({
      date: k.name.slice(2, 21).replace("T", " "),
      country: k.metadata?.country || "?",
      question: k.metadata?.q || "",
    }))
    .reverse();
  return new Response(JSON.stringify({ total: rows.length, questions: rows }, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Consultation des logs : GET /?logs=<LOGS_TOKEN>
    if (request.method === "GET") {
      return serveLogs(env, new URL(request.url), corsHeaders);
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

    logQuestion(env, ctx, request, messages);

    // Conversion format Gemini (role/parts) → OpenAI (role/content) — Mistral
    // utilise le même format de requête que l'API OpenAI (chat/completions).
    // Le premier message est toujours le system prompt (envoyé comme "user" par chatbot.jsx)
    const mistralMessages = messages.map((m, i) => ({
      role: i === 0 ? "system" : m.role === "model" ? "assistant" : "user",
      content: m.parts?.[0]?.text || m.content || "",
    }));

    try {
      const mistralRes = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "mistral-small-latest",
          messages: mistralMessages,
          max_tokens: 350,
          temperature: 0.7,
        }),
      });

      const data = await mistralRes.json();

      if (!mistralRes.ok || data.error) {
        const detail = data?.error?.message || JSON.stringify(data);
        return new Response(
          JSON.stringify({ error: `Mistral [${mistralRes.status}]: ${detail}` }),
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
