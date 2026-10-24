# OrbStack UI 候选审查报告（只读）

## 范围与证据

本报告基于 OrbStack `2.2.5`（Build `21124`）arm64 安装镜像的只读静态分析结果：

- 输入：`OrbStack_v2.2.5_21124_arm64.dmg`
- 输入 SHA-256：`f2b887d26a21e0a12147eb005297782794b26f461f77c6b9cdfb57f576ad5e6d`
- Bundle ID：`dev.kdrag0n.MacVirt`
- 主程序：arm64 Mach-O
- 主程序字符串总数：`17,783`
- 本次候选清单保留：`10,000`
- 字符串来源：主程序 Mach-O 的 `__cstring` 区段
- 分析报告：本地文件 `orb-inspector-10000-v10.json`（不随公开仓库发布）
- 候选清单：本地文件 `orbstack-translation-candidates-v10.json`（不随公开仓库发布）
- 人工审查队列：本地文件 `orbstack-review-queue-v10.json`（不随公开仓库发布）

主应用 `Contents/Resources` 下没有观察到自己的 `.lproj`、`.strings` 或 `.stringsdict`。嵌套 Sparkle Framework 中发现了 35 个本地化文件，其中含 `zh_CN`、`zh_TW` 和 `zh_HK`；这些文件只能证明 Sparkle 有本地化资源，不能证明 OrbStack 主界面已经支持中文。

## 读表方式

`file_offset` 和 `virtual_address` 来自 Mach-O 字符串提取器，`section` 是字符串所在区段，`risk` 是候选分类器的初始风险标签：

- `translate`：文本形态像 UI 文案，可以进入人工翻译队列；不代表可以直接改写二进制。
- `review`：可能是错误、状态、格式化消息或需要上下文确认的文本。
- `do-not-translate`：包含路径、URL、协议、标识符或其他不应当翻译的结构。
- `code_symbol`：源代码符号、类型名或编译器生成的标识，不作为界面文案处理。
- `runtime_token`：命令行参数、模板控制片段、编码数据或运行时内部令牌，不作为界面文案处理。

本报告另外给出人工置信度。`高` 表示文本和相邻功能字符串共同指向主界面；`中` 表示可能显示在 UI，但需要运行时路径或调用点确认；`低` 表示更像库、协议或系统诊断文本。

## 高置信度主界面候选

### 入门、导航与首页

| 原文 | file_offset | virtual_address | section | 工具风险 | 人工置信度 |
|---|---:|---:|---|---|---|
| Welcome to OrbStack | 22873008 | 4317840304 | `__cstring` | translate | 高 |
| Seamless and efficient Docker and Linux on your Mac | 22873040 | 4317840336 | `__cstring` | translate | 高 |
| Create a Linux machine | 22872720 | 4317840016 | `__cstring` | translate | 高 |
| This is a Linux machine that integrates with macOS. You can use it to build code, run services, and more. | 22872752 | 4317840048 | `__cstring` | translate | 高 |
| What do you want to use? | 22872912 | 4317840208 | `__cstring` | translate | 高 |
| Containers | 22873793 | 4317841089 | `__cstring` | translate | 高 |
| Select a Container | 22870176 | 4317837472 | `__cstring` | translate | 高 |
| Go to Containers | 22869296 | 4317836592 | `__cstring` | translate | 高 |
| Looking for Docker? | 22869216 | 4317836512 | `__cstring` | translate | 高 |
| Use the included Docker commands directly from macOS. No Linux machines needed. | 22894464 | 4317861760 | `__cstring` | translate | 高 |
| Migrate from Docker Desktop | 22858592 | 4317825888 | `__cstring` | translate | 高 |
| Copy your existing containers, volumes, and images to OrbStack. | 22858624 | 4317825920 | `__cstring` | translate | 高 |
| Get started with an example | 22858448 | 4317825744 | `__cstring` | translate | 高 |
| Build and run containers, and more. | 22895920 | 4317863216 | `__cstring` | translate | 高 |
| Build and run multiple containers at once. | 22895968 | 4317863264 | `__cstring` | translate | 高 |
| Open in New Window | 22872352 | 4317839648 | `__cstring` | translate | 高 |
| Toggle Inspector | 22872512 | 4317839808 | `__cstring` | translate | 高 |
| Show System Namespace | 22872416 | 4317839712 | `__cstring` | translate | 高 |
| Show Stopped Containers | 22872480 | 4317839776 | `__cstring` | translate | 高 |

`By continuing, you agree to our [terms](https://orbstack.dev/terms) and [privacy policy](https://orbstack.dev/privacy).` 位于 `22873104`，但工具将其归为 `path_or_protocol / do-not-translate`，因为原始候选中包含 URL。它仍然可能是入门页文案，翻译时应保留链接目标和 Markdown 结构，不能把它当作普通无格式字符串替换。

### Docker 容器、镜像、网络与卷

| 原文 | file_offset | virtual_address | section | 工具风险 | 人工置信度 |
|---|---:|---:|---|---|---|
| Container Not Running | 22858064 | 4317825360 | `__cstring` | translate | 高 |
| Container Removed | 22858192 | 4317825488 | `__cstring` | translate | 高 |
| Delete container? | 22858096 | 4317825392 | `__cstring` | translate | 高 |
| Delete containers? | 22856864 | 4317824160 | `__cstring` | translate | 高 |
| No Ports or Mounts | 22858128 | 4317825424 | `__cstring` | translate | 高 |
| No logs available. | 22858224 | 4317825520 | `__cstring` | translate | 高 |
| No Containers Selected | 22858256 | 4317825552 | `__cstring` | translate | 高 |
| Starting containers | 22861984 | 4317829280 | `__cstring` | translate | 高 |
| Import from File | 22859040 | 4317826336 | `__cstring` | translate | 高 |
| Select image (.tar) to import | 22859072 | 4317826368 | `__cstring` | do-not-translate | 高 |
| Images are used to run containers. They contain an application and its dependencies. | 22859184 | 4317826480 | `__cstring` | translate | 高 |
| Only tagged images are supported. | 22859344 | 4317826640 | `__cstring` | translate | 高 |
| Files Not Available | 22859392 | 4317826688 | `__cstring` | translate | 高 |
| File browsing is not supported when the containerd image store is enabled. | 22859424 | 4317826720 | `__cstring` | translate | 高 |
| Copy Image Digest | 22856416 | 4317823712 | `__cstring` | translate | 高 |
| Runs slower due to emulation | 22860176 | 4317827472 | `__cstring` | translate | 高 |
| This image was built for a different architecture ( | 22860208 | 4317827504 | `__cstring` | do-not-translate | 中 |
| Images will be permanently deleted. | 22860384 | 4317827680 | `__cstring` | translate | 高 |
| Delete networks? | 22860800 | 4317828096 | `__cstring` | translate | 高 |
| Networks will be permanently deleted. | 22860832 | 4317828128 | `__cstring` | translate | 高 |
| Delete services? | 22867008 | 4317834304 | `__cstring` | translate | 高 |
| Select volume (.tar.zst) to import | 22860912 | 4317828208 | `__cstring` | do-not-translate | 高 |
| Volumes are for sharing data between containers. Unlike bind mounts, they are stored on a native Linux file system, making them faster and more reliable. | 22861008 | 4317828304 | `__cstring` | translate | 高 |
| Delete volume | 22861248 | 4317828544 | `__cstring` | translate | 高 |

`This image was built for a different architecture (` 是截断片段，后续内容和右括号位于相邻字符串或运行时拼接逻辑中。它不适合单独翻译或按固定长度覆盖，应先确认完整格式化消息及占位符。

### Linux 机器与 Kubernetes

| 原文 | file_offset | virtual_address | section | 工具风险 | 人工置信度 |
|---|---:|---:|---|---|---|
| Start Kubernetes | 22861520 | 4317828816 | `__cstring` | translate | 高 |
| Enable Kubernetes | 22872448 | 4317839744 | `__cstring` | translate | 高 |
| Reset Kubernetes cluster? | 22877296 | 4317844592 | `__cstring` | translate | 高 |
| Kubernetes Disabled | 22867392 | 4317834688 | `__cstring` | translate | 高 |
| Creating cluster | 22867360 | 4317834656 | `__cstring` | translate | 高 |
| Ephemeral Containers | 22866768 | 4317834064 | `__cstring` | translate | 高 |
| Resources will be removed from the cluster. | 22866864 | 4317834160 | `__cstring` | translate | 高 |
| Select machine (.tar.zst) to import | 22867680 | 4317834976 | `__cstring` | do-not-translate | 高 |
| Machine Not Running | 22869328 | 4317836624 | `__cstring` | translate | 高 |
| Delete machines? | 22868720 | 4317836016 | `__cstring` | translate | 高 |
| Network isolation | 22867776 | 4317835072 | `__cstring` | translate | 高 |
| Block access to other machines and host IPs. | 22867808 | 4317835104 | `__cstring` | translate | 高 |
| SSH agent forwarding | 22867856 | 4317835152 | `__cstring` | translate | 高 |
| Allow the machine to use your host SSH agent. | 22867888 | 4317835184 | `__cstring` | translate | 高 |
| Cloud-init user data | 22867984 | 4317835280 | `__cstring` | translate | 高 |
| Select User Data | 22868192 | 4317835488 | `__cstring` | translate | 高 |
| Select user data file for Cloud-init setup | 22868224 | 4317835520 | `__cstring` | translate | 高 |
| x86-64 (emulated) | 22868272 | 4317835568 | `__cstring` | do-not-translate | 高 |
| Mount destinations must be unique. | 22868752 | 4317836048 | `__cstring` | translate | 高 |
| Select folder to mount | 22868960 | 4317836256 | `__cstring` | translate | 高 |
| 1 core (limited by CPU setting in OrbStack Settings) | 22869088 | 4317836384 | `__cstring` | do-not-translate | 高 |
| 1 GiB (limited by memory setting in OrbStack Settings) | 22869152 | 4317836448 | `__cstring` | do-not-translate | 高 |

### 设置、网络与权限

| 原文 | file_offset | virtual_address | section | 工具风险 | 人工置信度 |
|---|---:|---:|---|---|---|
| Use containerd image store | 22876752 | 4317844048 | `__cstring` | translate | 高 |
| Use containerd image store? | 22876288 | 4317843584 | `__cstring` | translate | 高 |
| Use Rosetta to run Intel code | 22880528 | 4317847824 | `__cstring` | translate | 高 |
| Use admin privileges for enhanced features | 22880672 | 4317847968 | `__cstring` | translate | 高 |
| Automatically download updates | 22881056 | 4317848352 | `__cstring` | translate | 高 |
| Check for Updates | 22869664 | 4317836960 | `__cstring` | translate | 高 |
| Update Frequency | 22872256 | 4317839552 | `__cstring` | translate | 高 |
| Show in menu bar | 22877152 | 4317844448 | `__cstring` | translate | 高 |
| Allow access to container domains & IPs | 22878944 | 4317846240 | `__cstring` | translate | 高 |
| Allow other devices on your LAN to connect to forwarded container ports. | 22876896 | 4317844192 | `__cstring` | translate | 高 |
| Allow other devices on your LAN to connect to forwarded machine ports. | 22878368 | 4317845664 | `__cstring` | translate | 高 |
| Use domain in kubeconfig | 22877984 | 4317845280 | `__cstring` | translate | 高 |
| Allows using the same kubeconfig in containers and machines. Requires container domain access to be enabled and working. | 22878016 | 4317845312 | `__cstring` | translate | 中 |
| Select data location | 22880080 | 4317847376 | `__cstring` | translate | 高 |
| Allow devices on the LAN and other networks to connect to OrbStack | 22878576 | 4317845872 | `__cstring` | translate | 高 |
| Allow OrbStack in macOS Settings > General > Login Items & Extensions > Allow in the Background. This is recommended for full functionality. | 22885192 | 4317852488 | `__cstring` | do-not-translate | 高 |
| Apply an HTTP, HTTPS, SOCKS5, or SOCKS5H proxy to all traffic from containers and machines. | 22879328 | 4317846624 | `__cstring` | translate | 高 |
| Apply and Restart | 22876400 | 4317843696 | `__cstring` | translate | 高 |
| Install Command-Line Tools? | 22871808 | 4317839104 | `__cstring` | translate | 高 |
| Command-Line Tools Installed | 22871904 | 4317839200 | `__cstring` | translate | 高 |
| Restart your terminal to use the new tools. | 22872009 | 4317839305 | `__cstring` | translate | 高 |
| Copy files from Linux to Mac | 22894976 | 4317862272 | `__cstring` | translate | 高 |
| Copy files from Mac to Linux | 22894848 | 4317862144 | `__cstring` | translate | 高 |
| Run a Mac command | 22895168 | 4317862464 | `__cstring` | translate | 高 |
| Start a Mac shell | 22895104 | 4317862400 | `__cstring` | translate | 高 |
| Start a shell from Linux. | 22895136 | 4317862432 | `__cstring` | translate | 高 |

### 错误、状态与许可提示

| 原文 | file_offset | virtual_address | section | 工具风险 | 人工置信度 |
|---|---:|---:|---|---|---|
| No running machines | 22854928 | 4317822224 | `__cstring` | review | 高 |
| A macOS update is required. | 22898000 | 4317865296 | `__cstring` | review | 高 |
| This beta version of OrbStack is too old. Please update to continue. | 22884848 | 4317852144 | `__cstring` | translate | 高 |
| Your organization requires you to sign in to OrbStack. | 22871744 | 4317839040 | `__cstring` | translate | 高 |
| Allow admin privileges to improve compatibility? | 22884688 | 4317851984 | `__cstring` | translate | 高 |
| Virtualization not supported | 22887728 | 4317855024 | `__cstring` | translate | 高 |
| VM not responding | 22883312 | 4317850608 | `__cstring` | translate | 高 |
| Service Not Running | 22884624 | 4317851920 | `__cstring` | translate | 高 |
| File Sharing Unavailable | 22871376 | 4317838672 | `__cstring` | translate | 高 |
| Pro License Required | 22871648 | 4317838944 | `__cstring` | translate | 高 |
| To use OrbStack Debug Shell, purchase a Pro license. | 22871680 | 4317838976 | `__cstring` | translate | 高 |
| Failed to load USB devices | 22854784 | 4317822080 | `__cstring` | review | 中 |
| Failed to attach USB device | 22888208 | 4317855504 | `__cstring` | review | 中 |
| Failed to detach USB device | 22888176 | 4317855472 | `__cstring` | review | 中 |
| Can't enable disk limit | 22888880 | 4317856176 | `__cstring` | translate | 中 |
| Failed to move OrbStack.app to /Applications | 22894192 | 4317861488 | `__cstring` | review | 高 |
| Failed to start migration | 22861904 | 4317829200 | `__cstring` | review | 高 |
| Some data couldn | 22861936 | 4317829232 | `__cstring` | translate | 中 |
| Replace existing data? | 22861728 | 4317829024 | `__cstring` | translate | 高 |
| You already have containers, volumes, or images in OrbStack. Migrating data from Docker Desktop may lead to unexpected results or data loss. | 22861760 | 4317829056 | `__cstring` | translate | 高 |

`Failed to create container`、`Failed to pull image`、`Failed to import image` 等错误位于同一主程序字符串区段，且周围有 Docker 页面文案，因此可以作为主界面错误提示候选；由于它们被分类器标为 `diagnostic_or_status / review`，应在运行时确认显示路径后再翻译。

## 需要单独审查的格式化和截断字符串

以下字符串从静态字节区段提取出来时可能只是格式化模板的一部分，或者包含占位符、转义符、URL、命令行和路径。它们不应使用简单的等长覆盖方式处理：

| 原文或片段 | file_offset | virtual_address | section | 风险 | 原因 |
|---|---:|---:|---|---|---|
| This image was built for a different architecture ( | 22860208 | 4317827504 | `__cstring` | do-not-translate | 片段末尾未闭合，可能与架构名和后续文案拼接 |
| Some data couldn | 22861936 | 4317829232 | `__cstring` | translate | 英文单词被静态提取截断，不能单独翻译 |
| By continuing, you agree to our [terms](https://orbstack.dev/terms) and [privacy policy](https://orbstack.dev/privacy). | 22873104 | 4317840400 | `__cstring` | do-not-translate | 必须保留 Markdown 链接目标和结构 |
| See all containers at [orb.local](http://orb.local) | 22856992 | 4317824288 | `__cstring` | do-not-translate | 包含本地地址和 Markdown 链接 |
| Then open [localhost](http://localhost) in your browser. | 22858528 | 4317825824 | `__cstring` | do-not-translate | 包含本地地址和 Markdown 链接 |
| Use the included Docker commands directly from macOS. No Linux machines needed. | 22894464 | 4317861760 | `__cstring` | translate | 翻译时保留 Docker 命令和产品名 |
| Failed to allocate fixed report buffer of size %ld | 23204381 | 4318171677 | `__cstring` | review | `%ld` 必须原样保留 |
| Failed to move %@ to previous state file: %@ | 23214820 | 4318182116 | `__cstring` | review | 两个 `%@` 占位符必须按数量和顺序保留 |
| [SentryHub doInstallIntegrations] couldn't find "%@" -> skipping. | 23191375 | 4318158671 | `__cstring` | do-not-translate | Sentry 日志模板，不属于主 UI 的高置信度候选 |

## 可能属于系统库、Swift/NIO、Sentry 或其他第三方组件的文本

主 Mach-O 的 `__cstring` 会把应用代码、静态链接代码、Swift 标准库、系统框架错误文本和第三方库文本放在同一类区段中。仅凭偏移不能证明归属。以下模式应默认排除出主界面翻译队列：

### SwiftNIO、NIOSSL 和网络栈

- `Cannot create global singleton FileSystem thread pool because the global singletons have been disabled by setting \`NIOSingletons.singletonsEnabledSuggestion = false\``，偏移 `23058128`。
- `Cannot create global singleton MultiThreadedEventLoopGroup because the global singletons have been disabled by setting  \`NIOSingletons.singletonsEnabledSuggestion = false\``，偏移 `22913312`。
- `Cannot create global singleton NIOThreadPool because the global singletons have been disabled by setting \`NIOSingletons.singletonsEnabledSuggestion = false\``，偏移 `22913152`。
- `Failed to create new connection in NIOSSLContext`，偏移 `22947568`。
- `bug in NIO (please report): NIOFileDescriptor illegal state (`，偏移 `22908192`。
- `BUG IN SwiftNIO (possibly #572), please report! Connection reset (no error set).`，偏移 `22914192`。

这些字符串带有 `NIO`、`NIOSSL` 或明确的库错误模板，属于网络库诊断文本。翻译它们不会使 OrbStack 主 UI 汉化，反而可能影响故障排查日志的一致性。

### Sentry 崩溃报告与遥测组件

- `Failed to initialize crash handler. Crash reporting disabled.`，偏移 `23200577`。
- `Failed to initialize SentryOptions`，偏移 `23216353`。
- `Failed to create HTTP transport because the SentryOptions does not contain a parsed DSN.`，偏移 `23201235`。
- `Could not create MessagePack for session replay envelope item.`，偏移 `23240800`。
- `Can't decode SentryThread because couldn't decode threadId.`，偏移 `23225840`。
- `Auto-tracking of NSData is disabled because enableDataSwizzling is false`，偏移 `23193597`。
- `Auto-tracking of NSFileManager is disabled because enableFileManagerSwizzling is false`，偏移 `23179917`。

这些文本包含 Sentry、session replay、DSN、swizzling 等特征，优先标记为第三方组件或内部诊断，不放入 UI 翻译队列。

### Apple Security、Foundation、Swift 运行时和编译器诊断

以下模式包括 `SecCode`、`SecKey`、`OCSP`、证书、属性列表、XPC、Mach 权限、Swift 编译器语义错误等：

- `Could not create SecCode for this application.`
- `Could not create SecStaticCode for bundled helper tool.`
- `could not create signature for OCSP response`
- `Failed to load certificate:`
- `Failed to read property list (handle not openable)`
- `An XPC service must have a CFBundleIdentifier`
- `An argument supplied to assert security privilege was not a host security port.`
- `attribute does not apply to a function`
- `cannot appear outside switch statement`
- `break statement only allowed in switch and loops`

这类文本的静态位置仍然是 `__cstring`，但没有证据表明它们由 OrbStack 主界面直接展示。应保留原文用于诊断上下文，默认不翻译。

### Docker、Kubernetes 和协议字段

`com.docker.compose.*`、`io.kubernetes.*`、`containerStatuses`、`creationTimestamp`、`HostConfig`、`NetworkSettings`、`RepoDigests`、`kubectl run nginx --image=nginx` 等字符串是 API 字段、标签键、命令或协议值。即使它们出现在 Docker/Kubernetes 页面附近，也不应翻译字段本身；可以翻译包围它们的说明文字。

## 当前统计与边界

`orb-inspector-10000-v10.json` 对应的候选清单中共有 10,000 条记录；分类器 v10 的统计如下：

| 分类 | 数量 | 解释 |
|---|---:|---|
| `ui_candidate` | 2,937 | 可读短语，进入人工翻译候选 |
| `diagnostic_or_status` | 715 | 错误、警告、状态或诊断文本 |
| `formatted_message` | 260 | 含占位符或转义序列 |
| `metadata_or_identifier` | 78 | Bundle、Docker、Kubernetes 或其他标识符 |
| `path_or_protocol` | 1,230 | 路径、URL、协议、源位置或命令结构 |
| `third_party_component` | 54 | 被规则标记为 Framework、更新器或第三方组件相关 |
| `code_symbol` | 131 | 源代码、类型或编译器符号 |
| `runtime_token` | 4,595 | 命令、模板、编码串或运行时内部令牌 |

按风险标签汇总：`translate` 2,937 条，`review` 1,029 条，`do-not-translate` 6,034 条。v10 的审查队列包含全部 2,937 条 `ui_candidate`，其中 2,844 条为 `high`、93 条为 `low` 优先级，未被数量上限截断。

这些分类由规则生成，不能替代调用点、界面截图或运行时验证。`ui_candidate` 的数量明显高于真实主界面文案，主要原因是主程序还包含系统库、静态链接库和协议错误文本。

## 未决问题

1. 目前没有把每个候选字符串反查到 Swift/Objective-C 调用点，因此无法证明某条文本一定能在 OrbStack UI 中显示。
2. `__cstring` 只保留 ASCII 可打印字符串；Swift 本地化键、字符串拼接、资源包内文本和非 ASCII 文本可能未被这一步完整覆盖。
3. 需要确认主程序是否使用自定义本地化机制、远程配置或编译期字符串表；仅检查 `.lproj` 和 Mach-O 不能排除这些可能性。
4. 需要在合法、隔离的测试副本中确认 UI 文案是否来自主 Mach-O，还是来自运行时生成的 SwiftUI/AppKit 内容。
5. 任何二进制字符串替换都可能改变 UTF-8 字节长度、引用边界、代码签名、Sparkle 更新校验或崩溃报告行为；当前报告没有生成补丁，也没有修改原始 App。
6. OrbStack 版本更新后偏移、签名摘要和字符串表都会变化；本报告只适用于上面列出的 `2.2.5 (21124)` arm64 样本。

当前报告的证据层级仍停留在“字符串存在”和“规则分类”。后续若增加 Mach-O 引用线索，应在每条记录中区分原始字节范围、启发式引用位置和经过运行时确认的页面证据；启发式引用不能直接作为 Swift/Objective-C 调用点结论。

## 建议的后续验证顺序

1. 先用 `review-queue` 仅筛选高置信度 `ui_candidate`，把本报告中的主界面候选作为人工基线。
2. 对每条候选记录原文、候选 ID、偏移、区段和完整上下文，避免仅按字符串内容替换。
3. 对包含 `%@`、`%ld`、`{{...}}`、URL、Markdown 或命令行的文本运行翻译映射校验，确认占位符和结构未改变。
4. 如需做补丁实验，只写入独立的测试副本，保留原始 DMG SHA-256、代码签名信息和补丁前后文件摘要。
5. 重新签名、运行验证、自动更新兼容性和分发行为应作为独立阶段，不能由静态候选报告推断。

下一阶段的验收记录建议至少包含：独立副本路径、样本 SHA-256、代码签名摘要、页面名称、触发操作、候选 ID、原文、截图或日志证据，以及翻译前后的占位符和链接结构检查结果。
