/* eslint-disable */
/* global React */
// ============================================================
// JB Chatbot — chatbot.jsx
// À ajouter dans index.html avant </body> :
//   <script type="text/babel" src="chatbot.jsx"></script>
// À ajouter dans pipeline-app.jsx juste avant le return :
//   <ChatBot />
// Remplacer WORKER_URL par l'URL de ton Cloudflare Worker
// ============================================================

const WORKER_URL = "https://jb-chatbot-proxy.jb-allombert.workers.dev";

const { useState, useRef, useEffect, useCallback } = React;

// ── Suggestions rapides ──────────────────────────────────────
const SUGGESTIONS = [
  "Tu cherches quoi ?",
  "Ton stack technique ?",
  "Parle-moi du projet Japon",
  "Tes certifications ?",
  "Ton niveau en SQL ?",
  "Ton parcours avant la data ?",
];

// ── Chargement du system prompt depuis jb_knowledge.json ────
async function buildSystemPrompt() {
  const res = await fetch("./data/jb_knowledge.json");
  const k = await res.json();
  const ci = k.chatbot_instructions;
  return `${ci.persona}

${ci.language}

RÈGLES ABSOLUES :
- ${ci.honesty}
- ${ci.privacy}
- ${ci.scope}
- Hors-sujet : ${ci.off_topic}

TA SITUATION ACTUELLE : ${k.situation_actuelle}

TON RÉSUMÉ : ${k.summary}

TES COMPÉTENCES :
${k.skills.languages.map(s => `${s.name} (${s.level}/100) — ${s.details}`).join(" | ")}
${k.skills.platforms.map(s => `${s.name} — ${s.details}`).join(" | ")}
Concepts : ${k.skills.concepts.join(", ")}

TES CERTIFICATIONS :
Obtenues : ${k.certifications.obtained.map(c => `${c.name} (${c.date})`).join(", ")}
En cours : ${k.certifications.in_progress.map(c => `${c.name} prévu ${c.planned}`).join(", ")}

TES PROJETS :
${k.projects.map(p => `[${p.name}] ${(p.tech_stack||[]).join(", ")} — ${p.description}`).join("\n")}

TON EXPÉRIENCE :
${k.experience.map(e => `[${e.period}] ${e.title} chez ${e.company} — ${e.description}`).join("\n")}

TA FORMATION :
${k.education.map(e => `${e.title} (${e.period}) — ${e.details}`).join("\n")}

CE QUE TU CHERCHES : ${k.job_search.target}. Dispo : ${k.job_search.availability}. ${k.job_search.strengths.join(" | ")}

FAQ :
${k.faq.map(f => `Q: ${f.q} → ${f.a}`).join("\n")}

MESSAGE CLÉ : ${ci.key_message}`;
}

// ── SVG Personnage stickman ──────────────────────────────────
function JBCharacter({ isOpen }) {
  return (
    <svg
      viewBox="0 0 120 290"
      xmlns="http://www.w3.org/2000/svg"
      width="120"
      height="290"
      fill="none"
      style={{ display: "block" }}
    >
      {/* TÊTE */}
      <g className={isOpen ? "jb-head-idle" : "jb-head-bob"}>
        <circle cx="60" cy="46" r="42" fill="#f0ede8" stroke="#222" strokeWidth="2.8"/>
        <path d="M26 36 Q18 46 22 62 Q26 74 36 82" stroke="#ddd" strokeWidth="8" strokeLinecap="round" opacity="0.4"/>
        <circle cx="46" cy="44" r="18" fill="#111"/>
        <circle cx="46" cy="44" r="13" fill="#0a0a0a"/>
        <circle cx="52" cy="37" r="5.5" fill="white" opacity="0.9"/>
        <circle cx="74" cy="44" r="18" fill="#111"/>
        <circle cx="74" cy="44" r="13" fill="#0a0a0a"/>
        <circle cx="80" cy="37" r="5.5" fill="white" opacity="0.9"/>
        <path d="M50 67 Q58 66 66 63" stroke="#aaa" strokeWidth="2" strokeLinecap="round"/>
      </g>

      {/* COU */}
      <line x1="60" y1="88" x2="60" y2="106" stroke="#222" strokeWidth="4" strokeLinecap="round"/>

      {/* CORPS losange */}
      <path
        d="M60 106 C54 110,50 120,51 132 C52 144,56 152,60 154 C64 152,68 144,69 132 C70 120,66 110,60 106 Z"
        fill="#e8e4de" stroke="#222" strokeWidth="2"
      />
      <circle cx="60" cy="132" r="3" fill="#ff2a3b" opacity="0.85"/>

      {/* BRAS GAUCHE */}
      <g className={isOpen ? "" : "jb-arm-l"} style={{ transformOrigin: "51px 128px" }}>
        <path d="M51 128 Q40 158 36 192" stroke="#222" strokeWidth="3.2" strokeLinecap="round"/>
        <ellipse cx="35" cy="197" rx="6" ry="5" fill="#666" stroke="#222" strokeWidth="1.5"/>
      </g>

      {/* BRAS DROIT */}
      <g className={isOpen ? "" : "jb-arm-r"} style={{ transformOrigin: "69px 128px" }}>
        <path d="M69 128 Q80 158 84 192" stroke="#222" strokeWidth="3.2" strokeLinecap="round"/>
        <ellipse cx="85" cy="197" rx="6" ry="5" fill="#666" stroke="#222" strokeWidth="1.5"/>
      </g>

      {/* JAMBE GAUCHE */}
      <g className={isOpen ? "" : "jb-leg-l"} style={{ transformOrigin: "57px 153px" }}>
        <path d="M57 153 Q48 210 38 258" stroke="#222" strokeWidth="4.5" strokeLinecap="round"/>
        <ellipse cx="33" cy="262" rx="14" ry="6" fill="#1a1a1a"/>
      </g>

      {/* JAMBE DROITE */}
      <g className={isOpen ? "" : "jb-leg-r"} style={{ transformOrigin: "63px 153px" }}>
        <path d="M63 153 Q72 210 82 258" stroke="#222" strokeWidth="4.5" strokeLinecap="round"/>
        <ellipse cx="87" cy="262" rx="14" ry="6" fill="#1a1a1a"/>
      </g>
    </svg>
  );
}

// ── Composant principal ──────────────────────────────────────
function ChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "model",
      parts: [{ text: "Salut 👾 Je suis JB — pose-moi ce que tu veux sur mon parcours ou mes projets." }],
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(null);
  const [error, setError] = useState(null);
  const [suggestionsShown, setSuggestionsShown] = useState(true);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    buildSystemPrompt().then(setSystemPrompt).catch(() => setError("Erreur de chargement du contexte."));
    // Affiche la bulle après 1 aller-retour (1s delay + 3s walk = 4s)
    const t = setTimeout(() => setBubbleVisible(true), 4000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const sendMessage = useCallback(async (text) => {
    const userText = (text || input).trim();
    if (!userText || loading || !systemPrompt) return;

    setSuggestionsShown(false);
    setInput("");
    setError(null);

    const userMsg = { role: "user", parts: [{ text: userText }] };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setLoading(true);

    const geminiMessages = [
      { role: "user", parts: [{ text: systemPrompt }] },
      { role: "model", parts: [{ text: "Compris. Je suis JB, prêt à répondre." }] },
      ...updated,
    ];

    try {
      const res = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: geminiMessages }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); setLoading(false); return; }
      setMessages(prev => [...prev, { role: "model", parts: [{ text: data.reply }] }]);
    } catch {
      setError("Erreur réseau. Vérifie ta connexion.");
    } finally {
      setLoading(false);
    }
  }, [input, loading, systemPrompt, messages]);

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  return (
    <>
      {/* ── STYLES ── */}
      <style>{`
        /* ── Personnage wrap ── */
        .jb-char-wrap {
          position: fixed;
          bottom: 24px;
          left: 28px;
          z-index: 9997;
          width: 120px;
          height: 290px;
          cursor: pointer;
          animation: jb-arrive 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.3s both;
          filter: drop-shadow(0 8px 16px rgba(0,0,0,0.5));
        }
        .jb-char-wrap.is-open {
          animation: jb-arrive 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.3s both,
                     jb-float-idle 3s ease-in-out infinite 1s;
        }
        @keyframes jb-arrive {
          from { opacity:0; transform:translateY(30px) scale(0.8); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        /* Wave occasionnel — bras gauche se lève de temps en temps */
        @keyframes jb-wave {
          0%, 68%  { transform: rotate(0deg); }
          73%      { transform: rotate(90deg); }
          78%      { transform: rotate(72deg); }
          83%      { transform: rotate(90deg); }
          88%      { transform: rotate(72deg); }
          93%      { transform: rotate(90deg); }
          98%      { transform: rotate(10deg); }
          100%     { transform: rotate(0deg); }
        }
        @keyframes jb-float-idle {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-7px); }
        }
        /* Head bob */
        .jb-head-bob {
          animation: jb-hbob 0.65s ease-in-out infinite 1s;
          transform-origin: 60px 46px;
        }
        .jb-head-idle { transform-origin: 60px 46px; }
        @keyframes jb-hbob {
          0%,50%,100% { transform: translateY(0); }
          25%,75%     { transform: translateY(-2px); }
        }
        /* Bras */
        .jb-arm-l {
          animation: jb-wave 9s ease-in-out infinite 2s;
          transform-origin: 51px 128px;
        }
        .jb-arm-r {
          transform-origin: 69px 128px;
        }
        /* Jambes — statiques au repos */
        .jb-leg-l {
          transform-origin: 57px 153px;
        }
        .jb-leg-r {
          transform-origin: 63px 153px;
        }

        /* ── Bulle ── */
        .jb-char-bubble {
          position: fixed;
          bottom: 268px;
          left: 148px;
          z-index: 9998;
          background: rgba(10,12,22,0.96);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 14px 14px 14px 0;
          padding: 9px 13px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          line-height: 1.6;
          color: rgba(255,255,255,0.88);
          max-width: 168px;
          pointer-events: none;
          animation: jb-bubble-in 0.3s ease 1.2s both, jb-bubble-out 0.3s ease 5.7s both;
        }
        .jb-char-bubble::after {
          content: '';
          position: absolute;
          bottom: -8px; left: 0;
          border-right: 8px solid transparent;
          border-top: 8px solid rgba(255,255,255,0.14);
        }
        @keyframes jb-bubble-in  { from{opacity:0;transform:scale(0.85) translateY(6px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes jb-bubble-out { from{opacity:1} to{opacity:0;transform:scale(0.9) translateY(4px)} }
        .jb-bubble-name { display:block; font-size:9px; letter-spacing:.15em; color:#ff2a3b; font-weight:700; margin-bottom:3px; }

        /* ── Fenêtre de chat ── */
        .jb-chat-window {
          position: fixed;
          bottom: 320px;
          left: 28px;
          z-index: 9999;
          width: 360px;
          max-height: 520px;
          display: flex;
          flex-direction: column;
          background: #0d0f1a;
          border: 1px solid rgba(255,42,59,0.35);
          border-radius: 12px;
          box-shadow: 0 0 40px rgba(0,0,0,0.85), 0 0 20px rgba(255,42,59,0.12);
          font-family: 'JetBrains Mono', monospace;
          overflow: hidden;
          animation: jb-win-in 0.25s ease;
        }
        @keyframes jb-win-in {
          from { opacity:0; transform:translateY(12px) scale(0.97); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        @media (max-width: 480px) {
          .jb-chat-window { left:8px; right:8px; width:auto; bottom:310px; }
          .jb-char-wrap   { left:12px; }
        }

        /* Header */
        .jb-chat-hdr {
          display:flex; align-items:center; gap:9px;
          padding:11px 15px;
          background:#13151f;
          border-bottom:1px solid rgba(255,42,59,0.15);
          flex-shrink:0;
        }
        .jb-hdr-dot { width:7px;height:7px;border-radius:50%;background:#ff2a3b;box-shadow:0 0 7px rgba(255,42,59,0.9); }
        .jb-hdr-title { flex:1;font-size:11px;font-weight:700;color:#fff;letter-spacing:.07em; }
        .jb-hdr-sub { font-weight:400;color:rgba(255,255,255,0.25);font-size:9px; }
        .jb-hdr-close { background:none;border:none;color:rgba(255,255,255,0.3);cursor:pointer;font-size:16px;line-height:1;padding:0; }
        .jb-hdr-close:hover { color:rgba(255,255,255,0.7); }
        .jb-hdr-status { font-size:9px;color:rgba(46,255,255,0.75);display:flex;align-items:center;gap:4px; }
        .jb-hdr-pulse { width:5px;height:5px;border-radius:50%;background:#2effff;animation:jb-pulse 2s ease-in-out infinite; }
        @keyframes jb-pulse { 0%,100%{opacity:1}50%{opacity:.3} }

        /* Messages */
        .jb-chat-msgs {
          flex:1;overflow-y:auto;padding:14px;
          display:flex;flex-direction:column;gap:10px;
          scrollbar-width:thin;scrollbar-color:rgba(255,42,59,0.2) transparent;
        }
        .jb-msg { display:flex;gap:7px;align-items:flex-end; }
        .jb-msg-usr { flex-direction:row-reverse; }
        .jb-msg-av {
          font-size:8px;font-weight:700;color:#ff2a3b;
          background:rgba(255,42,59,0.1);border:1px solid rgba(255,42,59,0.3);
          border-radius:50%;width:24px;height:24px;
          display:flex;align-items:center;justify-content:center;flex-shrink:0;
        }
        .jb-msg-bbl {
          max-width:78%;padding:9px 12px;border-radius:10px;
          font-size:11px;line-height:1.6;color:rgba(255,255,255,0.88);
        }
        .jb-msg-bot .jb-msg-bbl { background:#1a1d2e;border:1px solid rgba(255,255,255,0.06);border-bottom-left-radius:3px; }
        .jb-msg-usr .jb-msg-bbl { background:rgba(255,42,59,0.14);border:1px solid rgba(255,42,59,0.28);border-bottom-right-radius:3px;color:#fff; }

        /* Typing */
        .jb-typing { display:flex;gap:5px;align-items:center;padding:10px 14px; }
        .jb-typing span { width:6px;height:6px;border-radius:50%;background:rgba(255,42,59,0.6);animation:jb-typ 1.2s ease-in-out infinite; }
        .jb-typing span:nth-child(2){animation-delay:.2s}
        .jb-typing span:nth-child(3){animation-delay:.4s}
        @keyframes jb-typ { 0%,60%,100%{transform:translateY(0);opacity:.4} 30%{transform:translateY(-5px);opacity:1} }

        /* Erreur */
        .jb-error { font-size:10px;color:rgba(255,42,59,0.8);text-align:center;padding:6px;border:1px solid rgba(255,42,59,0.2);border-radius:6px;background:rgba(255,42,59,0.05); }

        /* Suggestions */
        .jb-suggestions { display:flex;flex-wrap:wrap;gap:5px;padding-top:4px; }
        .jb-chip {
          font-family:'JetBrains Mono',monospace;font-size:10px;
          color:rgba(46,255,255,0.82);background:rgba(46,255,255,0.05);
          border:1px solid rgba(46,255,255,0.22);border-radius:20px;
          padding:4px 10px;cursor:pointer;transition:background .15s,border-color .15s;
        }
        .jb-chip:hover { background:rgba(46,255,255,0.12);border-color:rgba(46,255,255,0.5);color:#2effff; }

        /* Input */
        .jb-chat-inp {
          display:flex;gap:7px;padding:11px 12px;
          border-top:1px solid rgba(255,255,255,0.06);
          background:#0d0f1a;flex-shrink:0;
        }
        .jb-input {
          flex:1;background:#1a1d2e;border:1px solid rgba(255,255,255,0.09);
          border-radius:7px;padding:8px 11px;
          font-family:'JetBrains Mono',monospace;font-size:11px;
          color:#fff;outline:none;transition:border-color .15s;
        }
        .jb-input:focus { border-color:rgba(255,42,59,0.5); }
        .jb-input::placeholder { color:rgba(255,255,255,0.22); }
        .jb-input:disabled { opacity:.45; }
        .jb-send {
          width:36px;height:36px;background:#ff2a3b;border:none;border-radius:7px;
          color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;
          flex-shrink:0;transition:opacity .15s,box-shadow .15s;
        }
        .jb-send:hover:not(:disabled) { box-shadow:0 0 12px rgba(255,42,59,0.6); }
        .jb-send:disabled { opacity:.3;cursor:not-allowed; }
      `}</style>

      {/* ── Bulle d'intro ── */}
      {bubbleVisible && !open && (
        <div className="jb-char-bubble">
          <span className="jb-bubble-name">JB.exe</span>
          Salut — je suis JB.<br/>Une question ? 👾
        </div>
      )}

      {/* ── Personnage ── */}
      <div
        className={"jb-char-wrap" + (open ? " is-open" : "")}
        onClick={() => { setOpen(o => !o); setBubbleVisible(false); }}
        title={open ? "Fermer le chat" : "Discuter avec JB"}
      >
        <JBCharacter isOpen={open} />
      </div>

      {/* ── Fenêtre de chat ── */}
      {open && (
        <div className="jb-chat-window" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="jb-chat-hdr">
            <div className="jb-hdr-dot"/>
            <span className="jb-hdr-title">
              JB <span className="jb-hdr-sub">· Data Engineer</span>
            </span>
            <span className="jb-hdr-status">
              <span className="jb-hdr-pulse"/>online
            </span>
            <button className="jb-hdr-close" onClick={() => setOpen(false)}>×</button>
          </div>

          {/* Messages */}
          <div className="jb-chat-msgs">
            {messages.map((msg, i) => (
              <div key={i} className={"jb-msg " + (msg.role === "user" ? "jb-msg-usr" : "jb-msg-bot")}>
                {msg.role === "model" && <span className="jb-msg-av">JB</span>}
                <div className="jb-msg-bbl">
                  {msg.parts[0].text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="jb-msg jb-msg-bot">
                <span className="jb-msg-av">JB</span>
                <div className="jb-msg-bbl jb-typing"><span/><span/><span/></div>
              </div>
            )}

            {error && <div className="jb-error">{error}</div>}

            {suggestionsShown && messages.length === 1 && (
              <div className="jb-suggestions">
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} className="jb-chip" onClick={() => sendMessage(s)}>{s}</button>
                ))}
              </div>
            )}

            <div ref={bottomRef}/>
          </div>

          {/* Input */}
          <div className="jb-chat-inp">
            <input
              ref={inputRef}
              className="jb-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Pose ta question..."
              disabled={loading || !systemPrompt}
              maxLength={400}
            />
            <button
              className="jb-send"
              onClick={() => sendMessage()}
              disabled={loading || !input.trim() || !systemPrompt}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
