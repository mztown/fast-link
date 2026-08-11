// 弹窗逻辑：控制两个功能开关，并可跳转到完整设置页

const DEFAULTS = {
  enableMagnet: true,
  enableBaidu: true,
};

const enableMagnet = document.getElementById("enableMagnet");
const enableBaidu = document.getElementById("enableBaidu");
const openSettings = document.getElementById("openSettings");

// 加载已保存的配置
chrome.storage.sync.get(DEFAULTS, (items) => {
  enableMagnet.checked = items.enableMagnet;
  enableBaidu.checked = items.enableBaidu;
});

// 开关变化时保存（background 通过 storage.onChanged 同步内存缓存）
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
