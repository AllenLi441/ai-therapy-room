"use client";
/* app.tsx — 静室 orchestration, wired to the real backend.
   Streams POST /api/chat; images go through POST /api/vision (Kimi multimodal)
   and their description is folded into the message so the text model + server
   risk-detection can respond to them. */
import { useEffect, useRef, useState } from "react";
import { personaById, detectRisk, detectScaleNeed, STR, SCALES, type Lang, type Message, type Media } from "./data";
import { Ic } from "./icons";
import { TopBar, PrivacyRibbon, Stream, Composer, Welcome, CalmMode } from "./chat-parts";
import { AboutSheet, ScaleModal, CrisisSheet, CrisisBanner, BreathingSheet, CaseDrawer } from "./overlays";

let _mid = 0;
const uid = () => "m" + ++_mid;

type Overlay = "about" | "crisis" | "breathing" | "case" | null;

export function App() {
  const [lang, setLang] = useState<Lang>("zh");
  const [theme, setTheme] = useState<string>("light");
  const [pace, setPace] = useState<"deep" | "fast">("deep");
  const persona = personaById("linxi");

  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [scaleId, setScaleId] = useState<string | null>(null);
  // Scales are no longer a permanent UI entry — only suggested when the
  // conversation shows a matching need, and at most once per scale per session.
  const [suggestedScale, setSuggestedScale] = useState<string | null>(null);
  const offeredScales = useRef<Set<string>>(new Set());
  const exitedCrisisRef = useRef(false); // user tapped "我没事了" → judge next msgs solo until new risk
  const [crisis, setCrisis] = useState(false);
  const [calm, setCalm] = useState(false); // emotion-adaptive; driven by a server signal in future
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  // hydrate persisted lang/theme on the client
  useEffect(() => {
    try {
      const lg = localStorage.getItem("js_lang");
      const th = localStorage.getItem("js_theme");
      if (lg === "zh" || lg === "en") setLang(lg);
      if (th === "light" || th === "dark") setTheme(th);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); try { localStorage.setItem("js_theme", theme); } catch {} }, [theme]);
  useEffect(() => { document.documentElement.lang = lang; try { localStorage.setItem("js_lang", lang); } catch {} }, [lang]);

  function pickGreeting(lg: Lang) {
    const hi = lg === "zh" ? `你好，我是${persona.name.zh}。` : `Hi, I'm ${persona.name.en}.`;
    return hi + "\n\n" + STR[lg].today_intro;
  }

  // seed the opening greeting once
  useEffect(() => {
    setMessages([{ id: uid(), role: "assistant", personaId: "linxi", content: pickGreeting(lang) }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // refresh greeting if language flips and nothing's been said yet
  useEffect(() => {
    setMessages((ms) => (ms.length === 1 && ms[0].role === "assistant" ? [{ ...ms[0], content: pickGreeting(lang) }] : ms));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  async function send(text: string, attachments: Media[]) {
    const media = attachments || [];
    const userMsg: Message = { id: uid(), role: "user", content: text, media };
    const aiId = uid();
    const aiMsg: Message = { id: aiId, role: "assistant", personaId: "linxi", content: "", streaming: true };
    const history = [...messagesRef.current, userMsg];
    setMessages((ms) => [...ms, userMsg, aiMsg]);
    setBusy(true);
    const risky = detectRisk(text);
    setCrisis(risky); // track the current turn — banner can clear, no longer sticky
    if (risky) exitedCrisisRef.current = false; // a genuinely risky message re-enters safety mode
    if (!risky) {
      // offer a self-check only when a theme surfaces (sleep/anxiety/low mood), once each
      const need = detectScaleNeed(text);
      if (need && !offeredScales.current.has(need)) { offeredScales.current.add(need); setSuggestedScale(need); }
    }

    const setAi = (fn: (c: string) => string) =>
      setMessages((ms) => ms.map((m) => (m.id === aiId ? { ...m, content: fn(m.content) } : m)));

    // images → /api/vision (Kimi) → fold description into the text the model sees
    let visionNote = "";
    const images = media.filter((m) => m.type === "image");
    if (images.length) {
      try {
        const descs = await Promise.all(
          images.map(async (im) => {
            const r = await fetch("/api/vision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: im.url }) });
            const d = (await r.json().catch(() => ({}))) as { description?: string };
            return d.description || "";
          })
        );
        const joined = descs.filter(Boolean).join("；");
        if (joined) visionNote = lang === "zh" ? `\n\n[我发了图片，内容大致是：${joined}]` : `\n\n[I sent image(s); roughly: ${joined}]`;
      } catch { /* vision failed — continue with text only */ }
    }

    const fallbackText = text || (media.length ? (lang === "zh" ? "（我发了一张图片）" : "(I sent an image)") : "");
    const backendContent = fallbackText + visionNote;
    const payloadMsgs = history.map((m, i) =>
      i === history.length - 1 ? { role: "user", content: backendContent } : { role: m.role, content: m.content }
    );

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payloadMsgs, pace, personaId: "linxi", language: lang, exitedCrisis: exitedCrisisRef.current })
      });
      if (res.headers.get("X-Crisis-Triggered") === "1") setCrisis(true);
      if (!res.body) {
        const tx = (await res.text()) || (lang === "zh" ? "（没有收到回复）" : "(No reply)");
        setAi(() => tx);
      } else {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value, { stream: true });
          setAi((c) => c + chunk);
        }
      }
    } catch {
      setAi(() => (lang === "zh" ? "（连接出错了，请稍后再试。）" : "(Connection error — please try again.)"));
    } finally {
      setMessages((ms) => ms.map((m) => (m.id === aiId ? { ...m, streaming: false } : m)));
      setBusy(false);
    }
  }

  function deleteAll() {
    const msg = lang === "zh" ? "确定要彻底删除这次对话吗？此操作无法撤销。" : "Delete this conversation completely? This cannot be undone.";
    if (confirm(msg)) {
      setBusy(false); setCrisis(false); setCalm(false);
      setMessages([{ id: uid(), role: "assistant", personaId: "linxi", content: pickGreeting(lang) }]);
    }
  }

  const started = messages.some((m) => m.role === "user");

  return (
    <div className="app" style={{ "--tone": persona.av } as React.CSSProperties}>
      <TopBar
        lang={lang} theme={theme} persona={persona}
        onTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        onLang={() => setLang(lang === "zh" ? "en" : "zh")}
        onPersona={() => setOverlay("about")}
        onCase={() => setOverlay("case")}
      />
      <PrivacyRibbon lang={lang} onDelete={deleteAll} />
      {crisis && <CrisisBanner lang={lang} onOpen={() => setOverlay("crisis")} onDismiss={() => { setCrisis(false); exitedCrisisRef.current = true; setOverlay((o) => (o === "crisis" ? null : o)); }} />}

      <div className="chat-wrap">
        {started
          ? <Stream messages={messages} persona={persona} lang={lang} />
          : <Welcome lang={lang} companion={persona} onStart={(s) => void send(s, [])} />}
        {suggestedScale && !scaleId && !crisis && (
          <div className="scale-suggest" role="status">
            <span className="ss-ico"><Ic.clipboard /></span>
            <span className="ss-text">
              {STR[lang].scale_suggest}（{SCALES[suggestedScale].name[lang].split(" · ")[1] || SCALES[suggestedScale].name[lang]}）
            </span>
            <button className="ss-cta" onClick={() => { setScaleId(suggestedScale); setSuggestedScale(null); }}>{STR[lang].scale_suggest_cta}</button>
            <button className="ss-dismiss" onClick={() => setSuggestedScale(null)} aria-label={STR[lang].scale_dismiss}><Ic.close /></button>
          </div>
        )}
        <Composer lang={lang} pace={pace} busy={busy} tone={persona.av} onSend={(t, a) => void send(t, a)} onPace={setPace} />
      </div>

      {calm && (
        <CalmMode lang={lang}
          onBreathe={() => setOverlay("breathing")}
          onHotline={() => setOverlay("crisis")}
          onContact={() => setOverlay("crisis")}
          onBack={() => setCalm(false)}
        />
      )}

      {overlay === "about" && <AboutSheet lang={lang} companion={persona} onClose={() => setOverlay(null)} />}
      {scaleId && <ScaleModal lang={lang} scaleId={scaleId} onClose={() => setScaleId(null)} />}
      {overlay === "crisis" && <CrisisSheet lang={lang} onClose={() => setOverlay(null)} onBreathe={() => setOverlay("breathing")} />}
      {overlay === "breathing" && <BreathingSheet lang={lang} onClose={() => setOverlay(null)} />}
      {overlay === "case" && <CaseDrawer lang={lang} persona={persona} onClose={() => setOverlay(null)} />}
    </div>
  );
}
