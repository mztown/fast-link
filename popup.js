// ============================================================
// 弹窗逻辑：粘贴字符串 -> 转换并打开新标签页
// 文案取自 _locales（t 由 i18n.js 提供）
// ============================================================

const input = document.getElementById("input");
const convertBtn = document.getElementById("convertBtn");
const resultBox = document.getElementById("result");
const openSettings = document.getElementById("openSettings");

// 高级模式：打开完整设置页
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
    showResult("error", t("popupNeedInput"));
    return;
  }

  convertBtn.disabled = true;
  showResult("", "");

  chrome.runtime.sendMessage({ type: "convert", text }, (resp) => {
    convertBtn.disabled = false;
    if (chrome.runtime.lastError) {
      showResult(
        "error",
        t("popupBgError") + chrome.runtime.lastError.message
      );
      return;
    }
    if (resp && resp.ok) {
      showResult("success", t("popupOpened") + "\n" + resp.result.url);
    } else {
      showResult(
        "error",
        resp && resp.error ? resp.error : t("cannotRecognize")
      );
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
