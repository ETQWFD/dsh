/**
 * DSH Harness v2.0 - 弹窗逻辑
 * @author ET
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 读取当前设置
  const { dsh_settings = {} } = await chrome.storage.local.get('dsh_settings');

  // 初始化开关
  document.querySelectorAll('.toggle').forEach(toggle => {
    const key = toggle.dataset.key;
    if (dsh_settings[key]) toggle.classList.add('active');

    toggle.addEventListener('click', async () => {
      toggle.classList.toggle('active');
      const current = await chrome.storage.local.get('dsh_settings');
      const settings = current.dsh_settings || {};
      settings[key] = toggle.classList.contains('active');
      await chrome.storage.local.set({ dsh_settings: settings });

      // 通知content script
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SETTINGS_UPDATED',
          key,
          value: settings[key]
        }).catch(() => {});
      }
    });
  });
});
