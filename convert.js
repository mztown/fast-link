// ============================================================
// 共享配置与转换逻辑
// 供 background.js（importScripts）与各页面 <script> 引入使用
// ============================================================

// 配置项默认值（存储在 chrome.storage.sync）
// matchTemplate ：拦截地址模板，用 $s 表示搜索词位置
// searchTemplate：兜底搜索引擎模板，用 $s 表示搜索词位置
const DEFAULTS = {
  matchTemplate: "https://autolinreserved.publicvm.com/?wd=$s",
  searchTemplate: "https://cn.bing.com/search?q=$s",
  enableMagnet: true,
  enableBaidu: true,
  enableFallbackSearch: true, // 兜底跳转搜索（默认开启）
  isDefaultSE: false, // 自定义搜索引擎开关（默认关闭）
  isDefalutSEDisabled: true, // 该开关是否禁用（默认禁用）
};

// ============================================================
// 转换规则（使用 JS 原生正则，无 DNR 的 2KB 限制）
// ============================================================
const CONVERT_RULES = [
  {
    name: "baidu",
    // 28 位：前 23 位 [a-zA-Z0-9-]，倒数第 5 位 "-"，后 4 位 [a-zA-Z0-9]
    regex: /^([a-zA-Z0-9-]{23})-([a-zA-Z0-9]{4})$/,
    build: (m) => "https://pan.baidu.com/s/" + m[1] + "?pwd=" + m[2],
  },
  {
    name: "magnet",
    // 40 位 BT InfoHash
    regex: /^[a-zA-Z0-9]{40}$/,
    build: (m) => "magnet:?xt=urn:btih:" + m[0],
  },
];

// 清理输入：去掉协议前缀、空白、两端引号等
function sanitize(raw) {
  let s = (raw || "").trim();
  s = s.replace(/^[a-z][a-z0-9+\-.]*:\/\//i, "");
  s = s.replace(/^["'(]+|["')]+$/g, "");
  return s;
}

// 尝试转换为目标链接，返回 { type, url } 或 null
function convert(raw) {
  const s = sanitize(raw);
  if (!s) return null;
  for (const rule of CONVERT_RULES) {
    const m = s.match(rule.regex);
    if (m) return { type: rule.name, url: rule.build(m) };
  }
  return null;
}

// ============================================================
// 把拦截模板转换为 JS 正则（用于从 URL 中提取 $s 的值）
// 例：https://a.com/?wd=$s  ->  /^https?:\/\/a\.com\/\?wd=(.+?)$/
// 返回 null 表示模板无效（缺少 $s）
// ============================================================
function templateToJsRegex(template) {
  if (typeof template !== "string" || template.indexOf("$s") === -1) {
    return null;
  }
  const idx = template.indexOf("$s");

  // 正则特殊字符转义
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  let pre = esc(template.slice(0, idx));
  // 让 http 与 https 都能匹配
  pre = pre.replace(/^https?:\/\//, "https?://");

  const post = esc(template.slice(idx + 2));

  return new RegExp("^" + pre + "(.+?)" + post + "$");
}

// ============================================================
// 用 $s 占位符构造目标链接（用于兜底搜索引擎模板）
// 例：https://cn.bing.com/search?q=$s + "天气"
//     -> https://cn.bing.com/search?q=%E5%A4%A9%E6%B0%94
// 返回 null 表示模板无效（缺少 $s）
// ============================================================
function applyKeywordTemplate(template, keyword) {
  if (typeof template !== "string" || template.indexOf("$s") === -1) {
    return null;
  }
  return template.split("$s").join(encodeURIComponent(keyword || ""));
}
