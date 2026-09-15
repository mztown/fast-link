// 设置页面逻辑：读取并保存开关与各类模板
// DEFAULTS 来自 convert.js（已在本页 <script> 中引入）

const SWITCH_KEYS = ["enableMagnet", "enableBaidu", "enableFallbackSearch"];

// 按 id 收集所有开关元素
const switches = {};
for (const key of SWITCH_KEYS) {
  switches[key] = document.getElementById(key);
}

const templateCard = document.getElementById("templateCard");
const saveStatus = document.getElementById("saveStatus");

let saveTimer = null;

function flashSaved() {
  saveStatus.classList.add("show");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveStatus.classList.remove("show"), 1500);
}

// 右栏（搜索引擎 / 拦截地址模板）仅在「兜底跳转搜索引擎」开启时展开
// 用 collapsed 类驱动宽度折叠 + 内容平移的动画
function updateTemplateVisibility() {
  templateCard.classList.toggle(
    "collapsed",
    !switches.enableFallbackSearch.checked
  );
}

// 模板输入通用绑定：失焦或回车时保存，校验必须含 $s
function bindTemplateInput(inputId, hintId, key, example) {
  const input = document.getElementById(inputId);
  const hint = document.getElementById(hintId);
  input.addEventListener("change", () => {
    const value = input.value.trim();
    if (!value.includes("$s")) {
      hint.textContent = "模板必须包含 $s 占位符，例如 " + example;
      hint.className = "hint error";
      return;
    }
    hint.textContent = "";
    hint.className = "hint";
    chrome.storage.sync.set({ [key]: value }, flashSaved);
  });
  return input;
}

const templateInput = bindTemplateInput(
  "matchTemplate",
  "templateHint",
  "matchTemplate",
  "https://example.com/?wd=$s"
);
const searchInput = bindTemplateInput(
  "searchTemplate",
  "searchHint",
  "searchTemplate",
  "https://cn.bing.com/search?q=$s"
);

// 加载已保存的配置
chrome.storage.sync.get(DEFAULTS, (items) => {
  for (const key of SWITCH_KEYS) {
    switches[key].checked = !!items[key];
  }
  templateInput.value = items.matchTemplate || "";
  searchInput.value = items.searchTemplate || "";

  // 初始定位不播放动画：先禁用过渡，定位后再恢复
  document.body.classList.add("no-anim");
  updateTemplateVisibility();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.remove("no-anim");
    });
  });
});

// ---- 开关：变化即保存 ----
function persistSwitches() {
  const patch = {};
  for (const key of SWITCH_KEYS) {
    patch[key] = switches[key].checked;
  }
  updateTemplateVisibility();
  chrome.storage.sync.set(patch, flashSaved);
}

for (const key of SWITCH_KEYS) {
  switches[key].addEventListener("change", persistSwitches);
}
