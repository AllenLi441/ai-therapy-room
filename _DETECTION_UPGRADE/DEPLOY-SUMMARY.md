# 危险识别升级 — deploy summary

**Patch:** `_DETECTION_UPGRADE/detection-upgrade-FULL.patch` (apply onto deploy
base `1ccef94`). Branch: `claude/detection-upgrade`, HEAD `843305b`.
**Gate:** `tsc` clean · 369/369 tests pass · crisis-corpus FP threshold green ·
red-team adversarial FP ratchet held at 6.

## What ships (7 commits, P0→P6 minus deterministic cues)

| # | Layer | Change | Why it matters |
|---|-------|--------|----------------|
| P0 `195ceb7` | eval | 172-case seed corpus + per-category deterministic baseline harness | objective ruler; froze pre-upgrade recall/FP |
| **P1 `928786e`** | infra | **closed 2 silent bypasses**: flash-mode no longer skips the implicit screen; Kimi call retries once + warns on persistent failure | **biggest real recall win** — the semantic layer was being skipped entirely in fast mode |
| P2 `d60c40d` | routing | `gentle_check` soft tier between silent-release and full crisis | makes high recall affordable — detection ≠ flooding every user with hotlines |
| P3 `29699c1` | matching | NFKC + Traditional→Simplified + anti-insertion normalization | catches 繁体/全角/zero-width/spaced obfuscation |
| P4-A `f421548` | guard | means-aware crisis de-escalation (药还在床边 can't release crisis) + objective-label denial carve-out | fixes the correctness bug where a calm tone released an active-means crisis |
| P4-C/P5 `6e0c3d3` | semantic | demographic few-shots (elderly/perinatal/chronic/teen/LGBTQ) + full English coverage (HARD self-disguise rule + 24 few-shots + coded slang) | "catch every tendency" — the recall breadth, context-aware |
| P6 `843305b` | eval | red-team adversarial corpus wired into harness + FP ratchet | locks precision against regression |

## Verification status — read before deploy

- **Deterministic layer (safety.ts):** fully offline-tested. 0 FP regressions; crisis-corpus + red-team gates green. Safe to deploy.
- **Semantic layer (implicit-risk.ts CLASSIFIER_SYSTEM):** the prompt few-shots are validated **structurally only** — the offline suite mocks Kimi, so the suite proves nothing broke but does NOT measure live recall/precision of the new few-shots. **Recommended:** one live eval pass over the seed + red-team corpora against the real Kimi endpoint before/after deploy to confirm the recall lift and watch for prompt-induced FPs. The few-shots are downstream-gated (decideImplicitIntercept evidence/confidence thresholds + gentle_check soft tier), so the blast radius of an over-trigger is a gentle check-in, not a hotline flood.

## Baseline numbers (deterministic-only, Kimi NOT exercised)

- seed corpus: lexicon recall 26/124 (21%), FP 11/48 (23%) — the 79% recall gap is exactly what the (now-un-bypassed) Kimi layer is for.
- red-team corpus: deterministic recall 15/32 (47%, low by design), benign-look-alike FP 6/12 (ratcheted).

These are deterministic-floor numbers; full-stack recall (with Kimi) is higher and is the live-eval item above.

## Held for clinical sign-off (NOT in the patch)

`_DETECTION_UPGRADE/CLINICAL-REVIEW-BUNDLE.md` — the deterministic cue lists
(P4-B 6 groups + P5-C English coded cues, ~150 terms). Held because each adds
context-free regex with FP surface the offline corpus can't cover (e.g. perinatal
`带孩子一起走` collides with "带孩子一起走亲戚"). The Kimi layer already covers
these patterns with context; the deterministic versions are a Kimi-outage backstop
to add after term-by-term review.

## Apply

```bash
git -C <deploy-line-worktree> checkout 1ccef94    # or rebase the patch onto current deploy HEAD
git -C <deploy-line-worktree> apply --3way /path/to/detection-upgrade-FULL.patch
# verify
npx tsc --noEmit && npm test
```
If the deploy line has drifted past `1ccef94`, apply with `--3way` and resolve, or
cherry-pick the 7 commits from `claude/detection-upgrade`.
