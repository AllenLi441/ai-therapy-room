# 部署到 Vercel — 静室

> 状态(2026-06-13):应用**可构建、可部署**。`npm run build` 通过;后端 API 全部可用;前端是临时极简可用版,等 Claude Design 重构后替换。

## ⚠️ 先做:密钥
恢复出的 `.env.local` 里有 DeepSeek / SiliconFlow / 旧 Moonshot key。生产 Kimi 已迁移到 SiliconFlow；Moonshot 变量只作评测/紧急回退。部署前确认 DeepSeek 与 SiliconFlow 余额和 key，**永远不要提交 `.env.local`**(已在 `.gitignore` 里)。

应用需要的环境变量:
| 变量 | 必需 | 说明 |
|---|---|---|
| `DEEPSEEK_API_KEY` | ✅ | 面向用户的咨询回应(流式)。没有它 `/api/chat` 会返回兜底文案。 |
| `DEEPSEEK_MODEL` | 默认 deepseek-chat | |
| `DEEPSEEK_BASE_URL` | 默认 api.deepseek.com | |
| `EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL` | ✅ | SiliconFlow 单账户；同时供 Kimi、向量检索、重排使用。base 必须为 `api.siliconflow.com/v1` 或 `.cn/v1`。 |
| `KIMI_PROVIDER` | 建议 `siliconflow` | 未设置时也会自动识别 SiliconFlow embedding 配置。 |
| `SILICONFLOW_KIMI_MODEL` / `SILICONFLOW_KIMI_VISION_MODEL` | 默认 `moonshotai/Kimi-K2.5` | 文本判官与图片理解。 |
| `KIMI_API_KEY` / `KIMI_BASE_URL` / `KIMI_MODEL` | 仅回退 | 只有 `KIMI_PROVIDER=moonshot` 时使用。 |
| `NET_CONNECT_TIMEOUT_MS` | 建议 `1500` | 连接阶段超时；代码限制 100–10000ms，最多 3 次总尝试。 |
| `QUIET_ROOM_SESSION_SALT` / `QUIET_ROOM_RATE_LIMIT_SALT` | 建议设 | 生产环境用于哈希,设一个随机串。 |

## 路线 A(推荐):连 Git 仓库,根因修复
这样源码永久留存,以后不会再丢,且每次 push 自动部署。
```bash
cd ~/Desktop/静室/app
git init && git add . && git commit -m "Recover + rebuild ai-therapy-room (real backend, minimal frontend)"
gh repo create ai-therapy-room --private --source=. --push   # gh 已登录为 AllenLi441
```
然后在 Vercel:把项目 `ai-therapy-room` 的 Git 连接指向这个新仓库(Settings → Git),或新建项目导入它;在 Settings → Environment Variables 填上面的 key;Deploy。

## 路线 B(快):Vercel CLI 直接部署
```bash
cd ~/Desktop/静室/app
npx vercel login        # 交互式,你本人登录(在本会话用 `! npx vercel login`)
npx vercel link         # 关联到现有 ai-therapy-room 项目,或新建
npx vercel env add DEEPSEEK_API_KEY   # 逐个加,或在网页控制台加
npx vercel --prod       # 部署
```
> 路线 B 仍然是"无 Git 连接"的老路——会再次面临丢源码的风险。优先用路线 A。

## 部署后自检
- 打开站点,发一句话,确认有流式回复(若返回兜底文案 → 检查 DEEPSEEK_API_KEY)。
- `/api/health` 应返回 JSON(配置/降级状态)。本次 v0.7.9 发布必须看到
  `appVersion="0.7.9"`、`models.kimiProvider="siliconflow"`、
  `models.kimiModel="moonshotai/Kimi-K2.5"`、`transport.connectTimeoutMs=1500`、`transport.maxAttempts=3`；
  否则仍是旧运行时，不能把本地源码修复写成已上线。
