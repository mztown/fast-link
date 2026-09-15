// ============================================================
// Auto Link：按可配置模板拦截地址（经中间页判断）+ 弹窗手动转换
// ============================================================
// 拦截规则由设置页配置的「拦截地址模板」决定，模板中的 $s 表示搜索词位置，
// 默认：https://autolinreserved.publicvm.com/?wd=$s
//
// 为什么经中间页判断？
// Chrome DNR 的 regexFilter 基于 RE2，单条正则编译后不得超过 2KB。
// 实测本环境下所有含 {n} 有界量词的正则（如 (.{23})-(.{4})）都会
// memoryLimitExceeded，无法用 DNR 正则做「定长提取 + 分支」。
// 因此 DNR 只负责最简拦截与转发，判断逻辑交给中间页 JS。

importScripts("convert.js");

let settings = { ...DEFAULTS };

const RULE_ID = 1;

// 扩展根地址，如 chrome-extension://abcdefg
const EXT_ORIGIN = chrome.runtime.getURL("").replace(/\/$/, "");

// 串行化：避免 storage.get 回调与 storage.onChanged 并发调用
// 造成 "Rule with id 1 does not have a unique ID" 冲突
let updateChain = Promise.resolve();

function updateRules() {
  updateChain = updateChain.then(applyRules).catch((err) => {
    console.error("[Auto Link] 更新 DNR 规则失败：", err);
  });
  return updateChain;
}

async function applyRules() {
  // 需要清除的规则 id：所有已存在的 + 本规则 id
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map((r) => r.id);
  if (!removeIds.includes(RULE_ID)) removeIds.push(RULE_ID);

  // 由模板构造拦截正则
  const regexFilter = templateToRegex(settings.matchTemplate);
  if (!regexFilter) {
    console.warn(
      "[Auto Link] 拦截模板无效（必须包含 $s）：",
      settings.matchTemplate
    );
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeIds,
    });
    return;
  }

  // 校验正则是否可编译
  const check = await chrome.declarativeNetRequest.isRegexSupported({
    regex: regexFilter,
  });
  if (!check.isSupported) {
    console.error("[Auto Link] 拦截正则无法编译：", check.reason, regexFilter);
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeIds,
    });
    return;
  }

  const rule = {
    id: RULE_ID,
    priority: 1,
    action: {
      type: "redirect",
      redirect: {
        regexSubstitution: EXT_ORIGIN + "/redirect.html?wd=\\1",
      },
    },
    condition: {
      regexFilter,
      resourceTypes: ["main_frame"],
    },
  };

  // 同一次调用中同时删除与添加：Chrome 保证先删后加，天然避免 id 冲突
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules: [rule],
  });
  console.log("[Auto Link] 拦截规则已注册：", regexFilter);
  console.log("[Auto Link] 中间页地址：", EXT_ORIGIN + "/redirect.html");
}

// ============================================================
// 启动与配置同步
// ============================================================
chrome.storage.sync.get(DEFAULTS, async (items) => {
  settings = { ...DEFAULTS, ...items };
  await updateRules();
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
  // 模板变化才需要重建 DNR 规则；开关只影响中间页判断
  if (needRebuild) updateRules();
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
