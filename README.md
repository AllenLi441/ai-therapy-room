# 静室 JÌNGSHÌ

**An open-source, privacy-first Chinese AI mental-health companion — layered safety pipeline, verifiable RAG, and a fully reproducible evaluation suite.**

[English](#english) · [中文](#中文) · Live: [ai-therapy-room.vercel.app](https://ai-therapy-room.vercel.app)

> ⚠️ **Not medical care.** 静室 is an AI companion for emotional support. It is not psychotherapy, not a medical device, and has **no clinical validation**. If you are in danger, call your local emergency number (mainland China: 110/120; psychological support hotline 12356).

---

## English

### What is this?

静室 ("Quiet Room") is a self-hostable web app for talking through feelings with an AI companion, in Chinese or English. No accounts, no server-side chat storage — conversations live only in the visitor's browser and can be wiped with one tap.

It is built around three engineering commitments:

1. **Safety is layered, and deterministic where it matters.** Every turn passes a lexicon floor plus an LLM risk judge (C-SSRS-informed severity ladder, multi-turn aggregation). Crisis support is delivered through always-on UI — a crisis banner with tappable hotlines, a 1–4 check-in row, a support sheet — driven by response headers, not by boilerplate text a model may forget to produce.
2. **RAG must be verifiable.** Grounded replies cite real sources (PubMed / WHO / CDC / PMC) with clickable URLs and verbatim quotes, visible to the user. No source, no claim.
3. **Privacy by default.** API keys stay server-side; the server keeps no conversation history.

### Architecture

```
Next.js (App Router, node runtime)
 ├─ /api/chat   dual-pace reply engine
 │    ├─ fast   flash tier + parallel safety judge (trailing event), ~6s replies
 │    └─ deep   pro tier + blocking judge + visible reasoning panel
 ├─ safety      lexicon floor → Kimi-K2.5 via SiliconFlow (DeepSeek fallback) → routing policy
 ├─ RAG         tier-1 Qdrant dense (+rerank in deep) → committed vectors → keyword
 └─ UI          crisis banner / support sheet / per-reply feedback / zh+en / light+dark
```

### Quick start

```bash
npm install
cp .env.example .env.local   # DEEPSEEK_API_KEY + SiliconFlow EMBEDDING_API_KEY (Kimi/RAG); optional QDRANT_*
npm run dev                  # or: npm run build
```

Deploys to Vercel out of the box; Docker/self-hosting works the same. Without vector-store keys, retrieval degrades gracefully (committed vectors → keyword) and the app stays functional. Verify with `npm test · npm run lint · npm run build`.

### Reproducible evaluation

- `../datasets/eval-suite/` — 19 zero-shot tasks over 8 public mental-health benchmarks (EmoBench, CPsyExam, IMHI×9, PsySUICIDE, MentalManip, CBT-Bench, MDD-5k, EATD): strict closed-set parsing, per-row `api_model` + `system_fingerprint` provenance, resume, plus audit scripts (`audit_results.py`, `paired_model_audit.py`, `compare_runs.py`).
- [`eval/reports/imhi_zero_shot_v3.md`](eval/reports/imhi_zero_shot_v3.md) — audited IMHI prompt-protocol correction for dreaddit and MultiWD, including before/after weighted-F1, confusion changes, exact decision criteria, and result-file hashes.
- `eval/` (in-repo) — a 256-seed adversarial safety set with a four-level annotation guide (C-SSRS-aligned), dual-model annotation with Cohen's κ, and a detection-arms experiment (lexicon / judge / full pipeline / plain-LLM baseline). Headline finding: most detection loss happens in the **routing layer**, not the model.

### Honest limitations

- The safety pipeline is engineering, not clinical practice; human review of the safety seed set is still `pending`.
- Comparisons against published GPT-4/ChatGPT numbers carry protocol and model-generation gaps — positioning, not leaderboards.
- Evaluation datasets keep their own licenses (some CC BY-NC / research-only); see `../datasets/license_manifest.tsv`.

### License

[Apache License 2.0](./LICENSE), with a medical-disclaimer notice (see [NOTICE](./NOTICE)). Not a medical device; no clinical validation.

---

## 中文

### 这是什么?

静室是一个可自托管的中文 AI 情绪陪伴网页应用(亦支持英文)。无账号系统、服务端不保存聊天;对话只存在访问者浏览器本地,可一键彻底删除。

三个工程承诺:

1. **安全分层,关键处确定性。** 每轮对话经过词表底线 + LLM 风险判官(对齐 C-SSRS 严重度阶梯,多轮聚合)。危机支持由常在 UI 承载——可一键拨打热线的危机横幅、1–4 状态确认按钮、支持面板——由响应头驱动,不依赖模型"记得"在文字里写热线。
2. **RAG 必须可查证。** 有依据的回复引用真实来源(PubMed / WHO / CDC / PMC),给出可点击链接与逐字引述,对用户可见。没有出处就不作声称。
3. **隐私默认最小化。** API key 只存在服务端;服务端不留存对话。

### 快速开始

```bash
npm install
cp .env.example .env.local   # 填 DEEPSEEK_API_KEY、SiliconFlow EMBEDDING_API_KEY(Kimi/RAG);QDRANT_* 可选
npm run dev                  # 或 npm run build
```

支持 Vercel 一键部署与 Docker 自托管;未配置向量库时检索自动降级,应用仍可用。国内网络部署方案见 `docs/china-deployment.md`。

### 可复现评测

- `../datasets/eval-suite/`:8 个公开心理健康基准、19 个零样本任务;严格闭集解析,逐行记录 API 回传模型名与指纹,支持断点续跑,附审计脚本(重算对账 / 同题配对 / 复跑稳定性)。
- 仓库内 `eval/`:256 条对抗性安全种子集(四级标注指南,对齐 C-SSRS 量表)、双模型独立标注(Cohen's κ)、四臂检测对比实验。核心发现:检测能力的主要损失在**路由层**而非模型层。

### 诚实的边界

- 安全管线是工程实现,不是临床实践;种子集人工审核仍为 `pending`;
- 与已发表 GPT-4/ChatGPT 数字的对比存在协议与代际差,仅作定位不作排行;
- 各评测数据集保留原始许可(部分 CC BY-NC / 仅研究用途),见 `../datasets/license_manifest.tsv`。

### 许可证

[Apache License 2.0](./LICENSE),附医疗免责声明(见 [NOTICE](./NOTICE))。非医疗器械,无临床验证。
