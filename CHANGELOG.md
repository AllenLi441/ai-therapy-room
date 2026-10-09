# Changelog

This file records every version that can be verified from the repository's
original commit history. Versions that were never released are not backfilled.

## [v1.2.1] - 2026-10-09

- Shorten the sharing question to one line ("愿意让我们用你的对话来改进静室吗？") plus "可以随时在设置里关闭。", in all eight languages.
- Add "换一批" under the three welcome openers: three new random ones, never repeating those on screen.

## [v1.2.0] - 2026-10-07

- Replace per-conversation donation with one choice in the opening consent: "用我的对话帮助改进静室", 同意 or 不同意 (neither preselected; one is required to enter). Agreeing needs an age of 18+, or under 18 with "I'm 14 or older" ticked; under-14s cannot agree.
- After agreeing, every conversation, crisis turns included, is uploaded after each reply: one row per conversation, replaced as it grows (upsert on a random id kept in the browser), masked on the server. Needs UPDATE on the table: `grant update on table public.donations to service_role;`.
- Add Settings (gear in the top bar): the sharing choice, "删除我已上传的对话", age range, support region, language and theme.
- Remove the donate buttons and the review panel. Consent version 4, so everyone sees the opening screen once more and makes the choice.

## [v1.1.0] - 2026-10-06

- Add opt-in conversation donation for building our own dataset. From a saved session (after "今天先到这里" or in past conversations), a donor sees a preview with phone numbers, ID numbers, emails, QQ/WeChat IDs, names and long numbers masked, can untick any message, picks an age range (18+ or 14–17; under 14 cannot donate) and ticks an explicit consent. Sessions that went through a crisis or suicide-concern intervention are not offered. The server masks again and stores the rows in a private Supabase table (RLS on, no policies, no anon/authenticated grants; `docs/supabase-donations.sql`). No IP, device or account is stored. Each donation gets a random id kept in the donor's browser to withdraw it, which deletes the row.
- Off unless `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `NEXT_PUBLIC_DONATIONS=1` are set.
- Saved sessions now keep each reply's safety label (it was dropped when history was read back).
- Reword the no-quotes rule in the counselor prompt with positive examples only. A live 1.0.0 reply left a broken phrase (那种的感觉) where the old rule showed a placeholder pattern; local samples showed it in 0/20 replies with either wording, so the effect is not proven.

## [v1.0.0] - 2026-10-06

- Add six interface languages beside 简体中文 and English: 繁體中文, 日本語, 한국어, Español, Français and Deutsch, chosen from a language menu. Each has a full interface dictionary, fixed safety texts (crisis, gentle check, medical, medication and diagnosis boundaries), localized support-region labels, and replies in that language. PHQ-9, GAD-7 and ISI stay in Chinese and English only.
- Recognize explicit first-person suicide and self-harm wording in the new languages as medium risk, so those turns always wait for the danger judge; 繁體 input is folded onto the simplified lexicon with a fuller character map.
- Replace the three fixed welcome openers with 100 per language and audience (teen pool for under 18; adult pool for 18+ and not chosen), three drawn at random on each visit; once there are saved past sessions, openers sharing topic words with them come first (matched in the browser with Intl.Segmenter; everyday words ignored). All 1,600 pass the risk lexicon without escalation (starters.test.ts).
- Turn thinking off by default for both 深度 and 快速. Live timing on 2026-10-06: 深度 with "high" took 16.3s (12.7s thinking) against 4.2s with thinking off, with no better reply. The selector still lets users turn it on.
- Stop the reply from parroting a fixed closing question ("你最希望我先听见的是哪一段？") that the default turn plan injected as a must-follow instruction; stop encouraging "我在听"; don't fill in details the user did not say; avoid "不只是X，更是Y" phrasing.
- Add voice input through the browser's own speech recognition (Safari, Edge, Chrome where reachable). The text goes into the input box for review and is never sent automatically; the button is hidden where the browser has no recognition.
- Center the attach button and the new voice button on the input line.

## [v0.12.0] - 2026-10-04

- Add a teen mode (12–18) to the counselor prompt: plain, non-lecturing language and concrete guidance for exam stress, family conflict and abuse, bullying and cyberbullying, self-harm, romance, body image and eating, sleep, phones and games, plus clear boundaries (no diagnosis, medication advice, running away or secrecy promises).
- Add 9 source-verified teen knowledge cards (WHO, NIMH, NHS, CDC): adolescent mental health, exam stress, bullying and cyberbullying, signs of teen depression, self-harm help, teen sleep, eating disorders, gaming disorder, and bereavement. Each is an AI-written Chinese paraphrase checked against the primary source on 2026-10-05 and remains pending professional review. Tests retrieve them through the route's own topic-query builder.
- When a teen explicitly asks "怎么办 / 有什么方法 / 正常吗", give one or two concrete, doable suggestions (preferring the supplied card) after acknowledging feelings, instead of only asking back.
- Teen mode also covers online grooming and sextortion (don't send, keep screenshots, block and report, tell a trusted adult, never pay; 110 / 12355) and states that the assistant will not role-play a boyfriend or girlfriend.
- Turn teen mode on when the user chooses "under 18", or when no age is chosen but recent messages carry school-age cues (月考, 班主任, …); an explicit adult choice always wins.
- Answer privacy questions truthfully: the assistant cannot contact anyone, history stays in this browser, and messages are processed by the server and model to produce a reply. A live probe had previously claimed it would "make an exception" and tell an adult.

## [v0.11.0] - 2026-10-04

- Add a thinking selector beside 深度/快速: off / low / high / max, mapped to DeepSeek `reasoning_effort` (defaults: quick off, depth high). Active crisis turns and internal calls (judge, crisis reply, summary) never think.
- Stop sending the model's reasoning text to the browser: it contained internal risk judgments and system-prompt guidance. The stream now carries only thinking-phase markers and the UI shows "思考了 N 秒".
- Size the provider timeout by thinking state (30s, 45s at max) instead of by model name.

## [v0.10.0] - 2026-10-04

- Judge implicit risk with DeepSeek first (median 1.6s, so the fast tier's 5s parallel budget no longer drops verdicts); Kimi becomes an optional backup, and `/api/health` reports the effective `judgePrimary`.
- Stop releasing self-directed coded speech: `emoji_coded`, `coded_euphemism` and `uncertain_ambivalent` judge results now go through the severity ladder instead of being treated as "not about the user" (e.g. "今晚🪦见" labelled plan_preparation was previously released).
- Recognize perceived burdensomeness, wished non-existence and wished not-waking as death cues for passive ideation; a confident (≥0.7) passive call without a listed cue now gets a warm gentle check instead of release.
- Re-baseline the 344-unit detection set and add a frozen 110-unit teen holdout; see `docs/SAFETY_REBASELINE_20261004.md`. Labels are AI-authored and not clinically validated.

## [v0.9.0] - 2026-09-14

- Add 40 primary-source checked general-information cards from 22 authoritative sources, with explicit use limits and pending professional review.
- Answer information requests directly from supplied evidence; separate them from counseling prompts, preserve short follow-up topics, and honor requests to listen without advice.
- Handle missing evidence for efficacy rates and other factual questions without inventing numbers, explanations, or personal motives.
- Validate source domains and vector content versions, share retrieval deadlines, and label the reference panel accurately.
- Strengthen deterministic medical and indirect-crisis routing and remove unmentioned symptom histories from the medical response.
- Add regression coverage and retain actual failed cases and their corrected outcomes; these checks do not establish clinical effectiveness.

## [v0.7.9] - 2026-07-22

- Route the production Kimi text judge and image understanding through the existing SiliconFlow embedding account, using `moonshotai/Kimi-K2.5` for both modalities.
- Keep direct Moonshot credentials only as an explicit evaluation/emergency fallback, so an evaluation embedding key cannot silently replace the dedicated judge key.
- Expose the effective Kimi provider/model in `/api/health` without exposing credentials.

## [v0.7.8] - 2026-07-22

- Correct the connection policy to at most three total transport attempts and raise the default connect timeout from 300ms to 1500ms so normal cross-region handshakes are not self-induced failures.
- Add deterministic referee, v4-pro reconciliation, passive-route, human-study, and publication-readiness audit gates.
- Keep human annotation explicitly pending until real annotators, ethics review, calibration, and adjudication are complete.
- Isolate batch-evaluation credentials from production API keys and expose the effective version/transport policy in `/api/health` for post-deploy proof.

## [v0.7.7] - 2026-07-16

- Added the `NET_CONNECT_TIMEOUT_MS` deployment knob while retaining the then-current 300ms default.
- Documented that `KIMI_API_KEY` is safety-critical because removing it bypasses the semantic judge instead of reaching its DeepSeek failure fallback.

## [v0.7.6] - 2026-07-16

- Switched resilient transport to undici's matching `fetch` implementation after the Next.js patched global fetch rejected a foreign dispatcher in v0.7.5.

## [v0.7.5] - 2026-07-16

- Added Kimi judge retry classification, a ten-minute circuit breaker, and DeepSeek backup.
- Added connection-phase retry and the first dual-referee/detection-arm evidence package.

## [v0.7.4] - 2026-07-08

- Put localized crisis hotlines directly in the always-visible crisis banner.
- Removed the numbered 1-4 check-in controls and the separate support sheet.
- Kept the one-tap crisis exit and the existing server-side safety floor.

## [v0.7.3] - 2026-07-08

- Published the first public open-source release of JINGSHI.
- Shipped the layered safety pipeline, dual-pace reply engine, verifiable RAG,
  bilingual crisis resources, and reproducible evaluation tooling together.
- Reset the public-release presentation after the private development cycle;
  this is why the verified version sequence moves from v0.6.0 to v0.7.3.

## [v0.6.0] - 2026-07-01

- Added the M2 corpus pipeline: fetch, clean, chunk, quote verification,
  approval gating, embedding, Qdrant upsert, and stale-source pruning.
- Ingested the first bilingual WHO, NIMH, and CDC slice: 160 approved chunks and
  20 pending suicide-related chunks requiring human sign-off.
- Added a calibrated fast-mode retrieval floor while preserving broad recall in
  deep mode for reranking.

## [v0.5.5] - 2026-07-01

- Removed the repeated numbered crisis-response quiz and trailing disclaimer.
- Preserved hotline numbers and escalation instructions.

## [v0.5.4] - 2026-06-29

- Restored a warmer chat surface by hiding routine safety and empty-source
  chrome on normal replies.
- Added intent-gated retrieval so pure emotional venting receives a direct,
  supportive response without unrelated evidence panels.

## [v0.5.3] - 2026-06-27

- Added cross-encoder reranking so displayed sources match the reply topic.
- Raised the cosine fallback threshold and made reranking fail safely when its
  provider is unavailable.

## [v0.5.2] - 2026-06-27

- Renamed the visible research panel to the clearer "Sources" label.
- Added an explicit empty state when a reply cites no external material.

## [v0.5.1] - 2026-06-26

- Generated real Qwen3 embedding vectors for the curated knowledge cards.
- Made semantic retrieval deployable while retaining keyword fallback.

## [v0.5.0] - 2026-06-25

- Added an authoritative-domain web-search fallback for deep-mode knowledge-base
  misses.
- Kept crisis turns and fast mode out of web search and exposed live sources to
  the user for verification.

## [v0.4.0] - 2026-06-25

- Made fast mode stream immediately while the danger judge runs concurrently.
- Added visible safety events and model latency caps.
- Preserved blocking safety checks for explicit danger, deep mode, crisis mode,
  and lexicon-flagged messages.

## [v0.3.2] - 2026-06-25

- Added a graded gentle-check tier for ambiguous passive-death language.
- Prevented ordinary sadness from triggering the full crisis template while
  retaining escalation for real death cues, intent, self-harm, or hard signals.

## [v0.3.1] - 2026-06-25

- Reduced crisis false positives by letting the danger judge resolve ambiguous
  distress idioms after the deterministic safety floor.

## [v0.3.0] - 2026-06-25

- Added a visible deep-mode reasoning-progress trace.
- Made the behavioral difference between deep and fast modes transparent.

## [v0.2.0] - 2026-06-25

- Replaced placeholder retrieval content with a researched 17-card evidence
  knowledge base and verbatim source quotations.
- Added the visible research process and a BGE-M3 vector-retrieval path.

## [v0.1.1] - 2026-06-24

- Stopped crisis replies from repeating the full grading block.
- Made scope-boundary replies lead with empathy before limitations.

## [v0.1.0] - 2026-06-24

- Added visible, verifiable RAG evidence cards with clickable sources and
  verbatim quotations.

## [v0.0.5] - 2026-06-24

- Removed forced either-or endings and other formulaic AI phrasing.
- Added a retrieval relevance floor.

## [v0.0.4] - 2026-06-24

- Gave safety-sensitive scales, including PHQ-9, routing priority.
- Restored byte-locked crisis-response snapshots.

## [v0.0.3] - 2026-06-24

- Localized emergency resources so English replies lead with international
  options instead of China-only numbers.

## [v0.0.2] - 2026-06-22

- Removed quote-wrapped filler from assistant replies.
- Replaced repeated hotline blocks with one dismissible crisis notice.

## [v0.0.1] - 2026-06-22

- Introduced the first user-visible semantic version in the application footer.
- This tag marks the first explicitly versioned build; earlier commits remain
  available in Git history as pre-version development.

[v0.7.8]: https://github.com/AllenLi441/ai-therapy-room/compare/v0.7.7...v0.7.8
[v0.7.7]: https://github.com/AllenLi441/ai-therapy-room/commit/f0fc273
[v0.7.6]: https://github.com/AllenLi441/ai-therapy-room/commit/ea4b27f
[v0.7.5]: https://github.com/AllenLi441/ai-therapy-room/commit/2f25dbd
[v0.7.4]: https://github.com/AllenLi441/ai-therapy-room/compare/v0.7.3...v0.7.4
[v0.7.3]: https://github.com/AllenLi441/ai-therapy-room/compare/v0.6.0...v0.7.3
[v0.6.0]: https://github.com/AllenLi441/ai-therapy-room/compare/v0.5.5...v0.6.0
[v0.5.5]: https://github.com/AllenLi441/ai-therapy-room/compare/v0.5.4...v0.5.5
[v0.5.4]: https://github.com/AllenLi441/ai-therapy-room/compare/v0.5.3...v0.5.4
[v0.5.3]: https://github.com/AllenLi441/ai-therapy-room/compare/v0.5.2...v0.5.3
[v0.5.2]: https://github.com/AllenLi441/ai-therapy-room/compare/v0.5.1...v0.5.2
[v0.5.1]: https://github.com/AllenLi441/ai-therapy-room/compare/v0.5.0...v0.5.1
[v0.5.0]: https://github.com/AllenLi441/ai-therapy-room/compare/v0.4.0...v0.5.0
[v0.4.0]: https://github.com/AllenLi441/ai-therapy-room/compare/v0.3.2...v0.4.0
[v0.3.2]: https://github.com/AllenLi441/ai-therapy-room/compare/v0.3.1...v0.3.2
[v0.3.1]: https://github.com/AllenLi441/ai-therapy-room/compare/v0.3.0...v0.3.1
[v0.3.0]: https://github.com/AllenLi441/ai-therapy-room/compare/v0.2.0...v0.3.0
[v0.2.0]: https://github.com/AllenLi441/ai-therapy-room/compare/v0.1.1...v0.2.0
[v0.1.1]: https://github.com/AllenLi441/ai-therapy-room/compare/v0.1.0...v0.1.1
[v0.1.0]: https://github.com/AllenLi441/ai-therapy-room/compare/v0.0.5...v0.1.0
[v0.0.5]: https://github.com/AllenLi441/ai-therapy-room/compare/v0.0.4...v0.0.5
[v0.0.4]: https://github.com/AllenLi441/ai-therapy-room/compare/v0.0.3...v0.0.4
[v0.0.3]: https://github.com/AllenLi441/ai-therapy-room/compare/v0.0.2...v0.0.3
[v0.0.2]: https://github.com/AllenLi441/ai-therapy-room/compare/v0.0.1...v0.0.2
[v0.0.1]: https://github.com/AllenLi441/ai-therapy-room/tree/v0.0.1
