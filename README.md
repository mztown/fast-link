# Auto Link

一个 Google Chrome 扩展，提供两种链接转换方式：

1. **自动拦截**：访问匹配**可配置模板**的链接（默认 `https://autolinreserved.publicvm.com/?wd=$s`，`$s` 为搜索词占位符）时，自动判断搜索词格式并跳转到对应链接。
2. **手动转换**：在弹窗中粘贴特定格式的字符串，一键转换并打开。

## 功能

### 自动拦截规则

可在**设置页**配置两项模板（均用 `$s` 表示搜索词位置）：

| 配置项 | 作用 | 默认值 |
| --- | --- | --- |
| `matchTemplate` | 拦截地址模板 | `https://autolinreserved.publicvm.com/?wd=$s` |
| `searchTemplate` | 兜底搜索引擎模板 | `https://cn.bing.com/search?q=$s` |

命中拦截后，按以下顺序判断搜索词：

| 搜索词格式 | 识别规则 | 跳转目标 |
| --- | --- | --- |
| 28 位百度网盘分享码<br/>如 `1W6PUbukIFsXCCEBKuGuKdg-n6g3` | 前 23 位 `[a-zA-Z0-9-]`，倒数第 5 位 `-`，后 4 位 `[a-zA-Z0-9]` | `https://pan.baidu.com/s/<23位>?pwd=<4位>` |
| 40 位 BT 哈希<br/>如 `abc123...abc1`（共 40 位） | 匹配 `[a-zA-Z0-9]{40}` | `magnet:?xt=urn:btih:<哈希>` |
| 其他任意搜索词 | 兜底（**默认开启**，可在设置页关闭） | 由 `searchTemplate` 决定，默认 `https://cn.bing.com/search?q=<搜索词>` |

### 手动转换

支持两种字符串的识别与转换：

| 输入字符串格式 | 识别规则 | 转换结果 |
| --- | --- | --- |
| 40 位英文/数字混合（BT 哈希）<br/>如 `abc123abc123abc123abc123abc123abc123ab`（共 40 位） | 匹配 `[a-zA-Z0-9]{40}` | `magnet:?xt=urn:btih:<哈希>` |
| 28 位字符串（百度网盘分享码 + 提取码）<br/>如 `1W6PUbukIFsXCCEBKuGuKdg-n6g3` | 前 23 位 `[a-zA-Z0-9-]`，倒数第 5 位 `-`，后 4 位 `[a-zA-Z0-9]` | `https://pan.baidu.com/s/<23位>?pwd=<4位>` |

各功能均可通过设置页开关独立控制。

## 为什么自动拦截限定在特定地址

早期版本尝试过**在地址栏输入裸字符串自动拦截**，但两种方案在普通 Chrome 下均不可行：

- `webRequest` + `["blocking"]`：需要 `webRequestBlocking` 权限，Chrome 110+ 仅对**企业策略（ExtensionInstallForcelist）**安装的扩展开放，普通手动安装的扩展无法使用。
- `declarativeNetRequest`：普通扩展虽可用，但 Chrome 会把**不含点号**的裸字符串（如 BT 哈希）直接当作**搜索词**送进搜索引擎，根本不会生成可匹配的 URL 请求，DNR 规则无法触发。

因此自动拦截需要作用在**带域名的真实 URL** 上，例如默认的
`https://autolinreserved.publicvm.com/?wd=...`。

## 技术实现

整体分三层：**拦截 → 中间页判断 → 跳转**。

1. **拦截层**（`background.js`）
   读取设置页配置的**拦截地址模板**，把 `$s` 处替换为正则捕获组 `(.*)`、其余
   部分做正则转义（并让 `http`/`https` 均可匹配），生成 `declarativeNetRequest`
   动态规则，拦截匹配的主框架导航并重定向到扩展中间页
   `chrome-extension://<id>/redirect.html?wd=<原参数>`。

2. **判断层**（`redirect.js` + `convert.js`）
   中间页读取 `wd`，用 JS 正则完成格式判断，再按开关决定跳转目标。

3. **跳转**
   命中规则 → `pan.baidu.com` / `magnet:`；未命中 → 按兜底开关跳转到
   `searchTemplate` 配置的搜索引擎（默认 Bing），或停下并提示。

### 为什么不让 DNR 直接判断

DNR 的 `regexFilter` 基于 RE2，单条正则编译后不得超过 **2KB**。实测本环境下：

```
(.{23})-(.{4})                        → memoryLimitExceeded
(.{40})                               → memoryLimitExceeded
([a-zA-Z0-9-]{23})-([a-zA-Z0-9]{4})   → memoryLimitExceeded
([^&#]+)([&#].*)?$                    → ✅ 通过
```

即**所有含 `{n}` 有界量词的正则都会被拒绝**，只有 `+` / `*` 无界量词的能通过。
因此 DNR 无法完成"定长提取 + 分支"，格式判断只能交给 JS（V8 正则无此限制）。

### 其他

- 手动转换复用同一套 `convert.js`，弹窗经 `chrome.runtime.onMessage` 调用，由 `chrome.tabs.create()` 打开。
- 所有配置（`matchTemplate`、`searchTemplate`、各开关）通过 `chrome.storage.sync` 持久化；
  拦截模板变更后实时重建 DNR 规则。

## 项目结构

```
fast-link/
├── manifest.json       # 扩展清单（MV3，权限 / 页面 / 中间页声明）
├── background.js       # Service Worker：DNR 拦截规则 + 弹窗消息处理
├── convert.js          # 共享配置、转换逻辑与模板转正则
├── redirect.html       # 中间跳转页
├── redirect.js         # 中间页判断与跳转逻辑
├── options.html        # 完整设置页（模板 + 开关）
├── options.js          # 设置页逻辑
├── hello.html          # 弹窗面板（输入框 + 转换按钮）
├── popup.js            # 弹窗逻辑
├── hello_extensions.png# 扩展图标
└── README.md
```

## 安装使用

1. 打开 Chrome，进入扩展管理页 `chrome://extensions/`。
2. 打开右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择本项目目录 `fast-link`。
4. 进入**设置页**：
   - 左栏可开关「Magnet 链接转换」「百度网盘链接转换」「兜底跳转搜索引擎」；
   - 右栏（仅在兜底开关开启时展开）可配置「兜底搜索引擎」与「拦截地址模板」，
     两者均用 `$s` 表示搜索词位置。
5. **自动拦截**：在地址栏访问匹配模板的链接，例如
   `https://autolinreserved.publicvm.com/?wd=1W6PUbukIFsXCCEBKuGuKdg-n6g3`，
   扩展会判断并跳转；不符合格式的则跳转到配置的搜索引擎。
6. **手动转换**：点击工具栏 Auto Link 图标，在弹窗输入框**粘贴** 40 位 BT 哈希或
   28 位百度分享码，点击「转换并打开」（或直接按回车）。

> 提示：若修改了代码，需在 `chrome://extensions/` 中点击该扩展的「刷新」按钮重新加载。

## 配置持久化

拦截地址模板、兜底搜索引擎与各开关均通过 `chrome.storage.sync` 保存。若 Chrome 开启了同步，配置还会跨设备同步。
