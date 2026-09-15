// 设置页面逻辑：读取并保存开关与各类模板
// DEFAULTS 来自 convert.js（已在本页 <script> 中引入）

const SWITCH_KEYS = ["enableMagnet", "enableBaidu", "enableFallbackSearch"];

// 按 id 收集所有开关元素
const switches = {};
for (const key of SWITCH_KEYS) {
  switches[key] = document.getElementById(key);
}

const templateCard = document.getElementById("templateCard");
const searchEngineCard = document.getElementById("searchEngineCard");
const isDefaultSE = document.getElementById("isDefaultSE");
const saveStatus = document.getElementById("saveStatus");
const addAsSearchEngine = document.getElementById("addAsSearchEngine");
const seGuide = document.getElementById("seGuide");

let saveTimer = null;

// 底部 toast（复用「已保存」提示条）
function flashToast(text) {
  saveStatus.textContent = text || "已保存";
  saveStatus.classList.add("show");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveStatus.classList.remove("show");
    saveStatus.textContent = "已保存";
  }, 1800);
}

function flashSaved() {
  flashToast("已保存");
}

// 右栏整体：仅在「兜底跳转搜索引擎」开启时展开
// 用 collapsed 类驱动宽度折叠 + 内容平移的动画
function updateTemplateVisibility() {
  templateCard.classList.toggle(
    "collapsed",
    !switches.enableFallbackSearch.checked
  );
}

// 「兜底搜索引擎」卡片：仅在「自定义搜索引擎」开启时显示
function updateSearchEngineVisibility() {
  searchEngineCard.style.display = isDefaultSE.checked ? "" : "none";
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

// Bing 积分商城推广链接：仅当兜底搜索引擎为 bing.com 时显示
const bingRewards = document.getElementById("bingRewards");

function updateBingPromo() {
  const tpl = (searchInput.value || "").toLowerCase();
  bingRewards.style.display = tpl.includes("bing.com") ? "block" : "none";
}

// 输入时实时判断
searchInput.addEventListener("input", updateBingPromo);

// ============================================================
// 添加为浏览器搜索引擎
// ============================================================
function detectBrowser() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "edge";
  if (/OPR\//.test(ua)) return "opera";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Chrome\//.test(ua)) return "chrome";
  return "other";
}

// 生成可点击的设置页链接
function urlLink(url) {
  return '<a class="url-link" data-url="' + url + '">' + url + "</a>";
}

const BROWSER_GUIDE = {
  chrome: {
    name: "Chrome",
    steps: [
      "在地址栏打开 " + urlLink("chrome://settings/searchEngines"),
      "在「网站搜索」区域点击「添加」",
      "「网址」一栏粘贴刚复制的地址（<code>$s</code> 已转为 <code>%s</code>，并附带 <code>autolinkdefault=true</code>）",
      "「名称」「快捷字词」可随意填写，保存",
      "点击该项右侧「⋮」→「设为默认」",
    ],
  },
  edge: {
    name: "Edge",
    steps: [
      "在地址栏打开 " + urlLink("edge://settings/searchEngines"),
      "点击「添加搜索引擎」",
      "「URL（使用 %s 代替搜索字词）」粘贴刚复制的地址（已附带 <code>autolinkdefault=true</code>）",
      "「名称」「快捷方式」可随意填写，点击「添加」",
      "在列表最下方找到刚添加的搜索引擎，点击该项右侧「⋮」→「设为默认」",
    ],
  },
  opera: {
    name: "Opera",
    steps: [
      "在地址栏打开 " + urlLink("opera://settings/searchEngines"),
      "在「搜索引擎」区域点击「添加」",
      "「网址」粘贴刚复制的地址",
      "保存后点击「设为默认」",
    ],
  },
  firefox: {
    name: "Firefox",
    steps: [
      "打开 " + urlLink("about:preferences#search"),
      "Firefox 不支持直接粘贴 URL 添加自定义搜索引擎，需借助 OpenSearch 描述文件",
      "如需此功能，建议改用 Chrome 或 Edge",
    ],
  },
  other: {
    name: "浏览器",
    steps: [
      "打开浏览器的「搜索引擎」设置页",
      "添加一个新的搜索引擎，「网址」粘贴刚复制的地址",
      "将其设为默认",
    ],
  },
};

function showSearchEngineGuide() {
  const g = BROWSER_GUIDE[detectBrowser()] || BROWSER_GUIDE.other;
  seGuide.innerHTML =
    "<strong>如何设为默认搜索引擎（" +
    g.name +
    "）</strong><ol>" +
    g.steps.map((s) => "<li>" + s + "</li>").join("") +
    "</ol>";
  seGuide.style.display = "block";
}

addAsSearchEngine.addEventListener("click", async () => {
  const raw = (templateInput.value || "").trim() || DEFAULTS.matchTemplate;
  // 浏览器的自定义搜索引擎要求用 %s 表示搜索词，这里把 $s 转成 %s
  let forBrowser = raw.split("$s").join("%s");
  // 末尾追加 autolinkdefault=true：
  // 用户把该地址设为默认搜索引擎后，地址栏搜索会带上此参数，
  // 扩展据此识别「已设为默认搜索引擎」并解锁「自定义搜索引擎」开关
  const sep = forBrowser.indexOf("?") === -1 ? "?" : "&";
  forBrowser += sep + "autolinkdefault=true";

  try {
    await navigator.clipboard.writeText(forBrowser);
    flashToast("已将拦截地址复制到剪贴板");
  } catch (err) {
    flashToast("复制失败：" + (err && err.message ? err.message : err));
  }
  showSearchEngineGuide();
});

// 复制设置页地址并提示（扩展无权打开 chrome:// 时降级）
async function copySettingsUrl(url) {
  try {
    await navigator.clipboard.writeText(url);
    flashToast("浏览器不允许扩展直接打开设置页，地址已复制，请粘贴到地址栏");
  } catch (e) {
    flashToast("请手动在地址栏打开：" + url);
  }
}

// 尝试打开浏览器设置页；扩展通常无权打开 chrome:// / edge:// 等内部页面，
// 失败时降级为复制到剪贴板
function openBrowserSettings(url) {
  try {
    chrome.tabs.create({ url }, () => {
      if (chrome.runtime.lastError) {
        copySettingsUrl(url);
      }
    });
  } catch (e) {
    copySettingsUrl(url);
  }
}

// 指引内的设置页链接：事件委托
seGuide.addEventListener("click", (e) => {
  const link = e.target.closest(".url-link");
  if (!link) return;
  e.preventDefault();
  openBrowserSettings(link.dataset.url);
});

// ============================================================
// 加载已保存的配置
// ============================================================
chrome.storage.sync.get(DEFAULTS, (items) => {
  for (const key of SWITCH_KEYS) {
    switches[key].checked = !!items[key];
  }
  templateInput.value = items.matchTemplate || "";
  searchInput.value = items.searchTemplate || "";
  updateBingPromo();

  // 自定义搜索引擎：由 isDefaultSE 决定开关状态，
  // 由 isDefalutSEDisabled 决定是否禁用
  isDefaultSE.checked = !!items.isDefaultSE;
  isDefaultSE.disabled = !!items.isDefalutSEDisabled;
  updateSearchEngineVisibility();

  // 初始定位不播放动画：先禁用过渡，定位后再恢复
  document.body.classList.add("no-anim");
  updateTemplateVisibility();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.remove("no-anim");
    });
  });
});

// ---- 各规则开关：变化即保存 ----
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

// ---- 自定义搜索引擎开关 ----
isDefaultSE.addEventListener("change", () => {
  updateSearchEngineVisibility();
  chrome.storage.sync.set({ isDefaultSE: isDefaultSE.checked }, flashSaved);
});
