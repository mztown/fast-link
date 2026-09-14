// ============================================================
// 中间页逻辑：读取 wd 搜索词，判断后跳转
// 运行在扩展页面上下文中，可直接访问 chrome.storage
// ============================================================

const DEFAULTS = {
  enableMagnet: true,
  enableBaidu: true,
  enableFallbackSearch: false, // 兜底跳转百度搜索（当前暂停）
};

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
    const enabled =
      result.type === "magnet" ? s.enableMagnet : s.enableBaidu;
    if (enabled) {
      location.replace(result.url);
      return;
    }
    show("该功能已在设置页中关闭：" + wd);
    return;
  }

  // 2) 未命中规则 -> 按兜底开关决定
  if (s.enableFallbackSearch) {
    location.replace("https://www.baidu.com/s?wd=" + encodeURIComponent(wd));
    return;
  }

  // 3) 兜底也关闭 -> 不做任何跳转
  show("未识别的字符串（兜底跳转已关闭）：" + wd);
});
