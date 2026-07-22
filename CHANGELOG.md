# Changelog

This file records every version that can be verified from the repository's
original commit history. Versions that were never released are not backfilled.

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
