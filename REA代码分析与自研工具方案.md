# REA 代码分析与自研工具方案

更新时间：2026 年 10 月 24 日

## 1. 当前目标

我们不是直接修改 OrbStack，而是先建立一个只读分析链路，用来回答：

1. 应用是原生 macOS、Electron、脚本应用，还是混合结构？
2. UI 文本位于标准本地化资源、Web 资源、资产目录，还是原生二进制？
3. 哪些资源属于主应用，哪些资源属于第三方 Framework？
4. 如果未来做中文化，修改点是否会触发代码签名、自动更新或完整性校验问题？

本机 REA 已通过 npm 全局安装并验证：

```sh
npm install -g rea-agents
rea --version
# 6.7.0
```

## 2. REA 代码结构

REA 不是单一的“字符串提取脚本”，而是一个分层的逆向分析工具：

| 层 | 主要目录 | 作用 |
| --- | --- | --- |
| CLI/MCP 入口 | `scripts/rea.mjs`、`src/cli/`、`src/server/` | 把一次性命令和 MCP 请求转换为统一分析调用 |
| 应用层 | `src/application/` | 组合分析流程、会话、调查记录和 Evidence |
| 领域/契约 | `src/domain/`、`src/contracts/` | 定义观察结果、覆盖率、未知项和错误语义 |
| 资源与格式读取 | `src/artifacts/`、`src/native/`、`src/apple/` 等 | 处理 App、DMG、Mach-O、NIB、资产目录等格式 |
| 深度提供者 | `src/ghidra/`、`src/ida/`、`src/hopper/`、`src/kuna/` | 对接 Ghidra、IDA、Hopper 或其他反编译后端 |
| 进程与生命周期 | `src/process/` | 负责子进程、临时文件、取消、清理和资源所有权 |

最值得复用的不是某一个命令，而是以下设计：

- 先识别目标格式，再选择分析路径；
- 把“观察到的事实”“推导结果”“未知项”分开；
- 保留目标摘要、SHA-256、路径和 Evidence ID；
- 把静态分析和运行时观察分开，静态结果不能冒充运行时结论；
- 把资源所有权和清理状态作为结果的一部分，而不是隐藏在脚本退出逻辑里；
- 大结果采用摘要加可继续查询的 Evidence，而不是一次性把全部数据塞给调用方。

## 3. OrbStack 2.2.5 静态分析结果

样本：`OrbStack_v2.2.5_21124_arm64.dmg`

### 已观察事实

- DMG SHA-256：`f2b887d26a21e0a12147eb005297782794b26f461f77c6b9cdfb57f576ad5e6d`
- Bundle ID：`dev.kdrag0n.MacVirt`
- 版本：`2.2.5`，Build：`21124`
- 主程序是 arm64 Mach-O，使用 Swift/SwiftUI 相关系统框架。
- App 由 Developer ID 签名，Team ID 为 `HUAQ24HBR6`。
- 主应用 `Contents/Resources` 下没有发现自己的 `.lproj`、`.strings` 或 `.stringsdict`。
- 嵌套的 Sparkle Framework 有 35 个本地化文件，其中包括 `zh_CN.lproj`、`zh_TW.lproj` 和 `zh_HK.lproj`。
- 主 Mach-O 中存在大量可打印 UI 文本候选，例如 `Activity Monitor`、`No running machines`、`Enable Kubernetes` 等。
- 主包存在 `Assets.car`，并且包含 NIB/Interface Builder 资源，但目前发现的 NIB 主要来自 Sparkle 更新组件。
- `Assets.car` 通过 macOS `assetutil` 可解出 889 条资产记录；当前记录中没有观察到明确的本地化字段。
- Mach-O 的 `__cstring` 区段可提取 17,783 条候选；当前复现批次保留 10,000 条，并为每条候选记录文件偏移、虚拟地址和区段。
- 最新分析器还保留每条字符串的原始字节起止位置、原始长度、ASCII 编码和是否被长度上限截断的状态；对恢复出的 `__const`、`__data` 等区段执行有限的 64 位小端地址值扫描，记录可能的字符串地址引用线索。

### 推断

- OrbStack 主界面的可见文本很可能主要由 Swift/SwiftUI 编译产物直接提供，而不是由传统 Cocoa `.strings` 文件驱动。
- Sparkle 的中文资源只代表更新组件支持这些语言，不能证明 OrbStack 主界面支持中文。
- 如果直接修改主 Mach-O 或资产目录，必须重新处理代码签名；即使本地能够启动，也不代表自动更新或后续版本兼容。
- 候选清单可以先把文本分成 UI、诊断/状态、格式化消息、标识符、路径/协议和第三方组件，翻译前需要逐条人工审查。

### 尚未验证

- 每一个字符串候选对应的实际 UI 位置。
- SwiftUI 动态拼接文本、格式化文本和运行时生成的文本。
- 代码签名校验失败后的具体启动和更新行为。
- OrbStack 是否存在未被当前资源分类器识别的压缩、生成或加密资源。

REA 对 DMG 的完整容器清单保存在：
`artifacts/orbstack/rea-evidence`。

## 4. 自研 MVP：orb-inspector

目录：`orb-inspector/`

当前 MVP 提供一个只读 CLI：

```sh
cd orb-inspector
npm test
node src/cli.mjs analyze /绝对路径/OrbStack.app --out report.json
node src/cli.mjs analyze /绝对路径/OrbStack.dmg --no-strings
node src/cli.mjs review translation-candidates.json --ui-only --limit 100 --out review-queue.json
node src/cli.mjs validate translation-candidates.json translations.zh-CN.json --out validation.json
```

输出报告包括：

- `Info.plist` 身份和版本；
- `codesign` 的签名、Team ID、Authority 和 CDHash；
- 主程序的 `file` 类型；
- 主应用资源与嵌套 Framework 资源的区分；
- `.lproj`、`.strings`、`.stringsdict`、Web 文件、NIB、资产目录和其他文件清单；
- 主程序的有限字符串候选；
- 带 `ui_candidate`、`diagnostic_or_status`、`formatted_message`、`metadata_or_identifier`、`path_or_protocol`、`third_party_component`、`code_symbol` 和 `runtime_token` 分类的候选清单；
- 可按 UI 候选、风险、长度和数量筛选的人工审查队列；
- 独立翻译映射的候选 ID、源文本、占位符和重复引用校验；
- `observed`、`derived`、`unknowns` 和 `limitations` 字段。

工具接受 `.app` 或 `.dmg`。对于 DMG，它使用 `hdiutil` 只读挂载，并在 `finally` 路径中尝试卸载。工具不会执行 OrbStack，不会修改 App，不会去签名，也不会关闭系统保护。

当前样本的可复现证据文件包括：

- `artifacts/orbstack/orb-inspector-10000-v10.json`：10,000 条候选的完整分析报告；
- `artifacts/orbstack/orbstack-translation-candidates-v10.json`：候选清单；
- `artifacts/orbstack/orbstack-review-queue-v10.json`：UI 候选人工审查队列；
- `artifacts/orbstack/translations.zh-CN.json`：24 条高置信度 UI 翻译草稿；
- `artifacts/orbstack/translations.zh-CN.v10.validation.json`：翻译映射校验报告。

在 v10 规则下，10,000 条候选中有 2,937 条保留为 `ui_candidate`，4,595 条归入 `runtime_token`，1,230 条归入 `path_or_protocol`，715 条归入 `diagnostic_or_status`，其余为格式化消息、代码符号、标识符和第三方组件。这个统计描述规则输出，不等同于实际 UI 文案数量；审查队列仍需结合调用点和运行时页面人工确认。

## 5. 下一阶段建议

### 第一优先级：提高证据质量

- 解析 `Assets.car` 的名称、变体和本地化元数据；
- 读取主二进制的 Swift 符号、字符串引用和所在 Mach-O section；
- 对字符串候选保留文件偏移、虚拟地址、原始字节范围、编码长度和结尾边界；
- 对可能的字符串引用保留引用位置、目标地址、所在 section 和解析方法；引用线索必须标注为 heuristic，不能直接称为调用点；
- 生成“主应用资源”和“第三方组件资源”的独立报告。
- 将 `Assets.car` 记录与主 Mach-O 字符串候选关联，形成资源到代码位置的证据链。

### 第二优先级：建立可审计的翻译候选流程

- 允许用户选择字符串候选，而不是自动替换全部字符串；
- 为每个候选保留原文、位置、长度、编码和风险标签；
- 生成单独的候选补丁目录，不直接覆盖原始 App；
- 在任何修改前保存原始 SHA-256 和代码签名摘要。

### 第三优先级：验证而不是猜测

- 在隔离副本上验证签名变化；
- 只读捕获启动日志和 UI 页面，确认候选字符串是否真实出现；
- 将“字符串存在”“静态引用线索”“字符串被调用”“字符串显示在目标页面”分别建模；
- 每次运行时验证记录页面、操作、候选 ID、原文、截图或日志证据，并关联副本的 SHA-256 与代码签名摘要；
- 记录更新器、完整性检查和恢复路径。

### 下一阶段的证据门槛

下一阶段不应把“能够在二进制中找到字符串”直接升级为“可以安全替换”。建议按以下顺序推进：

1. 先为字符串记录原始字节范围和可复现的候选 ID；
2. 再记录可能的静态引用线索，并区分真实解析结果与启发式匹配；
3. 在独立测试副本中通过用户操作确认页面显示；
4. 最后才评估翻译映射、格式化参数、链接结构和签名变化；
5. 任何补丁实验都必须保留原始样本和恢复路径，不能覆盖原始 App。

## 6. 边界

本项目可以用于自有软件、获得授权的软件或安全研究环境中的静态分析。当前实现不包含绕过授权、破解付费功能、禁用代码签名、注入第三方进程或规避更新器保护的功能。
