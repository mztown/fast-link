// ============================================================
// Auto Link 核心转换逻辑
// ============================================================
// 转换规则：
//   规则 1（百度网盘）：28 位字符串，前 23 位 [a-zA-Z0-9-]，
//                       倒数第 5 位 "-"，后 4 位 [a-zA-Z0-9]
//   规则 2（magnet）：40 位 [a-zA-Z0-9]（BT InfoHash）

const DEFAULT_SETTINGS = {
  enableMagnet: true,
  enableBaidu: true,
};

const RULES = [
  {
    name: "baidu",
    regex: /^([a-zA-Z0-9-]{23})-([a-zA-Z0-9]{4})$/,
    build: (m) => "https://pan.baidu.com/s/" + m[1] + "?pwd=" + m[2],
  },
  {
    name: "magnet",
    regex: /^[a-zA-Z0-9]{40}$/,
    build: (m) => "magnet:?xt=urn:btih:" + m[0],
  },
];

// 清理输入：去掉可能的协议前缀、空白、两端引号等
function sanitize(raw) {
  let s = (raw || "").trim();
  // 去掉协议前缀（如 https://、http://）
  s = s.replace(/^[a-z][a-z0-9+\-.]*:\/\//i, "");
  // 去掉两端引号/括号
  s = s.replace(/^["'(]+|["')]+$/g, "");
  return s;
}

// 尝试将输入字符串转换为目标链接
// 返回 { type, url } 或 null
function convert(raw) {
  const s = sanitize(raw);
  if (!s) return null;

  for (const rule of RULES) {
    const m = s.match(rule.regex);
    if (m) {
      return { type: rule.name, url: rule.build(m) };
    }
  }
  return null;
}

// ============================================================
// 监听消息：popup 请求转换
// ============================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "convert") {
    const result = convert(msg.text);
    if (result) {
      // 打开目标链接到新标签页
      chrome.tabs.create({ url: result.url });
      sendResponse({ ok: true, result });
    } else {
      sendResponse({ ok: false, error: "无法识别该字符串格式" });
    }
  }
  // 同步返回，不使用 async
  return false;
});
