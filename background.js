// ============================================================
// Auto Link：地址拦截（经中间页判断）+ 弹窗手动转换
// ============================================================
// 为什么不用 DNR 正则直接完成判断？
// Chrome DNR 的 regexFilter 使用 RE2，有 2KB 编译内存限制。本环境下
// 连 (.{23})-(.{4}) 这类含 {n} 有界量词的正则都会 memoryLimitExceeded，
// 因此无法用 DNR 正则做「定长提取 + 分支 + 拼接」。
//
// 现方案：DNR 只做最简单的拦截与转发，把 wd 参数原样带给扩展中间页，
// 由中间页的 JS（无 2KB 限制）完成判断与跳转：
//   访问 publicvm.com/?wd=xxx
//     -> DNR 正则 (.*) 拦截
//     -> 重定向到 chrome-extension://<id>/redirect.html?wd=xxx
//     -> redirect.js 调用 convert() 判断后跳转

importScripts("convert.js");

const DEFAULTS = {
  enableMagnet: true,
  enableBaidu: true,
  enableFallbackSearch: false, // 兜底跳转百度搜索（当前暂停）
};
let settings = { ...DEFAULTS };

const RULE_ID = 1;

// 扩展根地址，如 chrome-extension://abcdefg
const EXT_ORIGIN = chrome.runtime.getURL("").replace(/\/$/, "");

// DNR 规则：拦截目标地址，转发到中间页并带上 wd
// 正则使用无界量词 (.*)，必然可编译通过
const REDIRECT_RULE = {
  id: RULE_ID,
  priority: 1,
  action: {
    type: "redirect",
    redirect: {
      regexSubstitution: EXT_ORIGIN + "/redirect.html?wd=\\1",
    },
  },
  condition: {
    regexFilter: "^https?://autolinreserved\\.publicvm\\.com/?\\?wd=(.*)$",
    resourceTypes: ["main_frame"],
  },
};

async function updateRules() {
  try {
    // 先清除全部历史动态规则，避免旧规则残留
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const ids = existing.map((r) => r.id);
    if (ids.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: ids,
      });
      console.log("[Auto Link] 已清除历史规则：", ids);
    }

    // 校验拦截正则（应始终通过）
    const check = await chrome.declarativeNetRequest.isRegexSupported({
      regex: REDIRECT_RULE.condition.regexFilter,
    });
    if (!check.isSupported) {
      console.error("[Auto Link] 拦截正则无法编译：", check.reason);
      return;
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [REDIRECT_RULE],
    });
    console.log("[Auto Link] 拦截规则已注册：", REDIRECT_RULE.condition.regexFilter);
    console.log("[Auto Link] 中间页地址：", EXT_ORIGIN + "/redirect.html");
  } catch (err) {
    console.error("[Auto Link] 更新 DNR 规则失败：", err);
  }
}

// ============================================================
// 启动与配置同步
// ============================================================
chrome.storage.sync.get(DEFAULTS, async (items) => {
  settings = { ...DEFAULTS, ...items };
  await updateRules();
});

// 开关变化：判断逻辑在中间页实时读取 storage，这里只同步内存缓存
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  for (const key of Object.keys(DEFAULTS)) {
    if (changes[key]) settings[key] = changes[key].newValue;
  }
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
