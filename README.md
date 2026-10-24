# orb-inspector

`orb-inspector` 是一个面向 macOS 应用本地化研究和静态逆向前置检查的只读工具。项目基于 REA 的证据分层思路，自行实现 App/DMG 清单、代码签名摘要、Mach-O 字符串、Assets.car 元数据、翻译候选、人工审查队列和翻译映射校验。

## 当前状态

- 版本：`0.2.0`；版本真相源是根目录的 `VERSION`。
- 语言：源码注释、CLI 日志、文档、提交说明和发布说明使用中文；JSON 字段名和稳定分类标识保留英文，便于程序处理。
- 安全边界：只读分析，不修改原始 App，不注入进程，不绕过授权，不生成覆盖原应用的补丁。
- 测试：`orb-inspector` 当前测试套件通过。
- 本版本新增 `.strings` / `.stringsdict` 静态解析（包括二进制 plist 形式）、本地化汇总和 Mach-O 截断输入边界保护。

## 快速开始

```sh
cd orb-inspector
npm test
node src/cli.mjs --help
```

分析 App 或 DMG：

```sh
node src/cli.mjs analyze /绝对路径/OrbStack.dmg \
  --max-strings 10000 \
  --out report.json \
  --candidates-out translation-candidates.json
```

生成审查队列并校验独立翻译映射：

```sh
node src/cli.mjs review translation-candidates.json \
  --ui-only --limit 100 --out review-queue.json

node src/cli.mjs validate translation-candidates.json translations.zh-CN.json \
  --out translation-validation.json
```

完整中文说明见 [orb-inspector/README.zh-CN.md](orb-inspector/README.zh-CN.md)，项目台账见 [PROJECT_LEDGER.md](PROJECT_LEDGER.md)，版本记录见 [CHANGELOG.md](CHANGELOG.md)。

## 开源仓库边界

公开仓库包含源码、测试、CI/CD 配置、中文文档和少量翻译示例。OrbStack 安装包、完整二进制提取结果和第三方 REA 工作副本留在本地，不进入公开仓库；这样可以避免分发第三方应用和大体积样本，也让公开仓库保持可维护。

## 贡献与安全

贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请阅读 [SECURITY.md](SECURITY.md)。项目使用 MIT 许可证，标准许可证正文见 [LICENSE](LICENSE)，中文说明见 [LICENSE.zh-CN.md](LICENSE.zh-CN.md)。
