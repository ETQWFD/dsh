/**
 * DSH - DeepSeek增强助手 内容脚本
 * 功能：视频解析AI视觉 + 跨对话记忆 + 对话回收站
 * @author ET
 */

(function () {
  'use strict';

  // ========== 工具函数 ==========
  const Utils = {
    debounce(fn, delay = 300) {
      let timer;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    },
    async sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },
    getStorage(key, defaultValue = null) {
      return new Promise(resolve => {
        chrome.storage.local.get([key], result => {
          resolve(result[key] !== undefined ? result[key] : defaultValue);
        });
      });
    },
      setStorage(key, value) {
      return new Promise(resolve => {
        chrome.storage.local.set({ [key]: value }, resolve);
      });
    },
    createEl(tag, className = '', html = '') {
      const el = document.createElement(tag);
      if (className) el.className = className;
      if (html) el.innerHTML = html;
      return el;
    }
  };

  // ========== 视频解析模块 ==========
  const VideoParser = {
    // 支持的视频网站匹配规则
    patterns: [
      {
        name: 'bilibili',
        test: (url) => /bilibili\.com\/video\/(BV|av)\w+/i.test(url),
        parse: async (url) => {
          // 提取BV号
          const match = url.match(/\/video\/(BV\w+|av\d+)/i);
          if (!match) throw new Error('无法解析B站视频ID');
          const videoId = match[1];

          // 调用B站API获取视频信息
          let apiUrl;
          if (videoId.startsWith('BV')) {
            apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${videoId}`;
          } else {
            apiUrl = `https://api.bilibili.com/x/web-interface/view?aid=${videoId.replace('av', '')}`;
          }

          const resp = await fetch(apiUrl);
          const data = await resp.json();
          if (data.code !== 0) throw new Error(data.message || 'B站API请求失败');

          const info = data.data;
          return {
            platform: 'B站',
            title: info.title,
            author: info.owner.name,
            duration: info.duration,
            description: info.desc,
            cover: info.pic,
            views: info.stat.view,
            danmaku: info.stat.danmaku,
            aid: info.aid,
            bvid: info.bvid,
            // 视频摘要文本
            summary: `【B站视频解析】
标题：${info.title}
UP主：${info.owner.name}
时长：${Math.floor(info.duration / 60)}分${info.duration % 60}秒
播放量：${info.stat.view}
弹幕数：${info.stat.danmaku}
简介：${info.desc || '暂无简介'}

请基于以上视频信息，告诉我这个视频的主要内容和看点。`
          };
        }
      },
      {
        name: 'youtube',
        test: (url) => /youtube\.com\/watch\?v=\w+|youtu\.be\/\w+/i.test(url),
        parse: async (url) => {
          let videoId;
          const match1 = url.match(/[?&]v=([\w-]+)/);
          const match2 = url.match(/youtu\.be\/([\w-]+)/);
          if (match1) videoId = match1[1];
          else if (match2) videoId = match2[1];
          else throw new Error('无法解析YouTube视频ID');

          // 页面元数据提取
          const resp = await fetch(url);
          const html = await resp.text();
          const titleMatch = html.match(/<title>([^<]+)<\/title>/);
          const descMatch = html.match(/<meta name="description" content="([^"]+)"/);

          return {
            platform: 'YouTube',
            title: titleMatch ? titleMatch[1].replace(' - YouTube', '') : '未知标题',
            description: descMatch ? descMatch[1] : '暂无简介',
            videoId: videoId,
            summary: `【YouTube视频解析】
链接：${url}
视频ID：${videoId}
页面标题：${titleMatch ? titleMatch[1] : '未知'}
描述：${descMatch ? descMatch[1] : '暂无'}

请帮我分析这个YouTube视频的内容概要。`
          };
        }
      },
      {
        name: 'douyin',
        test: (url) => /douyin\.com\/video\/\d+|v\.douyin\.com/i.test(url),
        parse: async (url) => {
          return {
            platform: '抖音',
            videoUrl: url,
            summary: `【抖音视频解析】
链接：${url}

这是一个抖音视频链接，请帮我分析这个视频可能的内容和主题。我会在浏览器中打开这个视频，你可以看到页面内容。`
          };
        }
      },
      {
        name: 'generic',
        test: () => true,
        parse: async (url) => {
          // 通用视频网站 - 尝试获取页面元数据
          try {
            const resp = await fetch(url);
            const html = await resp.text();
            const titleMatch = html.match(/<title>([^<]+)<\/title>/);
            const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/);
            const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/);

            return {
              platform: '通用视频网站',
              title: (ogTitle && ogTitle[1]) || (titleMatch && titleMatch[1]) || '未知视频',
              description: descMatch ? descMatch[1] : '暂无描述',
              summary: `【网页视频解析】
链接：${url}
页面标题：${(ogTitle && ogTitle[1]) || (titleMatch && titleMatch[1]) || '未知'}
页面描述：${descMatch ? descMatch[1] : '暂无'}

请帮我分析这个网页上的视频内容。`
            };
          } catch (e) {
            return {
              platform: '未知视频网站',
              summary: `【视频解析】
链接：${url}

请帮我查看并分析这个视频链接的内容。`
            };
          }
        }
      }
    ],

    async parse(url) {
      for (const pattern of this.patterns) {
        if (pattern.test(url)) {
          return await pattern.parse(url);
        }
      }
    },

    // 注入解析按钮到输入框
    injectButton() {
      // 等待输入框出现
      const observer = new MutationObserver(() => {
        const inputArea = document.querySelector('div[class*="chat_input"], div[class*="editor"], textarea[class*="input"]');
        if (inputArea && !document.getElementById('dsh-video-btn')) {
          this.addButton(inputArea);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    },

    addButton(inputArea) {
      const btn = Utils.createEl('button', 'dsh-video-btn', '🎬 解析视频');
      btn.id = 'dsh-video-btn';
      btn.style.cssText = `
        position: absolute;
        right: 12px;
        bottom: 8px;
        padding: 4px 12px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 16px;
        font-size: 12px;
        cursor: pointer;
        z-index: 9999;
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
        transition: all 0.2s;
      `;
      btn.onmouseenter = () => btn.style.transform = 'scale(1.05)';
      btn.onmouseleave = () => btn.style.transform = 'scale(1)';

      btn.onclick = async () => {
        const input = document.querySelector('textarea, div[contenteditable="true"]');
        const text = input ? (input.value || input.innerText) : '';
        const urlMatch = text.match(/https?:\/\/[^\s<>"']+/);

        if (!urlMatch) {
          this.showToast('请先在输入框中粘贴视频链接', 'warning');
          return;
        }

        btn.textContent = '解析中...';
        btn.disabled = true;

        try {
          const result = await this.parse(urlMatch[0]);
          // 将解析结果插入输入框
          const insertText = result.summary;
          if (input.tagName === 'TEXTAREA') {
            input.value = insertText + '\n\n' + (input.value || '');
            input.dispatchEvent(new Event('input', { bubbles: true }));
          } else if (input.isContentEditable) {
            input.innerText = insertText + '\n\n' + input.innerText;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          this.showToast(`✅ 已解析${result.platform}视频：${result.title.slice(0, 20)}...`, 'success');
        } catch (e) {
          this.showToast('❌ 解析失败：' + e.message, 'error');
        } finally {
          btn.textContent = '🎬 解析视频';
          btn.disabled = false;
        }
      };

      // 找到输入区域的容器
      const container = inputArea.closest('div[class*="container"], div[class*="wrapper"]') || inputArea.parentElement;
      if (container) {
        container.style.position = container.style.position || 'relative';
        container.appendChild(btn);
      }
    },

    showToast(msg, type = 'info') {
      const toast = Utils.createEl('div', 'dsh-toast', msg);
      const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
      toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${colors[type] || colors.info};
        color: white;
        border-radius: 8px;
        z-index: 100000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: dsh-slide-in 0.3s ease;
        max-width: 300px;
        font-size: 14px;
      `;
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.animation = 'dsh-slide-out 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }
  };

  // ========== 跨对话记忆模块 ==========
  const Memory = {
    memoryKey: 'dsh_long_term_memory',
    currentChatKey: 'dsh_current_chat_id',

    async init() {
      // 注入记忆面板按钮
      this.injectMemoryButton();
      // 监听对话变化
      this.observeChatChanges();
      // 新对话开始时注入记忆
      await this.injectMemoryOnNewChat();
    },

    injectMemoryButton() {
      const btn = Utils.createEl('button', 'dsh-memory-btn', '🧠 记忆');
      btn.style.cssText = `
        position: fixed;
        top: 70px;
        right: 20px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        color: white;
        border: none;
        font-size: 20px;
        cursor: pointer;
        z-index: 99999;
        box-shadow: 0 4px 12px rgba(245, 87, 108, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s;
      `;
      btn.onmouseenter = () => btn.style.transform = 'scale(1.1)';
      btn.onmouseleave = () => btn.style.transform = 'scale(1)';
      btn.onclick = () => this.togglePanel();
      document.body.appendChild(btn);

      // 创建记忆面板
      this.panel = Utils.createEl('div', 'dsh-memory-panel');
      this.panel.style.cssText = `
        position: fixed;
        top: 130px;
        right: 20px;
        width: 320px;
        max-height: 400px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        z-index: 99998;
        display: none;
        flex-direction: column;
        overflow: hidden;
      `;
      this.panel.innerHTML = `
        <div style="padding: 12px 16px; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; font-weight: bold;">
          🧠 DSH 长期记忆
        </div>
        <div style="padding: 12px; overflow-y: auto; flex: 1;" id="dsh-memory-content">
          <div style="color: #999; text-align: center; padding: 20px;">加载中...</div>
        </div>
        <div style="padding: 8px 12px; border-top: 1px solid #eee; display: flex; gap: 8px;">
          <button id="dsh-add-memory" style="flex:1; padding: 6px; background: #f5576c; color: white; border: none; border-radius: 6px; cursor: pointer;">添加记忆</button>
          <button id="dsh-clear-memory" style="flex:1; padding: 6px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer;">清空全部</button>
        </div>
      `;
      document.body.appendChild(this.panel);

      // 绑定按钮事件
      this.panel.querySelector('#dsh-add-memory').onclick = () => this.addMemory();
      this.panel.querySelector('#dsh-clear-memory').onclick = async () => {
        if (confirm('确定要清空所有记忆吗？')) {
          await Utils.setStorage(this.memoryKey, []);
          this.renderMemories();
        }
      };
    },

    togglePanel() {
      if (this.panel.style.display === 'none') {
        this.panel.style.display = 'flex';
        this.renderMemories();
      } else {
        this.panel.style.display = 'none';
      }
    },

    async getMemories() {
      return await Utils.getStorage(this.memoryKey, []);
    },

    async addMemory() {
      const text = prompt('请输入要记住的内容：');
      if (!text) return;
      const memories = await this.getMemories();
      memories.push({
        id: Date.now(),
        text: text,
        createdAt: new Date().toLocaleString()
      });
      await Utils.setStorage(this.memoryKey, memories);
      this.renderMemories();
      VideoParser.showToast('✅ 已添加到长期记忆', 'success');
    },

    async renderMemories() {
      const container = this.panel.querySelector('#dsh-memory-content');
      const memories = await this.getMemories();

      if (memories.length === 0) {
        container.innerHTML = '<div style="color: #999; text-align: center; padding: 20px;">暂无记忆<br>点击下方按钮添加</div>';
        return;
      }

      container.innerHTML = memories.map(m => `
        <div style="padding: 8px; margin-bottom: 8px; background: #f8f9fa; border-radius: 6px; border-left: 3px solid #f5576c;">
          <div style="font-size: 13px; color: #333; margin-bottom: 4px;">${m.text}</div>
          <div style="font-size: 11px; color: #999; display: flex; justify-content: space-between; align-items: center;">
            <span>${m.createdAt}</span>
            <button data-id="${m.id}" class="dsh-del-memory" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 11px;">删除</button>
          </div>
        </div>
      `).join('');

      // 绑定删除按钮
      container.querySelectorAll('.dsh-del-memory').forEach(btn => {
        btn.onclick = async () => {
          const id = parseInt(btn.dataset.id);
          const ms = await this.getMemories();
          await Utils.setStorage(this.memoryKey, ms.filter(m => m.id !== id));
          this.renderMemories();
        };
      });
    },

    async injectMemoryOnNewChat() {
      const memories = await this.getMemories();
      if (memories.length === 0) return;

      // 构造记忆注入文本
      const memoryText = `【系统长期记忆 - DSH插件注入】
以下是用户之前对话中的重要记忆，请在后续对话中始终记住：
${memories.map((m, i) => `${i + 1}. ${m.text}`).join('\n')}

---
请基于以上记忆继续对话。`;

      // 等待输入框出现后自动注入
      const checkInput = setInterval(async () => {
        const input = document.querySelector('textarea, div[contenteditable="true"]');
        if (input) {
          clearInterval(checkInput);
          // 只在新对话（空白输入框）时注入
          const currentText = input.value || input.innerText;
          if (!currentText.trim()) {
            // 不自动发送，只提示用户有记忆可用
            VideoParser.showToast(`🧠 已加载 ${memories.length} 条长期记忆`, 'info');
          }
        }
      }, 2000);
    },

    observeChatChanges() {
      // 监听对话内容，自动提取重要信息到记忆
      let lastMessageCount = 0;
      setInterval(async () => {
        const messages = document.querySelectorAll('div[class*="message"], div[class*="chat-item"]');
        if (messages.length > lastMessageCount + 2) {
          // 有新消息，不自动保存（避免打扰），用户可手动添加
          lastMessageCount = messages.length;
        }
      }, 5000);
    }
  };

  // ========== 对话回收站模块 ==========
  const RecycleBin = {
    binKey: 'dsh_recycle_bin',

    async init() {
      this.injectRecycleButton();
      this.bindContextMenu();
    },

    injectRecycleButton() {
      const btn = Utils.createEl('button', 'dsh-recycle-btn', '🗑️ 回收站');
      btn.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        padding: 8px 16px;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 20px;
        font-size: 13px;
        cursor: pointer;
        z-index: 99999;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        transition: all 0.2s;
      `;
      btn.onmouseenter = () => btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      btn.onclick = () => this.showBin();
      document.body.appendChild(btn);
    },

    bindContextMenu() {
      // 监听左侧对话列表的右键点击
      document.addEventListener('contextmenu', async (e) => {
        const chatItem = e.target.closest('div[class*="conversation"], div[class*="chat-item"], a[href*="/chat/"]');
        if (!chatItem) return;

        e.preventDefault();

        // 获取对话标题
        const title = chatItem.textContent.trim().slice(0, 50) || '未命名对话';
        const chatId = this.extractChatId(chatItem);

        // 显示自定义右键菜单
        this.showContextMenu(e.clientX, e.clientY, {
          title,
          id: chatId,
          element: chatItem
        });
      });
    },

    extractChatId(el) {
      const link = el.querySelector('a[href*="/chat/"]') || el.closest('a[href*="/chat/"]');
      if (link) {
        const match = link.href.match(/\/chat\/([\w-]+)/);
        if (match) return match[1];
      }
      return 'chat_' + Date.now();
    },

    showContextMenu(x, y, chatInfo) {
      // 移除已有菜单
      document.getElementById('dsh-context-menu')?.remove();

      const menu = Utils.createEl('div', 'dsh-context-menu');
      menu.id = 'dsh-context-menu';
      menu.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        z-index: 100000;
        min-width: 160px;
        overflow: hidden;
      `;
      menu.innerHTML = `
        <div style="padding: 8px 12px; background: #f8f9fa; font-size: 12px; color: #666; border-bottom: 1px solid #eee;">
          ${chatInfo.title}
        </div>
        <div class="dsh-menu-item" data-action="delete" style="padding: 10px 12px; cursor: pointer; font-size: 13px; color: #ef4444;">
          🗑️ 删除对话（移入回收站）
        </div>
        <div class="dsh-menu-item" data-action="cancel" style="padding: 10px 12px; cursor: pointer; font-size: 13px; color: #666; border-top: 1px solid #eee;">
          取消
        </div>
      `;
      document.body.appendChild(menu);

      // 菜单项事件
      menu.querySelectorAll('.dsh-menu-item').forEach(item => {
        item.onmouseenter = () => item.style.background = '#f3f4f6';
        item.onmouseleave = () => item.style.background = 'white';
        item.onclick = async () => {
          const action = item.dataset.action;
          menu.remove();
          if (action === 'delete') {
            await this.moveToBin(chatInfo);
          }
        };
      });

      // 点击其他地方关闭菜单
      setTimeout(() => {
        document.addEventListener('click', function closeMenu() {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        });
      }, 10);
    },

    async moveToBin(chatInfo) {
      const bin = await Utils.getStorage(this.binKey, []);
      bin.unshift({
        id: chatInfo.id,
        title: chatInfo.title,
        deletedAt: new Date().toLocaleString(),
        url: location.href
      });
      await Utils.setStorage(this.binKey, bin);

      // 从界面隐藏该对话
      chatInfo.element.style.opacity = '0.3';
      chatInfo.element.style.pointerEvents = 'none';

      VideoParser.showToast('✅ 已移入回收站，可在左下角回收站恢复', 'success');
    },

    async showBin() {
      const bin = await Utils.getStorage(this.binKey, []);

      // 创建回收站弹窗
      const modal = Utils.createEl('div', 'dsh-recycle-modal');
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        z-index: 100001;
        display: flex;
        align-items: center;
        justify-content: center;
      `;

      const content = Utils.createEl('div');
      content.style.cssText = `
        background: white;
        border-radius: 12px;
        width: 500px;
        max-height: 70vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      `;

      content.innerHTML = `
        <div style="padding: 16px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
          <div style="font-weight: bold; font-size: 16px;">🗑️ 对话回收站 (${bin.length})</div>
          <button class="dsh-close-modal" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #999;">×</button>
        </div>
        <div style="flex: 1; overflow-y: auto; padding: 12px;">
          ${bin.length === 0 ? '<div style="text-align: center; color: #999; padding: 40px;">回收站为空</div>' : ''}
          ${bin.map(item => `
            <div class="dsh-bin-item" data-id="${item.id}" style="padding: 12px; margin-bottom: 8px; background: #f9fafb; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
              <div style="flex: 1;">
                <div style="font-size: 14px; color: #333; margin-bottom: 4px;">${item.title}</div>
                <div style="font-size: 12px; color: #999;">删除于 ${item.deletedAt}</div>
              </div>
              <div style="display: flex; gap: 8px; margin-left: 12px;">
                <button class="dsh-restore" style="padding: 6px 12px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">恢复</button>
                <button class="dsh-purge" style="padding: 6px 12px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">永久删除</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      modal.appendChild(content);
      document.body.appendChild(modal);

      // 关闭按钮
      content.querySelector('.dsh-close-modal').onclick = () => modal.remove();
      modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

      // 恢复和永久删除按钮
      content.querySelectorAll('.dsh-bin-item').forEach(item => {
        const id = item.dataset.id;
        item.querySelector('.dsh-restore').onclick = async () => {
          await this.restoreItem(id);
          modal.remove();
          VideoParser.showToast('✅ 对话已恢复', 'success');
          location.reload();
        };
        item.querySelector('.dsh-purge').onclick = async () => {
          if (confirm('确定要永久删除这个对话吗？此操作不可恢复。')) {
            await this.purgeItem(id);
            item.remove();
            VideoParser.showToast('已永久删除', 'info');
          }
        };
      });
    },

    async restoreItem(id) {
      const bin = await Utils.getStorage(this.binKey, []);
      const item = bin.find(b => b.id === id);
      if (item) {
        // 从回收站移除
        await Utils.setStorage(this.binKey, bin.filter(b => b.id !== id));
        // 标记为已恢复
        VideoParser.showToast('✅ 已恢复：' + item.title.slice(0, 20), 'success');
      }
    },

    async purgeItem(id) {
      const bin = await Utils.getStorage(this.binKey, []);
      await Utils.setStorage(this.binKey, bin.filter(b => b.id !== id));
    }
  };

  // ========== 样式注入 ==========
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes dsh-slide-in {
        from { transform: translateX(100px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes dsh-slide-out {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100px); opacity: 0; }
      }
      .dsh-video-btn:hover { transform: scale(1.05) !important; }
      .dsh-menu-item:hover { background: #f3f4f6 !important; }
    `;
    document.head.appendChild(style);
  }

  // ========== 启动 ==========
  async function init() {
    console.log('[DSH] 插件已加载 - DeepSeek增强助手');
    injectStyles();
    VideoParser.injectButton();
    await Memory.init();
    await RecycleBin.init();
    console.log('[DSH] 所有模块初始化完成');
  }

  // 等待页面加载完成
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
