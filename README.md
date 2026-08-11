# Auto Link

一个 Google Chrome 扩展：在**弹窗**中粘贴**特定格式的字符串**，一键转换为对应链接并打开，免去手动拼链接的麻烦。

## 功能

支持两种字符串的识别与转换：

| 输入字符串格式 | 识别规则 | 转换结果 |
| --- | --- | --- |
| 40 位英文/数字混合（BT 哈希）<br/>如 `abc123abc123abc123abc123abc123abc123ab`（共 40 位） | 匹配 `[a-zA-Z0-9]{40}` | `magnet:?xt=urn:btih:<哈希>` |
| 28 位字符串（百度网盘分享码 + 提取码）<br/>如 `1W6PUbukIFsXCCEBKuGuKdg-n6g3` | 前 23 位 `[a-zA-Z0-9-]`，倒数第 5 位 `-`，后 4 位 `[a-zA-Z0-9]` | `https://pan.baidu.com/s/<23位>?pwd=<4位>` |

两个功能均可通过开关独立控制。

## 为什么是"手动转换"

早期版本尝试过**地址栏自动拦截**，但两种方案在普通 Chrome 下均不可行：

- `webRequest` + `["blocking"]`：需要 `webRequestBlocking` 权限，Chrome 110+ 仅对**企业策略（ExtensionInstallForcelist）**安装的扩展开放，普通手动安装的扩展无法使用。
- `declarativeNetRequest`：普通扩展虽可用，但 Chrome 会把**不含点号**的裸字符串（如 BT 哈希）直接当作**搜索词**送进搜索引擎，根本不会生成可匹配的 URL 请求，DNR 规则无法触发。

因此采用**弹窗手动转换**方案：用户粘贴字符串 → 扩展解析 → 打开新标签页。该方案不依赖任何请求拦截权限，稳定可靠。

## 技术实现

- **Manifest V3**。
- 转换逻辑为纯函数，在 `background.js` 的 Service Worker 中通过 `chrome.runtime.onMessage` 提供，弹窗调用后由 `chrome.tabs.create()` 打开目标链接。
- 配置通过 `chrome.storage.sync` 持久化。

## 项目结构

```
fast-link/
├── manifest.json       # 扩展清单（MV3，声明权限与页面）
├── background.js       # Service Worker：核心转换逻辑（纯函数 + 消息处理）
├── options.html        # 完整设置页（开关）
├── options.js          # 设置页逻辑
├── hello.html          # 弹窗面板（输入框 + 转换按钮 + 开关）
├── popup.js            # 弹窗逻辑
├── hello_extensions.png# 扩展图标
└── README.md
```

## 安装使用

1. 打开 Chrome，进入扩展管理页 `chrome://extensions/`。
2. 打开右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择本项目目录 `fast-link`。
4. 点击工具栏 Auto Link 图标，弹出面板。
5. 在输入框中**粘贴** 40 位 BT 哈希或 28 位百度分享码，点击「转换并打开」（或直接按回车）。
6. 扩展会在新标签页中打开转换后的链接。
7. 面板底部的开关和设置页可分别控制「Magnet 转换」和「百度网盘转换」是否启用。

> 提示：若修改了代码，需在 `chrome://extensions/` 中点击该扩展的「刷新」按钮重新加载。

## 配置持久化

开关状态通过 `chrome.storage.sync` 保存。若 Chrome 开启了同步，配置还会跨设备同步。
