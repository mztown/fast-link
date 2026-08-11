// ============================================================
// 功能开关缓存（在 service worker 内存中），默认全部开启
// ============================================================
const DEFAULTS = {
  enableMagnet: true,
  enableBaidu: true,
};
let settings = { ...DEFAULTS };

// 两个 DNR 规则的 ID（用于后续动态更新/删除）
const RULE_MAGNET = 1;
const RULE_BAIDU = 2;

// ============================================================
// 正则定义（注意 DNR 正则有 2KB 编译内存限制）
// ============================================================
// 关键优化：
// 1. 避免「多分支交替 + 大字符类」组合（RE2 DFA 会状态爆炸超 2KB）。
// 2. 尾部统一用单个窄字符类 [/?&]* 吸收路径/查询/参数，替代
//    原来的多分支 (|/.*|?.*|&.*|$)，显著降低自动机状态数。
// 3. 捕获组保持最少（仅重定向拼接需要）。
//
// 地址栏输入裸字符串时，Chrome 会拼成 https://<string>/，
// 因此用 ^https?:// 前缀匹配。

// 百度网盘：
//   前 23 位 [a-zA-Z0-9-]，倒数第 5 位 "-"，后 4 位 [a-zA-Z0-9]
//   -> https://pan.baidu.com/s/<23位>?pwd=<4位>
const BAIDU_PATTERNS = [
  {
    id: RULE_BAIDU,
    priority: 2, // 高于 magnet，避免误判
    regex: "^https?://([a-zA-Z0-9-]{23})-([a-zA-Z0-9]{4})[/?&]*",
    substitution: "https://pan.baidu.com/s/\\1?pwd=\\2",
  },
];

// Magnet：40 位 [a-zA-Z0-9]
//   -> magnet:?xt=urn:btih:<40位>
const MAGNET_PATTERNS = [
  {
    id: RULE_MAGNET,
    priority: 1,
    regex: "^https?://([a-zA-Z0-9]{40})[/?&]*",
    substitution: "magnet:?xt=urn:btih:\\1",
  },
];

// ============================================================
// 构建可用的 DNR 规则（运行时校验正则是否超 2KB）
// ============================================================
async function buildRules() {
  const rules = [];

  const candidates = [];
  if (settings.enableBaidu) candidates.push(...BAIDU_PATTERNS);
  if (settings.enableMagnet) candidates.push(...MAGNET_PATTERNS);

  for (const p of candidates) {
    // 检查该正则是否被支持（不超 2KB）
    let ok = true;
    try {
      const res = await chrome.declarativeNetRequest.isRegexSupported({
        regex: p.regex,
      });
      ok = res.isSupported;
      if (!ok) {
        console.warn("正则超限被跳过：", p.regex, res.reason);
      }
    } catch (e) {
      ok = false;
      console.warn("isRegexSupported 调用失败：", e);
    }
    if (!ok) continue;

    rules.push({
      id: p.id,
      priority: p.priority,
      action: {
        type: "redirect",
        redirect: {
          regexSubstitution: p.substitution,
        },
      },
      condition: {
        regexFilter: p.regex,
        resourceTypes: ["main_frame"],
      },
    });
  }

  return rules;
}

// 根据当前 settings 更新 DNR 动态规则
async function updateRules() {
  const rules = await buildRules();
  const ruleIds = rules.map((r) => r.id);
  try {
    // 先删除旧规则，再添加新规则（保持原子性）
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: ruleIds,
    });
    if (rules.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: rules,
      });
    }
  } catch (err) {
    console.error("更新 DNR 规则失败：", err);
  }
}

// 启动时加载配置并注册规则
chrome.storage.sync.get(DEFAULTS, async (items) => {
  settings = { ...DEFAULTS, ...items };
  await updateRules();
});

// 设置页面/弹窗中修改开关时，同步更新内存缓存并刷新 DNR 规则
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  let changed = false;
  for (const key of Object.keys(DEFAULTS)) {
    if (changes[key]) {
      settings[key] = changes[key].newValue;
      changed = true;
    }
  }
  if (changed) {
    updateRules();
  }
});
