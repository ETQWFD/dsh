/**
 * DSH - 后台服务脚本
 * @author ET
 */

// 安装时初始化
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[DSH] 插件已安装');
    // 初始化默认存储
    chrome.storage.local.set({
      dsh_long_term_memory: [],
      dsh_recycle_bin: [],
      dsh_settings: {
        videoParseEnabled: true,
        memoryEnabled: true,
        recycleBinEnabled: true
      }
    });
  }
});

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'PARSE_VIDEO') {
    handleVideoParse(request.url).then(result => {
      sendResponse({ success: true, data: result });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // 异步响应
  }
});

// 视频解析处理（后台跨域请求）
async function handleVideoParse(url) {
  // B站视频解析
  if (/bilibili\.com\/video\//i.test(url)) {
    const match = url.match(/\/video\/(BV\w+|av\d+)/i);
    if (!match) throw new Error('无法识别视频ID');

    let apiUrl;
    if (match[1].startsWith('BV')) {
      apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${match[1]}`;
    } else {
      apiUrl = `https://api.bilibili.com/x/web-interface/view?aid=${match[1].replace('av', '')}`;
    }

    const resp = await fetch(apiUrl);
    const data = await resp.json();
    if (data.code !== 0) throw new Error(data.message);

    return {
      platform: 'B站',
      title: data.data.title,
      author: data.data.owner.name,
      duration: data.data.duration,
      description: data.data.desc
    };
  }

  throw new Error('暂不支持的视频网站');
}
