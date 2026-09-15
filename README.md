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
| `searchEngines` | 搜索引擎有序列表（第 0 项为默认搜索引擎） | 含 Bing / Google / DuckDuckGo / Ecosia / Yahoo / Yandex 六项，详见 `convert.js` |
| `isDefaultSE` | 自定义搜索引擎开关（检测到 `autolinkdefault=true` 后自动置为 `true`） | `false` |
| `isDefalutSEDisabled` | 上项开关是否禁用（同上，自动置为 `false` 以解除禁用） | `true` |
| `blockEditEnabled` | 拦截地址模板是否允许编辑（同上，自动解锁为 `true`） | `false` |

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

「拦截 → 判断 → 跳转」全部在后台一次完成：

1. **拦截与判断**（`background.js`）
   读取设置页配置的**拦截地址模板**，用 `templateToJsRegex()` 把 `$s` 处替换为
   捕获组 `(.+?)`、其余部分做正则转义（并让 `http`/`https` 均可匹配），得到
   一个 **JS 正则**；再用 `chrome.webNavigation.onBeforeNavigate` 监听主框架导航：

   ```
   导航到匹配模板的地址
     → 正则提取 $s 处的搜索词
     → convert() 判断（百度网盘 / magnet）
     → chrome.tabs.update(tabId, { url }) 跳转
   ```

2. **兜底跳转**
   未命中转换规则时，若「兜底跳转搜索引擎」开启：
   - `isDefaultSE = true` → 使用列表第 0 项（自定义搜索引擎）
   - `isDefaultSE = false` → 使用 `chrome.search.query()` 走浏览器默认搜索引擎

   （`chrome.search` 不可用时会自动回退到列表第 0 项）

### 为什么不用 declarativeNetRequest

早期版本用 DNR 把请求重定向到扩展中间页，但存在三个硬伤：

1. **无法执行分支判断** —— DNR 是声明式的，不能跑 JS；
2. **正则受 2KB 限制** —— 实测本环境下所有含 `{n}` 有界量词的正则都被拒绝：

   ```
   (.{23})-(.{4})                        → memoryLimitExceeded
   (.{40})                               → memoryLimitExceeded
   ([a-zA-Z0-9-]{23})-([a-zA-Z0-9]{4})   → memoryLimitExceeded
   ```

   于是无法用 DNR 正则做「定长提取」；
3. **重定向到 `chrome-extension://` 不可靠** —— 失败时请求会被**原样放行**，
   落到目标服务器（表现就是「拦截似乎失效」）。

改用 `webNavigation` + `tabs.update` 后，判断逻辑在 JS 中执行，完全不受上述限制。

### 自动识别「已设为默认搜索引擎」

设置页「拦截地址模板」右侧的「添加为浏览器搜索引擎」会复制形如
`https://autolinreserved.publicvm.com/?wd=%s&autolinkdefault=true` 的地址
（`$s` 转为浏览器所需的 `%s`，并追加 `autolinkdefault=true`）。

用户把它设为浏览器默认搜索引擎后，每次地址栏搜索都会带上该参数。扩展拦截到
`autolinkdefault=true` 时会：

1. **跳过 `chrome.search.query`** —— 此时浏览器的默认搜索引擎就是本拦截地址，
   若继续调用会形成无限循环；
2. 把 `isDefaultSE` 置为 `true`、`isDefalutSEDisabled` 置为 `false`，
   即打开「自定义搜索引擎」开关并解除其禁用状态（用户仍可自行关闭）；
3. 把 `blockEditEnabled` 置为 `true`，解锁「拦截地址模板」的编辑；
4. 然后照常进入转换 / 兜底跳转的判断逻辑。

### 其他

- 手动转换复用同一套 `convert.js`，弹窗经 `chrome.runtime.onMessage` 调用，由 `chrome.tabs.create()` 打开。
- 所有配置（`matchTemplate`、`searchEngines`、各开关）通过 `chrome.storage.sync` 持久化；
  拦截模板变更后实时重建 DNR 规则。

## 项目结构

```
fast-link/
├── manifest.json       # 扩展清单（MV3，权限 / 页面 / 默认语言）
├── background.js       # Service Worker：URL 拦截 + 判断 + 跳转 + 弹窗消息
├── convert.js          # 共享配置、转换逻辑与模板转正则
├── i18n.js             # 多语言渲染辅助（data-i18n 等属性）
├── _locales/           # 多语言文案
│   ├── en/messages.json
│   └── zh_CN/messages.json
├── options.html        # 完整设置页（模板 + 开关）
├── options.js          # 设置页逻辑
├── hello.html          # 弹窗面板（输入框 + 转换按钮）
├── popup.js            # 弹窗逻辑
├── hello_extensions.png# 扩展图标
├── PRIVACY.md          # 隐私政策
└── README.md
```

## 多语言

所有文案放在 `_locales/<locale>/messages.json`，通过 `chrome.i18n` 读取：

| 用途 | 方式 |
| --- | --- |
| manifest 的 `name` / `description` | `__MSG_extName__` / `__MSG_extDesc__`（配合 `default_locale`） |
| HTML 静态文案 | `data-i18n` / `data-i18n-html` / `data-i18n-title` / `data-i18n-placeholder` 属性，由 `i18n.js` 自动渲染 |
| JS 动态文案 | `t("key")`（由 `i18n.js` 提供，可传占位符参数，如 `t("guideTitle", [name])`） |

当前支持 **`en`（默认）** 与 **`zh_CN`**。新增语言只需在 `_locales` 下新建目录（如 `ja`）并复制翻译一份 `messages.json`，**无需改动任何代码**。

> ⚠️ 文案中的 `$` 必须写成 `$$`（例如 `$$s`），否则会被当作占位符解析。

> 注：`redirect.html` / `redirect.js` 是早期中间页方案的遗留文件，现已不再使用，可自行删除。

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

## 版权与声明

© 2026 Auto Link

- 完整的隐私说明见 [PRIVACY.md](./PRIVACY.md)。
- 本扩展**不收集、不上传任何用户数据**，所有匹配与转换均在本地完成。
- 设置页中的「微软积分商城」链接为**推广链接**（URL 中含推荐码），
  你通过该链接注册后，作者可能获得收益。
- 自动拦截会修改符合条件的 URL 的访问目标，使用前请确认这与你的预期一致。
