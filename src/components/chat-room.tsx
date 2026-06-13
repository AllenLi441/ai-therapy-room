"use client";

import {
  Download,
  FileText,
  Loader2,
  Lock,
  MessageCircle,
  Monitor,
  Moon,
  Send,
  ShieldCheck,
  Sun,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BrandGlyph, BreathingMark } from "@/components/breathing-mark";
import { BreathingExercise } from "@/components/breathing-exercise";
import { PersonaCard } from "@/components/persona-card";
import { getPersonaById, getPersonaForModality, type PersonaId } from "@/lib/personas";
import { CasePanel } from "@/components/case-panel";
import { ExercisePanel } from "@/components/exercise-panel";
import { PipelineBar, ModeToggle, type PipelineStep, type PipelineMode } from "@/components/pipeline-bar";
import { SafeMarkdown } from "@/components/safe-markdown";
import {
  CrisisCard,
  CrisisHelpButton,
  DisclaimerModal,
  HotlineModal,
  ReactionBar,
  Toast,
  useDisclaimerGate,
  useToast,
  type ReactionKind
} from "@/components/safety-ui";
import { ScaleModal, ScaleSelector } from "@/components/scale-modal";
import {
  DEFAULT_SESSION_PACE,
  SESSION_PACE_OPTIONS,
  resolveSessionPace,
  type SessionPaceId
} from "@/lib/model-options";
import { suggestScale } from "@/lib/scales";
import {
  emptyCaseMap,
  type CaseMap,
  type ChatMessage,
  type ConsultGoal,
  type IntakeProfile,
  type ScaleId,
  type ScaleResult,
  type TherapyModality,
  type TurnPlan
} from "@/lib/types";

type UIMessage = ChatMessage & {
  id: string;
  createdAt: string;
  crisis?: boolean;
  modality?: TherapyModality;
  personaId?: PersonaId;
  personaSwitched?: boolean;
  streaming?: boolean;
};

type StoredSession = {
  profile: IntakeProfile;
  messages: UIMessage[];
  model?: SessionPaceId;
  summary?: string;
  caseMap?: CaseMap;
  turnPlan?: TurnPlan | null;
  scaleResults?: ScaleResult[];
  pipelineMode?: PipelineMode;
};

type ThemeMode = "auto" | "light" | "dark";

const STORAGE_KEY = "quiet-room-session-v2";
const LEGACY_KEYS = ["quiet-room-session-v1"];
const THEME_KEY = "quiet-room-theme";

const CONCERNS = ["焦虑压力", "低落无力", "关系困扰", "睡眠问题", "自我否定", "说不清"];

const PROMPTS = [
  "最近反复出现在脑子里的想法是什么？",
  "此刻身体哪个部位感觉最紧绷？",
  "如果给现在的情绪起个名字，会叫什么？"
];

const MODALITY_LABEL: Record<TherapyModality, string> = {
  "person-centered": "人本倾听",
  CBT: "认知行为（CBT）",
  ACT: "接纳承诺（ACT）",
  DBT: "辩证行为（DBT）",
  MI: "动机式访谈（MI）",
  "trauma-informed": "创伤知情",
  crisis: "危机稳定化"
};

const defaultProfile: IntakeProfile = {
  nickname: "",
  concern: "焦虑压力",
  intensity: 5
};

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createMessage(role: UIMessage["role"], content: string): UIMessage {
  return {
    id: createId(),
    role,
    content,
    createdAt: new Date().toISOString()
  };
}

function initialMessages(): UIMessage[] {
  return [
    {
      id: "welcome-message",
      role: "assistant",
      content:
        "你好，我在。你可以不用组织得很完整，先说最困扰你的那一小段就好。我会先听你说，再在后台为你建立一份'个案理解'，每一轮回应都按一份治疗计划来；如果出现即时危险，请优先联系现实中的人或紧急服务。",
      createdAt: ""
    }
  ];
}

function formatTime(value: string) {
  if (!value) {
    return "现在";
  }

  try {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function dayLabel(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diff = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (diff === 0) return "今天";
  if (diff === 1) return "昨天";
  if (diff < 7) return `${diff} 天前`;

  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "long",
      day: "numeric"
    }).format(date);
  } catch {
    return "";
  }
}

function dayKey(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function buildExportMarkdown(
  profile: IntakeProfile,
  messages: UIMessage[],
  caseMap: CaseMap,
  scales: ScaleResult[],
  summary?: string
) {
  const lines = [
    "# AI心理咨询室会话记录",
    "",
    `- 称呼：${profile.nickname || "匿名"}`,
    `- 主要困扰：${profile.concern || "未选择"}`,
    `- 情绪强度：${profile.intensity ?? "-"} / 10`,
    ""
  ];

  if (caseMap.presenting || caseMap.workingHypothesis) {
    lines.push("## 个案理解");
    if (caseMap.presenting) lines.push(`- 主诉：${caseMap.presenting}`);
    if (caseMap.workingHypothesis) lines.push(`- 工作假设：${caseMap.workingHypothesis}`);
    if (caseMap.triggers.length) lines.push(`- 诱发情境：${caseMap.triggers.join("、")}`);
    if (caseMap.automaticThoughts.length) lines.push(`- 自动想法：${caseMap.automaticThoughts.join("、")}`);
    if (caseMap.coreBeliefs.length) lines.push(`- 核心信念：${caseMap.coreBeliefs.join("、")}`);
    if (caseMap.bodyResponses.length) lines.push(`- 身体反应：${caseMap.bodyResponses.join("、")}`);
    if (caseMap.behaviors.length) lines.push(`- 行为：${caseMap.behaviors.join("、")}`);
    if (caseMap.needsValues.length) lines.push(`- 需要/价值：${caseMap.needsValues.join("、")}`);
    if (caseMap.resources.length) lines.push(`- 资源：${caseMap.resources.join("、")}`);
    lines.push("");
  }

  if (scales.length) {
    lines.push("## 量表结果");
    for (const scale of scales) {
      lines.push(`- ${scale.id}：${scale.total} 分（${scale.severity}）— ${scale.completedAt.slice(0, 10)}`);
    }
    lines.push("");
  }

  lines.push("## 对话");
  for (const message of messages) {
    lines.push(
      "",
      `### ${message.role === "user" ? "来访者" : "AI助手"} ${formatTime(message.createdAt)}`,
      message.content
    );
  }

  if (summary) {
    lines.push("", "## 会话总结", summary);
  }

  return lines.join("\n");
}

function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const systemDark =
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = mode === "auto" ? (systemDark ? "dark" : "light") : mode;
  root.setAttribute("data-theme", resolved);
  if (mode === "auto") {
    root.setAttribute("data-theme-auto", "1");
  } else {
    root.removeAttribute("data-theme-auto");
  }
}

function nextTheme(mode: ThemeMode): ThemeMode {
  if (mode === "auto") return "light";
  if (mode === "light") return "dark";
  return "auto";
}

export function ChatRoom() {
  const [profile, setProfile] = useState<IntakeProfile>(defaultProfile);
  const [selectedPace, setSelectedPace] = useState<SessionPaceId>(DEFAULT_SESSION_PACE);
  const [messages, setMessages] = useState<UIMessage[]>(() => initialMessages());
  const [input, setInput] = useState("");
  const [summary, setSummary] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "ready">("loading");
  const [caseMap, setCaseMap] = useState<CaseMap>(() => emptyCaseMap());
  const [turnPlan, setTurnPlan] = useState<TurnPlan | null>(null);
  const [scaleResults, setScaleResults] = useState<ScaleResult[]>([]);
  const [activeScale, setActiveScale] = useState<ScaleId | null>(null);
  const [suggestedScale, setSuggestedScale] = useState<ScaleId | null>(null);
  // Session goal selector removed from the UI; default to "listen" so the
  // supervisor still receives a goal. (intensity slider also removed.)
  const [consultGoal] = useState<ConsultGoal>("listen");
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>("deep");
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>("idle");
  const [showHotlines, setShowHotlines] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("auto");
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const previousPersonaRef = useRef<PersonaId | null>(null);

  const { showDisclaimer, accept } = useDisclaimerGate();
  const { toast, show: showToast } = useToast();

  const userMessageCount = useMemo(() => {
    return messages.filter((message) => message.role === "user").length;
  }, [messages]);

  const completedScaleIds = useMemo(
    () => [...new Set(scaleResults.map((result) => result.id))],
    [scaleResults]
  );

  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant" && messages[i].content) {
        return messages[i].id;
      }
    }
    return null;
  }, [messages]);

  useEffect(() => {
    try {
      const storedTheme = window.localStorage.getItem(THEME_KEY) as ThemeMode | null;
      const mode: ThemeMode =
        storedTheme === "dark" || storedTheme === "light" || storedTheme === "auto" ? storedTheme : "auto";
      setTheme(mode);
      applyTheme(mode);
    } catch {
      applyTheme("auto");
    }
  }, []);

  useEffect(() => {
    if (theme !== "auto" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("auto");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  useEffect(() => {
    try {
      let stored = window.localStorage.getItem(STORAGE_KEY);

      if (!stored) {
        for (const legacy of LEGACY_KEYS) {
          const legacyStored = window.localStorage.getItem(legacy);
          if (legacyStored) {
            stored = legacyStored;
            window.localStorage.removeItem(legacy);
            break;
          }
        }
      }

      if (stored) {
        const parsed = JSON.parse(stored) as StoredSession;
        setProfile({ ...defaultProfile, ...parsed.profile });
        setSelectedPace(resolveSessionPace(parsed.pace));
        setMessages(parsed.messages?.length ? parsed.messages : initialMessages());
        setSummary(parsed.summary ?? "");
        setCaseMap({ ...emptyCaseMap(), ...(parsed.caseMap ?? {}) });
        setTurnPlan(parsed.turnPlan ?? null);
        setScaleResults(parsed.scaleResults ?? []);
        if (parsed.pipelineMode === "fast" || parsed.pipelineMode === "deep") {
          setPipelineMode(parsed.pipelineMode);
        }
        if (parsed.turnPlan?.modality) {
          previousPersonaRef.current = getPersonaForModality(parsed.turnPlan.modality).id;
        }
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setLoadState("ready");
    }
  }, []);

  useEffect(() => {
    if (loadState !== "ready") {
      return;
    }

    const payload: StoredSession = {
      profile,
      messages,
      pace: selectedPace,
      summary,
      caseMap,
      turnPlan,
      scaleResults,
      pipelineMode
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [loadState, messages, profile, selectedPace, summary, caseMap, turnPlan, scaleResults, pipelineMode]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages]);

  function cycleTheme() {
    const next = nextTheme(theme);
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // ignore
    }
  }

  async function dispatchMessage(content: string) {
    if (!content || isBusy) return;

    const suggestion = suggestScale(content);
    if (suggestion && !completedScaleIds.includes(suggestion)) {
      setSuggestedScale(suggestion);
    } else {
      setSuggestedScale(null);
    }

    const userMessage = createMessage("user", content);
    const assistantMessage = createMessage("assistant", "");
    const nextMessages = [...messages, userMessage, assistantMessage];
    const allMessages = [...messages, userMessage].map(({ role, content: text }) => ({
      role,
      content: text
    }));

    setInput("");
    setMessages(nextMessages);
    setIsBusy(true);
    setPipelineStep(pipelineMode === "deep" ? "planning" : "generating");
    setSummary("");

    const errorFallback =
      "连接 AI 服务时遇到问题。你可以先做一次慢呼吸：吸气 4 秒、呼气 6 秒，重复 3 轮；如果现在有伤害自己或他人的冲动，请优先联系 12356 / 010-82951332 / 400-161-9995 中的任一热线，或拨打 120。";

    try {
      // Parallel: safety pre-check (fast, regex) alongside the plan call.
      const safetyPromise = fetch("/api/safety-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: allMessages })
      })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null);

      // Step 1: Kimi planner (deep mode only — fast mode skips for speed)
      let planCaseMap: CaseMap = caseMap;
      let planTurnPlan: TurnPlan = turnPlan ?? {
        modality: "person-centered",
        protocolStep: "准确倾听并反映用户最核心的痛点",
        whatToReflect: "用户最在意、最痛的那一点",
        intervention: "用一句话承接情绪，不急着给方法",
        clarifyingQuestion: "你最希望我先听见的是哪一段？",
        avoid: "不要一次塞多个建议，不要给保证"
      };

      if (pipelineMode === "deep") {
        const planRes = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile, caseMap, scaleResults, consultGoal, messages: allMessages })
        });

        if (!planRes.ok) throw new Error("Plan failed");

        const planData = (await planRes.json()) as {
          plan: { caseMap: CaseMap; turnPlan: TurnPlan };
          risk: { level: string; shouldEscalate: boolean };
        };

        planCaseMap = planData.plan.caseMap;
        planTurnPlan = planData.plan.turnPlan;
        setCaseMap(planCaseMap);
        setTurnPlan(planTurnPlan);
      }

      // Step 2: DeepSeek generates (streaming)
      setPipelineStep("generating");

      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          profile,
          pace: selectedPace,
          caseMap: planCaseMap,
          turnPlan: planTurnPlan,
          scaleResults,
          messages: allMessages
        })
      });

      if (!chatRes.ok) throw new Error("Chat failed");

      const crisisHeader = chatRes.headers.get("X-Crisis-Triggered") === "1";

      // Stream the response into the assistant bubble.
      const CRISIS_MARKER = "<<<QR:CRISIS:1>>>";
      let draft = "";
      let trailerSeen = false;

      if (chatRes.body) {
        const reader = chatRes.body.getReader();
        const decoder = new TextDecoder();

        // Flip the pipeline to "generating" once the first byte arrives.
        let firstByte = true;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (firstByte && chunk.trim()) {
            setPipelineStep("generating");
            firstByte = false;
          }
          draft += chunk;
          if (draft.includes(CRISIS_MARKER)) {
            trailerSeen = true;
            draft = draft.replace(CRISIS_MARKER, "").trimEnd();
          }
          const displayed = draft;
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, content: displayed, streaming: true }
                : message
            )
          );
        }
        const tail = decoder.decode();
        if (tail) {
          draft += tail;
          if (draft.includes(CRISIS_MARKER)) {
            trailerSeen = true;
            draft = draft.replace(CRISIS_MARKER, "").trimEnd();
          }
        }
      } else {
        draft = await chatRes.text();
      }

      // If the safety check (parallel) flagged crisis but chat didn't escalate
      // (e.g. cumulative-only signal), force the crisis card to appear.
      const safetyData = (await safetyPromise) as
        | { risk?: { level?: string; shouldEscalate?: boolean } }
        | null;
      const safetyEscalated = Boolean(safetyData?.risk?.shouldEscalate);
      const isCrisis = crisisHeader || safetyEscalated || trailerSeen;

      setPipelineStep("done");

      const newModality = planTurnPlan.modality;
      const newPersona = getPersonaForModality(newModality);
      const previousPersonaId = previousPersonaRef.current;
      const personaSwitched = Boolean(previousPersonaId) && previousPersonaId !== newPersona.id;
      previousPersonaRef.current = newPersona.id;

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                content: draft,
                crisis: isCrisis,
                streaming: false,
                modality: newModality,
                personaId: newPersona.id,
                personaSwitched
              }
            : message
        )
      );
    } catch {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id
            ? { ...message, content: errorFallback, streaming: false }
            : message
        )
      );
    } finally {
      setIsBusy(false);
      setTimeout(() => setPipelineStep("idle"), 1200);
    }
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content) return;
    await dispatchMessage(content);
  }

  function handleReaction(_kind: ReactionKind, prompt: string) {
    if (isBusy) return;
    void dispatchMessage(prompt);
  }

  async function endSession() {
    if (isSummarizing || userMessageCount === 0) {
      return;
    }

    setIsSummarizing(true);

    try {
      const response = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          pace: selectedPace,
          caseMap,
          scaleResults,
          messages: messages.map(({ role, content }) => ({ role, content }))
        })
      });
      const data = (await response.json()) as { summary?: string };
      setSummary(data.summary ?? "暂时无法生成总结。");
    } catch {
      setSummary("暂时无法生成总结。你可以先记下：此刻最困扰你的是什么、哪件事稍微有帮助、下一步想做什么。");
    } finally {
      setIsSummarizing(false);
    }
  }

  function exportSession() {
    const markdown = buildExportMarkdown(profile, messages, caseMap, scaleResults, language, summary);
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ai-therapy-room-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("已下载到你的下载文件夹");
  }

  function clearSession() {
    const confirmed = window.confirm("确认清除本机保存的匿名会话记录吗？这个操作不会影响服务器，因为服务器没有长期保存这些记录。");

    if (!confirmed) {
      return;
    }

    window.localStorage.removeItem(STORAGE_KEY);
    setProfile(defaultProfile);
    setMessages(initialMessages());
    setInput("");
    setSummary("");
    setCaseMap(emptyCaseMap());
    setTurnPlan(null);
    setScaleResults([]);
    setSuggestedScale(null);
    previousPersonaRef.current = null;
    showToast("已清除本机记录");
  }

  function fillPrompt(prompt: string) {
    setInput(prompt);
    setTimeout(() => {
      const textarea = document.querySelector<HTMLTextAreaElement>(".composer textarea");
      textarea?.focus();
    }, 100);
  }

  function handleScaleSubmit(result: ScaleResult) {
    setScaleResults((current) => {
      const filtered = current.filter((entry) => entry.id !== result.id);
      return [...filtered, result];
    });
    setActiveScale(null);
    setSuggestedScale((current) => (current === result.id ? null : current));
    showToast(`${result.id} 已记录 · ${result.total} 分（${result.severity}）`);
  }

  if (loadState === "loading") {
    return (
      <main className="app-shell">
        <div className="loading-screen">
          <BreathingMark intensity={5} />
          <p>稍候，正在打开这片空间…</p>
        </div>
      </main>
    );
  }

  const themeIcon = theme === "auto" ? <Monitor size={17} /> : theme === "dark" ? <Moon size={17} /> : <Sun size={17} />;
  const themeLabel = theme === "auto" ? "跟随系统" : theme === "dark" ? "暗色" : "亮色";

  return (
    <main className="app-shell">
      <section className="side-panel" aria-label="来访设置">
        <div className="brand-row">
          <div className="brand-mark">
            <BrandGlyph size={24} />
          </div>
          <div>
            <h1>静室</h1>
            <p>Quiet Room · 匿名心理支持</p>
          </div>
        </div>

        <BreathingMark intensity={profile.intensity ?? 5} />
        <BreathingExercise />
        <PersonaCard modality={turnPlan?.modality ?? null} />

        <div className="field-group">
          <label htmlFor="nickname">匿名称呼</label>
          <input
            id="nickname"
            value={profile.nickname ?? ""}
            onChange={(event) => setProfile((current) => ({ ...current, nickname: event.target.value }))}
            placeholder="例如：小林"
            maxLength={24}
          />
        </div>

        <div className="field-group">
          <label htmlFor="concern">主要困扰</label>
          <select
            id="concern"
            value={profile.concern ?? CONCERNS[0]}
            onChange={(event) => setProfile((current) => ({ ...current, concern: event.target.value }))}
          >
            {CONCERNS.map((concern) => (
              <option key={concern} value={concern}>
                {concern}
              </option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <label>对话模型</label>
          <div className="model-switch" role="radiogroup" aria-label="选择 DeepSeek 模型">
            {SESSION_PACE_OPTIONS.map((option) => {
              const isSelected = selectedPace === option.id;

              return (
                <button
                  key={option.id}
                  className={`model-option${isSelected ? " selected" : ""}`}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelectedPace(option.id)}
                  disabled={isBusy}
                >
                  <span>{option.label}</span>
                  <small>{option.description}</small>
                </button>
              );
            })}
          </div>
          <small className="model-footnote">回应由 DeepSeek 生成；后台个案概念化由 Kimi 负责，每轮单独制定治疗计划。</small>
          <div className="mode-row">
            <small>回应模式</small>
            <ModeToggle mode={pipelineMode} onChange={setPipelineMode} disabled={isBusy} />
          </div>
        </div>

        <div className="field-group">
          <div className="range-label">
            <label htmlFor="intensity">当前情绪强度</label>
            <span>{profile.intensity ?? 5}/10</span>
          </div>
          <input
            id="intensity"
            type="range"
            min="0"
            max="10"
            value={profile.intensity ?? 5}
            onChange={(event) =>
              setProfile((current) => ({ ...current, intensity: Number(event.target.value) }))
            }
          />
        </div>

        <div className="field-group">
          <label>本轮咨询目标</label>
          <div className="goal-switch" role="radiogroup" aria-label="选择本轮目标">
            {CONSULT_GOALS.map((goal) => {
              const isSelected = consultGoal === goal.id;
              return (
                <button
                  key={goal.id}
                  className={`goal-option${isSelected ? " selected" : ""}`}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setConsultGoal(goal.id)}
                  disabled={isBusy}
                >
                  <span>{goal.label}</span>
                  <small>{goal.description}</small>
                </button>
              );
            })}
          </div>
        </div>

        <CasePanel
          caseMap={caseMap}
          turnPlan={turnPlan}
          scales={scaleResults}
          planning={pipelineStep !== "idle" && pipelineStep !== "done"}
        />

        <ScaleSelector activeIds={completedScaleIds} onPick={(id) => setActiveScale(id)} />

        <div className="safety-note">
          <ShieldCheck size={18} />
          <p>这里提供心理支持，不提供诊断、药物建议或紧急救援。若有即时危险，请联系当地急救服务或现实中的可信赖的人。</p>
        </div>
      </section>

      <section className="chat-panel" aria-label="匿名咨询聊天">
        <header className="chat-header">
          <div>
            <div className="header-title">
              <MessageCircle size={19} />
              <h2>对话</h2>
            </div>
            <p>{turnPlan ? "按你的节奏说，我会一段一段陪你看。" : "在这里，可以慢慢说。"}</p>
            {turnPlan ? (
              <div className="header-chip">
                <span className="header-chip-dot" />
                {MODALITY_LABEL[turnPlan.modality]}
                <span className="header-chip-sep">·</span>
                <em>{turnPlan.protocolStep}</em>
              </div>
            ) : null}
          </div>
          <div className="toolbar">
            <CrisisHelpButton onOpen={() => setShowHotlines(true)} />
            <button
              className="icon-button"
              type="button"
              onClick={cycleTheme}
              title={`主题：${themeLabel}（点击切换）`}
              aria-label={`主题：${themeLabel}`}
            >
              {themeIcon}
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={exportSession}
              title="导出会话"
              aria-label="导出会话"
            >
              <Download size={18} />
            </button>
            <button
              className="icon-button danger"
              type="button"
              onClick={clearSession}
              title="清除本地记录"
              aria-label="清除本地记录"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </header>

        <div className="privacy-strip">
          <Lock size={16} />
          <span>无账号、少存储、服务端只处理本次请求。个案理解只保留在你这台设备的浏览器里。</span>
        </div>

        <PipelineBar step={pipelineStep} mode={pipelineMode} />

        <div className="message-list" ref={scrollerRef}>
          {messages.flatMap((message, index) => {
            const prev = messages[index - 1];
            const showDivider =
              message.createdAt &&
              (!prev?.createdAt || dayKey(prev.createdAt) !== dayKey(message.createdAt));
            const nodes: ReactNode[] = [];
            if (showDivider) {
              nodes.push(
                <div key={`divider-${message.id}`} className="day-divider" aria-hidden="true">
                  <span>{dayLabel(message.createdAt)}</span>
                </div>
              );
            }
            nodes.push(
            <article
              className={`message ${message.role}${message.crisis ? " crisis" : ""}${
                message.streaming ? " streaming" : ""
              }`}
              key={message.id}
            >
              <div className="message-meta">
                <span>
                  {message.role === "user"
                    ? profile.nickname || "你"
                    : (message.personaId && getPersonaById(message.personaId)?.name) || "静室"}
                </span>
                <time>{formatTime(message.createdAt)}</time>
              </div>
              {message.role === "assistant" && message.personaSwitched && message.personaId
                ? (() => {
                    const persona = getPersonaById(message.personaId);
                    if (!persona) return null;
                    return (
                      <div className="modality-transition">
                        <strong>{persona.name}</strong>
                        <span className="modality-transition-flavor">{persona.flavor}</span>
                        <em>{persona.selfIntro}</em>
                      </div>
                    );
                  })()
                : null}
              {message.content ? (
                <>
                  <SafeMarkdown content={message.content} />
                  {message.streaming ? <span className="typing-caret" aria-hidden="true" /> : null}
                </>
              ) : (
                <p className="thinking">
                  {pipelineStep === "planning"
                    ? "正在认真听你说的话"
                    : pipelineStep === "generating"
                    ? "正在落笔"
                    : pipelineStep === "reviewing"
                    ? "正在再读一遍"
                    : isBusy && message.role === "assistant"
                    ? "稍等片刻"
                    : ""}
                  <span className="thinking-dots" aria-hidden="true" />
                </p>
              )}
              {message.role === "assistant" && message.crisis ? (
                <CrisisCard onShowHotlines={() => setShowHotlines(true)} />
              ) : null}
              {message.role === "assistant" &&
              message.id === lastAssistantId &&
              !message.crisis &&
              message.content &&
              userMessageCount > 0 ? (
                <ReactionBar onReact={handleReaction} disabled={isBusy} />
              ) : null}
            </article>
            );
            return nodes;
          })}

          {suggestedScale ? (
            <div className="scale-suggest">
              <span>注意到你描述的内容可能可以用 {suggestedScale} 做一次自评，得到一个客观参考分数。</span>
              <div>
                <button type="button" className="secondary-button" onClick={() => setActiveScale(suggestedScale)}>
                  做一次 {suggestedScale}
                </button>
                <button type="button" className="text-button" onClick={() => setSuggestedScale(null)}>
                  暂不做
                </button>
              </div>
            </div>
          ) : null}

          {userMessageCount === 0 && loadState === "ready" ? (
            <>
              <div className="welcome-prelude">
                如果不知道从哪里开始，下面这几句话也许能帮你打开门。
              </div>
              <div className="prompt-cards">
                {PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    className="prompt-card"
                    type="button"
                    onClick={() => fillPrompt(prompt)}
                  >
                    <MessageCircle size={16} />
                    <span>{prompt}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {summary ? (
          <aside className="summary-panel" aria-label="会话总结">
            <div className="summary-title">
              <div className="summary-title-text">
                <FileText size={18} />
                <h3>今天的回望</h3>
              </div>
              <time className="summary-date">
                {new Intl.DateTimeFormat("zh-CN", {
                  year: "numeric",
                  month: "long",
                  day: "numeric"
                }).format(new Date())}
              </time>
            </div>
            <div className="summary-body">
              <SafeMarkdown content={summary} />
            </div>
          </aside>
        ) : null}

        <footer className="composer">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            onFocus={(event) => {
              setTimeout(() => {
                event.target.scrollIntoView({ behavior: "smooth", block: "center" });
              }, 320);
            }}
            placeholder="把此刻最困扰你的那一小段写下来 —— 不用写得完整。"
            aria-label="输入咨询内容"
            rows={3}
            maxLength={2000}
          />
          <div className="composer-meta">
            <span className="composer-hint">Enter 发送 · Shift+Enter 换行</span>
            <span className="composer-count">{input.length} / 2000</span>
          </div>
          <div className="composer-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={endSession}
              disabled={userMessageCount === 0 || isSummarizing}
            >
              {isSummarizing ? <Loader2 className="spin" size={17} /> : <FileText size={17} />}
              结束并总结
            </button>
            <button className="primary-button" type="button" onClick={sendMessage} disabled={!input.trim() || isBusy}>
              {isBusy ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
              {pipelineStep !== "idle" && pipelineStep !== "done" ? "回应中…" : "发送"}
            </button>
          </div>
        </footer>
      </section>

      {activeScale ? (
        <ScaleModal
          scaleId={activeScale}
          onClose={() => setActiveScale(null)}
          onSubmit={handleScaleSubmit}
        />
      ) : null}

      {showHotlines ? <HotlineModal onClose={() => setShowHotlines(false)} /> : null}
      {showDisclaimer ? <DisclaimerModal onAccept={accept} /> : null}

      <Toast message={toast?.message ?? null} />
    </main>
  );
}
