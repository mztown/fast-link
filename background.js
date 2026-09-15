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

// 处理导航
function handleNavigation(details) {
  if (details.frameId !== 0) return; // 只处理主框架
  if (!interceptRegex) return;
  if (details.url.startsWith(EXT_ORIGIN)) return; // 防循环

  const m = details.url.match(interceptRegex);
  if (!m) return;

  const keyword = extractKeyword(m[1]);

  // 识别「拦截地址已被设为浏览器默认搜索引擎」
  if (/[?&]autolinkdefault=true(?:&|$)/.test(details.url)) {
    chrome.storage.sync.set({ isDefalutSEDisabled: false });
  }

  // 1) 命中转换规则 -> 跳转目标服务
  const result = convert(keyword);
  if (result) {
    const enabled =
      result.type === "magnet" ? settings.enableMagnet : settings.enableBaidu;
    if (enabled) {
      chrome.tabs.update(details.tabId, { url: result.url });
    }
    return;
  }

  // 2) 未命中 -> 兜底跳转
  if (!settings.enableFallbackSearch) return;

  // 2a) 自定义搜索引擎
  if (settings.isDefaultSE) {
    const target = applyKeywordTemplate(settings.searchTemplate, keyword);
    if (target) chrome.tabs.update(details.tabId, { url: target });
    return;
  }

  // 2b) 浏览器默认搜索引擎
  if (chrome.search && typeof chrome.search.query === "function") {
    try {
      chrome.search.query({ text: keyword, tabId: details.tabId });
      return;
    } catch (e) {
      // 失败则走回退
    }
  }

  // 2c) 回退到自定义模板
  const target = applyKeywordTemplate(settings.searchTemplate, keyword);
  if (target) chrome.tabs.update(details.tabId, { url: target });
}

chrome.webNavigation.onBeforeNavigate.addListener(handleNavigation, {
  url: [{ schemes: ["http", "https"] }],
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
        sendResponse({ ok: false, error: "该功能已在设置页中关闭" });
        return false;
      }
      chrome.tabs.create({ url: result.url });
      sendResponse({ ok: true, result });
    } else {
      sendResponse({ ok: false, error: "无法识别该字符串格式" });
    }
  }
  return false;
});
