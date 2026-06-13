# Clinical-review bundle — deterministic cue lists (P4-B + P5-C)

**Status: NOT shipped. Held for term-by-term clinical sign-off before integration.**

These are the only pieces of the detection upgrade that add **deterministic
wordlist/regex** to `safety.ts`. Per the standing rule (clinical suicide-detection
wordlist/regex changes require human review), they are not auto-committed.

## Why these are held (and the prompt few-shots were not)

The Kimi few-shots shipped in `6e0c3d3` already cover every pattern below
**semantically, with context**. The deterministic versions are a fail-closed
backstop for a Kimi outage — but a regex has no context, so each term carries
false-positive surface the small offline corpus cannot catch.

Worked example — perinatal dyadic `带X一起走`:
- **Kimi few-shot T (shipped):** fires only on the *exit framing* — `带着宝宝一起走可能对他更好` co-occurring with 产后绝望/不想活. Reads context. Safe.
- **Deterministic `带孩子一起走` (held):** would fire on `带孩子一起走亲戚` (take the kids to visit relatives), `周末带孩子一起走走` (go for a walk with the kids) — a hugely common benign phrase. Needs the negative guards below implemented as real code AND a clinician to confirm the guard set is complete.

That gap is the whole reason for review. Recommended posture: ship the Kimi
layer now (done), add the deterministic backstop after sign-off.

## Source specs (full term lists + guards)

- `_DETECTION_UPGRADE/P4-guards-cues.json` → `cueLists` (6 groups) + `demographicFewShots` (deterministic-pattern notes)
- `_DETECTION_UPGRADE/P5-english.json` → `englishCodedCues` (the `accumulator-cue` tier ones)

## What needs sign-off, grouped by FP risk

### Group 1 — LOWEST FP risk, recommend approve first
- **post_attempt_recurrence (zh/en)** — `上次没成功`, `救回来其实我有点失望`, `这次想做得更彻底`, `i woke up and was still alive`, `disappointed i survived` … These are specific enough that benign collisions are rare. Guards: third-party/news/fiction frames. Tier: post_attempt_disclosure severity; +recurrence → HIGH.

### Group 2 — MEDIUM FP risk, review guards carefully
- **rehearsal_aborted_attempt (zh/en)** — `刀架在手腕上`, `绳子套上了`, `差一点就`, `held the knife to my wrist`, `chickened out at the last second` … Guards needed: acting/rehearsal (彩排+话剧/演出), first-aid/training (演练+急救/CPR), cooking/tools (刀+切菜/做饭). Tier: accumulator-only, 2+ cues → MEDIUM, +means/isolation → HIGH.
- **means_method_extended (zh/en)** — `卧轨`, `百草枯`, `氦气球`, `跳黄浦江`, `clonazepam whole bottle`, `car exhaust` … Guards needed: news/case/research, occupational/lab (液氮/氦气+实验/工厂/party balloons), place-as-travel (黄浦江+旅游/通勤), prescribed-use & diabetes-care carve-outs. Tier: a method NAME alone must NOT hard-HIGH (often informational); +1 implicit cue → MEDIUM, +isolation/imminence → HIGH.

### Group 3 — HIGHEST FP risk, needs the most guard work
- **Demographic deterministic patterns** — especially perinatal `带X一起走/一起解脱` (the worked example above) and elderly `拖累儿女/省得伺候`. The elderly burden phrasing is comparatively safe; the perinatal dyadic phrasing is the riskiest single pattern and must keep the exit-framing requirement, never bare `带孩子一起走`.
- **English accumulator coded cues** — `unalive`, `kms`, `end it all`, `slit my wrists`. ALL are heavily overloaded by gaming/hyperbole. Spec already marks them `accumulator-cue` (NOT bare-HIGH) with guards (kms-lol/gaming, unalive-as-meta, slit-wrists-as-lifesteal, end-it-as-relationship). Firing HIGH on bare `kms` would flood FPs — must stay accumulator-only.

## Integration plan once approved
1. Implement per-group as accumulator cues (group=means/burden/isolation/hopelessness) with the negative guards as real predicates, NOT bare `includes()`.
2. After EACH group: run the full gate (tsc + suite + crisis-corpus FP threshold + red-team ratchet REDTEAM_FP_BOUND, currently 6) and the baseline report. Drop any group that regresses FP.
3. Expand the red-team/seed corpus with the new benign-look-alikes for each group so the guards are themselves tested.
