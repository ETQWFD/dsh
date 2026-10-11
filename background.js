/**
 * DSH Harness v2.0 - 后台服务
 * 低内存占用，按需唤醒
 * @author ET
 */

// 安装初始化
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[DSH Harness] v2.0 已安装');
    chrome.storage.local.set({
      dsh_settings: {
        autoParse: true,
        aiSearch: true,
        imageGen: true,
        videoGen: true,
        emotion: true,
        gameAssist: false,
        pcControl: false
      },
      dsh_thoughts: []
    });
  }
});

// 消息处理（轻量响应）
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SEARCH') {
    handleSearch(request.query).then(results => {
      sendResponse({ success: true, results });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

// 搜索API（后台跨域）
async function handleSearch(query) {
  try {
    const resp = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`
    );
    const data = await resp.json();
    return {
      abstract: data.Abstract,
      abstractUrl: data.AbstractURL,
      related: (data.RelatedTopics || []).slice(0, 5).map(t => ({
        text: t.Text,
        url: t.FirstURL
      }))
    };
  } catch (e) {
    throw new Error('搜索失败：' + e.message);
  }
}

// 插件图标点击
chrome.action.onClicked.addListener((tab) => {
  // 打开popup（已在manifest中配置）
});
