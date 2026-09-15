// 设置页面逻辑：读取并保存开关与拦截地址模板
// DEFAULTS 来自 convert.js（已在本页 <script> 中引入）

const SWITCH_KEYS = ["enableMagnet", "enableBaidu", "enableFallbackSearch"];

// 按 id 收集所有开关元素
const switches = {};
for (const key of SWITCH_KEYS) {
  switches[key] = document.getElementById(key);
}

const templateCard = document.getElementById("templateCard");
const templateInput = document.getElementById("matchTemplate");
const templateHint = document.getElementById("templateHint");
const saveStatus = document.getElementById("saveStatus");

let saveTimer = null;

function flashSaved() {
  saveStatus.classList.add("show");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveStatus.classList.remove("show"), 1500);
}

// 拦截地址模板仅在「兜底跳转百度搜索」开启时显示
function updateTemplateVisibility() {
  templateCard.style.display = switches.enableFallbackSearch.checked
    ? ""
    : "none";
}

// 加载已保存的配置
chrome.storage.sync.get(DEFAULTS, (items) => {
  for (const key of SWITCH_KEYS) {
    switches[key].checked = !!items[key];
  }
  templateInput.value = items.matchTemplate || "";
  updateTemplateVisibility();
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

// ---- 模板：失焦或回车时保存，并校验必须含 $s ----
templateInput.addEventListener("change", () => {
  const value = templateInput.value.trim();
  if (!value.includes("$s")) {
    templateHint.textContent =
      "模板必须包含 $s 占位符，例如 https://example.com/?wd=$s";
    templateHint.className = "hint error";
    return;
  }
  templateHint.textContent = "";
  templateHint.className = "hint";
  chrome.storage.sync.set({ matchTemplate: value }, flashSaved);
});
