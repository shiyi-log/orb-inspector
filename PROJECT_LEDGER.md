# 项目台账：orb-inspector

## 项目身份与目的

- **仓库：** 当前工作区根目录；公开远端为 `https://github.com/shiyi-log/orb-inspector`。
- **项目：** `orb-inspector`，位于仓库子目录 `orb-inspector/`。
- **目的：** 面向 macOS 应用本地化研究和静态逆向前置检查的只读工具，读取 `.app` 或 `.dmg`，生成应用清单、代码签名摘要、Mach-O 字符串与有限引用线索、Assets.car 元数据、翻译候选、人工审查队列和翻译映射校验结果。
- **安全边界：** 只读分析；不修改原始 App、不执行目标程序、不重新签名、不绕过授权或付费保护。该边界由根目录 `README.md`、`orb-inspector/README.md` 和 `orb-inspector/README.zh-CN.md` 说明。
- **负责人：** 待确认。
- **状态：** `active`（本地代码和测试已有证据；尚无提交、远端、CI 运行或正式发布证据）。

## 当前基线

_截至 2026-10-24 14:32:22 CST（+0800）。证据来自本地命令和仓库文件。_

- **分支 / 提交：** `main` / `0171419d698785484da92c42bbbf9d4ee08d4960`。
- **工作区：** `clean`；初始公开提交已推送，当前本地分支跟踪 `origin/main`。
- **远端发布：** 已创建公开仓库并推送 `main`；标签和 GitHub Release 尚待确认。
- **实现栈：** Node.js ESM；`orb-inspector/package.json` 声明 `node >=22`、`npm test` 使用 `node --test`，可执行入口为 `src/cli.mjs`。项目不含根目录 `package.json`；依赖清单仅有 `orb-inspector/package-lock.json` 的空依赖根记录。
- **外部命令依赖：** README 和源码说明涉及 macOS `hdiutil`、`codesign`、`assetutil` 等只读检查能力；这些命令在本次台账维护中未逐项进行运行时验收。
- **HTTP API：** 当前扫描到的入口为 CLI 和 ESM 模块，未发现 HTTP server、路由或端口配置；HTTP API 是否需要以及其正式契约均为 `待确认`。

## 目标与里程碑

| 目标或里程碑 | 状态 | 负责人 | 目标日期 | 证据 / 说明 |
|---|---|---|---|---|
| `.app` / `.dmg` 只读分析与证据报告 | `complete` | 待确认 | 待确认 | `orb-inspector/src/analyzer.mjs`、`src/macho.mjs`、`src/assets.mjs`；`README.md` 和测试覆盖资源分类、Mach-O 解析、资产元数据摘要。 |
| 翻译候选分类、人工审查队列和翻译映射校验 | `complete` | 待确认 | 待确认 | `src/candidates.mjs`、`src/review-queue.mjs`、`src/translation-validation.mjs`；本地测试 14/14 通过。 |
| 形成 `0.1.0` 本地版本基线 | `complete` | 待确认 | 2026-10-24 | 根目录 `VERSION`、`orb-inspector/package.json`、`package-lock.json` 和 `CHANGELOG.md` 均记录 `0.1.0`。 |
| GitHub Actions 持续集成 | `active` | 待确认 | 待确认 | `.github/workflows/ci.yml` 已配置 Node 22、`npm ci` 和 `npm test`；主分支已推送，实际运行结论待核对。 |
| 标签构建并创建 GitHub Release | `active` | 待确认 | 待确认 | `.github/workflows/release.yml` 已配置 `v*` 标签触发、打包和 `gh release create`；远端已存在，待创建标签并核对运行结果。 |
| 运行时 UI 显示、代码签名和自动更新兼容性验收 | `planned` | 待确认 | 待确认 | README 明确静态字符串和引用线索不能替代运行时观察；当前未观察到独立验收记录。 |

## API 文档登记

当前接口是本地 CLI 和 JavaScript ESM 模块；未观察到 HTTP API 实现。CLI 参数、JSON 输出和错误行为以 `orb-inspector/src/cli.mjs` 为准，详细 JSON schema 尚未单独生成。

| 方法 | 端点 / 符号 | 用途 | 认证 / 权限 | 请求 / 响应 / 序列化 | 错误行为 | 源文件 / 证据 | 状态 |
|---|---|---|---|---|---|---|---|
| `CLI` | `analyze <app-or-dmg> [options]` | 读取 App 或 DMG，输出分析报告，可另写候选清单 | 本地进程和本地文件读取；无网络认证 | 参数为输入路径与选项；stdout 输出 JSON，`--out` / `--candidates-out` 写 JSON 文件 | 缺少路径、未知选项或分析异常时打印错误并以退出码 1 结束 | `orb-inspector/src/cli.mjs`；`node src/cli.mjs --help` | `documented` |
| `CLI` | `review <translation-manifest.json> [options]` | 从候选清单生成可筛选人工审查队列 | 本地文件读取；无网络认证 | 输入 JSON 清单；stdout 输出队列，`--out` 写 JSON 文件；支持 `--ui-only`、`--limit` 等过滤项 | 缺少清单、JSON 解析失败或未知选项时退出码 1 | `orb-inspector/src/cli.mjs`、`src/review-queue.mjs` | `documented` |
| `CLI` | `validate <translation-manifest.json> <translations.json> [--out]` | 校验候选 ID、原文、空翻译、重复引用和格式化占位符 | 本地文件读取；无网络认证 | 输入两个 JSON；输出含 `valid`、汇总和诊断的 JSON 报告 | 缺少参数、JSON 解析失败或未知选项时退出码 1；内容问题在报告诊断中返回 | `orb-inspector/src/cli.mjs`、`src/translation-validation.mjs` | `documented` |
| `JS export` | `src/analyzer.mjs#analyzeInput(inputPath, options)`；`writeReport(report, outputPath)` | 提供分析和报告写入模块接口 | 调用方负责本地文件权限 | Promise；报告为普通 JSON 对象；未建立独立 TypeScript / JSON Schema | 文件、解析或外部命令异常以 Promise rejection 传播 | `orb-inspector/src/analyzer.mjs` | `partial` |
| `JS export` | `src/candidates.mjs#createTranslationManifest`；`src/review-queue.mjs#buildReviewQueue` | 生成翻译候选清单及审查队列 | 纯内存处理 | 普通对象输入和输出；字段约定由源码与测试定义 | 非法输入行为未形成独立契约 | 对应 `src/*.mjs` 与测试文件 | `partial` |
| `JS export` | `src/translation-validation.mjs#validateTranslationMap(manifest, translationMap)` | 校验翻译映射及占位符 | 纯内存处理 | 返回含有效性、汇总和诊断的普通对象 | 内容不一致以诊断返回；输入读取错误由 CLI 层处理 | `src/translation-validation.mjs`、`test/translation-validation.test.mjs` | `partial` |
| `HTTP` | 待确认（当前未发现） | 尚无已登记的 HTTP 服务 | 待确认 | 待确认 | 待确认 | 本地入口扫描、README 和 workflow 未提供 HTTP 路由或监听端口 | `unknown` |

已导出的其他模块函数包括 `classifyResourcePaths`、`sha256File`、`inspectAssetCatalog`、`summarizeAssetutilRecords`、`classifyTranslationCandidate`、`writeTranslationManifest`、`inspectMachOStrings`、`parseMachO`、`scanStringReferences`、`writeReviewQueue`、`normalizeMappings`、`extractPlaceholders` 和 `writeValidationReport`；这些函数尚未形成独立版本化 API schema。

## 版本与发布记录

| 版本 | 日期 | 提交 / 标签 | 变更摘要 | 版本真相源 | 迁移 | API 兼容性 | CI / 验证 | 发布状态 |
|---|---|---|---|---|---|---|---|---|
| `0.1.0` | 2026-10-24 | `0171419d698785484da92c42bbbf9d4ee08d4960`；标签待创建 | 首个公开版本：`.app` / `.dmg` 只读分析、资源与签名摘要、Mach-O 字符串和有限指针线索、独立 `source_evidence`、Assets.car 元数据、翻译候选、人工审查队列、翻译映射校验，以及 CI / 标签发布 workflow | 根目录 `VERSION`；`orb-inspector/package.json`、`package-lock.json`、`CHANGELOG.md` 均为 `0.1.0` | 不适用；仓库未观察到数据库或迁移文件 | `unknown`；尚未有正式 API schema 或兼容性承诺 | 本地 `npm test`：14 个测试通过；主分支已推送；CI 与 Release 运行结果待核对 | `active` / 公开仓库已创建；尚未确认正式标签和 GitHub Release |

`CHANGELOG.md` 明确说明本版本不包含 OrbStack 安装包，也未修改或重签名任何 OrbStack 应用。版本字符串、通过本地测试和 workflow 配置均不等同于 CI 健康、远端发布或独立验收。

## 决策与假设

| 日期 | 决策或假设 | 理由 | 影响 |
|---|---|---|---|
| 2026-10-24 | 以根目录 `VERSION` 作为仓库版本真相源，并要求嵌套 `package.json` 与其保持一致 | `README.md` 明确指定 `VERSION`；本次读取结果三处均为 `0.1.0` | 后续发布前应检查版本一致性，避免仅改动单一 manifest。 |
| 2026-10-24 | 维持只读分析边界 | README、中文说明和 changelog 均将不修改原始 App、不执行目标程序、不重签名列为边界 | 静态分析结果不能直接作为补丁安全性或运行时显示结论。 |
| 2026-10-24 | 当前台账按 CLI / ESM 模块登记接口，HTTP API 保持待确认 | 入口文件和 workflow 未提供 HTTP server、路由或端口证据 | 若未来增加服务端，需新增认证、请求响应、错误和兼容性契约。 |
| 2026-10-24 | 将本地实现、CI、远端发布和运行时验收分开记录 | 技能要求各证据类别独立；本地测试不证明外部状态 | 发布前必须分别补齐提交、CI 结论、Release 和独立验收证据。 |
| 2026-10-24 | 公开发布包排除 OrbStack 安装包和第三方 REA 工作副本 | `README.md`、`CHANGELOG.md` 与 release workflow 的打包排除项一致 | 研究样本只能作为本地证据，不能据此声称已发布完整样本。 |

## 风险、阻塞与依赖

| 项目 | 严重度 | 状态 | 负责人 | 缓解 / 下一检查 |
|---|---|---|---|---|
| 仓库尚无提交且未配置远端 | `high` | `closed` | 待确认 | 已创建公开仓库并推送初始提交；保留提交和远端地址证据。 |
| CI 与 GitHub Release workflow 尚未实际运行 | `high` | `open` | 待确认 | 远端可用后推送受控分支，核对 workflow 结论、产物和 Release 页面；当前不得声称已发布。 |
| macOS 工具链和目标样本运行时条件未逐项验收 | `medium` | `open` | 待确认 | 在隔离副本上核对 `hdiutil`、`codesign`、`assetutil` 和样本 SHA-256；保留命令输出。 |
| 静态字符串 / 指针线索不能证明运行时 UI、完整调用图或可安全替换 | `high` | `open` | 待确认 | 记录页面、操作、截图或日志、候选 ID、签名摘要和副本哈希，形成独立运行时验收。 |
| ESM 模块接口缺少独立 schema、类型和兼容性政策 | `medium` | `open` | 待确认 | 若作为外部集成接口，补充稳定字段、错误契约、版本兼容策略和测试。 |
| HTTP API 需求与边界未确认 | `medium` | `open` | 待确认 | 确认项目是否需要 HTTP 服务；若不需要，在后续版本中明确保持 CLI-only。 |

## 验证与证据

| 日期 | 声明 | 证据 | 结果 | 限制 / 未解决点 |
|---|---|---|---|---|
| 2026-10-24 | 版本基线为 `0.1.0` | `cat VERSION`；`node -p 'require("./package.json").version'`；`package-lock.json`；`CHANGELOG.md` | 根目录与嵌套项目版本一致 | 版本字符串不证明提交、CI 或发布。 |
| 2026-10-24 | 本地测试通过 | 在 `orb-inspector/` 执行 `npm test` | 14 个测试通过，0 失败、0 跳过 | 仅为本地 Node.js 测试；未证明 GitHub Actions 或生产环境。 |
| 2026-10-24 | CLI 入口可用 | 在 `orb-inspector/` 执行 `node src/cli.mjs --help` | 成功列出 `analyze`、`review`、`validate` 及选项 | 未使用真实 App / DMG 样本完成端到端运行时验收。 |
| 2026-10-24 | 工作区与 Git 状态已核对 | `git status --short --branch`、`git branch --show-current`、`git log`、`git remote -v` | 分支为 `main`；提交为 `0171419d698785484da92c42bbbf9d4ee08d4960`；远端为 `origin`；工作区干净 | 标签、CI 和 Release 仍需独立核对。 |
| 2026-10-24 | CI / Release workflow 已存在 | `.github/workflows/ci.yml`、`.github/workflows/release.yml` | 已读到 Node 22、`npm ci`、`npm test`、标签打包和 `gh release create` 配置 | 尚无运行记录和 Release 页面，执行结论为待确认。 |
| 2026-10-24 | 未发现 HTTP API 入口 | `README.md`、`orb-inspector/README*.md`、`src/cli.mjs`、源文件清单和 workflow | 观察到 CLI / ESM 模块；未观察到 HTTP server、路由或端口 | “未发现”不等于需求已决策；HTTP API 需求仍待确认。 |
| 2026-10-24 | v10 静态样本证据已生成 | 在 `orb-inspector/` 执行 `analyze`、`review`、`validate`；本地 `artifacts/orbstack/*-v10.json` | OrbStack 2.2.5 Build 21124 arm64：提取 17,783 条字符串、保留 10,000 条；UI 候选 2,937 条；审查队列 2,937 条；中文映射 24/24 有效 | 仍然只有静态字符串和启发式引用线索，不能证明运行时 UI 显示或补丁安全性。 |
| 2026-10-24 | 项目自身中文化已完成 | `src/*.mjs`、`test/*.mjs`、README、变更记录、`LICENSE.zh-CN.md` | 项目日志、注释、测试名称、说明文件和发布说明使用中文；字段名、命令参数、外部命令原始输出和样本原文保留为机器契约或观察证据 | 外部工具原始输出和被分析应用字符串不属于项目自定义说明，未强行翻译。 |
| 2026-10-24 | 创建公开远端并推送初始版本 | `gh repo create shiyi-log/orb-inspector --public ... --push`；`git remote -v` | 公开仓库已创建，`main` 已推送，远端 URL 为 `https://github.com/shiyi-log/orb-inspector` | GitHub Actions、标签和 Release 仍需单独核对。 |

## 下一步 / 待办

- [x] 创建公开远端并推送初始提交；负责人：待确认；完成：2026-10-24。
- [ ] 确认仓库负责人；负责人：待确认；截止：待确认。
- [ ] 在提交和远端配置完成后运行 GitHub Actions，并记录具体 workflow、提交 SHA、结论和产物；负责人：待确认；截止：待确认。
- [ ] 仅在 CI 结论明确后创建 `v0.1.0` 标签 / GitHub Release，并登记 Release 资产及 SHA-256；负责人：待确认；截止：待确认。
- [ ] 对真实 `.app` / `.dmg` 隔离副本完成 macOS 工具链、样本哈希、代码签名和运行时 UI 验收；负责人：待确认；截止：待确认。
- [ ] 确认 HTTP API 是否属于项目范围；若属于范围，补充路由、认证、请求响应、错误和兼容性文档；负责人：待确认；截止：待确认。
- [ ] 若模块接口供外部调用，补充稳定字段 / 错误契约和独立 schema；负责人：待确认；截止：待确认。

## 变更日志

| 日期 | 变更 | 证据 / 原因 |
|---|---|---|
| 2026-10-24 | 新增根目录项目台账，记录 `0.1.0` 本地基线、CLI / ESM 接口、版本发布状态、风险、验证证据和下一步 | 按 `project-ledger` 技能结构创建；依据 `README.md`、`orb-inspector/README*.md`、`VERSION`、`orb-inspector/package.json`、`CHANGELOG.md`、`.github/workflows/*.yml`、源文件、测试和 Git 命令输出 |
| 2026-10-24 | 更新 v10 静态证据、中文化状态和公开远端事实 | 新增 `source_evidence` 传递、中文测试名称、中文许可证说明；`0171419d698785484da92c42bbbf9d4ee08d4960` 已推送到 `shiyi-log/orb-inspector` |
