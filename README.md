# Auto Link

一个 Google Chrome 扩展：在地址栏输入**特定格式的字符串**并回车时，自动将其重定向到正确的链接，无需手动拼链接。

## 功能

支持两种字符串的自动识别与跳转：

| 输入字符串格式 | 识别规则 | 重定向到 |
| --- | --- | --- |
| 40 位英文/数字混合（BT 哈希）<br/>如 `abc123...abc123`（共 40 位） | 匹配 `[a-zA-Z0-9]{40}` | `magnet:?xt=urn:btih:<哈希>` |
| 28 位字符串（百度网盘分享码 + 提取码）<br/>如 `1W6PUbukIFsXCCEBKuGuKdg-n6g3` | 前 23 位 `[a-zA-Z0-9-]`，倒数第 5 位 `-`，后 4 位 `[a-zA-Z0-9]` | `https://pan.baidu.com/s/<23位>?pwd=<4位>` |

两个功能均可通过开关独立控制。

## 技术实现

- **Manifest V3**，使用 `declarativeNetRequest` API 实现请求重定向。
- 通过 `regexFilter` + `regexSubstitution` 在浏览器内核完成"提取字符串并重新拼接 URL"，无需后台 JS 常驻拦截。
- 配置通过 `chrome.storage.sync` 持久化，并在 Service Worker 中监听 `storage.onChanged` 实时刷新 DNR 动态规则。
- 正则经过优化以符合 DNR 的 2KB 编译内存限制，并在运行时用 `isRegexSupported()` 做校验兜底。

> 说明：早期版本曾使用 `webRequest` + `["blocking"]` 方案，但该方式需要 `webRequestBlocking` 权限，而 Chrome 110+ 仅对企业策略安装的扩展开放。故改用对普通扩展可用的 `declarativeNetRequest`。

## 项目结构

```
fast-link/
├── manifest.json       # 扩展清单（MV3，声明权限与页面）
├── background.js       # Service Worker：注册/更新 DNR 重定向规则
├── options.html        # 完整设置页（开关）
├── options.js          # 设置页逻辑
├── hello.html          # 弹窗快捷面板（开关）
├── popup.js            # 弹窗逻辑
├── hello_extensions.png# 扩展图标
└── README.md
```

## 安装使用

1. 打开 Chrome，进入扩展管理页 `chrome://extensions/`。
2. 打开右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择本项目目录 `fast-link`。
4. 在地址栏输入符合规则的字符串并回车，即可自动跳转到目标链接。
5. 点击工具栏扩展图标（弹窗）或进入扩展设置页，可分别开关「Magnet 转换」和「百度网盘转换」。

## 配置持久化

开关状态通过 `chrome.storage.sync` 保存。若 Chrome 开启了同步，配置还会跨设备同步。
