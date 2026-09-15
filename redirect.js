// ============================================================
// 中间页逻辑：读取 wd 搜索词，判断后跳转
// 运行在扩展页面上下文中，可直接访问 chrome.* API
// DEFAULTS / convert() / applyKeywordTemplate() 均来自 convert.js
// （已在 HTML 中先引入）
// ============================================================

const msgEl = document.getElementById("msg");

function show(text) {
  msgEl.textContent = text;
}

const params = new URLSearchParams(location.search);
const wd = params.get("wd") || "";

// 用浏览器默认搜索引擎搜索
// 返回 Promise<boolean>：true 表示调用成功，false 表示不可用/失败（需回退）
function searchWithDefaultEngine(keyword) {
  if (!chrome.search || typeof chrome.search.query !== "function") {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    try {
      const maybePromise = chrome.search.query({
        text: keyword,
        disposition: "CURRENT_TAB",
      });
      if (maybePromise && typeof maybePromise.then === "function") {
        // Chrome 96+ 的 Promise 形式
        maybePromise.then(() => resolve(true)).catch(() => resolve(false));
      } else {
        // 旧版回调形式：用 lastError 判断
        resolve(!chrome.runtime.lastError);
      }
    } catch (e) {
      resolve(false);
    }
  });
}

// 回退：用配置的 searchTemplate 跳转
function gotoSearchTemplate(s) {
  const target = applyKeywordTemplate(s.searchTemplate, wd);
  if (target) {
    location.replace(target);
    return true;
  }
  return false;
}

(async () => {
  // 若 URL 带有 autolinkdefault=true（由设置页「添加为浏览器搜索引擎」生成），
  // 说明拦截地址已被设为浏览器默认搜索引擎 -> 解锁「自定义搜索引擎」开关
  if (params.get("autolinkdefault") === "true") {
    await chrome.storage.sync.set({ isDefalutSEDisabled: false });
  }

  const s = await chrome.storage.sync.get(DEFAULTS);
  const result = convert(wd); // convert 来自 convert.js

  // 1) 命中转换规则且对应开关开启 -> 跳转目标服务
  if (result) {
    const enabled = result.type === "magnet" ? s.enableMagnet : s.enableBaidu;
    if (enabled) {
      location.replace(result.url);
      return;
    }
    show("该功能已在设置页中关闭：" + wd);
    return;
  }

  // 2) 未命中规则且兜底关闭 -> 停下并提示
  if (!s.enableFallbackSearch) {
    show("未识别的字符串（兜底跳转已关闭）：" + wd);
    return;
  }

  // 3) 开启「自定义搜索引擎」-> 使用 searchTemplate
  if (s.isDefaultSE) {
    if (gotoSearchTemplate(s)) return;
    show("兜底搜索引擎模板无效（必须包含 $s）：" + s.searchTemplate);
    return;
  }

  // 4) 未开启「自定义搜索引擎」-> 用浏览器默认搜索引擎
  const ok = await searchWithDefaultEngine(wd);
  if (ok) return;

  // 5) 浏览器默认引擎不可用时，回退到 searchTemplate
  if (gotoSearchTemplate(s)) return;
  show("无法调用浏览器默认搜索引擎，也未配置兜底搜索引擎模板。");
})();
