# Information-response contract follow-up

This is a development regression after an actual local HTTP response exposed a generation problem. It is separate from the original 18-case first run. The original live response was observed by the parent task; no provider reasoning is reproduced here.

Trigger: `CBT 是什么？适合在什么情况下找专业人士了解？`

Observed problem: the answer inferred private motives and feelings, ended with therapeutic questions, and offered help-seeking criteria even though the retrieved CBT card did not cover those criteria. The system prompt simultaneously required an emotional opening, a default person-centered plan, and avoidance of the CBT term itself.

Changes:

- Explicit information requests and anchored information follow-ups now select a separate information prompt. The server does not inject therapy persona, supervisor plan, case formulation, or mandatory emotional opening/closing instructions into that prompt. Ordinary support requests keep the existing support prompt. Medium/high risk and active crisis cannot select information mode; scale safety cues remain.
- Information responses must answer each subquestion from supplied evidence. Missing coverage is stated explicitly. A general definition does not establish individual suitability or help-seeking criteria. Card guidance is omitted in this mode; source facts and honest review status remain.
- The controlled query vocabulary now preserves the help-seeking facet in compound definition/help questions. Actual local retrieval for the trigger returns `ref-help-impact`, `ref-cbt-connections`, `ref-insomnia-help`, `ref-therapist-fit`; the first two cover the requested definition and general help-seeking information. The latter two are weaker matches, so claim-level relevance constraints remain necessary. This does not prove the cards support individual CBT suitability.
- The Chinese and English medical boundary templates no longer attribute an entire symptom/history checklist to the user, and no longer suggest slow exhalation while awaiting help. Current significant/sudden chest pain or breathing difficulty gets immediate local emergency/urgent-care direction; the text explicitly says not to wait for chat or relaxation. The template retains the inability to identify the cause. Chest-pain urgency was checked against [NHS chest pain](https://www.nhs.uk/symptoms/chest-pain/).

Validation:

`npm test -- --run src/lib/prompts.test.ts src/lib/knowledge-query.test.ts src/lib/knowledge-reference.test.ts src/lib/safety.test.ts src/app/api/chat/route.test.ts`

5 files, 154 tests passed. The new tests inspect the real POST-generated provider payload in fast and deep modes, forced partial/missing evidence, the local compound-query result, support-style preservation, current/scale safety priority, and both medical-template languages. Generation is mocked; this verifies the prompt contract and wiring, not model obedience or clinical effectiveness.

`npx tsc --noEmit` passed. Targeted ESLint passed with two existing unused-import warnings in the route (`stripLeadingPreface`, `summarizeOlderConversation`); `git diff --check` passed. No live model requests or deployment were performed by this task. The parent task owns a fresh build and real HTTP recheck; an already-running production build must be rebuilt to include these changes.

## Follow-up: numerical evidence requests

The parent task's next live check found that the compound CBT question improved, but `CBT 的准确治愈率是多少？请给出一个百分比。` still entered support mode. The classifier recognized neither numerical evidence requests nor some efficacy variants. This was a classification gap, not evidence that the definition card supports a cure percentage.

Added a general evidence-metric plus question/request detector for efficacy, cure/success/recurrence rates, side effects, risk, probability, percentages, and English counterparts. A controlled statistical facet is retained in the query. Merely mentioning a percentage while declining advice remains support. The information contract now states that absent numbers must be acknowledged directly, without invented estimates, proxy metrics, or unsourced explanations about study/population differences.

Targeted follow-up validation: `npm test -- --run src/lib/knowledge-query.test.ts src/lib/prompts.test.ts src/app/api/chat/route.test.ts` — 3 files, 90 tests passed; `npx tsc --noEmit` and `git diff --check` passed. This includes 10 distinct numerical/efficacy expressions and both actual API pace paths with definition-only evidence. The provider is mocked, so a fresh live generation check remains with the parent task.
