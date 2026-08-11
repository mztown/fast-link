// ============================================================
// 弹窗逻辑：粘贴字符串 -> 转换并打开新标签页 + 功能开关
// ============================================================

const DEFAULTS = {
  enableMagnet: true,
  enableBaidu: true,
};

const input = document.getElementById("input");
const convertBtn = document.getElementById("convertBtn");
const resultBox = document.getElementById("result");
const enableMagnet = document.getElementById("enableMagnet");
const enableBaidu = document.getElementById("enableBaidu");
const openSettings = document.getElementById("openSettings");

// 加载已保存的配置
chrome.storage.sync.get(DEFAULTS, (items) => {
  enableMagnet.checked = items.enableMagnet;
  enableBaidu.checked = items.enableBaidu;
});

// 开关变化时保存
enableMagnet.addEventListener("change", () => {
  chrome.storage.sync.set({ enableMagnet: enableMagnet.checked });
});
enableBaidu.addEventListener("change", () => {
  chrome.storage.sync.set({ enableBaidu: enableBaidu.checked });
});

// 打开完整设置页
openSettings.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// 显示结果提示
function showResult(type, text) {
  resultBox.className = "result " + type;
  resultBox.textContent = text;
}

// 点击转换
convertBtn.addEventListener("click", () => {
  const text = input.value;
  if (!text.trim()) {
    showResult("error", "请输入字符串");
    return;
  }

  convertBtn.disabled = true;
  showResult("", "");

  chrome.runtime.sendMessage({ type: "convert", text }, (resp) => {
    convertBtn.disabled = false;
    if (chrome.runtime.lastError) {
      showResult("error", "扩展后台出错：" + chrome.runtime.lastError.message);
      return;
    }
    if (resp && resp.ok) {
      showResult("success", "已打开：\n" + resp.result.url);
    } else {
      showResult("error", resp && resp.error ? resp.error : "无法识别该字符串格式");
    }
  });
});

// 回车触发转换
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    convertBtn.click();
  }
});
