# orb-inspector 中文说明

`orb-inspector` 是我们自研 macOS 应用分析工具的第一个 MVP，面向本地化研究和逆向分析前置检查。

## 功能

- 读取 `.app` 或 `.dmg`；
- 只读挂载 DMG，并在结束时尝试卸载；
- 读取 `Info.plist`；
- 记录 `codesign` 签名信息和主程序格式；
- 区分主应用资源与嵌套 Framework 资源；
- 扫描 `.lproj`、`.strings`、`.stringsdict`、NIB、资产目录和 Web 资源；
- 解析 `.strings` 键值、常见转义、注释和语法错误摘要；解析 `.stringsdict` 根级本地化键及 plist 结构错误摘要；
- 对二进制 plist 形式的 `.strings` 使用系统 `plutil` 做只读 JSON 转换，并在报告中记录 `binary-plist` 编码；
- 对二进制 plist 形式的 `.stringsdict` 只读取根级字典键，不执行复数格式化规则；
- 生成 `localization_analysis`，汇总语言目录、文件格式、条目数量、语法错误和读取错误；单文件读取上限为 4 MiB，并拒绝越出 App Bundle 的资源路径；
- 通过 Mach-O 的 `__cstring`/`__ustring` 区段提取有限的可打印字符串候选，并保留文件偏移和虚拟地址；
- 为每条候选保留原始字节范围（`byte_start`、`byte_end`、`byte_length`）、编码和截断状态；
- 在候选清单中保留独立的 `source_evidence`，记录字节范围、编码、截断状态和有限引用线索；候选 ID 仍只由原文和稳定源位置生成；
- 对 `__const`、`__data` 等可恢复区段执行有限的 64 位小端指针扫描，输出可能指向字符串虚拟地址的引用线索；
- 通过 macOS `assetutil` 读取 `Assets.car` 元数据；
- 根据字符串候选生成带风险分类的中文翻译清单；
- 在 JSON 中区分观察事实、推断、未知项和限制。
- 对截断或损坏的 fat Mach-O、thin Mach-O、加载命令和引用范围保留中文限制说明，尽量继续输出可审计的部分结果。

## 使用

```sh
cd orb-inspector
npm test

# 分析已挂载的 App
node src/cli.mjs analyze /绝对路径/OrbStack.app --out report.json

# 同时导出候选翻译清单
node src/cli.mjs analyze /绝对路径/OrbStack.app \
  --out report.json \
  --candidates-out translation-candidates.json

# 增加保留的 Mach-O 字符串候选数量
node src/cli.mjs analyze /绝对路径/OrbStack.app \
  --max-strings 10000 \
  --candidates-out translation-candidates.json

# 分析 DMG；工具会只读挂载并尝试自动卸载
node src/cli.mjs analyze /绝对路径/OrbStack.dmg --out report.json

# 跳过主程序字符串提取，适合先做快速清单
node src/cli.mjs analyze /绝对路径/OrbStack.app --no-strings

# 从候选清单生成人工审查队列
node src/cli.mjs review translation-candidates.json \
  --ui-only \
  --limit 100 \
  --out review-queue.json

# 校验独立的中文翻译映射，不修改 App
node src/cli.mjs validate translation-candidates.json translations.zh-CN.json \
  --out translation-validation.json
```

## 翻译映射的最小格式

翻译文件只保存候选 ID 到中文文本的映射，建议使用稳定的候选 ID：

```json
{
  "候选 ID": "中文翻译"
}
```

也可以保留原文，便于人工审查：

```json
[
  {
    "id": "候选 ID",
    "text": "Enable Kubernetes",
    "translation": "启用 Kubernetes"
  }
]
```

`validate` 会检查候选 ID、原文一致性、空翻译、重复引用，以及 `%@`、`%d`、`%016llx`、`{{name}}`、`\\n` 和 `\\t` 等格式化占位符。校验通过只说明映射与静态候选证据一致，不说明该字符串一定出现在运行时界面，也不会写入或重签名任何应用文件。

## 结果解释

报告中的 `application_localization_files` 只统计主应用 `Contents/Resources` 下的本地化文件；`framework_localization_files` 统计嵌套 Framework 中的文件。这样可以避免把 Sparkle 等第三方组件的中文资源误认为 OrbStack 主界面已汉化。

`translation_candidates.entries` 会保留原文、翻译、分类、风险、审查状态和源位置。`ui_candidate` 只是值得人工查看的候选，`translate` 只是低风险建议；它们都不能直接等同于可安全替换的补丁点。

Mach-O 报告中的 `reference_scan` 和每条字符串的 `references` 只表示“某个非字符串区段中出现了与该字符串虚拟地址相等的 64 位小端值”。它不是完整反汇编交叉引用，也不能证明调用点属于 UI；Swift 元数据、间接引用、重定位、字符串拼接和运行时生成文本仍需要单独分析。

建议把 `review` 的输出作为人工工作队列，把翻译映射和校验报告放在 `artifacts/` 等独立目录中。候选 ID 由原文和源位置的摘要稳定生成，重新分析同一份样本时应优先核对样本 SHA-256、版本、构建号和源位置。

本次 OrbStack 2.2.5（Build 21124）arm64 样本的复现文件位于 `../artifacts/orbstack/`：在 0.2.0 实现下，最终分析报告是 `orb-inspector-10000-v11.json`，候选清单是 `orbstack-translation-candidates-v11.json`，审查队列是 `orbstack-review-queue-v11.json`，中文草稿和校验报告分别是 `translations.zh-CN.json` 与 `translations.zh-CN.v11.validation.json`。v11 规则将 10,000 条保留候选中的 UI 候选数量记录在报告中，并额外记录本地化资源解析汇总；这些数量仍然不能替代运行时 UI 确认。

## 下一阶段：从字符串走向证据链

字符串候选确认后，下一步应记录它在 Mach-O 中的原始字节范围，并尝试寻找有限的引用线索。这里的“引用线索”只表示解析器在静态字节中发现了可能的地址或指针关系，不能直接等同于 Swift/Objective-C 调用点。完整调用图仍需要符号信息、反编译器或运行时观察共同确认。

建议把证据分成三层：

1. **字符串存在**：原文、编码、`file_offset`、`virtual_address`、section、字节长度和原始字节范围；
2. **静态引用线索**：可能指向该字符串的地址、所在 section、引用位置和解析置信度；
3. **运行时显示**：页面、控件、触发操作、截图或日志，以及候选文本与页面之间的对应关系。

只有第一层时，候选仍然是“待审查文本”；第二层可以帮助排序和排除库文本；第三层才足以支持“该文案出现在某个页面”的结论。任何翻译映射都应保留这三层证据的缺口，不能用静态字符串存在替代运行时显示证据。

`asset_catalog_analysis` 只读取 `assetutil` 元数据，保留资产名称、类型、摘要记录和 SHA-256，不提取或改写资源字节。

字符串候选只是静态提取结果，不表示：

- 该字符串一定会出现在 UI 中；
- 该字符串一定属于主界面；
- 替换该字符串不会破坏长度、编码或格式化参数；
- 修改后的 App 仍然通过代码签名和自动更新检查。

运行时验证应使用隔离副本，先记录副本的 SHA-256、代码签名摘要和版本，再通过正常用户操作触发页面。验证记录至少应包含页面名称、操作步骤、观察到的原文、截图或日志证据、候选 ID，以及是否存在格式化参数或链接。没有这些记录时，只能说“字符串存在”或“进入人工审查”，不能说“OrbStack 已经汉化”。

## 当前 OrbStack 结论

对 OrbStack 2.2.5 arm64 样本的检查显示：主应用没有自己的标准 `.lproj`、`.strings` 或 `.stringsdict`，但 Sparkle 更新组件包含 `zh_CN` 等语言资源；主程序 Mach-O 内含大量 UI 文本候选。因此，OrbStack 主界面的中文化不能简单等同于“复制一个 `zh_CN.lproj` 文件”。

## 安全边界

本工具只做静态、只读检查，不修改原始 App，不执行目标程序，不重新签名，不绕过授权或付费功能保护。后续如增加候选补丁生成，也应写入单独副本并保留原始摘要和签名证据。
