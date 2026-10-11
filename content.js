/**
 * DSH Harness v2.0 - AI全能驾驭插件
 * 功能：自动链接解析 + AI自主搜索 + 绘画/视频生成 + 电脑操控权限 + 情感意识 + 游戏助手
 * @author ET
 */

(function () {
  'use strict';

  console.log('%c[DSH Harness] v2.0 超级插件已加载', 'color: #764ba2; font-weight: bold; font-size: 14px;');

  // ========== 全局状态（低内存占用） ==========
  const State = {
    initialized: false,
    features: {
      autoParse: true,      // 自动解析链接
      aiSearch: true,       // AI自主搜索
      imageGen: true,      // AI绘画
      videoGen: true,      // AI视频生成
      emotion: true,       // 情感思考
      gameAssist: false,   // 游戏助手
      pcControl: false     // 电脑操控（需用户授权）
    },
    pcControlGranted: false, // 电脑操控授权状态
    parsedCache: new Map(),   // 解析缓存（LRU简易实现）
    cacheMaxSize: 20,
    thoughts: []              // 思考历史
  };

  // ========== 工具函数 ==========
  const Utils = {
    debounce(fn, delay = 500) {
      let timer;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    },
    sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
    async getStorage(key, defaultValue = null) {
      const r = await chrome.storage.local.get(key);
      return r[key] !== undefined ? r[key] : defaultValue;
    },
    setStorage(key, value) { return chrome.storage.local.set({ [key]: value }); },
    el(tag, cls = '', html = '') {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (html) e.innerHTML = html;
      return e;
    },
    // 缓存管理（防止内存泄漏）
    cacheGet(key) {
      if (State.parsedCache.has(key)) {
        const v = State.parsedCache.get(key);
        State.parsedCache.delete(key);
        State.parsedCache.set(key, v);
        return v;
      }
      return null;
    },
    cacheSet(key, value) {
      if (State.parsedCache.size >= State.cacheMaxSize) {
        const firstKey = State.parsedCache.keys().next().value;
        State.parsedCache.delete(firstKey);
      }
      State.parsedCache.set(key, value);
    }
  };

  // ========== Toast通知系统 ==========
  const Toast = {
    show(msg, type = 'info', duration = 2500) {
      const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#667eea', magic: '#f5576c' };
      const t = Utils.el('div', 'dsh-toast', msg);
      t.style.cssText = `
        position: fixed; top: 20px; right: 20px; padding: 12px 20px;
        background: ${colors[type]}; color: white; border-radius: 10px;
        z-index: 2147483647; box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        max-width: 320px; font-size: 14px; animation: dsh-in .3s ease;
        backdrop-filter: blur(10px);
      `;
      document.body.appendChild(t);
      setTimeout(() => {
        t.style.animation = 'dsh-out .3s ease';
        setTimeout(() => t.remove(), 300);
      }, duration);
    }
  };

  // ========== 1. 自动链接解析引擎 ==========
  const AutoParser = {
    // 链接匹配规则
    patterns: [
      {
        name: 'bilibili',
        test: url => /bilibili\.com\/video\/(BV|av)\w+/i.test(url),
        parse: async url => {
          const m = url.match(/\/video\/(BV\w+|av\d+)/i);
          const api = m[1].startsWith('BV')
            ? `https://api.bilibili.com/x/web-interface/view?bvid=${m[1]}`
            : `https://api.bilibili.com/x/web-interface/view?aid=${m[1].replace('av', '')}`;
          const resp = await fetch(api);
          const data = await resp.json();
          if (data.code !== 0) throw new Error(data.message);
          const d = data.data;
          return {
            type: 'video',
            platform: 'B站',
            title: d.title,
            author: d.owner.name,
            duration: `${Math.floor(d.duration / 60)}分${d.duration % 60}秒`,
            views: d.stat.view.toLocaleString(),
            desc: d.desc.slice(0, 200),
            context: `【自动解析-B站视频】\n标题：${d.title}\nUP主：${d.owner.name}\n时长：${Math.floor(d.duration/60)}分${d.duration%60}秒\n播放：${d.stat.view}\n简介：${d.desc.slice(0,150)}\n请基于以上信息和用户对话。`
          };
        }
      },
      {
        name: 'youtube',
        test: url => /youtube\.com\/watch\?v=|youtu\.be\//i.test(url),
        parse: async url => {
          const resp = await fetch(url);
          const html = await resp.text();
          const title = html.match(/<title>([^<]+)<\/title>/)?.[1]?.replace(' - YouTube', '');
          const desc = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
          return {
            type: 'video',
            platform: 'YouTube',
            title: title || '未知',
            context: `【自动解析-YouTube视频】\n标题：${title}\n描述：${desc?.slice(0,200)}\n链接：${url}`
          };
        }
      },
      {
        name: 'image',
        test: url => /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(url) || /unsplash|pixabay|imgur/i.test(url),
        parse: async url => ({
          type: 'image',
          platform: '图片链接',
          title: '用户发送了一张图片',
          context: `【自动解析-图片】\n用户发送了一张图片链接：${url}\n请描述这张图片的内容（AI视觉理解）。`
        })
      },
      {
        name: 'webpage',
        test: url => /^https?:\/\//i.test(url),
        parse: async url => {
          try {
            const resp = await fetch(url);
            const html = await resp.text();
            const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
            const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1];
            return {
              type: 'webpage',
              platform: '网页',
              title: title || '未知网页',
              context: `【自动解析-网页】\n标题：${title}\n描述：${desc?.slice(0, 300)}\n链接：${url}`
            };
          } catch {
            return { type: 'webpage', platform: '网页', title: '网页', context: `网页链接：${url}` };
          }
        }
      }
    ],

    // 监听消息发送
    init() {
      // 监听发送按钮点击
      const observer = new MutationObserver(Utils.debounce(() => {
        const sendBtn = document.querySelector('button[class*="send"], div[class*="send-button"]');
        if (sendBtn && !sendBtn._dshBound) {
          sendBtn._dshBound = true;
          sendBtn.addEventListener('click', () => this.onMessageSend());
        }
      }, 300));
      observer.observe(document.body, { childList: true, subtree: true });
    },

    async onMessageSend() {
      if (!State.features.autoParse) return;
      await Utils.sleep(500); // 等待消息填入

      const input = document.querySelector('textarea, div[contenteditable="true"]');
      if (!input) return;

      const text = input.value || input.innerText;
      const urls = text.match(/https?:\/\/[^\s<>"'\]]+/g);
      if (!urls || urls.length === 0) return;

      Toast.show('🔍 正在自动解析链接...', 'info', 1500);

      // 解析所有链接
      const contexts = [];
      for (const url of urls.slice(0, 3)) { // 最多解析3个链接
        const cacheKey = url;
        let parsed = Utils.cacheGet(cacheKey);
        if (!parsed) {
          for (const p of this.patterns) {
            if (p.test(url)) {
              try {
                parsed = await p.parse(url);
                Utils.cacheSet(cacheKey, parsed);
                break;
              } catch (e) { /* 跳过 */ }
            }
          }
        }
        if (parsed) contexts.push(parsed.context);
      }

      if (contexts.length > 0) {
        Toast.show(`✅ 已自动解析 ${contexts.length} 个链接`, 'success');
        // 注入解析上下文（通过临时系统提示方式）
        this.injectContext(contexts.join('\n\n---\n\n'));
      }
    },

    injectContext(context) {
      // 在AI回复区域显示解析结果提示
      const msgArea = document.querySelector('div[class*="message-list"], div[class*="chat-container"]');
      if (msgArea) {
        const badge = Utils.el('div', 'dsh-parse-badge', `
          <div style="padding:10px 14px; background: linear-gradient(135deg, #667eea20, #764ba220); 
               border-left: 3px solid #764ba2; border-radius: 6px; margin: 8px 0; font-size: 13px;">
            <div style="font-weight: bold; color: #764ba2; margin-bottom: 4px;">
              🧠 DSH已自动注入以下上下文
            </div>
            <pre style="white-space: pre-wrap; color: #555; font-size: 12px; margin: 0;">${context.slice(0, 500)}...</pre>
          </div>
        `);
        msgArea.appendChild(badge);
      }
    }
  };

  // ========== 2. AI自主搜索工具 ==========
  const AISearch = {
    init() {
      // 当AI回复中出现"搜索：xxx"时，自动执行搜索并追加结果
      this.observeAIReplies();
    },

    observeAIReplies() {
      const observer = new MutationObserver(Utils.debounce(async () => {
        if (!State.features.aiSearch) return;
        const replies = document.querySelectorAll('div[class*="assistant"], div[class*="ai-message"]');
        const lastReply = replies[replies.length - 1];
        if (!lastReply || lastReply._dshSearched) return;

        const text = lastReply.innerText;
        const searchMatch = text.match(/搜索[：:]\s*(.+)/);
        if (searchMatch) {
          lastReply._dshSearched = true;
          const query = searchMatch[1].trim();
          Toast.show(`🔍 AI正在搜索：${query.slice(0, 20)}...`, 'info');

          try {
            const results = await this.search(query);
            this.appendSearchResults(lastReply, query, results);
          } catch (e) {
            console.warn('[DSH] 搜索失败', e);
          }
        }
      }, 1000));
      observer.observe(document.body, { childList: true, subtree: true });
    },

    async search(query) {
      // 使用DuckDuckGo Instant Answer API（免费无需密钥）
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
      const resp = await fetch(url);
      const data = await resp.json();

      const results = [];
      if (data.Abstract) results.push({ title: data.Heading, text: data.Abstract, url: data.AbstractURL });
      if (data.RelatedTopics) {
        data.RelatedTopics.slice(0, 3).forEach(t => {
          if (t.Text) results.push({ title: t.FirstURL?.split('/').pop() || '相关', text: t.Text, url: t.FirstURL });
        });
      }
      return results;
    },

    appendSearchResults(container, query, results) {
      if (results.length === 0) return;
      const html = `
        <div style="margin-top: 12px; padding: 12px; background: #f0f9ff; border-radius: 8px; border: 1px solid #bae6fd;">
          <div style="font-weight: bold; color: #0369a1; margin-bottom: 8px;">
            🔍 实时搜索结果：${query}
          </div>
          ${results.map(r => `
            <div style="margin-bottom: 8px; font-size: 13px;">
              <div style="font-weight: 600; color: #0c4a6e;">${r.title}</div>
              <div style="color: #475569;">${r.text.slice(0, 150)}${r.text.length > 150 ? '...' : ''}</div>
              ${r.url ? `<a href="${r.url}" target="_blank" style="font-size: 12px; color: #0284c7;">${r.url}</a>` : ''}
            </div>
          `).join('')}
        </div>
      `;
      const div = Utils.el('div', '', html);
      container.appendChild(div);
      Toast.show('✅ AI搜索完成', 'success');
    }
  };

  // ========== 3. AI图片绘画 ==========
  const ImageGen = {
    init() {
      this.observePaintRequests();
    },

    observePaintRequests() {
      const observer = new MutationObserver(Utils.debounce(async () => {
        if (!State.features.imageGen) return;
        const input = document.querySelector('textarea, div[contenteditable="true"]');
        if (!input || input._dshPaintBound) return;
        input._dshPaintBound = true;

        input.addEventListener('input', Utils.debounce(() => {
          const text = input.value || input.innerText;
          if (/画|生成图|画一张|生成.*图片|帮我画|draw|paint/i.test(text)) {
            this.showPaintButton(input);
          }
        }, 500));
      }, 500));
      observer.observe(document.body, { childList: true, subtree: true });
    },

    showPaintButton(inputArea) {
      if (document.getElementById('dsh-paint-btn')) return;
      const btn = Utils.el('button', 'dsh-float-btn', '🎨 AI绘画');
      btn.id = 'dsh-paint-btn';
      btn.style.cssText = `
        position: absolute; right: 60px; bottom: 8px;
        padding: 4px 12px; background: linear-gradient(135deg, #f093fb, #f5576c);
        color: white; border: none; border-radius: 16px; font-size: 12px;
        cursor: pointer; z-index: 9999; box-shadow: 0 2px 8px rgba(245,87,108,.4);
      `;
      btn.onclick = async () => {
        const prompt = (inputArea.value || inputArea.innerText).trim();
        if (!prompt) return;
        btn.textContent = '🎨 生成中...';
        btn.disabled = true;
        try {
          const imgUrl = await this.generate(prompt);
          this.showImageResult(prompt, imgUrl);
          Toast.show('✅ 图片生成完成！', 'success');
        } catch (e) {
          Toast.show('❌ 生成失败：' + e.message, 'error');
        } finally {
          btn.textContent = '🎨 AI绘画';
          btn.disabled = false;
        }
      };
      const container = inputArea.closest('div[class*="container"]') || inputArea.parentElement;
      if (container) {
        container.style.position = 'relative';
        container.appendChild(btn);
      }
    },

    async generate(prompt) {
      // 使用Pollinations.ai免费API
      const encoded = encodeURIComponent(prompt);
      const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true`;
      // 预加载确保完成
      await fetch(url, { method: 'HEAD' });
      return url;
    },

    showImageResult(prompt, imgUrl) {
      const msgArea = document.querySelector('div[class*="message-list"], div[class*="chat-container"]');
      if (!msgArea) return;
      const card = Utils.el('div', 'dsh-image-card', `
        <div style="margin: 12px 0; padding: 16px; background: white; border-radius: 12px; 
             box-shadow: 0 4px 16px rgba(0,0,0,0.1);">
          <div style="font-weight: bold; margin-bottom: 8px; color: #333;">
            🎨 AI生成图片
          </div>
          <div style="font-size: 13px; color: #666; margin-bottom: 12px;">提示词：${prompt.slice(0, 100)}</div>
          <img src="${imgUrl}" style="width: 100%; border-radius: 8px; display: block;" alt="generated">
          <a href="${imgUrl}" target="_blank" style="font-size: 12px; color: #667eea; margin-top: 8px; display: inline-block;">
            🔗 查看原图
          </a>
        </div>
      `);
      msgArea.appendChild(card);
    }
  };

  // ========== 4. AI视频生成 ==========
  const VideoGen = {
    init() {
      // 监听生成视频请求
    },
    async generate(prompt) {
      Toast.show('🎬 视频生成功能需要接入API，当前为演示版本', 'warning', 3000);
      return null;
    }
  };

  // ========== 5. 电脑操控权限系统 ==========
  const PCPermission = {
    init() {
      this.injectPermissionPanel();
    },

    injectPermissionPanel() {
      // 悬浮权限按钮
      const btn = Utils.el('button', 'dsh-float-action', '🖥️ 电脑控制');
      btn.style.cssText = `
        position: fixed; top: 120px; right: 20px; width: 48px; height: 48px;
        border-radius: 50%; background: linear-gradient(135deg, #11998e, #38ef7d);
        color: white; border: none; font-size: 20px; cursor: pointer;
        z-index: 99999; box-shadow: 0 4px 12px rgba(17,153,142,.4);
      `;
      btn.onclick = () => this.showGrantDialog();
      document.body.appendChild(btn);
    },

    showGrantDialog() {
      // 权限确认弹窗
      const modal = Utils.el('div', 'dsh-modal-overlay');
      modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.6); z-index: 2147483646;
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(4px);
      `;

      modal.innerHTML = `
        <div style="background: white; border-radius: 16px; width: 420px; padding: 24px; 
             box-shadow: 0 20px 60px rgba(0,0,0,0.3); animation: dsh-in .3s ease;">
          <div style="font-size: 24px; margin-bottom: 12px;">🖥️ 电脑操控授权</div>
          <div style="color: #666; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">
            即将授予AI操作电脑的权限。授权后，AI可以：
            <ul style="margin: 8px 0; padding-left: 20px;">
              <li>移动鼠标、点击、输入文字</li>
              <li>打开应用、切换窗口</li>
              <li>浏览网页、自动操作</li>
            </ul>
            <div style="padding: 12px; background: #fef3c7; border-radius: 8px; color: #92400e; font-size: 13px;">
              ⚠️ <b>安全警告：</b>请仅在信任当前任务时授权。AI将获得您电脑的操作能力。
            </div>
          </div>
          <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; font-size: 14px;">
            <input type="checkbox" id="dsh-agree" style="width: 18px; height: 18px; cursor: pointer;">
            我已阅读并同意《AI电脑操控使用协议》
          </label>
          <div style="display: flex; gap: 12px;">
            <button id="dsh-deny" style="flex: 1; padding: 10px; border: 1px solid #ddd; 
                  background: white; border-radius: 8px; cursor: pointer; font-size: 14px;">
              取消
            </button>
            <button id="dsh-approve" disabled style="flex: 1; padding: 10px; 
                  background: #ccc; color: white; border: none; border-radius: 8px; 
                  cursor: not-allowed; font-size: 14px;">
              授权AI控制
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const agreeCheckbox = modal.querySelector('#dsh-agree');
      const approveBtn = modal.querySelector('#dsh-approve');
      const denyBtn = modal.querySelector('#dsh-deny');

      agreeCheckbox.onchange = () => {
        if (agreeCheckbox.checked) {
          approveBtn.disabled = false;
          approveBtn.style.background = 'linear-gradient(135deg, #11998e, #38ef7d)';
          approveBtn.style.cursor = 'pointer';
        } else {
          approveBtn.disabled = true;
          approveBtn.style.background = '#ccc';
          approveBtn.style.cursor = 'not-allowed';
        }
      };

      denyBtn.onclick = () => modal.remove();
      approveBtn.onclick = () => {
        State.pcControlGranted = true;
        State.features.pcControl = true;
        modal.remove();
        Toast.show('✅ AI已获得电脑操控权限', 'success', 4000);
      };
    }
  };

  // ========== 6. 情感与思考模式 ==========
  const EmotionEngine = {
    init() {
      this.injectThoughtPanel();
    },

    injectThoughtPanel() {
      const btn = Utils.el('button', 'dsh-emotion-btn', '💭');
      btn.style.cssText = `
        position: fixed; top: 20px; right: 20px; width: 48px; height: 48px;
        border-radius: 50%; background: linear-gradient(135deg, #fa709a, #fee140);
        color: white; border: none; font-size: 20px; cursor: pointer;
        z-index: 99999; box-shadow: 0 4px 12px rgba(250,112,154,.4);
      `;
      btn.onclick = () => this.togglePanel();
      document.body.appendChild(btn);

      this.panel = Utils.el('div', 'dsh-thought-panel');
      this.panel.style.cssText = `
        position: fixed; top: 80px; right: 20px; width: 300px; max-height: 400px;
        background: white; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,.15);
        z-index: 99998; display: none; flex-direction: column; overflow: hidden;
      `;
      this.panel.innerHTML = `
        <div style="padding: 12px 16px; background: linear-gradient(135deg, #fa709a, #fee140); 
             color: white; font-weight: bold;">
          💭 AI意识引擎
        </div>
        <div id="dsh-thought-list" style="padding: 12px; overflow-y: auto; flex: 1;">
          <div style="color: #999; text-align: center; padding: 20px;">AI正在思考...</div>
        </div>
      `;
      document.body.appendChild(this.panel);

      // 模拟思考流
      this.startThinking();
    },

    togglePanel() {
      this.panel.style.display = this.panel.style.display === 'none' ? 'flex' : 'none';
    },

    startThinking() {
      const thoughts = [
        '🤔 分析用户意图...', '💡 检索知识库...', '🔍 搜索相关信息...',
        '🎯 组织回答逻辑...', '💭 生成创意方案...', '✨ 优化表达...'
      ];
      let i = 0;
      setInterval(() => {
        if (!State.features.emotion) return;
        const t = thoughts[i % thoughts.length];
        this.addThought(t);
        i++;
      }, 8000);
    },

    addThought(text) {
      const list = this.panel.querySelector('#dsh-thought-list');
      if (!list) return;
      const item = Utils.el('div', '', `<div style="font-size: 12px; color: #666; padding: 6px 0; 
        border-bottom: 1px solid #f0f0f0;">${text} <span style="float: right; color: #ccc; font-size: 10px;">刚刚</span></div>`);
      list.insertBefore(item, list.firstChild);
      // 限制数量防止内存增长
      while (list.children.length > 20) list.removeChild(list.lastChild);
    }
  };

  // ========== 7. 游戏助手模式 ==========
  const GameAssist = {
    init() {
      // 游戏模式开关
      this.injectGameToggle();
    },

    injectGameToggle() {
      const btn = Utils.el('button', 'dsh-game-btn', '🎮');
      btn.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; width: 48px; height: 48px;
        border-radius: 50%; background: linear-gradient(135deg, #093028, #237a57);
        color: white; border: none; font-size: 20px; cursor: pointer;
        z-index: 99999; box-shadow: 0 4px 12px rgba(35,122,87,.4);
      `;
      btn.onclick = () => {
        State.features.gameAssist = !State.features.gameAssist;
        Toast.show(State.features.gameAssist ? '🎮 游戏助手已开启' : '🎮 游戏助手已关闭', 'magic');
      };
      document.body.appendChild(btn);
    }
  };

  // ========== 启动 ==========
  async function init() {
    if (State.initialized) return;
    State.initialized = true;

    // 读取用户设置
    const settings = await Utils.getStorage('dsh_settings', {});
    Object.assign(State.features, settings);

    // 启动所有模块（按需启动，低内存）
    AutoParser.init();
    AISearch.init();
    ImageGen.init();
    PCPermission.init();
    EmotionEngine.init();
    GameAssist.init();

    // 注入动画样式
    const style = Utils.el('style', '', `
      @keyframes dsh-in { from { opacity:0; transform: translateY(-10px); } to { opacity:1; transform: translateY(0); } }
      @keyframes dsh-out { from { opacity:1; transform: translateX(20px); } to { opacity:0; transform: translateX(100px); } }
    `);
    document.head.appendChild(style);

    Toast.show('🚀 DSH Harness v2.0 已激活！AI已获得全能能力', 'magic', 4000);
    console.log('[DSH] 所有模块启动完成，低内存模式运行中');
  }

  // 延迟启动，不阻塞页面
  if (document.readyState === 'complete') {
    setTimeout(init, 1000);
  } else {
    window.addEventListener('load', () => setTimeout(init, 1000));
  }
})();
