# 静室 | AI心理咨询室

一个可部署到 Vercel，也可自托管到普通云服务器的匿名中文 AI 心理咨询室。项目不使用 Supabase、不做账号系统，聊天记录默认只保存在访问者自己的浏览器本地。

## 与一般"AI 心理聊天"的差异

静室不是一个"给大模型套个心理咨询 system prompt 就上线"的产品。每一轮对话由两个模型分工：

1. **Kimi（督导/概念化）**：长上下文阅读完整对话，在后台持续维护一份【个案概念化表】——主诉、诱发情境、自动想法、核心信念、身体反应、行为模式、需要/价值、资源、工作假设。在每一轮回应前为 DeepSeek 制定一份【本轮治疗计划】：选择取向（人本/CBT/ACT/DBT/MI/创伤知情/危机）、本轮协议步骤、必须先反映的核心点、本轮微干预、结尾澄清问题、本轮要避免的事。
2. **DeepSeek（咨询师）**：流式生成面向来访者的中文回应，必须按督导给的本轮计划执行，不向来访者暴露后台术语。

辅以临床自评量表（PHQ-9 抑郁、GAD-7 焦虑、ISI 失眠），分数会回流到 Kimi 的概念化输入，让每一轮回应都看得见客观参考。

## 功能

- 双模型协作：DeepSeek 出回应、Kimi 出督导计划
- 持续更新的【个案理解】侧栏，会话越长越准确
- 知识库（焦虑、低落、压力、CBT、ACT、DBT、创伤知情、睡眠、关系、自我否定、哀伤、危机稳定化等）检索增强
- PHQ-9 / GAD-7 / ISI 自评量表，本地保存
- 自伤、自杀、伤人、虐待等高风险表达的强安全分流
- 会话结束总结（六段式）、Markdown 导出（含个案理解与量表）、本地记录清除
- 服务端清洗括号附注、下划线填空和常见 AI 自述
- Vercel 和 Docker 自托管部署，API key 只存在服务端环境变量

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

在 `.env.local` 中至少填写：

```bash
DEEPSEEK_API_KEY=your-rotated-production-key
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_BASE_URL=https://api.deepseek.com

KIMI_API_KEY=your-rotated-moonshot-key
KIMI_MODEL=moonshot-v1-32k
KIMI_BASE_URL=https://api.moonshot.cn/v1
```

未配置 `KIMI_API_KEY` 时，系统会回退为单模型模式（DeepSeek 直答 + 默认计划），但会失去差异化。

## 部署

1. 推到 GitHub，在 Vercel 导入该仓库。
2. 在 Vercel Project Settings → Environment Variables 添加上述 6 个变量。
3. 部署完成后 Vercel 会给一个公开网址。

如果目标用户主要在中国大陆普通网络环境，建议迁移到腾讯云/阿里云轻量服务器，具体步骤见 [国内普通网络部署方案](./docs/china-deployment.md)。

## 隐私与安全边界

- 前端不会暴露任何 API key。
- 服务端 API route 只处理当前请求，不长期保存用户聊天内容。
- 个案概念化表和量表分数只存在用户浏览器本地，可随时清除。
- 本项目提供心理支持，不提供医疗诊断、药物建议或紧急救援。
- 高风险表达会优先进入安全分流，提示联系现实支持和当地紧急资源。
- 自评量表用于自我观察，不构成医学诊断。

## AI 专业反馈原则

- 不做诊断、不冒充持证治疗师、不提供药物建议。
- 每轮回应优先包含：准确反映、非诊断机制理解、一个可执行微干预、一个澄清问题。
- 取向选择由后台督导显式决定，避免空泛承诺或模板化输出。

## 验证命令

```bash
npm test
npm run lint
npm run build
npm audit
```
