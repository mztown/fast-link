# Auto Link

一个 Google Chrome 扩展，提供两种链接转换方式：

1. **自动拦截**：访问 `https://autolinreserved.publicvm.com?wd=搜索词` 时，自动判断搜索词格式并跳转到对应链接，不符合格式则跳转百度搜索。
2. **手动转换**：在弹窗中粘贴特定格式的字符串，一键转换并打开。

## 功能

### 自动拦截规则

拦截 `https://autolinreserved.publicvm.com?wd=<搜索词>` 开头的链接，按以下顺序判断搜索词：

| 搜索词格式 | 识别规则 | 跳转目标 |
| --- | --- | --- |
| 28 位百度网盘分享码<br/>如 `1W6PUbukIFsXCCEBKuGuKdg-n6g3` | 前 23 位 `[a-zA-Z0-9-]`，倒数第 5 位 `-`，后 4 位 `[a-zA-Z0-9]` | `https://pan.baidu.com/s/<23位>?pwd=<4位>` |
| 40 位 BT 哈希<br/>如 `abc123...abc1`（共 40 位） | 匹配 `[a-zA-Z0-9]{40}` | `magnet:?xt=urn:btih:<哈希>` |
| 其他任意搜索词 | 兜底（**默认暂停**，可在设置页开启） | `https://www.baidu.com/s?wd=<搜索词>` |

### 手动转换

支持两种字符串的识别与转换：

| 输入字符串格式 | 识别规则 | 转换结果 |
| --- | --- | --- |
| 40 位英文/数字混合（BT 哈希）<br/>如 `abc123abc123abc123abc123abc123abc123ab`（共 40 位） | 匹配 `[a-zA-Z0-9]{40}` | `magnet:?xt=urn:btih:<哈希>` |
| 28 位字符串（百度网盘分享码 + 提取码）<br/>如 `1W6PUbukIFsXCCEBKuGuKdg-n6g3` | 前 23 位 `[a-zA-Z0-9-]`，倒数第 5 位 `-`，后 4 位 `[a-zA-Z0-9]` | `https://pan.baidu.com/s/<23位>?pwd=<4位>` |

两个功能均可通过开关独立控制。

## 为什么自动拦截限定在特定域名

早期版本尝试过**在地址栏输入裸字符串自动拦截**，但两种方案在普通 Chrome 下均不可行：

- `webRequest` + `["blocking"]`：需要 `webRequestBlocking` 权限，Chrome 110+ 仅对**企业策略（ExtensionInstallForcelist）**安装的扩展开放，普通手动安装的扩展无法使用。
- `declarativeNetRequest`：普通扩展虽可用，但 Chrome 会把**不含点号**的裸字符串（如 BT 哈希）直接当作**搜索词**送进搜索引擎，根本不会生成可匹配的 URL 请求，DNR 规则无法触发。

而 `https://autolinreserved.publicvm.com?wd=...` 是**带域名的真实 URL**，会正常发起网络请求，因此 DNR 可以稳定拦截并重定向。

## 技术实现

整体分三层：**拦截 → 中间页判断 → 跳转**。

1. **拦截层**（`background.js`）
   `declarativeNetRequest` 动态规则，用最简正则 `(.*)` 拦截
   `autolinreserved.publicvm.com/?wd=*` 的主框架导航，重定向到扩展中间页
   `chrome-extension://<id>/redirect.html?wd=<原参数>`。

2. **判断层**（`redirect.js` + `convert.js`）
   中间页读取 `wd`，用 JS 正则完成格式判断，再按开关决定跳转目标。

3. **跳转**
   命中规则 → `pan.baidu.com` / `magnet:`；未命中 → 按兜底开关跳百度搜索或停下。

### 为什么不让 DNR 直接判断

DNR 的 `regexFilter` 基于 RE2，单条正则编译后不得超过 **2KB**。实测本环境下：

```
(.{23})-(.{4})                        → memoryLimitExceeded
(.{40})                               → memoryLimitExceeded
([a-zA-Z0-9-]{23})-([a-zA-Z0-9]{4})   → memoryLimitExceeded
([^&#]+)([&#].*)?$                    → ✅ 通过
```

即**所有含 `{n}` 有界量词的正则都会被拒绝**，只有 `+` / `*` 无界量词的能通过。因此 DNR 无法完成"定长提取 + 分支"，返回格式判断只能交给 JS（V8 正则无此限制）。

### 其他

- 手动转换复用同一套 `convert.js`，弹窗经 `chrome.runtime.onMessage` 调用，由 `chrome.tabs.create()` 打开。
- 配置通过 `chrome.storage.sync` 持久化。

## 项目结构

```
fast-link/
├── manifest.json       # 扩展清单（MV3，权限 / 页面 / 中间页声明）
├── background.js       # Service Worker：DNR 拦截规则 + 弹窗消息处理
├── convert.js          # 共享的字符串转换逻辑（JS 正则）
├── redirect.html       # 中间跳转页
├── redirect.js         # 中间页判断与跳转逻辑
├── options.html        # 完整设置页（开关）
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
4. **自动拦截**：在地址栏访问 `https://autolinreserved.publicvm.com?wd=搜索词`，即可按规则自动跳转。
5. **手动转换**：点击工具栏 Auto Link 图标，在弹窗输入框**粘贴** 40 位 BT 哈希或 28 位百度分享码，点击「转换并打开」（或直接按回车），扩展会在新标签页中打开转换后的链接。
6. 在**设置页**（点击弹窗底部「打开完整设置页」进入）统一管理「Magnet 转换」和「百度网盘转换」开关。开关同时控制自动拦截与手动转换：关闭后，自动拦截场景下对应搜索词会落到兜底的百度搜索（需兜底开关已开启，否则原样放行），手动转换则会提示功能已关闭。

> 提示：若修改了代码，需在 `chrome://extensions/` 中点击该扩展的「刷新」按钮重新加载。

## 配置持久化

开关状态通过 `chrome.storage.sync` 保存。若 Chrome 开启了同步，配置还会跨设备同步。
