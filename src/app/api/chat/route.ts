import { appendDecisionLog, buildDecisionLogEntry, type DecisionRoute } from "@/lib/decision-log";
import { sanitizeConversation } from "@/lib/conversation-window";
import { buildDeepSeekPayload, createDeepSeekTextStream, generateDeepSeekText } from "@/lib/deepseek";
import { sanitizeReplyStream, streamTextResponse, textStreamFromString } from "@/lib/http";
import {
  assessImplicitRiskWithLLM,
  decideImplicitIntercept,
  mergeImplicitWithLexicon,
  type ImplicitDecision,
  type ImplicitOutcome
} from "@/lib/implicit-risk";
import { retrieveKnowledge } from "@/lib/knowledge";
import { createAssistantTextStream, createAssistantTextStreamWithThinking } from "@/lib/output-style";
import { resolvePersona, type PersonaId } from "@/lib/personas";
import { buildCounselorSystemPrompt, createProviderErrorFallback } from "@/lib/prompts";
import { stripLeadingPreface } from "@/lib/preface";
import { takeRecentWithinBudget, buildEarlierUserDigest } from "@/lib/chat-window";
import { summarizeOlderConversation } from "@/lib/chat-summary";
import {
  activateCrisisSessionRisk,
  assessConversationRisk,
  assessRisk,
  createCrisisResponse,
  createCrisisResourceBlock,
  createDiagnosisBoundaryResponse,
  createGentleCheckResponse,
  createMedicationBoundaryResponse,
  createMedicalRedFlagResponse,
  createMinorSupportLine,
  hasMinorContextCue,
  createSuicideConcernResponse,
  detectActiveCrisisFromHistory
} from "@/lib/safety";
import { resolveApiModelForPace, resolveDeepSeekModel, resolveSessionPace, type DeepSeekModelId, type SessionPaceId } from "@/lib/model-options";
import type {
  CaseMap,
  ChatMessage,
  AppLanguage,
  IntakeProfile,
  RiskAssessment,
  ScaleResult,
  TurnPlan
} from "@/lib/types";
import { defaultTurnPlan } from "@/lib/session-plan";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatRequest = {
  messages?: ChatMessage[];
  profile?: IntakeProfile;
  model?: DeepSeekModelId;
  pace?: SessionPaceId;
  personaId?: PersonaId;
  caseMap?: CaseMap | null;
  turnPlan?: TurnPlan | null;
  scaleResults?: ScaleResult[];
  crisisModeActive?: boolean;
  moodMemory?: string;
  language?: AppLanguage;
  // Set by the frontend when the user taps "我没事了" to leave safety mode. When
  // true, judge risk on THIS message only (not the multi-turn aggregate, which
  // would keep re-detecting the earlier crisis line and trap the user).
  exitedCrisis?: boolean;
};

export async function POST(request: Request) {
  let body: ChatRequest;

  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const messages = sanitizeConversation(body.messages ?? []);
  const model = resolveDeepSeekModel(body.model);
  const persona = resolvePersona(body.personaId);
  const language: AppLanguage = body.language === "en" ? "en" : "zh";
  const latestUserMessage = [...messages].reverse().find((m) => m.role === "user");

  if (!latestUserMessage) {
    return new Response("Missing user message", { status: 400 });
  }
  const latestUserText = latestUserMessage.content;

  // Multi-turn aggregation: looks at last 4 user messages, not just current.
  // This is what catches the PDF gradient case (turn 1: 看着药盒 → turn 2:
  // 把药吃了 → turn 3: 今晚没人) where no single turn would trigger but
  // the trajectory clearly does.
  const baseRisk = assessConversationRisk(messages);

  // Backend-inferred crisis persistence: if the previous assistant turn
  // contained a crisis template marker and the user hasn't clearly
  // de-escalated yet, treat this turn as still inside the crisis session
  // even if the frontend forgot to pass crisisModeActive.
  const inferredCrisis = detectActiveCrisisFromHistory(messages);
  // De-escalation (user signalled safety) overrides the frontend's sticky flag so
  // the session can leave safety mode without clearing the whole conversation.
  // exitedCrisis (user tapped "我没事了") forces us out of safety mode this turn.
  const crisisModeActive =
    (Boolean(body.crisisModeActive) || inferredCrisis.active) && !inferredCrisis.deescalated && !body.exitedCrisis;
  // Branch on THIS turn's own signal: the full crisis template fires only on a real
  // new risk, not on every follow-up (which made it repeat verbatim and never exit).
  // After an explicit exit, judge THIS message alone (assessRisk) so the lingering
  // earlier crisis line in the multi-turn window can't re-trigger and trap the user;
  // a genuinely risky current message still re-escalates. Otherwise use the
  // multi-turn aggregate (catches gradual escalation). crisisModeActive keeps the
  // model in safety tone via the system prompt without re-dumping the template.
  const risk = body.exitedCrisis ? assessRisk(latestUserMessage.content) : baseRisk;

  // Stubs used by the lexicon-only exit branches (LLM not invoked there).
  const stubImplicit: ImplicitOutcome = { kind: "not_configured" };
  const stubDecision: ImplicitDecision = {
    intercept: false,
    source: "none",
    rationale: "lexicon path — LLM classifier not invoked"
  };

  function logFireAndForget(route: DecisionRoute, implicit: ImplicitOutcome, decision: ImplicitDecision) {
    appendDecisionLog(
      buildDecisionLogEntry({
        messages,
        lexicon: risk,
        implicit,
        implicitDecision: decision,
        crisisModeActive,
        route
      })
    ).catch(() => {});
  }

  // ③ AI-tailored crisis reply: instead of a fixed template, generate a reply that
  // fits what the user actually said (under the crisis-safety prompt, fast tier,
  // non-streaming so the deterministic resource block can be GUARANTEED-appended),
  // then append the vetted hotline block. On ANY model failure / missing key, fall
  // back to the existing fixed template — never degrades below the previous behavior.
  async function respondTailoredCrisis(
    mode: "crisis" | "suicide_concern",
    decisionRisk: RiskAssessment,
    source: string
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Crisis-Triggered": "1",
      "X-Crisis-Source": source
    };
    const block = createCrisisResourceBlock(mode, language);
    // §5 additive minor support: if this looks like a minor, append the 12355 youth
    // line to the crisis reply (never replaces — zero downside per clinical review).
    const minorLine = hasMinorContextCue(latestUserText)
      ? `\n\n${createMinorSupportLine(language)}`
      : "";
    try {
      const recent = takeRecentWithinBudget(messages);
      const crisisPrompt = buildCounselorSystemPrompt({
        profile: body.profile,
        risk: activateCrisisSessionRisk(decisionRisk),
        knowledge: [],
        caseMap: null,
        turnPlan: defaultTurnPlan(),
        scaleResults: body.scaleResults,
        persona,
        pace: resolveSessionPace(body.pace),
        language,
        earlierUserContext: buildEarlierUserDigest(messages, recent.length)
      });
      const payload = buildDeepSeekPayload({
        systemPrompt: crisisPrompt,
        messages: recent,
        apiModel: "deepseek-v4-flash", // crisis: fast tier keeps the wait short
        stream: false,
        maxTokens: 500
      });
      const reply = (await generateDeepSeekText(payload)).trim();
      if (!reply) throw new Error("empty crisis reply");
      return new Response(textStreamFromString(`${reply}\n\n${block}${minorLine}`), { headers });
    } catch {
      const fallback =
        mode === "crisis"
          ? createCrisisResponse(decisionRisk, { language })
          : createSuicideConcernResponse(language);
      return new Response(textStreamFromString(`${fallback}${minorLine}`), { headers });
    }
  }

  // Respond to a FIRST-contact crisis/suicide_concern with the AI-tailored reply only
  // (or a fresh re-escalation after exit/de-escalation — crisisModeActive is false
  // then). While ALREADY in an active crisis session, do NOT re-dump the identical
  // template on every triggering turn (robotic + re-traumatizing). Instead fall
  // through to the model path, which replies in context under the crisis-safety
  // prompt (activateCrisisSessionRisk) while the crisis banner keeps the real
  // hotlines one tap away (X-Crisis-Triggered, set on the normal path below).
  if (risk.shouldEscalate && !crisisModeActive) {
    logFireAndForget("lexicon_crisis", stubImplicit, stubDecision);
    return await respondTailoredCrisis("crisis", risk, "lexicon");
  }

  // NOTE: lexicon suicide_concern (medium) NO LONGER short-circuits here. Firing the
  // full number-grading block on a bare keyword over-triggered on ordinary distress
  // idioms — "快撑不住了" got the same clinical grading as real ideation (2026-06-24
  // eval, finding #1). It is now handled AFTER the implicit danger judge below: the
  // judge weighs intent+severity, so judge-cleared ordinary distress gets a warm
  // gentle check instead of the cold grading, while a Kimi outage / unconfigured judge
  // still fires the template (fail-safe — a lexicon suicide signal is never released blind).

  // NOTE: medication / diagnosis / medical_red_flag boundary replies USED to short-
  // circuit here, before the LLM judge ran. That let a brittle keyword match (e.g.
  // "安眠药" in "我把整瓶安眠药都吞了") pre-empt a real crisis. They now run AFTER the
  // judge (below), so danger judgment wins; see the reordered branches past the
  // implicit block.

  // -------- Implicit-risk layer (LLM semantic detection) — now PRIMARY danger judge --------
  //
  // The lexicon catches explicit signals. The synthesis in
  // docs/model-quality-evaluation-2026-05-14.md and the broader research
  // landscape both identify implicit/paraphrased ideation as the largest
  // remaining safety gap. We block here, before DeepSeek streams, so the
  // model never gets a chance to produce hyper-validating content in
  // front of a subtly-suicidal user.
  //
  // Order-of-effects:
  //   - Only the explicit CRISIS / suicide_concern floor returned above.
  //     medication / diagnosis / medical_red_flag are deferred to AFTER this
  //     judge, so danger judgment can override a brittle keyword short-circuit.
  //   - assessImplicitRiskWithLLM looks at the last 8 turns, returns a
  //     three-layer assessment (C-SSRS severity + pragmatic form +
  //     modifiers), and tags evidence spans.
  //   - decideImplicitIntercept applies over-triage policy: pragmatic
  //     non-self releases; plan_preparation/imminent_acute/post_attempt
  //     fire crisis; passive_death_wish / suicidal_ideation / NSSI fire
  //     suicide_concern; low-confidence non-imminent cases release.
  //   - Fail-safe: classifier error + lexicon=none → release;
  //     error + lexicon=low → conservative suicide_concern.
  // After an explicit exit, the implicit (LLM) gate must also judge THIS message
  // alone — otherwise it still sees the earlier crisis context in the history and
  // intercepts the first post-exit message with a safety template (the off-by-one
  // "still in safety mode for one more turn"). A genuinely risky current message is
  // still caught because it's the one being classified.
  const implicitOutcome = await assessImplicitRiskWithLLM(body.exitedCrisis ? [latestUserMessage] : messages);
  const implicitDecision = decideImplicitIntercept(implicitOutcome, risk);
  const mergedRisk = mergeImplicitWithLexicon(risk, implicitOutcome);

  // Same first-contact rule as the lexicon branches: don't re-dump a template from
  // the implicit layer while already in an active crisis session — engage in context.
  if (implicitDecision.intercept && !crisisModeActive) {
    if (implicitDecision.mode === "crisis") {
      logFireAndForget("implicit_crisis", implicitOutcome, implicitDecision);
      return await respondTailoredCrisis("crisis", mergedRisk, implicitDecision.source);
    }
    if (implicitDecision.mode === "gentle_check") {
      // Judge-only medium signal on an otherwise-benign message (e.g. it over-triaged
      // plain "我好伤心"): a warm safety check instead of the cold number-grading — and
      // instant (fixed text, no model round-trip, so it also kills the ~30s crisis-path
      // latency these false positives used to incur). Hotlines stay in the global footer.
      logFireAndForget("implicit_gentle_check", implicitOutcome, implicitDecision);
      return new Response(textStreamFromString(createGentleCheckResponse(undefined, language)), {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
      });
    }
    const route: DecisionRoute =
      implicitDecision.source === "fail_safe" ? "implicit_fail_safe" : "implicit_suicide_concern";
    logFireAndForget(route, implicitOutcome, implicitDecision);
    return await respondTailoredCrisis("suicide_concern", mergedRisk, implicitDecision.source);
  }

  // Lexicon flagged suicide_concern but the implicit judge did NOT intercept above.
  // This is where the eval-#1 over-trigger is fixed: branch on whether the judge
  // actually ran.
  //   - judge unavailable/errored (kind !== "ok") → fire the full template (FAIL-SAFE:
  //     never release a lexicon suicide signal blind during a Kimi outage / no key —
  //     this preserves the exact pre-change behavior whenever the judge can't speak).
  //   - judge ran and read it as ordinary distress (kind === "ok", no intercept) → the
  //     idiom is everyday venting ("快撑不住了"), so soften to a WARM gentle check-in
  //     instead of the clinical number-grading. A genuinely risky message would have
  //     been intercepted by the judge block just above.
  if (risk.flags.includes("suicide_concern") && !crisisModeActive) {
    if (implicitOutcome.kind !== "ok") {
      logFireAndForget("lexicon_suicide_concern", implicitOutcome, implicitDecision);
      return await respondTailoredCrisis("suicide_concern", mergedRisk, "lexicon");
    }
    logFireAndForget("implicit_gentle_check", implicitOutcome, implicitDecision);
    return new Response(textStreamFromString(createGentleCheckResponse(undefined, language)), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }

  // Reordered scope-boundary replies — reached only AFTER the danger judge cleared
  // the message. Had the judge seen danger it already returned crisis/suicide_concern
  // above, so "我把整瓶安眠药都吞了" can no longer be short-circuited into a medication
  // reply. medical_red_flag reads mergedRisk so the JUDGE (not only the lexicon) can
  // raise it.
  if (risk.flags.includes("medication_request")) {
    logFireAndForget("lexicon_medication", implicitOutcome, implicitDecision);
    return new Response(textStreamFromString(createMedicationBoundaryResponse(language)), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }

  if (risk.flags.includes("diagnosis_request")) {
    logFireAndForget("lexicon_diagnosis", implicitOutcome, implicitDecision);
    return new Response(textStreamFromString(createDiagnosisBoundaryResponse(language)), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }

  if (mergedRisk.flags.includes("medical_red_flag")) {
    logFireAndForget("lexicon_medical_red_flag", implicitOutcome, implicitDecision);
    return new Response(textStreamFromString(createMedicalRedFlagResponse(language)), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }

  logFireAndForget("deepseek_normal", implicitOutcome, implicitDecision);

  const plan = body.turnPlan ?? defaultTurnPlan();
  const caseMap = body.caseMap ?? null;

  const knowledge = await retrieveKnowledge(
    [
      body.profile?.concern,
      latestUserMessage.content,
      caseMap?.presenting,
      caseMap?.workingHypothesis,
      ...(caseMap?.triggers ?? []),
      ...(caseMap?.automaticThoughts ?? [])
    ]
      .filter(Boolean)
      .join(" "),
    4
  );

  // Long-conversation memory: keep recent turns verbatim within the char budget,
  // and inject a compact digest of the EARLIER user statements (names, facts,
  // safety-relevant history) so they survive once the conversation scrolls past the
  // recent window instead of being silently dropped. Wires up the chat-window
  // machinery that existed but was previously unused. Short chats: recent = all,
  // digest = "" → no change. (The danger judge still sees full history separately.)
  const recentMessages = takeRecentWithinBudget(messages);
  const earlierUserContext = buildEarlierUserDigest(messages, recentMessages.length);

  // Stay in safety mode during a recent-crisis window WITHOUT re-sending the
  // template: the model gets danger-level guidance, but the reply stays natural.
  const promptRisk = crisisModeActive ? activateCrisisSessionRisk(mergedRisk) : mergedRisk;

  const systemPrompt = buildCounselorSystemPrompt({
    profile: body.profile,
    risk: promptRisk,
    knowledge,
    caseMap,
    turnPlan: plan,
    scaleResults: body.scaleResults,
    persona,
    pace: resolveSessionPace(body.pace),
    language,
    earlierUserContext
  });

  const payload = buildDeepSeekPayload({
    systemPrompt,
    messages: recentMessages,
    model,
    apiModel: resolveApiModelForPace(body.pace), // deep→v4-pro, fast→v4-flash
    stream: true
  });

  // On a continuation crisis turn (engaging in context instead of re-dumping the
  // template), keep the crisis banner up so the real hotlines stay one tap away —
  // the deterministic safety floor while the reply itself is model-generated.
  const crisisHeader = crisisModeActive ? { "X-Crisis-Triggered": "1" } : undefined;

  // Visible RAG: tell the client which knowledge cards were actually consulted for
  // this reply, so the UI can show "数据来源" with clickable, checkable links. URL-
  // encoded JSON (headers are latin-1; titles are Chinese). Only cards with a real
  // source are surfaced.
  const refs = knowledge
    .filter((k) => k.sourceUrl)
    .map((k) => ({ title: k.title, source: k.sourceTitle, url: k.sourceUrl, quote: k.sourceQuote }));
  const knowledgeHeader = refs.length
    ? { "X-Knowledge": encodeURIComponent(JSON.stringify(refs)) }
    : undefined;

  // Deep tier streams the model's reasoning ("思考过程") as a leading block the
  // client shows in a collapsible panel — this is what makes 深度 vs 快速 visible.
  // Never during an active crisis (keep those replies fast + free of raw risk
  // deliberation): fall back to the plain content-only cleaning path.
  const pace = resolveSessionPace(body.pace);
  const wantThinking = pace === "deep" && !crisisModeActive;
  const replyHeaders = { ...crisisHeader, ...knowledgeHeader, "X-Pace": pace };

  try {
    const raw = await createDeepSeekTextStream(payload, { includeReasoning: wantThinking });
    const styled = wantThinking
      ? createAssistantTextStreamWithThinking(raw)
      : sanitizeReplyStream(createAssistantTextStream(raw));
    return streamTextResponse(styled, replyHeaders);
  } catch {
    return new Response(createProviderErrorFallback(), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...crisisHeader }
    });
  }
}
