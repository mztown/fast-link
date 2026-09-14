// 设置页面逻辑：读取并保存功能开关
const DEFAULTS = {
  enableMagnet: true,
  enableBaidu: true,
  enableFallbackSearch: false, // 兜底跳转百度搜索（当前暂停）
};

const SWITCH_KEYS = Object.keys(DEFAULTS);

// 按 id 收集所有开关元素
const switches = {};
for (const key of SWITCH_KEYS) {
  switches[key] = document.getElementById(key);
}
const saveStatus = document.getElementById("saveStatus");

let saveTimer = null;

// 加载已保存的配置
chrome.storage.sync.get(DEFAULTS, (items) => {
  for (const key of SWITCH_KEYS) {
    switches[key].checked = !!items[key];
  }
});

function persist() {
  const patch = {};
  for (const key of SWITCH_KEYS) {
    patch[key] = switches[key].checked;
  }
  chrome.storage.sync.set(patch, () => {
    saveStatus.classList.add("show");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveStatus.classList.remove("show"), 1500);
  });
}

// 开关变化时立即保存
for (const key of SWITCH_KEYS) {
  switches[key].addEventListener("change", persist);
}
