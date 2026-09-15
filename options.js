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
  saveStatus.textContent = text || t("savedToast");
  saveStatus.classList.add("show");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveStatus.classList.remove("show");
    saveStatus.textContent = t("savedToast");
  }, 1800);
}

function flashSaved() {
  // storage 写入失败（例如超出 sync 配额）时给出提示
  if (chrome.runtime.lastError) {
    flashToast(t("saveFailed") + chrome.runtime.lastError.message);
    return;
  }
  flashToast(t("savedToast"));
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
    hint.textContent = t("templateNeedS", [example]);
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
    label.textContent = val || t("emptyItem");
    label.title = val;
    label.addEventListener("click", () => startEdit(row, index));
    row.appendChild(label);

    const actions = document.createElement("div");
    actions.className = "se-actions";

    // 第一行已是默认，无需置顶按钮
    if (index > 0) {
      actions.appendChild(
        makeIconButton("pin", t("tipPin"), () => pinToTop(index))
      );
    }
    actions.appendChild(
      makeIconButton("trash", t("tipDelete"), () => removeEngine(index))
    );

    row.appendChild(actions);
    seListInner.appendChild(row);
  });

  // 最后一行：添加按钮
  const addRow = document.createElement("div");
  addRow.className = "se-row se-add-row";
  addRow.appendChild(makeIconButton("plus", t("tipAdd"), addEngine));
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
        title: t("modalMissingTitle"),
        html: t("modalMissingBody"),
        cancelText: t("modalDelete"),
        confirmText: t("modalContinue"),
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
  seToggle.title = open ? t("tipCollapse") : t("tipExpand");
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

// 各浏览器的名称、设置页地址与指引文案键（文案取自 _locales）
const BROWSER_CONFIG = {
  chrome: {
    nameKey: "browserChrome",
    url: "chrome://settings/searchEngines",
    stepsKey: "guideChromeSteps",
    urlInSteps: false,
  },
  edge: {
    nameKey: "browserEdge",
    url: "edge://settings/searchEngines",
    stepsKey: "guideEdgeSteps",
    urlInSteps: false,
  },
  opera: {
    nameKey: "browserOpera",
    url: "opera://settings/searchEngines",
    stepsKey: "guideOperaSteps",
    urlInSteps: false,
  },
  firefox: {
    nameKey: "browserFirefox",
    url: "about:preferences#search",
    stepsKey: "guideFirefoxSteps",
    urlInSteps: true, // 链接已内嵌在该文案中
  },
};

function showSearchEngineGuide() {
  const cfg = BROWSER_CONFIG[detectBrowser()] || {
    nameKey: "browserOther",
    url: "",
    stepsKey: "guideOtherSteps",
    urlInSteps: false,
  };

  const title = t("guideTitle", [t(cfg.nameKey)]);
  const openStep = cfg.url
    ? "<li>" + t("guideOpenUrl", [urlLink(cfg.url)]) + "</li>"
    : "";
  const steps = cfg.urlInSteps
    ? t(cfg.stepsKey, [urlLink(cfg.url)])
    : openStep + t(cfg.stepsKey);

  seGuide.innerHTML = "<strong>" + title + "</strong><ol>" + steps + "</ol>";
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
    flashToast(t("copiedIntercept"));
  } catch (err) {
    flashToast(t("copyFailed") + (err && err.message ? err.message : err));
  }
  showSearchEngineGuide();
});

// 复制设置页地址并提示（扩展无权打开 chrome:// 时降级）
async function copySettingsUrl(url) {
  try {
    await navigator.clipboard.writeText(url);
    flashToast(t("settingsUrlCopied"));
  } catch (e) {
    flashToast(t("manualOpenUrl", [url]));
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
  // 拦截地址模板：由 blockEditEnabled 决定是否允许编辑
  // （检测到 autolinkdefault=true 后会被置为 true 而解锁）
  // 未解锁时隐藏（display:none 仍可被程序读写 value，只是不可见）
  templateInput.style.display = items.blockEditEnabled ? "" : "none";
  templateInput.title = items.blockEditEnabled ? "" : t("tipTemplateLocked");

  // 搜索引擎列表：优先使用已保存的 searchEngines；
  // 否则以默认列表（Bing 位于首位）为基础，
  // 并把旧的单项 searchTemplate 追加到末尾，避免丢失用户配置
  if (Array.isArray(all.searchEngines) && all.searchEngines.length) {
    engines = all.searchEngines.slice();
  } else {
    engines = DEFAULTS.searchEngines.slice();
    if (all.searchTemplate && !engines.includes(all.searchTemplate)) {
      engines.push(all.searchTemplate);
    }
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

// 其他上下文（如拦截触发时）修改了配置，这里实时同步 UI
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;

  if (changes.blockEditEnabled) {
    const enabled = !!changes.blockEditEnabled.newValue;
    templateInput.style.display = enabled ? "" : "none";
    templateInput.title = enabled ? "" : t("tipTemplateLocked");
  }

  if (changes.isDefaultSE) {
    isDefaultSE.checked = !!changes.isDefaultSE.newValue;
    updateSearchEngineVisibility();
  }

  if (changes.isDefalutSEDisabled) {
    isDefaultSE.disabled = !!changes.isDefalutSEDisabled.newValue;
  }
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
