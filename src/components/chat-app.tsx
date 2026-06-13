"use client";

/**
 * 静室 · chat UI (2026-06-13 rebuild, v2 — polished).
 *
 * Single warm companion. Streams /api/chat. The "+" uploads an image to
 * /api/vision (Kimi multimodal); the returned description is attached to the
 * next message so the text conversation + risk-detection can respond to it.
 * Self-contained styling (scoped <style>), warm sage/cream palette, light+dark,
 * mobile-first, large calm type. Honest (not a licensed therapist) + a always-
 * visible crisis line. Swap the CSS avatar orb for the Claude Design avatar
 * image when ready (replace .qr-orb with an <img>).
 */
import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string; image?: string };

const STARTERS = [
  "我现在有点乱，不知道从哪里说起。",
  "先帮我听听，我不太想马上要建议。",
  "我想把今天最难受的一段讲出来。"
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function ChatApp() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [pendingImage, setPendingImage] = useState<{ url: string; description: string } | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const saved = (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme")) as
      | "dark"
      | "light"
      | null;
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("quiet-room-theme-v1", next);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  async function onPickImage(file: File) {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 6 * 1024 * 1024) {
      setPendingImage(null);
      alert("图片太大了（请小于 6MB）");
      return;
    }
    const url = await fileToDataUrl(file);
    setPendingImage({ url, description: "" });
    setImgBusy(true);
    try {
      const res = await fetch("/api/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: url })
      });
      const data = (await res.json().catch(() => ({}))) as { description?: string };
      setPendingImage({ url, description: data.description ?? "" });
    } catch {
      setPendingImage({ url, description: "" });
    } finally {
      setImgBusy(false);
    }
  }

  async function send(text?: string) {
    const userText = (text ?? input).trim();
    if ((!userText && !pendingImage) || busy) return;

    const img = pendingImage;
    const display: Msg = { role: "user", content: userText, image: img?.url };
    // What the backend sees: user text + (if present) the image description, so
    // DeepSeek can respond to the picture and risk-detection screens it.
    const backendContent = img?.description
      ? `${userText}\n\n[我发了一张图片，它的内容大致是：${img.description}]`
      : userText;

    const history: Msg[] = [...messages, display];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setPendingImage(null);
    setBusy(true);

    const payloadMsgs = history.map((m, i) =>
      i === history.length - 1 ? { role: "user", content: backendContent } : { role: m.role, content: m.content }
    );

    const setLast = (content: string) =>
      setMessages((m) => {
        const c = [...m];
        c[c.length - 1] = { role: "assistant", content };
        return c;
      });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payloadMsgs })
      });
      if (!res.body) {
        setLast((await res.text()) || "（没有收到回复）");
      } else {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          setLast(acc);
        }
      }
    } catch {
      setLast("（连接出错了，请稍后再试。）");
    } finally {
      setBusy(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="qr-root" data-theme={theme}>
      <style>{CSS}</style>

      <header className="qr-head">
        <div className="qr-brand">
          <span className="qr-orb" aria-hidden />
          <div>
            <h1>静室</h1>
            <p className="qr-sub">一间安静的房间 · 想说什么都可以</p>
          </div>
        </div>
        <button className="qr-theme" onClick={toggleTheme} aria-label="切换明暗">
          {theme === "dark" ? "☾" : "☀"}
        </button>
      </header>

      <div className="qr-scroll" ref={scrollRef}>
        {empty ? (
          <div className="qr-empty">
            <span className="qr-orb qr-orb-lg" aria-hidden />
            <p className="qr-empty-lead">我在这儿。你最希望我先听见的，是哪一段？</p>
            <div className="qr-starters">
              {STARTERS.map((s) => (
                <button key={s} className="qr-chip" onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`qr-row ${m.role}`}>
              {m.role === "assistant" && <span className="qr-orb qr-orb-sm" aria-hidden />}
              <div className={`qr-bubble ${m.role}`}>
                {m.image && <img className="qr-thumb" src={m.image} alt="上传的图片" />}
                {m.content || (m.role === "assistant" && busy ? <span className="qr-dots">…</span> : "")}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="qr-composer">
        {pendingImage && (
          <div className="qr-pending">
            <img src={pendingImage.url} alt="待发送图片" />
            <span>{imgBusy ? "正在看这张图…" : "图片已读，发送时一起带上"}</span>
            <button onClick={() => setPendingImage(null)} aria-label="移除图片">
              ×
            </button>
          </div>
        )}
        <div className="qr-inputrow">
          <button
            className="qr-plus"
            onClick={() => fileRef.current?.click()}
            disabled={busy || imgBusy}
            aria-label="上传图片"
            title="上传图片"
          >
            +
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPickImage(f);
              e.target.value = "";
            }}
          />
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="写下此刻的心情…（Enter 发送 · Shift+Enter 换行）"
          />
          <button
            className="qr-send"
            onClick={() => void send()}
            disabled={busy || (!input.trim() && !pendingImage)}
            aria-label="发送"
          >
            发送
          </button>
        </div>
        <p className="qr-foot">
          这是 AI 陪伴，不是持证治疗师，也不能替代线下帮助或紧急救援 · 危机求助 12356 / 110 / 120
        </p>
      </div>
    </div>
  );
}

const CSS = `
.qr-root{
  --bg:#0e0d0b; --panel:#1a1815; --bubble-ai:#1f1d18; --bubble-user:#33403a;
  --edge:#2c2823; --ink:#ece7da; --ink-soft:#a59f90; --sage:#67c2b4; --sage-deep:#3f8d80;
  --coral:#e0a89a;
  min-height:100dvh; display:flex; flex-direction:column;
  max-width:760px; margin:0 auto; background:var(--bg); color:var(--ink);
  font-family:var(--font-sans-sc),system-ui,-apple-system,sans-serif;
  font-size:16px; line-height:1.75;
}
.qr-root[data-theme="light"]{
  --bg:#f7f3ea; --panel:#fbf8f1; --bubble-ai:#fbf8f1; --bubble-user:#dfeee9;
  --edge:#e6dfce; --ink:#2c2a25; --ink-soft:#7d776a; --sage:#3f8d80; --sage-deep:#2f6f64;
  --coral:#c5705c;
}
.qr-head{display:flex;align-items:center;justify-content:space-between;padding:20px 18px 12px;}
.qr-brand{display:flex;align-items:center;gap:12px;}
.qr-brand h1{margin:0;font-family:var(--font-serif-sc),serif;font-size:22px;font-weight:600;letter-spacing:.06em;}
.qr-sub{margin:2px 0 0;font-size:13px;color:var(--ink-soft);}
.qr-theme{background:transparent;border:1px solid var(--edge);color:var(--ink-soft);
  width:38px;height:38px;border-radius:50%;cursor:pointer;font-size:16px;transition:.2s;}
.qr-theme:hover{color:var(--ink);border-color:var(--sage);}
.qr-orb{width:36px;height:36px;border-radius:50%;flex:0 0 auto;
  background:radial-gradient(circle at 35% 30%,var(--sage),var(--sage-deep) 70%);
  box-shadow:0 0 22px -4px var(--sage); animation:qr-breathe 6s ease-in-out infinite;}
.qr-orb-sm{width:26px;height:26px;margin-top:4px;}
.qr-orb-lg{width:84px;height:84px;margin:0 auto 22px;}
@keyframes qr-breathe{0%,100%{transform:scale(1);opacity:.92;}50%{transform:scale(1.06);opacity:1;}}
@media (prefers-reduced-motion:reduce){.qr-orb{animation:none;}}
.qr-scroll{flex:1;overflow-y:auto;padding:10px 18px;display:flex;flex-direction:column;gap:16px;}
.qr-empty{margin:auto;text-align:center;max-width:460px;padding:24px 0;}
.qr-empty-lead{font-size:19px;line-height:1.9;color:var(--ink);margin:0 0 22px;}
.qr-starters{display:flex;flex-direction:column;gap:10px;}
.qr-chip{background:var(--panel);border:1px solid var(--edge);color:var(--ink-soft);
  border-radius:14px;padding:12px 16px;font-size:15px;cursor:pointer;text-align:left;transition:.18s;font-family:inherit;}
.qr-chip:hover{color:var(--ink);border-color:var(--sage);transform:translateY(-1px);}
.qr-row{display:flex;gap:10px;align-items:flex-start;}
.qr-row.user{justify-content:flex-end;}
.qr-bubble{max-width:84%;padding:13px 16px;border-radius:16px;white-space:pre-wrap;
  font-size:16px;line-height:1.8;border:1px solid var(--edge);}
.qr-bubble.assistant{background:var(--bubble-ai);border-bottom-left-radius:5px;}
.qr-bubble.user{background:var(--bubble-user);border-bottom-right-radius:5px;}
.qr-thumb{display:block;max-width:220px;max-height:200px;border-radius:10px;margin-bottom:8px;}
.qr-dots{color:var(--ink-soft);}
.qr-composer{padding:8px 18px 14px;border-top:1px solid var(--edge);background:var(--bg);}
.qr-pending{display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:13px;color:var(--ink-soft);}
.qr-pending img{width:42px;height:42px;object-fit:cover;border-radius:8px;}
.qr-pending button{margin-left:auto;background:none;border:none;color:var(--ink-soft);font-size:20px;cursor:pointer;}
.qr-inputrow{display:flex;gap:8px;align-items:flex-end;}
.qr-plus{flex:0 0 auto;width:44px;height:44px;border-radius:12px;background:var(--panel);
  border:1px solid var(--edge);color:var(--ink-soft);font-size:24px;line-height:1;cursor:pointer;transition:.18s;}
.qr-plus:hover:not(:disabled){color:var(--sage);border-color:var(--sage);}
.qr-inputrow textarea{flex:1;resize:none;background:var(--panel);color:var(--ink);
  border:1px solid var(--edge);border-radius:12px;padding:12px 14px;font-size:16px;
  font-family:inherit;line-height:1.6;max-height:160px;}
.qr-inputrow textarea:focus{outline:none;border-color:var(--sage);}
.qr-send{flex:0 0 auto;height:44px;padding:0 18px;border:none;border-radius:12px;
  background:var(--sage);color:#0c1f1b;font-size:15px;font-weight:600;cursor:pointer;transition:.18s;}
.qr-send:disabled,.qr-plus:disabled{opacity:.45;cursor:default;}
.qr-send:hover:not(:disabled){background:var(--sage-deep);}
.qr-foot{margin:10px 2px 0;font-size:11.5px;line-height:1.6;color:var(--coral);text-align:center;}
@media (max-width:520px){
  .qr-bubble{max-width:90%;} .qr-empty-lead{font-size:17px;}
  .qr-head{padding:16px 14px 10px;} .qr-scroll,.qr-composer{padding-left:14px;padding-right:14px;}
}
`;
