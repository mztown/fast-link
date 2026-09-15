// 设置页面逻辑：开关 + 拦截地址模板 + 搜索引擎有序列表
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
const seToggle = document.getElementById("seToggle");
const seList = document.getElementById("seList");
const seListInner = document.getElementById("seListInner");
const searchInput = document.getElementById("searchTemplate");
const searchHint = document.getElementById("searchHint");
const bingRewards = document.getElementById("bingRewards");

const MATCH_EXAMPLE = "https://example.com/?wd=$s";
const SEARCH_EXAMPLE = "https://cn.bing.com/search?q=$s";

let saveTimer = null;
let engines = []; // 搜索引擎有序列表，[0] 即默认搜索引擎

// ============================================================
// 通用
// ============================================================
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

// ---------------- 模态弹窗 ----------------
const modalMask = document.getElementById("modalMask");
const modalTitle = document.getElementById("modalTitle");
const modalText = document.getElementById("modalText");
const modalCancel = document.getElementById("modalCancel");
const modalConfirm = document.getElementById("modalConfirm");

let modalHandlers = { cancel: null, confirm: null };

function showModal(opts) {
  modalTitle.textContent = opts.title || "";
  modalText.innerHTML = opts.html || "";
  modalCancel.textContent = opts.cancelText || "取消";
  modalConfirm.textContent = opts.confirmText || "确定";
  modalHandlers = {
    cancel: opts.onCancel || null,
    confirm: opts.onConfirm || null,
  };
  modalMask.classList.add("open");
}

function closeModal() {
  modalMask.classList.remove("open");
  modalHandlers = { cancel: null, confirm: null };
}

modalCancel.addEventListener("click", () => {
  const fn = modalHandlers.cancel;
  closeModal();
  if (fn) fn();
});

modalConfirm.addEventListener("click", () => {
  const fn = modalHandlers.confirm;
  closeModal();
  if (fn) fn();
});

// 右栏整体：仅在「地址栏搜索」开启时展开
function updateTemplateVisibility() {
  templateCard.classList.toggle(
    "collapsed",
    !switches.enableFallbackSearch.checked
  );
}

// 「默认搜索引擎」卡片：仅在「自定义搜索引擎」开启时展开
// 用 collapsed 类驱动「从上方滑动展开」动画（与右栏动画参数一致）
function updateSearchEngineVisibility() {
  searchEngineCard.classList.toggle("collapsed", !isDefaultSE.checked);
}

// 校验模板必须包含 $s；通过返回去除空白后的值，否则返回 null
function checkTemplate(input, hint, example) {
  const value = input.value.trim();
  if (!value.includes("$s")) {
    hint.textContent = "模板必须包含 $s 占位符，例如 " + example;
    hint.className = "hint error";
    return null;
  }
  hint.textContent = "";
  hint.className = "hint";
  return value;
}

// ============================================================
// 拦截地址模板
// ============================================================
const templateInput = document.getElementById("matchTemplate");
const templateHint = document.getElementById("templateHint");

templateInput.addEventListener("change", () => {
  const value = checkTemplate(templateInput, templateHint, MATCH_EXAMPLE);
  if (value === null) return;
  chrome.storage.sync.set({ matchTemplate: value }, flashSaved);
});

// ============================================================
// 搜索引擎有序列表
// ============================================================
const ICONS = {
  down: '<path d="M6 9l6 6 6-6"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  pin: '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>',
  trash:
    '<path d="M4 7h16"/><path d="M6 7l1 12h10l1-12"/><path d="M9 7V4h6v3"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
};

function iconSvg(name) {
  return '<svg viewBox="0 0 24 24">' + ICONS[name] + "</svg>";
}

function makeIconButton(icon, title, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon-btn";
  btn.title = title;
  btn.innerHTML = iconSvg(icon);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

// Bing 积分商城推广链接：仅当默认搜索引擎为 bing.com 时显示
function updateBingPromo() {
  const tpl = (searchInput.value || "").toLowerCase();
  bingRewards.style.display = tpl.includes("bing.com") ? "block" : "none";
}

// 顶部输入框始终显示默认搜索引擎（engines[0]）
function syncDefaultEngine() {
  searchInput.value = engines[0] || "";
  updateBingPromo();
}

function saveEngines() {
  chrome.storage.sync.set({ searchEngines: engines.slice() }, flashSaved);
}

function renderEngines() {
  seListInner.innerHTML = "";

  engines.forEach((val, index) => {
    const row = document.createElement("div");
    row.className = "se-row";

    const label = document.createElement("span");
    label.className = "se-label";
    label.textContent = val || "(空)";
    label.title = val;
    label.addEventListener("click", () => startEdit(row, index));
    row.appendChild(label);

    const actions = document.createElement("div");
    actions.className = "se-actions";

    // 第一行已是默认，无需置顶按钮
    if (index > 0) {
      actions.appendChild(
        makeIconButton("pin", "置顶（设为默认搜索引擎）", () => pinToTop(index))
      );
    }
    actions.appendChild(
      makeIconButton("trash", "删除", () => removeEngine(index))
    );

    row.appendChild(actions);
    seListInner.appendChild(row);
  });

  // 最后一行：添加按钮
  const addRow = document.createElement("div");
  addRow.className = "se-row se-add-row";
  addRow.appendChild(makeIconButton("plus", "添加", addEngine));
  seListInner.appendChild(addRow);
}

// 点击 label -> 变为可编辑文本框；失焦后保存并变回 label
function startEdit(row, index) {
  const label = row.querySelector(".se-label");
  if (!label) return;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "se-edit-input";
  input.value = engines[index];
  row.replaceChild(input, label);
  input.focus();
  input.select();

  let finished = false;
  const commit = () => {
    if (finished) return;
    const value = input.value.trim();

    // 失焦时校验：必须包含 $s
    if (!value.includes("$s")) {
      showModal({
        title: "缺少 $s 占位符",
        html:
          "该项不包含 <code>$s</code> 占位符。<br /><br />" +
          "<code>$s</code> 用于代表您输入的搜索词——浏览器会把 <code>$s</code> " +
          "所在的位置替换为实际的搜索内容，例如：<br />" +
          "<code>https://cn.bing.com/search?q=$s</code>",
        cancelText: "删除该项",
        confirmText: "继续编辑",
        onCancel: () => {
          // 删除当前项
          finished = true;
          engines.splice(index, 1);
          saveEngines();
          renderEngines();
          if (index === 0) syncDefaultEngine();
        },
        onConfirm: () => {
          // 保持编辑态并让文本框重新获得焦点
          input.focus();
          input.select();
        },
      });
      return; // 不置 finished，允许用户继续编辑
    }

    finished = true;
    engines[index] = value;
    saveEngines();
    renderEngines();
    if (index === 0) syncDefaultEngine();
  };

  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    } else if (e.key === "Escape") {
      finished = true; // 放弃本次修改
      renderEngines();
    }
  });
}

function pinToTop(index) {
  const [item] = engines.splice(index, 1);
  engines.unshift(item);
  saveEngines();
  renderEngines();
  syncDefaultEngine();
}

function removeEngine(index) {
  engines.splice(index, 1);
  saveEngines();
  renderEngines();
  syncDefaultEngine();
}

function addEngine() {
  engines.push("");
  renderEngines();
  const rows = seListInner.querySelectorAll(".se-row:not(.se-add-row)");
  const newRow = rows[rows.length - 1];
  if (newRow) startEdit(newRow, engines.length - 1);
}

// 下拉 / 收起
function toggleList() {
  const open = seList.classList.toggle("open");
  seToggle.innerHTML = iconSvg(open ? "up" : "down");
  seToggle.title = open ? "收起列表" : "展开列表";
}

seToggle.addEventListener("click", toggleList);
seToggle.innerHTML = iconSvg("down"); // 初始为「下拉」图标

// 顶部输入框即默认搜索引擎（engines[0]），编辑后回写列表
searchInput.addEventListener("change", () => {
  const value = checkTemplate(searchInput, searchHint, SEARCH_EXAMPLE);
  if (value === null) return;
  engines[0] = value;
  saveEngines();
  renderEngines();
  updateBingPromo();
});

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
chrome.storage.sync.get(null, (all) => {
  const items = { ...DEFAULTS, ...all };

  for (const key of SWITCH_KEYS) {
    switches[key].checked = !!items[key];
  }
  templateInput.value = items.matchTemplate || "";

  // 搜索引擎列表：优先 searchEngines，其次从旧的 searchTemplate 迁移
  if (Array.isArray(all.searchEngines) && all.searchEngines.length) {
    engines = all.searchEngines.slice();
  } else if (all.searchTemplate) {
    engines = [all.searchTemplate];
  } else {
    engines = DEFAULTS.searchEngines.slice();
  }
  renderEngines();
  syncDefaultEngine();

  // 自定义搜索引擎：由 isDefaultSE 决定开关状态，
  // 由 isDefalutSEDisabled 决定是否禁用
  isDefaultSE.checked = !!items.isDefaultSE;
  isDefaultSE.disabled = !!items.isDefalutSEDisabled;

  // 初始定位不播放动画：先禁用过渡，定位后再恢复
  document.body.classList.add("no-anim");
  updateSearchEngineVisibility();
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
