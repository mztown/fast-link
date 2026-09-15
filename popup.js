// ============================================================
// 弹窗逻辑：粘贴字符串 -> 转换并打开新标签页
// 功能开关统一在设置页（options.html）中管理
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
      showResult(
        "error",
        resp && resp.error ? resp.error : "无法识别该字符串格式"
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
