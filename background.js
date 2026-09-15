// ============================================================
// Auto Link：URL 拦截（webNavigation + tabs.update）+ 弹窗手动转换
// ============================================================
// 拦截地址由设置页配置的「拦截地址模板」决定，$s 表示搜索词位置，
// 默认：https://autolinreserved.publicvm.com/?wd=$s
//
// 为什么不用 declarativeNetRequest 重定向到扩展中间页？
// 1) DNR 只能做声明式匹配，无法执行 JS 分支判断；
// 2) 定长提取所需的正则（含 {n} 量词）在本环境受 RE2 2KB 限制，必被拒绝；
// 3) 重定向到 chrome-extension:// 页面并不被稳定支持，失败时请求会被
//    原样放行（于是落到目标服务器，看似「拦截失效」）。
//
// 因此改用 webNavigation.onBeforeNavigate 监听导航，在 JS 中完成判断，
// 再用 chrome.tabs.update 跳转。逻辑与弹窗手动转换共用 convert.js。

importScripts("convert.js");

let settings = { ...DEFAULTS };
let interceptRegex = null;

// 扩展根地址（用于防循环）
const EXT_ORIGIN = chrome.runtime.getURL("").replace(/\/$/, "");

// 由模板生成 JS 正则
function rebuildRegex() {
  interceptRegex = templateToJsRegex(settings.matchTemplate);
  console.log(
    "[Auto Link] 拦截正则：",
    interceptRegex ? interceptRegex.source : "(模板无效，必须包含 $s)"
  );
}

// 从捕获到的原始文本中取出搜索词（丢弃其后的 & 参数）
function extractKeyword(raw) {
  let kw = raw || "";
  const amp = kw.indexOf("&");
  if (amp !== -1) kw = kw.slice(0, amp);
  return kw;
}

// 安全跳转：标签页可能已被关闭或再次跳转，
// 此时 chrome.tabs.update 会 reject（No tab with id），静默忽略即可
function safeTabsUpdate(tabId, url) {
  if (!url) return;
  try {
    const p = chrome.tabs.update(tabId, { url });
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (e) {
    // 忽略
  }
}

// 处理导航
function handleNavigation(details) {
  if (details.frameId !== 0) return; // 只处理主框架
  if (!interceptRegex) return;
  if (details.url.startsWith(EXT_ORIGIN)) return; // 防循环

  const m = details.url.match(interceptRegex);
  if (!m) return;

  const keyword = extractKeyword(m[1]);

  // 识别「拦截地址已被设为浏览器默认搜索引擎」。
  // 此时浏览器的默认搜索引擎就是本拦截地址，若再调用 chrome.search.query
  // 会形成无限循环，因此本次导航强制跳过该分支，改用自定义搜索引擎；
  // 同时锁定 isDefaultSE / isDefalutSEDisabled，并解锁拦截地址模板的编辑。
  const hasAutolinkFlag = /[?&]autolinkdefault=true(?:&|$)/.test(details.url);
  let skipSearchQuery = false;

  if (hasAutolinkFlag) {
    skipSearchQuery = true;

    if (
      !settings.isDefaultSE ||
      settings.isDefalutSEDisabled ||
      !settings.blockEditEnabled
    ) {
      // 先更新内存缓存，避免每次导航都写 storage 触发写入配额限制
      settings.isDefaultSE = true;
      settings.isDefalutSEDisabled = false;
      settings.blockEditEnabled = true;
      try {
        const p = chrome.storage.sync.set({
          isDefaultSE: true,
          isDefalutSEDisabled: false,
          blockEditEnabled: true,
        });
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch (e) {
        // 忽略
      }
    }
  }

  // 1) 命中转换规则 -> 跳转目标服务
  const result = convert(keyword);
  if (result) {
    const enabled =
      result.type === "magnet" ? settings.enableMagnet : settings.enableBaidu;
    if (enabled) safeTabsUpdate(details.tabId, result.url);
    return;
  }

  // 2) 未命中 -> 兜底跳转
  if (!settings.enableFallbackSearch) return;

  // 默认搜索引擎 = 搜索引擎列表的第 0 项
  const defaultEngine = Array.isArray(settings.searchEngines)
    ? settings.searchEngines[0]
    : "";

  // 2a) 自定义搜索引擎
  if (settings.isDefaultSE) {
    safeTabsUpdate(
      details.tabId,
      applyKeywordTemplate(defaultEngine, keyword)
    );
    return;
  }

  // 2b) 浏览器默认搜索引擎
  //     检测到 autolinkdefault 时跳过（默认引擎即本拦截地址，会无限循环）
  if (
    !skipSearchQuery &&
    chrome.search &&
    typeof chrome.search.query === "function"
  ) {
    try {
      const p = chrome.search.query({ text: keyword, tabId: details.tabId });
      if (p && typeof p.then === "function") {
        p.then(() => {}).catch(() => {
          // 调用失败时回退到自定义模板
          safeTabsUpdate(
            details.tabId,
            applyKeywordTemplate(defaultEngine, keyword)
          );
        });
        return;
      }
      return; // 旧版回调形式
    } catch (e) {
      // 同步异常 -> 走回退
    }
  }

  // 2c) 回退到默认搜索引擎模板
  safeTabsUpdate(details.tabId, applyKeywordTemplate(defaultEngine, keyword));
}

chrome.webNavigation.onBeforeNavigate.addListener(handleNavigation, {
  url: [{ schemes: ["http", "https"] }],
});

// ============================================================
// 首次安装：写入默认搜索引擎列表
// ============================================================
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    try {
      const p = chrome.storage.sync.set({
        searchEngines: DEFAULTS.searchEngines.slice(),
      });
      if (p && typeof p.then === "function") {
        p.then(() => {
          console.log("[Auto Link] 首次安装，已写入默认搜索引擎列表");
        }).catch((err) => {
          console.warn("[Auto Link] 写入默认搜索引擎列表失败：", err);
        });
      }
    } catch (e) {
      console.warn("[Auto Link] 写入默认搜索引擎列表失败：", e);
    }
  }
});

// ============================================================
// 启动与配置同步
// ============================================================
chrome.storage.sync.get(DEFAULTS, (items) => {
  settings = { ...DEFAULTS, ...items };
  rebuildRegex();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  let needRebuild = false;
  for (const key of Object.keys(DEFAULTS)) {
    if (changes[key]) {
      settings[key] = changes[key].newValue;
      if (key === "matchTemplate") needRebuild = true;
    }
  }
  if (needRebuild) rebuildRegex();
});

// ============================================================
// 弹窗消息：手动转换
// ============================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "convert") {
    const result = convert(msg.text);
    if (result) {
      const key = result.type === "magnet" ? "enableMagnet" : "enableBaidu";
      if (!settings[key]) {
        sendResponse({
          ok: false,
          error: chrome.i18n.getMessage("featureDisabled") || "featureDisabled",
        });
        return false;
      }
      try {
        const p = chrome.tabs.create({ url: result.url });
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch (e) {
        // 忽略
      }
      sendResponse({ ok: true, result });
    } else {
      sendResponse({
        ok: false,
        error: chrome.i18n.getMessage("cannotRecognize") || "cannotRecognize",
      });
    }
  }
  return false;
});
