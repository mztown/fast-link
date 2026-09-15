// ============================================================
// 中间页逻辑：读取 wd 搜索词，判断后跳转
// 运行在扩展页面上下文中，可直接访问 chrome.storage
// DEFAULTS / convert() / applyKeywordTemplate() 均来自 convert.js
// （已在 HTML 中先引入）
// ============================================================

const msgEl = document.getElementById("msg");

function show(text) {
  msgEl.textContent = text;
}

const params = new URLSearchParams(location.search);
const wd = params.get("wd") || "";

chrome.storage.sync.get(DEFAULTS, (s) => {
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

  // 2) 未命中规则 -> 按兜底开关决定，跳转到配置的搜索引擎
  if (s.enableFallbackSearch) {
    const target = applyKeywordTemplate(s.searchTemplate, wd);
    if (target) {
      location.replace(target);
      return;
    }
    show("兜底搜索引擎模板无效（必须包含 $s）：" + s.searchTemplate);
    return;
  }

  // 3) 兜底也关闭 -> 不做任何跳转
  show("未识别的字符串（兜底跳转已关闭）：" + wd);
});
