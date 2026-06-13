import { appendDecisionLog, buildDecisionLogEntry, type DecisionRoute } from "@/lib/decision-log";
import { sanitizeConversation } from "@/lib/conversation-window";
import { buildDeepSeekPayload, createDeepSeekTextStream } from "@/lib/deepseek";
import { streamTextResponse, textStreamFromString } from "@/lib/http";
import {
  assessImplicitRiskWithLLM,
  decideImplicitIntercept,
  mergeImplicitWithLexicon,
  type ImplicitDecision,
  type ImplicitOutcome
} from "@/lib/implicit-risk";
import { retrieveKnowledge } from "@/lib/knowledge";
import { createAssistantTextStream } from "@/lib/output-style";
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
  createDiagnosisBoundaryResponse,
  createGentleCheckResponse,
  createMedicationBoundaryResponse,
  createMedicalRedFlagResponse,
  createMinorSupportLine,
  hasMinorContextCue,
  createSuicideConcernResponse,
  detectActiveCrisisFromHistory
} from "@/lib/safety";
import { resolveDeepSeekModel, type DeepSeekModelId, type SessionPaceId } from "@/lib/model-options";
import type {
  CaseMap,
  ChatMessage,
  AppLanguage,
  IntakeProfile,
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

  if (risk.shouldEscalate) {
    logFireAndForget("lexicon_crisis", stubImplicit, stubDecision);
    return new Response(textStreamFromString(createCrisisResponse(risk, { continuation: crisisModeActive, language })), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }

  if (risk.flags.includes("suicide_concern")) {
    logFireAndForget("lexicon_suicide_concern", stubImplicit, stubDecision);
    return new Response(textStreamFromString(createSuicideConcernResponse(language)), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }

  if (risk.flags.includes("medication_request")) {
    logFireAndForget("lexicon_medication", stubImplicit, stubDecision);
    return new Response(textStreamFromString(createMedicationBoundaryResponse(language)), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }

  if (risk.flags.includes("diagnosis_request")) {
    logFireAndForget("lexicon_diagnosis", stubImplicit, stubDecision);
    return new Response(textStreamFromString(createDiagnosisBoundaryResponse(language)), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }

  if (risk.flags.includes("medical_red_flag")) {
    logFireAndForget("lexicon_medical_red_flag", stubImplicit, stubDecision);
    return new Response(textStreamFromString(createMedicalRedFlagResponse(language)), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }

  // -------- Implicit-risk layer (LLM semantic detection) --------
  //
  // The lexicon catches explicit signals. The synthesis in
  // docs/model-quality-evaluation-2026-05-14.md and the broader research
  // landscape both identify implicit/paraphrased ideation as the largest
  // remaining safety gap. We block here, before DeepSeek streams, so the
  // model never gets a chance to produce hyper-validating content in
  // front of a subtly-suicidal user.
  //
  // Order-of-effects:
  //   - Lexicon-handled branches above ALREADY returned. We only reach
  //     here when the explicit layer thinks the message is benign.
  //   - assessImplicitRiskWithLLM looks at the last 8 turns, returns a
  //     three-layer assessment (C-SSRS severity + pragmatic form +
  //     modifiers), and tags evidence spans.
  //   - decideImplicitIntercept applies over-triage policy: pragmatic
  //     non-self releases; plan_preparation/imminent_acute/post_attempt
  //     fire crisis; passive_death_wish / suicidal_ideation / NSSI fire
  //     suicide_concern; low-confidence non-imminent cases release.
  //   - Fail-safe: classifier error + lexicon=none → release;
  //     error + lexicon=low → conservative suicide_concern.
  const implicitOutcome = await assessImplicitRiskWithLLM(messages);
  const implicitDecision = decideImplicitIntercept(implicitOutcome, risk);
  const mergedRisk = mergeImplicitWithLexicon(risk, implicitOutcome);

  if (implicitDecision.intercept) {
    if (implicitDecision.mode === "crisis") {
      logFireAndForget("implicit_crisis", implicitOutcome, implicitDecision);
      return new Response(
        textStreamFromString(createCrisisResponse(mergedRisk, { continuation: crisisModeActive, language })),
        {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Risk-Level": "high",
            "X-Crisis-Triggered": "1",
            "X-Crisis-Source": implicitDecision.source
          }
        }
      );
    }
    const route: DecisionRoute =
      implicitDecision.source === "fail_safe" ? "implicit_fail_safe" : "implicit_suicide_concern";
    logFireAndForget(route, implicitOutcome, implicitDecision);
    return new Response(textStreamFromString(createSuicideConcernResponse(language)), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Risk-Level": "medium",
        "X-Implicit-Risk-Source": implicitDecision.source
      }
    });
  }

  logFireAndForget("deepseek_normal", implicitOutcome, implicitDecision);

  const plan = body.turnPlan ?? defaultTurnPlan();
  const caseMap = body.caseMap ?? null;

  const knowledge = retrieveKnowledge(
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
    language
  });

  const payload = buildDeepSeekPayload({
    systemPrompt,
    messages,
    model,
    stream: true,
    maxTokens: 900
  });

  try {
    return streamTextResponse(createAssistantTextStream(await createDeepSeekTextStream(payload)));
  } catch {
    return new Response(createProviderErrorFallback(), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
}
