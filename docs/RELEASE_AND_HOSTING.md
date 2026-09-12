# 静室发布与域名迁移（0.8.1）

当前先发布到现有 Vercel 项目，之后在阿里云购买 `jingshiroom.com` 并绑定同一个项目。买域名和迁服务器是两个独立操作：域名放在阿里云管理，不妨碍网站及所有 API 继续运行在 Vercel。

0.8.1 修复自动小结继承深度模型后，750 token 预算可能全部用于思考、最终正文为空的问题。小结使用明确的快速模型；聊天里的深度/快速选择保持不变。供应商不可用时仍显示重试及手动保存入口。

## 现有项目与发布

- Git 仓库：`AllenLi441/ai-therapy-room`。
- Vercel 项目：`ai-therapy-room`，项目 ID `prj_abauKjVlzV0DdEZOKk2zjPiJJKDy`。
- 当前域名：`https://ai-therapy-room.vercel.app/`。
- Next.js 完整服务端应用，保留 `/api/chat`、`/api/health` 等接口和现有环境变量。发布应更新此项目，不能仅另建一个静态首页。

从仓库根目录运行：

```sh
npm ci
npm run verify
```

`verify` 顺序执行版本一致性、lint、类型检查、全部默认离线 Node/组件测试、生产构建、独立产物启动检查。任何一步失败都会非零退出。`test:ratchet` 保留命令兼容性，但已改成真实运行所有测试，旧 known-failing 列表不能覆盖失败。需要真实模型和计费的评测不属于默认离线 CI，也不能拿打印报告的探针代替回归断言。

GitHub Actions 的 `CI / verify` 执行相同检查。**仅提交 workflow 不会自动阻止 Vercel 在 main push 后构建发布。** 应在仓库对 main 配置“必须通过 CI / verify 才能合并”，并通过测试分支/PR 合并发布；如账号不支持该规则，本轮必须在本地完整验证后再推送，后续可在托管构建命令中设置等效的离线验证。不要把未配置的分支保护描述成已经生效。

发布前记录当前 production deployment 的 URL、版本、提交号，作为回退目标。Vercel 保持现有 Git 连接、项目及环境变量。Chrome 已登录状态可用于项目操作；浏览器登录与 CLI 登录独立，不应通过读取浏览器凭据来修复 CLI。

## 发布后核验

```sh
npm run release:check -- https://ai-therapy-room.vercel.app 0.8.1 EXPECTED_GIT_COMMIT
```

把 `EXPECTED_GIT_COMMIT` 替换为本次真实提交号。脚本先验证 `/api/health?check=liveness`，再验证 `/api/health`。版本不一致、提交号不一致、HTTP 错误、缺少服务配置或观察到降级都会退出失败。若部署方式暂时无法提供提交号，可省略最后一个参数，但该次只能证明版本，不能证明具体提交。

健康元数据：

- `appVersion`：默认使用代码中的版本；可用 `APP_RELEASE_VERSION` 指定有效语义版本。
- `buildCommit`：优先 `APP_BUILD_COMMIT`，其次 Vercel 提供的 `VERCEL_GIT_COMMIT_SHA`；只返回有效十六进制提交号，缺失或无效时为 `null`。
- `check=liveness`：只说明该版本服务进程能够响应，不访问模型服务，也不要求模型密钥。
- 默认健康接口：检查配置及当前实例已观察到的错误。没有近期模型调用时为 unknown，不能证明模型当前可用；不同 Vercel 实例也不共享内存计数。

健康探针不调用真实模型，因此不会因为探测产生模型费用。上线验收仍要人工验证一段正常对话、可取消的流式输出、安全帮助、数据导出/清除、手机交互，以及后端错误恢复。

## Vercel 回退

如果发布后核验或关键流程失败，在原项目 Production Deployment 选择 **Instant Rollback**，核对要回退的域名和上一个 production deployment 后执行，然后针对旧版本/旧提交重新运行 `release:check`。Hobby 计划支持回退到紧邻的上一个 production deployment。回退沿用旧构建及其环境配置，不能假设会采纳后来编辑的环境变量。

Vercel 执行回退后会暂停新推送自动覆盖生产域名；修复并验证好新部署后，在项目里 **Undo Rollback**/promote 正确部署，恢复自动域名分配。[Vercel 官方回退文档，2026-09-12 核对](https://vercel.com/docs/instant-rollback)

## 之后购买并绑定 jingshiroom.com

1. 在阿里云**中国站**重查并购买 `jingshiroom.com`，完成注册人实名。此前 RDAP 未查到注册记录仅是时间点证据，不能保证现在仍可买；本轮发布准备没有购买或保留它。
2. 在现有 Vercel 项目 `Settings → Domains` 添加根域名及需要的 `www.jingshiroom.com`，选择一个作为主域名，另一个重定向到主域名。
3. 在阿里云 DNS 控制台填写 **Vercel 此项目当时给出的** A/CNAME/TXT 记录。不要复制旧教程里的固定 IP；遇到已有同名记录先核对用途，不动邮件 MX 或其他无关记录。
4. 等待 Vercel 域名验证和 HTTPS 证书成功，针对自定义域名再运行 `release:check`，核对首页、API 和流式响应。保留 `.vercel.app` 地址作临时排查入口。
5. 后续代码仍通过同一 Git 仓库更新；域名不需要随每次发布重配，API 路径也保持同源。

浏览器历史不会随域名自动搬迁：`.vercel.app` 和 `jingshiroom.com` 的本地存储相互独立。先在旧地址的「关于安屿」中选择「导出我的记录」，再在新地址选择「导入记录」，核对消息/往次记录数量后确认替换。新版备份包含当前对话、量表、理解、往次小结及偏好；每段保留最近120条消息，原始图片和模型思考过程不在备份中，已识别的图片描述可能保留。反馈片段仍有单独的「导出内测反馈」入口。文件含私人对话，应由用户自行保管，不上传到域名注册商。导入不会向模型自动发送数据，继续聊天时才按已说明的数据流处理。

[官方自定义域名说明](https://vercel.com/docs/domains/working-with-domains/add-a-domain)。仅换 `.com` 不能保证中国大陆访问质量；Vercel 无大陆节点，官方不保证大陆可用性。[官方大陆访问说明](https://vercel.com/kb/guide/accessing-vercel-hosted-sites-from-mainland-china)

## 未来迁到阿里云服务器

选择阿里云香港或大陆服务器前，先确认目标用户网络、预算和 ICP 条件。阿里云大陆服务器对外提供网站服务前需要相应 ICP 备案；香港服务器不需要大陆 ICP 接入备案，但跨境质量仍需验证。[阿里云官方备案流程](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-application-overview)

仓库已有完整应用 Dockerfile，运行的是 Next.js standalone 服务，包含 API，不是静态导出。构建上下文采用允许清单，只包含构建输入；`.env*`、日志、研究目录、本地截图和凭据不进入镜像。运行密钥使用宿主机私有配置或云秘密管理注入，不能写进 Dockerfile、build-arg、仓库、日志或聊天。

以下命令是未来已有服务器和权限后的操作步骤，本轮未执行：

```sh
docker build --build-arg APP_BUILD_COMMIT=EXPECTED_GIT_COMMIT -t jingshi:0.8.1 .
docker run -d --name jingshi-candidate --restart unless-stopped \
  --env-file /etc/jingshi/runtime.env \
  -p 127.0.0.1:3001:3000 jingshi:0.8.1
npm run release:check -- http://127.0.0.1:3001 0.8.1 EXPECTED_GIT_COMMIT
```

私有运行配置应保留与原 Vercel 项目等效的 API、检索、模型选择等变量；只迁前端或忘记后端环境变量会造成接口退化。`runtime.env` 仅在服务器存放，由发布人员在受控界面配置，不输出文件内容。若启用持久化日志，应单独配置受控存储；容器本地目录不能作为跨实例长期记录方案。

候选服务通过健康核验及实际流程后，再切 Nginx/Caddy 的上游到 `127.0.0.1:3001`。Nginx 流式 API 应关闭 `proxy_buffering` 并设置足够读取超时；在 reload 前执行配置检查。保留上个已验证服务（例如 `127.0.0.1:3000`）及旧镜像，切换后再从公网域名核验。发现问题就将上游恢复旧端口并 reload，再用旧版本/提交验证；不要先删除旧容器再测试新版本。

首次从 Vercel 迁服务器时，先用临时验证域名/受控 hosts 验证新机器的完整站点与 HTTPS，再改变阿里云 DNS。保留旧 Vercel 部署直至 DNS 缓存过渡和新环境观测完成；回退时恢复旧 DNS 记录值并验证，DNS 回退不会对所有缓存立即生效。后续自动更新可由同一仓库 CI 构建镜像并上传/推送到阿里云环境，再执行上述候选验证和上游切换；须先配置发布身份及网络通道，不会因为买了域名自动获得推送权限。

本地可用 `npm run build && npm run smoke:build` 验证 standalone 的首页、静态资源、版本、提交号与 liveness。Docker 镜像仍应在具备 Docker 的 Linux/CI 环境实际构建验收；本轮工作机没有 Docker，不能将 standalone 验证宣称为容器运行验证。
