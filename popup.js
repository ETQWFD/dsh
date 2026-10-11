/**
 * DSH - 弹窗逻辑
 * @author ET
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 读取设置
  const settings = await chrome.storage.local.get('dsh_settings');
  const currentSettings = settings.dsh_settings || {
    videoParseEnabled: true,
    memoryEnabled: true,
    recycleBinEnabled: true
  };

  // 初始化开关状态
  document.querySelectorAll('.toggle').forEach(toggle => {
    const key = toggle.dataset.key;
    if (currentSettings[key]) {
      toggle.classList.add('active');
    }

    toggle.addEventListener('click', async () => {
      toggle.classList.toggle('active');
      const newSettings = await chrome.storage.local.get('dsh_settings');
      const updated = newSettings.dsh_settings || {};
      updated[key] = toggle.classList.contains('active');
      await chrome.storage.local.set({ dsh_settings: updated });

      // 通知content script
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SETTINGS_CHANGED',
          key,
          value: updated[key]
        }).catch(() => {});
      }
    });
  });
});
