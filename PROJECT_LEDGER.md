# 项目台账：orb-inspector

## 项目身份与目的

- **仓库：** 当前工作区根目录；公开远端为 `https://github.com/shiyi-log/orb-inspector`。
- **项目：** `orb-inspector`，位于仓库子目录 `orb-inspector/`。
- **目的：** 面向 macOS 应用本地化研究和静态逆向前置检查的只读工具，读取 `.app` 或 `.dmg`，生成应用清单、代码签名摘要、Mach-O 字符串与有限引用线索、Assets.car 元数据、翻译候选、人工审查队列和翻译映射校验结果。
- **安全边界：** 只读分析；不修改原始 App、不执行目标程序、不重新签名、不绕过授权或付费保护。该边界由根目录 `README.md`、`orb-inspector/README.md` 和 `orb-inspector/README.zh-CN.md` 说明。
- **负责人：** 待确认。
- **状态：** `active`（`0.2.0` 本地实现已完成，公开远端仍需接收本版本提交并创建 Release；运行时 UI、签名变化和自动更新兼容性仍待独立验收）。

## 当前基线

_截至 2026-10-24 15:35:39 CST（+0800）。证据来自本地命令、样本分析产物和 GitHub 外部证据。_

- **分支 / 提交：** `main` / `49d2059037288c1c28f6f473810cf95744cb0079`，提交消息为“增加本地化资源解析与 Mach-O 边界校验”。
- **工作区：** 本次台账更新尚未提交；代码、测试、版本和说明文件已在上述实现提交中完成，未跟踪的原始 DMG 和 v11 JSON 只保留在本地忽略目录。
- **远端发布：** 公开仓库、`main`、`v0.1.0` 标签和 GitHub Release 已观察到；`0.2.0` 实现提交尚未推送，Release 资产校验待本次发布后补记。
- **实现栈：** Node.js ESM；`orb-inspector/package.json` 声明 `node >=22`、`npm test` 使用 `node --test`，可执行入口为 `src/cli.mjs`。项目不含根目录 `package.json`；依赖清单仅有 `orb-inspector/package-lock.json` 的空依赖根记录。
- **外部命令依赖：** README 和源码说明涉及 macOS `hdiutil`、`codesign`、`assetutil` 等只读检查能力；这些命令在本次台账维护中未逐项进行运行时验收。
- **HTTP API：** 当前扫描到的入口为 CLI 和 ESM 模块，未发现 HTTP server、路由或端口配置；HTTP API 是否需要以及其正式契约均为 `待确认`。

## 目标与里程碑

| 目标或里程碑 | 状态 | 负责人 | 目标日期 | 证据 / 说明 |
|---|---|---|---|---|
| `.app` / `.dmg` 只读分析与证据报告 | `complete` | 待确认 | 待确认 | `orb-inspector/src/analyzer.mjs`、`src/macho.mjs`、`src/assets.mjs`；`README.md` 和测试覆盖资源分类、Mach-O 解析、资产元数据摘要。 |
| 翻译候选分类、人工审查队列和翻译映射校验 | `complete` | 待确认 | 待确认 | `src/candidates.mjs`、`src/review-queue.mjs`、`src/translation-validation.mjs`；本地测试 23/23 通过。 |
| 本地化资源解析与 Mach-O 边界保护 | `complete` | 待确认 | 2026-10-24 | `src/analyzer.mjs` 支持文本及二进制 plist `.strings`、`.stringsdict` 摘要、编码记录和 Bundle 范围校验；`src/macho.mjs` 记录截断和非法范围限制；本地测试 23/23 通过。 |
| 形成 `0.2.0` 本地版本基线 | `complete` | 待确认 | 2026-10-24 | 根目录 `VERSION`、`orb-inspector/package.json`、`package-lock.json` 和 `CHANGELOG.md` 均记录 `0.2.0`。 |
| 推送 `0.2.0` 并创建 GitHub Release | `planned` | 待确认 | 2026-10-24 | 实现提交为 `49d2059`；待推送后等待 CI 成功，再创建 `v0.2.0` 标签和 Release。 |
| GitHub Actions 持续集成 | `complete` | 待确认 | 2026-10-24 | Run `40071400278` 对 `34bcb99` 成功；Run `40071857123` 对发布校验修复提交 `dcbf791` 成功，Job“Node.js 测试”通过。 |
| 标签构建并创建 GitHub Release | `complete` | 待确认 | 2026-10-24 | Run `40071436013` 成功；标签 `v0.1.0` 创建 Release，包含源码压缩包和 `SHA256SUMS`。 |
| 运行时 UI 显示、代码签名和自动更新兼容性验收 | `planned` | 待确认 | 待确认 | README 明确静态字符串和引用线索不能替代运行时观察；当前未观察到独立验收记录。 |

## API 文档登记

当前接口是本地 CLI 和 JavaScript ESM 模块；未观察到 HTTP API 实现。CLI 参数、JSON 输出和错误行为以 `orb-inspector/src/cli.mjs` 为准，详细 JSON schema 尚未单独生成。

| 方法 | 端点 / 符号 | 用途 | 认证 / 权限 | 请求 / 响应 / 序列化 | 错误行为 | 源文件 / 证据 | 状态 |
|---|---|---|---|---|---|---|---|
| `CLI` | `analyze <app-or-dmg> [options]` | 读取 App 或 DMG，输出分析报告，可另写候选清单 | 本地进程和本地文件读取；无网络认证 | 参数为输入路径与选项；stdout 输出 JSON，`--out` / `--candidates-out` 写 JSON 文件 | 缺少路径、未知选项或分析异常时打印错误并以退出码 1 结束 | `orb-inspector/src/cli.mjs`；`node src/cli.mjs --help` | `documented` |
| `CLI` | `review <translation-manifest.json> [options]` | 从候选清单生成可筛选人工审查队列 | 本地文件读取；无网络认证 | 输入 JSON 清单；stdout 输出队列，`--out` 写 JSON 文件；支持 `--ui-only`、`--limit` 等过滤项 | 缺少清单、JSON 解析失败或未知选项时退出码 1 | `orb-inspector/src/cli.mjs`、`src/review-queue.mjs` | `documented` |
| `CLI` | `validate <translation-manifest.json> <translations.json> [--out]` | 校验候选 ID、原文、空翻译、重复引用和格式化占位符 | 本地文件读取；无网络认证 | 输入两个 JSON；输出含 `valid`、汇总和诊断的 JSON 报告 | 缺少参数、JSON 解析失败或未知选项时退出码 1；内容问题在报告诊断中返回 | `orb-inspector/src/cli.mjs`、`src/translation-validation.mjs` | `documented` |
| `JS export` | `src/analyzer.mjs#analyzeInput(inputPath, options)`；`writeReport(report, outputPath)` | 提供分析和报告写入模块接口 | 调用方负责本地文件权限 | Promise；报告为普通 JSON 对象；未建立独立 TypeScript / JSON Schema | 文件、解析或外部命令异常以 Promise rejection 传播 | `orb-inspector/src/analyzer.mjs` | `partial` |
| `JS export` | `src/analyzer.mjs#inspectLocalizationResources(appPath, paths)`；`parseStringsContent(content)`；`parseStringsDictContent(content)` | 解析本地化资源并输出静态键值、语言、编码、语法和读取错误摘要 | 调用方负责本地文件权限；资源必须位于 Bundle 内 | Promise 或普通对象；单文件读取上限 4 MiB；二进制 plist 通过系统 `plutil` 只读转换 | 单个文件错误保留在 `read_error`，不阻断其他文件 | `orb-inspector/src/analyzer.mjs`、本地化测试 | `documented` |
| `JS export` | `src/candidates.mjs#createTranslationManifest`；`src/review-queue.mjs#buildReviewQueue` | 生成翻译候选清单及审查队列 | 纯内存处理 | 普通对象输入和输出；字段约定由源码与测试定义 | 非法输入行为未形成独立契约 | 对应 `src/*.mjs` 与测试文件 | `partial` |
| `JS export` | `src/translation-validation.mjs#validateTranslationMap(manifest, translationMap)` | 校验翻译映射及占位符 | 纯内存处理 | 返回含有效性、汇总和诊断的普通对象 | 内容不一致以诊断返回；输入读取错误由 CLI 层处理 | `src/translation-validation.mjs`、`test/translation-validation.test.mjs` | `partial` |
| `HTTP` | 待确认（当前未发现） | 尚无已登记的 HTTP 服务 | 待确认 | 待确认 | 待确认 | 本地入口扫描、README 和 workflow 未提供 HTTP 路由或监听端口 | `unknown` |

已导出的其他模块函数包括 `classifyResourcePaths`、`sha256File`、`inspectAssetCatalog`、`summarizeAssetutilRecords`、`classifyTranslationCandidate`、`writeTranslationManifest`、`inspectMachOStrings`、`parseMachO`、`scanStringReferences`、`writeReviewQueue`、`normalizeMappings`、`extractPlaceholders` 和 `writeValidationReport`；这些函数尚未形成独立版本化 API schema。

## 版本与发布记录

| 版本 | 日期 | 提交 / 标签 | 变更摘要 | 版本真相源 | 迁移 | API 兼容性 | CI / 验证 | 发布状态 |
|---|---|---|---|---|---|---|---|---|
| `0.2.0` | 2026-10-24 | 提交 `49d2059037288c1c28f6f473810cf95744cb0079`；标签待创建 | 新增 `.strings` / `.stringsdict` 文本和二进制 plist 静态解析、本地化汇总、Bundle 范围及 4 MiB 读取限制；增强 fat/thin Mach-O 截断和引用范围保护；新增中文测试与 v11 样本证据 | 根目录 `VERSION`；`orb-inspector/package.json`、`package-lock.json`、`CHANGELOG.md` 均为 `0.2.0` | 不适用；仓库未观察到数据库或迁移文件 | 新增报告字段 `localization_analysis`；旧字段保持兼容，完整 API schema 仍待补充 | 本地 23 个测试通过；随机截断 Mach-O 检查通过；v11 OrbStack 报告、审查队列和翻译校验均已生成；远端 CI / Release 待本次推送后验证 | `local-only` |
| `0.1.0` | 2026-10-24 | 提交 `34bcb9921769de7cfb25413aff10681d849c0e7a`；标签 `v0.1.0`（对象 `81d07a96a400886bc5ddbf79e13a196e323d5862`） | 首个公开版本：`.app` / `.dmg` 只读分析、资源与签名摘要、Mach-O 字符串和有限指针线索、独立 `source_evidence`、Assets.car 元数据、翻译候选、人工审查队列、翻译映射校验，以及 CI / 标签发布 workflow | 根目录 `VERSION`；`orb-inspector/package.json`、`package-lock.json`、`CHANGELOG.md` 均为 `0.1.0` | 不适用；仓库未观察到数据库或迁移文件 | `unknown`；尚未有正式 API schema 或兼容性承诺 | 本地 14 个测试通过；CI Run `40071400278`、标签发布 Run `40071436013` 成功；Release 资产摘要已下载校验 | `published`；Release：`https://github.com/shiyi-log/orb-inspector/releases/tag/v0.1.0` |

`CHANGELOG.md` 明确说明本版本不包含 OrbStack 安装包，也未修改或重签名任何 OrbStack 应用。版本字符串、通过本地测试和 workflow 配置均不等同于 CI 健康、远端发布或独立验收。

## 决策与假设

| 日期 | 决策或假设 | 理由 | 影响 |
|---|---|---|---|
| 2026-10-24 | 以根目录 `VERSION` 作为仓库版本真相源，并要求嵌套 `package.json` 与其保持一致 | `README.md` 明确指定 `VERSION`；本次读取结果三处均为 `0.2.0` | 后续发布前应检查版本一致性，避免仅改动单一 manifest。 |
| 2026-10-24 | 将 `.strings` 的二进制 plist 形式纳入本地化解析 | OrbStack Sparkle 资源实际以 `bplist00` 开头；只读调用系统 `plutil` 后可恢复键值，避免把二进制格式误报成文本语法错误 | 报告记录 `binary-plist` 编码；仍不执行目标程序或格式化规则。 |
| 2026-10-24 | 维持只读分析边界 | README、中文说明和 changelog 均将不修改原始 App、不执行目标程序、不重签名列为边界 | 静态分析结果不能直接作为补丁安全性或运行时显示结论。 |
| 2026-10-24 | 当前台账按 CLI / ESM 模块登记接口，HTTP API 保持待确认 | 入口文件和 workflow 未提供 HTTP server、路由或端口证据 | 若未来增加服务端，需新增认证、请求响应、错误和兼容性契约。 |
| 2026-10-24 | 将本地实现、CI、远端发布和运行时验收分开记录 | 技能要求各证据类别独立；本地测试不证明外部状态 | 发布前必须分别补齐提交、CI 结论、Release 和独立验收证据。 |
| 2026-10-24 | 公开发布包排除 OrbStack 安装包和第三方 REA 工作副本 | `README.md`、`CHANGELOG.md` 与 release workflow 的打包排除项一致 | 研究样本只能作为本地证据，不能据此声称已发布完整样本。 |

## 风险、阻塞与依赖

| 项目 | 严重度 | 状态 | 负责人 | 缓解 / 下一检查 |
|---|---|---|---|---|
| 仓库尚无提交且未配置远端 | `high` | `closed` | 待确认 | 已创建公开仓库并推送初始提交；保留提交和远端地址证据。 |
| CI 与 GitHub Release workflow 尚未实际运行 | `high` | `closed` | 待确认 | CI Run `40071400278`、`40071857123` 和标签发布 Run `40071436013` 均成功；Release 资产已校验。 |
| macOS 工具链和目标样本运行时条件未逐项验收 | `medium` | `open` | 待确认 | 在隔离副本上核对 `hdiutil`、`codesign`、`assetutil` 和样本 SHA-256；保留命令输出。 |
| 静态字符串 / 指针线索不能证明运行时 UI、完整调用图或可安全替换 | `high` | `open` | 待确认 | 记录页面、操作、截图或日志、候选 ID、签名摘要和副本哈希，形成独立运行时验收。 |
| ESM 模块接口缺少独立 schema、类型和兼容性政策 | `medium` | `open` | 待确认 | 若作为外部集成接口，补充稳定字段、错误契约、版本兼容策略和测试。 |
| HTTP API 需求与边界未确认 | `medium` | `open` | 待确认 | 确认项目是否需要 HTTP 服务；若不需要，在后续版本中明确保持 CLI-only。 |

## 验证与证据

| 日期 | 声明 | 证据 | 结果 | 限制 / 未解决点 |
|---|---|---|---|---|
| 2026-10-24 | 版本基线为 `0.2.0` | `cat VERSION`；`node -p 'require("./package.json").version'`；`package-lock.json`；`CHANGELOG.md` | 根目录与嵌套项目版本一致 | 版本字符串不证明提交、CI 或发布。 |
| 2026-10-24 | 本地测试通过 | 在 `orb-inspector/` 执行 `npm test` | 23 个测试通过，0 失败、0 跳过 | 仅为本地 Node.js 测试；未证明 GitHub Actions 或生产环境。 |
| 2026-10-24 | CLI 入口可用 | 在 `orb-inspector/` 执行 `node src/cli.mjs --help` | 成功列出 `analyze`、`review`、`validate` 及选项 | 未使用真实 App / DMG 样本完成端到端运行时验收。 |
| 2026-10-24 | 工作区与 Git 状态已核对 | `git status --short --branch`、`git branch --show-current`、`git log`、`git remote -v` | 分支为 `main`；实现提交为 `49d2059037288c1c28f6f473810cf95744cb0079`；远端为 `origin`；台账更新待提交 | `v0.1.0` 标签仍指向旧发布提交；`v0.2.0` 尚未创建。 |
| 2026-10-24 | CI / Release workflow 已验证 | `.github/workflows/ci.yml`、`.github/workflows/release.yml`；GitHub Actions Runs `40071400278`、`40071857123`、`40071436013` | 主分支 CI、发布校验修复后的 CI、标签发布均为 `success`；Release 页面已生成 | 这些结果证明仓库发布流程成功，不证明 OrbStack 运行时 UI 或本地化补丁安全。 |
| 2026-10-24 | 未发现 HTTP API 入口 | `README.md`、`orb-inspector/README*.md`、`src/cli.mjs`、源文件清单和 workflow | 观察到 CLI / ESM 模块；未观察到 HTTP server、路由或端口 | “未发现”不等于需求已决策；HTTP API 需求仍待确认。 |
| 2026-10-24 | v10 静态样本证据已生成 | 在 `orb-inspector/` 执行 `analyze`、`review`、`validate`；本地 `artifacts/orbstack/*-v10.json` | OrbStack 2.2.5 Build 21124 arm64：提取 17,783 条字符串、保留 10,000 条；UI 候选 2,937 条；审查队列 2,937 条；中文映射 24/24 有效 | 仍然只有静态字符串和启发式引用线索，不能证明运行时 UI 显示或补丁安全性。 |
| 2026-10-24 | 项目自身中文化已完成 | `src/*.mjs`、`test/*.mjs`、README、变更记录、`LICENSE.zh-CN.md` | 项目日志、注释、测试名称、说明文件和发布说明使用中文；字段名、命令参数、外部命令原始输出和样本原文保留为机器契约或观察证据 | 外部工具原始输出和被分析应用字符串不属于项目自定义说明，未强行翻译。 |
| 2026-10-24 | 创建公开远端并推送初始版本 | `gh repo create shiyi-log/orb-inspector --public ... --push`；`git remote -v` | 公开仓库已创建，`main` 已推送，远端 URL 为 `https://github.com/shiyi-log/orb-inspector` | GitHub Actions、标签和 Release 已在后续证据中核对。 |
| 2026-10-24 | 最新台账提交的 CI 已完成 | GitHub Actions Run `40072052725`；提交 `0bce5cd5e6b29ca2e4d6a12dd331faf4fd329e16` | Job“Node.js 测试”为 `success` | 仍然只证明仓库测试通过，不证明运行时 UI 或本地化补丁安全。 |
| 2026-10-24 | CI 与标签发布完成 | GitHub Actions Run `40071400278`、`40071857123`、`40071436013` | 两次主分支 CI 和一次标签发布均为 `success`；Release 页面已公开 | 运行时 UI、代码签名变化和自动更新兼容性仍未验收。 |
| 2026-10-24 | 修正并验证 Release 校验清单 | `.github/workflows/release.yml`；Release `v0.1.0` 资产 `SHA256SUMS`；`shasum -a 256 -c SHA256SUMS` | 源码压缩包摘要校验为 `OK`，清单文件使用可直接下载验证的文件名 | 当前只验证发布资产完整性，不等于 OrbStack 运行时验收。 |
| 2026-10-24 | 生成 v11 静态分析证据 | `orb-inspector` CLI、OrbStack 2.2.5 Build 21124 arm64 DMG；`artifacts/orbstack/*-v11.json` | 35 个本地化 `.strings` 文件均以二进制 plist 解析，合计 1,695 个键；保留 10,000 条 Mach-O 候选，其中 UI 候选 2,937 条；审查队列 2,937 条；中文映射 24/24 有效 | 原始 DMG、完整 JSON 和 REA 工作副本仍只保留本地；静态证据不证明运行时 UI 或补丁安全。 |
| 2026-10-24 | 完成本地化与 Mach-O 加固验证 | `npm test`；随机 0 至 1024 字节截断输入检查；`git diff --check` | 23 个测试通过；随机截断输入未抛出异常；差异无空白错误 | 远端 CI、正式标签和 Release 仍待本次提交推送后验证。 |

## 下一步 / 待办

- [x] 创建公开远端并推送初始提交；负责人：待确认；完成：2026-10-24。
- [ ] 确认仓库负责人；负责人：待确认；截止：待确认。
- [x] 运行 GitHub Actions 并记录 workflow、提交 SHA、结论和产物；负责人：待确认；完成：2026-10-24。
- [x] 创建 `v0.1.0` 标签 / GitHub Release，并登记 Release 资产及 SHA-256；负责人：待确认；完成：2026-10-24。
- [x] 完成本地化资源解析、Bundle 范围校验和 Mach-O 边界保护；负责人：待确认；完成：2026-10-24；提交：`49d2059`。
- [ ] 推送 `0.2.0`、等待 CI 成功并创建 `v0.2.0` GitHub Release；负责人：待确认；截止：2026-10-24。
- [ ] 对真实 `.app` / `.dmg` 隔离副本完成 macOS 工具链、样本哈希、代码签名和运行时 UI 验收；负责人：待确认；截止：待确认。
- [ ] 确认 HTTP API 是否属于项目范围；若属于范围，补充路由、认证、请求响应、错误和兼容性文档；负责人：待确认；截止：待确认。
- [ ] 若模块接口供外部调用，补充稳定字段 / 错误契约和独立 schema；负责人：待确认；截止：待确认。

## 变更日志

| 日期 | 变更 | 证据 / 原因 |
|---|---|---|
| 2026-10-24 | 新增根目录项目台账，记录 `0.1.0` 本地基线、CLI / ESM 接口、版本发布状态、风险、验证证据和下一步 | 按 `project-ledger` 技能结构创建；依据 `README.md`、`orb-inspector/README*.md`、`VERSION`、`orb-inspector/package.json`、`CHANGELOG.md`、`.github/workflows/*.yml`、源文件、测试和 Git 命令输出 |
| 2026-10-24 | 更新 v10 静态证据、中文化状态和公开远端事实 | 新增 `source_evidence` 传递、中文测试名称、中文许可证说明；`0171419d698785484da92c42bbbf9d4ee08d4960` 已推送到 `shiyi-log/orb-inspector` |
| 2026-10-24 | 完成 CI/CD 发布验收并修正校验清单 | CI Run `40071400278`、`40071857123`、标签发布 Run `40071436013` 成功；`v0.1.0` Release 资产摘要下载校验成功；发布流程改为只写入压缩包文件名 |
| 2026-10-24 | 完成 `0.2.0` 本地实现和 v11 证据生成 | 提交 `49d2059` 增加本地化资源解析、二进制 plist 支持、Bundle 路径边界、Mach-O 截断保护和 23 个中文测试；v11 报告记录 1,695 个本地化键、2,937 条 UI 候选、24/24 翻译映射有效；待推送后补充 CI / Release 证据 |
