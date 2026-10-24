# orb-inspector

`orb-inspector` 是一个面向 macOS 应用本地化研究和静态逆向前置检查的只读工具。

当前能力包括：

- 读取 App Bundle 和 `Info.plist` 元数据；
- 记录 `codesign` 和可执行文件格式；
- 清点 `.lproj`、`.strings`、`.stringsdict`、Web 资源、NIB、资产目录和其他资源；
- 从主程序提取有限的可打印字符串，并保留文件偏移、虚拟地址、原始字节范围和编码长度；
- 在非字符串区段中扫描有限的、按地址对齐的 little-endian 64 位指针引用线索；
- 通过 macOS `assetutil` 读取 `Assets.car` 元数据；
- 生成带审查和替换风险标签的翻译候选清单；
- 生成可筛选的人工审查队列；
- 校验翻译映射中的候选 ID、原文、格式化占位符和重复引用；
- 在 JSON 报告中区分观察事实、推导结果、未知项和限制。

工具可以直接读取 `.app`，也可以使用 `hdiutil` 只读挂载 `.dmg`，随后在清理路径中尝试卸载。工具不会编辑目标 App、重新签名、关闭保护、执行目标程序或修改授权状态。

## 使用

```sh
npm test

node src/cli.mjs analyze /绝对路径/OrbStack.app --out report.json
node src/cli.mjs analyze /绝对路径/OrbStack.app \
  --out report.json --candidates-out translation-candidates.json

# 保留更多 Mach-O 候选
node src/cli.mjs analyze /绝对路径/OrbStack.app \
  --max-strings 10000 --candidates-out translation-candidates.json

node src/cli.mjs analyze /绝对路径/OrbStack.dmg --no-strings

node src/cli.mjs review translation-candidates.json \
  --ui-only --limit 100 --out review-queue.json

node src/cli.mjs validate translation-candidates.json translations.zh-CN.json \
  --out translation-validation.json
```

分析报告是研究证据，不是“某条字符串一定会出现在某个页面”的结论。原生字符串提取会保留 Mach-O 能确定的位置，但不会恢复 SwiftUI 布局，也不会证明翻译补丁可以安全应用。指针匹配只是启发式引用线索，不能直接称为完整调用点或 UI 调用图。`assetutil` 只提供资产目录元数据，也不能证明某个资产在运行时的使用位置。

## OrbStack 样本

本地 `../artifacts/orbstack` 目录保存 OrbStack 2.2.5 arm64 样本的研究证据，原始 DMG 和完整分析 JSON 默认不会进入公开仓库。该版本主应用 `Contents/Resources` 下未观察到自己的 `.lproj`、`.strings` 或 `.stringsdict`，但嵌套 Sparkle 资源包含翻译文件。主 Mach-O 含有大量 UI 文本候选，因此它与普通 Cocoa 本地化资源编辑的边界不同，代码签名和自动更新兼容性仍需单独验证。

更多中文说明见同目录的 `README.zh-CN.md`，项目级流程见仓库根目录的 `PROJECT_LEDGER.md`。
