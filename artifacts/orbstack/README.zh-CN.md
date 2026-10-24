# OrbStack 样本证据

本目录记录 OrbStack 2.2.5（Build 21124）arm64 样本的本地只读分析结果。原始 DMG、完整 Mach-O 提取结果和历史版本 JSON 默认被 `.gitignore` 排除，不随公开仓库发布。

样本摘要：

- Bundle ID：`dev.kdrag0n.MacVirt`
- DMG SHA-256：`f2b887d26a21e0a12147eb005297782794b26f461f77c6b9cdfb57f576ad5e6d`
- 主程序：arm64 Mach-O
- 本地化结论：主应用 `Contents/Resources` 下未观察到自己的 `.lproj`、`.strings` 或 `.stringsdict`；嵌套 Sparkle Framework 的中文资源不能证明 OrbStack 主界面已汉化。

公开或单独保留的说明文件只用于记录研究结论和翻译映射，不代表获得了 OrbStack 的分发授权，也不构成对原始应用的修改。
