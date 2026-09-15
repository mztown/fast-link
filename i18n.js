// ============================================================
// 多语言辅助
// 把带有以下 data-* 标记的元素文本替换为 chrome.i18n 文案：
//   data-i18n              -> textContent
//   data-i18n-html         -> innerHTML（文案中可含标签）
//   data-i18n-title        -> title 属性
//   data-i18n-placeholder  -> placeholder 属性
// ============================================================

/**
 * 取文案；缺失时回退为 key 本身。
 * @param {string} key 文案键名
 * @param {string|string[]} [subs] 占位符参数（对应 $1$、$2$ …）
 * @returns {string}
 */
function t(key, subs) {
  const args = Array.isArray(subs) ? subs : subs == null ? [] : [subs];
  const value = chrome.i18n.getMessage(key, args);
  return value || key;
}

/**
 * 对指定根节点（默认整页）应用多语言替换
 * @param {ParentNode} [root]
 */
function applyI18n(root) {
  const scope = root || document;

  scope.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  scope.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  scope.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => applyI18n());
} else {
  applyI18n();
}
