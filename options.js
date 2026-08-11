// 设置页面逻辑：读取并保存两个功能开关
const DEFAULTS = {
  enableMagnet: true,
  enableBaidu: true,
};

const enableMagnet = document.getElementById("enableMagnet");
const enableBaidu = document.getElementById("enableBaidu");
const saveStatus = document.getElementById("saveStatus");

let saveTimer = null;

// 加载已保存的配置
chrome.storage.sync.get(DEFAULTS, (items) => {
  enableMagnet.checked = items.enableMagnet;
  enableBaidu.checked = items.enableBaidu;
});

function persist() {
  chrome.storage.sync.set(
    { enableMagnet: enableMagnet.checked, enableBaidu: enableBaidu.checked },
    () => {
      saveStatus.classList.add("show");
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveStatus.classList.remove("show"), 1500);
    }
  );
}

// 开关变化时立即保存
enableMagnet.addEventListener("change", persist);
enableBaidu.addEventListener("change", persist);
