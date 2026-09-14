// ============================================================
// 共享转换逻辑（供 background.js / redirect.js 使用）
// 说明：这里使用 JS 原生正则（V8 引擎），没有 DNR 的 2KB 限制，
// 可以放心使用 {n} 定长量词。
// ============================================================

// 转换规则：按顺序尝试
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

// 尝试转换为目标链接
// 返回 { type, url } 或 null
function convert(raw) {
  const s = sanitize(raw);
  if (!s) return null;
  for (const rule of CONVERT_RULES) {
    const m = s.match(rule.regex);
    if (m) return { type: rule.name, url: rule.build(m) };
  }
  return null;
}
