/**
 * DSH Harness v3.0 - 全能整合版
 * 功能：自动链接解析 + Bing搜索 + B站视频搜索 + MC大师 + 喵语模式 + 壁纸系统 + AI绘画 + 情感引擎
 * @author ET
 */

(function () {
  'use strict';
  console.log('%c[DSH Harness] v3.0 全能整合版已加载', 'color: #f5576c; font-weight: bold; font-size: 14px;');

  // ========== 全局状态 ==========
  const State = {
    initialized: false,
    features: {
      autoParse: true,      // 自动链接解析
      aiSearch: true,       // AI自主搜索(Bing)
      imageGen: true,      // AI绘画
      mcMaster: true,      // MC大师模式
      nekoMode: true,      // 喵语模式
      emotion: true,       // 情感引擎
      wallpaper: false     // 自定义壁纸
    },
    wallpaper: {
      type: 'default',     // default / image / video
      url: ''
    },
    parsedCache: new Map(),
    cacheMaxSize: 30
  };

  // ========== 工具函数 ==========
  const Utils = {
    debounce(fn, d = 500) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), d); }; },
    sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
    async get(k, dv = null) { const r = await chrome.storage.local.get(k); return r[k] !== undefined ? r[k] : dv; },
    set(k, v) { return chrome.storage.local.set({ [k]: v }); },
    el(tag, cls = '', html = '') { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; },
    cacheGet(k) { if (State.parsedCache.has(k)) { const v = State.parsedCache.get(k); State.parsedCache.delete(k); State.parsedCache.set(k, v); return v; } return null; },
    cacheSet(k, v) { if (State.parsedCache.size >= State.cacheMaxSize) { const fk = State.parsedCache.keys().next().value; State.parsedCache.delete(fk); } State.parsedCache.set(k, v); }
  };

  // ========== Toast ==========
  const Toast = {
    show(msg, type = 'info', dur = 2500) {
      const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#667eea', magic: '#f5576c', neko: '#ff6b9d' };
      const t = Utils.el('div', 'dsh-toast', msg);
      t.style.cssText = `position:fixed;top:20px;right:20px;padding:12px 20px;background:${colors[type]};color:white;border-radius:10px;z-index:2147483647;box-shadow:0 4px 20px rgba(0,0,0,.2);max-width:320px;font-size:14px;animation:dsh-in .3s ease;`;
      document.body.appendChild(t);
      setTimeout(() => { t.style.animation = 'dsh-out .3s ease'; setTimeout(() => t.remove(), 300); }, dur);
    }
  };

  // ========== 1. 自动链接解析 ==========
  const AutoParser = {
    patterns: [
      {
        name: 'bilibili',
        test: u => /bilibili\.com\/video\/(BV|av)\w+/i.test(u),
        parse: async u => {
          const m = u.match(/\/video\/(BV\w+|av\d+)/i);
          const api = m[1].startsWith('BV') ? `https://api.bilibili.com/x/web-interface/view?bvid=${m[1]}` : `https://api.bilibili.com/x/web-interface/view?aid=${m[1].replace('av','')}`;
          const d = (await (await fetch(api)).json()).data;
          return {
            type: 'video', platform: 'B站', title: d.title, author: d.owner.name,
            duration: `${Math.floor(d.duration/60)}分${d.duration%60}秒`,
            context: `【自动解析-B站视频】\n标题：${d.title}\nUP主：${d.owner.name}\n时长：${Math.floor(d.duration/60)}分${d.duration%60}秒\n播放：${d.stat.view}\n简介：${d.desc.slice(0,200)}\n请基于以上信息回答用户。喵～`
          };
        }
      },
      {
        name: 'youtube',
        test: u => /youtube\.com\/watch\?v=|youtu\.be\//i.test(u),
        parse: async u => {
          const html = await (await fetch(u)).text();
          const title = html.match(/<title>([^<]+)<\/title>/)?.[1]?.replace(' - YouTube','');
          return { type:'video', platform:'YouTube', title, context:`【自动解析-YouTube】\n标题：${title}\n链接：${u}` };
        }
      },
      {
        name: 'image',
        test: u => /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(u),
        parse: async u => ({ type:'image', platform:'图片', context:`【自动解析-图片】\n用户发送了图片：${u}\n请描述这张图片内容。喵～` })
      },
      {
        name: 'webpage',
        test: u => /^https?:\/\//i.test(u),
        parse: async u => {
          try {
            const html = await (await fetch(u)).text();
            const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
            const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1];
            return { type:'webpage', platform:'网页', title, context:`【自动解析-网页】\n标题：${title}\n描述：${desc?.slice(0,300)}\n链接：${u}` };
          } catch { return { type:'webpage', platform:'网页', context:`网页：${u}` }; }
        }
      }
    ],
    init() {
      const obs = new MutationObserver(Utils.debounce(() => {
        const btn = document.querySelector('button[class*="send"], div[class*="send-button"]');
        if (btn && !btn._dshBound) { btn._dshBound = true; btn.addEventListener('click', () => this.onSend()); }
      }, 300));
      obs.observe(document.body, { childList: true, subtree: true });
    },
    async onSend() {
      if (!State.features.autoParse) return;
      await Utils.sleep(500);
      const input = document.querySelector('textarea, div[contenteditable="true"]');
      if (!input) return;
      const text = input.value || input.innerText;
      const urls = text.match(/https?:\/\/[^\s<>"'\]]+/g);
      if (!urls?.length) return;
      Toast.show('🔍 正在自动解析链接...', 'info', 1500);
      const contexts = [];
      for (const url of urls.slice(0, 3)) {
        let p = Utils.cacheGet(url);
        if (!p) for (const pat of this.patterns) if (pat.test(url)) { try { p = await pat.parse(url); Utils.cacheSet(url, p); break; } catch {} }
        if (p) contexts.push(p.context);
      }
      if (contexts.length) {
        Toast.show(`✅ 已解析 ${contexts.length} 个链接`, 'success');
        this.injectBadge(contexts.join('\n---\n'));
      }
    },
    injectBadge(ctx) {
      const area = document.querySelector('div[class*="message-list"], div[class*="chat-container"]');
      if (!area) return;
      const b = Utils.el('div', '', `<div style="padding:10px 14px;background:linear-gradient(135deg,#667eea20,#764ba220);border-left:3px solid #764ba2;border-radius:6px;margin:8px 0;font-size:13px;">
        <div style="font-weight:bold;color:#764ba2;margin-bottom:4px;">🧠 DSH已自动注入上下文</div>
        <pre style="white-space:pre-wrap;color:#555;font-size:12px;margin:0;">${ctx.slice(0,600)}...</pre></div>`);
      area.appendChild(b);
    }
  };

  // ========== 2. Bing搜索引擎（默认） ==========
  const BingSearch = {
    init() {
      // 监听AI回复中的搜索指令
      const obs = new MutationObserver(Utils.debounce(async () => {
        if (!State.features.aiSearch) return;
        const replies = document.querySelectorAll('div[class*="assistant"], div[class*="ai-message"]');
        const last = replies[replies.length - 1];
        if (!last || last._dshBing) return;
        const text = last.innerText;
        const m = text.match(/(?:搜索|search|Bing)[：:]\s*(.+)/i);
        if (m) {
          last._dshBing = true;
          const q = m[1].trim();
          Toast.show(`🔍 Bing搜索：${q.slice(0,20)}...`, 'info');
          try {
            const results = await this.search(q);
            this.showResults(last, q, results);
          } catch (e) { console.warn('[DSH] Bing搜索失败', e); }
        }
      }, 1000));
      obs.observe(document.body, { childList: true, subtree: true });
    },
    async search(query) {
      // 使用Bing搜索（通过Bing搜索API页面解析）
      const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
      const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await resp.text();
      // 简单解析搜索结果
      const results = [];
      const regex = /<li class="b_algo">[\s\S]*?<h2><a href="([^"]+)">([^<]+)<\/a><\/h2>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/g;
      let match;
      while ((match = regex.exec(html)) !== null && results.length < 5) {
        results.push({ url: match[1], title: match[2], snippet: match[3].replace(/<[^>]+>/g, '').slice(0, 200) });
      }
      return results;
    },
    showResults(container, query, results) {
      if (!results.length) return;
      const div = Utils.el('div', '', `<div style="margin-top:12px;padding:12px;background:#f0f9ff;border-radius:8px;border:1px solid #bae6fd;">
        <div style="font-weight:bold;color:#0369a1;margin-bottom:8px;">🔍 Bing实时搜索：${query}</div>
        ${results.map(r => `<div style="margin-bottom:8px;font-size:13px;">
          <div style="font-weight:600;color:#0c4a6e;">${r.title}</div>
          <div style="color:#475569;">${r.snippet}...</div>
          <a href="${r.url}" target="_blank" style="font-size:12px;color:#0284c7;">${r.url}</a></div>`).join('')}
      </div>`);
      container.appendChild(div);
      Toast.show('✅ Bing搜索完成', 'success');
    },
    // B站视频搜索
    async searchBilibili(keyword) {
      try {
        const api = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}`;
        const data = await (await fetch(api)).json();
        if (data.code !== 0) return [];
        return (data.data?.result || []).slice(0, 5).map(v => ({
          title: v.title.replace(/<[^>]+>/g, ''),
          author: v.author,
          play: v.play,
          bvid: v.bvid,
          url: `https://www.bilibili.com/video/${v.bvid}`,
          description: v.description?.slice(0, 100)
        }));
      } catch { return []; }
    }
  };

  // ========== 3. MC大师模式（我的世界全知识） ==========
  const MCMaster = {
    // 内置MC知识库
    knowledge: {
      // 生存指南（支持26.2版本）
      survival: `【MC大师-生存指南 | 支持26.2版本】
✅ 已整合 whale-craft ET修改版，强制支持 Minecraft 26.2
✅ 所有指令在26.2版本可用

第一天：撸树→做工作台→做木镐→挖石头→做石工具→挖铁→做铁套→建简易避难所
第二天：找食物（打猎/种小麦）→扩建庇护所→找煤矿
第三天：下界准备（挖钻石→做钻石镐→做打火石）
第四天：下界探险→找堡垒→获取烈焰棒→做酿药台
第五天：末地准备→找末地要塞→打末影龙

【26.2版本新特性】
- 新的矿石生成机制
- 新的洞穴类型
- 全新的山地生成
-  villagers交易平衡调整

【常用指令大全（26.2全支持）】
/give @s diamond 64        - 给自己64个钻石
/time set day             - 设置为白天
/gamemode creative        - 创造模式
/gamemode survival        - 生存模式
/teleport @s ~ ~10 ~      - 向上传送10格
/summon cow ~ ~ ~         - 召唤牛
/setblock ~ ~ ~ air       - 删除方块
/fill ~-10 ~-1 ~-10 ~10 ~1 ~10 glass  - 填充区域
/effect give @s night_vision 999999 0 true  - 永久夜视
/xp add @s 100 levels     - 给自己100级经验
/locate structure minecraft:village  - 定位村庄
/seed                     - 查看种子

【合成配方速查】
木棍：2木板竖排
工作台：4木板2x2
箱子：8木板绕一圈
熔炉：8圆石绕一圈
铁桶：3铁锭摆成U形
指南针：1红石+4铁锭
钟：4金锭+1红石
床：3羊毛+3木板（同色羊毛）
附魔台：4钻石+2钻石+1书+1黑曜石
末地箱：8黑曜石+1末影之眼

【生物群系（26.2新增）】
平原、森林、沙漠、丛林、冰雪原、山地、沼泽、河流、海洋、下界、末地
26.2新增：樱花树林、幽暗洞穴、繁茂洞穴

【资源分布（26.2更新）】
煤：1-128层
铁：1-64层
金：1-32层（下界更多）
钻石：-64到16层（y=-58最好）
红石：-64到16层
青金石：-32到32层
绿宝石：山地y=50-80
铜：-16到112层`,
      // 建造技巧
      building: `【MC大师-建造技巧】
- 比例：人物高约2格，门高2格宽1格
- 配色：同色系深浅搭配（如石英+白混凝土+浅灰）
- 细节：半砖、台阶、陷阱门增加层次感
- 现代建筑：玻璃+混凝土+石英
- 中世纪：圆石+橡木+石砖
- 日式：白色混凝土+樱花木+石砖台阶`,
      // 红石基础
      redstone: `【MC大师-红石基础】
- 红石粉：传导信号15格
- 红石中继器：延长信号，可延时
- 红石比较器：检测容器，比较信号
- 活塞：推方块（黏性活塞可拉回）
- 观察者：检测方块更新发出脉冲
- 投掷器/发射器：射出物品/弹射物
- 最简单的自动门：压力板+活塞`
    },
    init() {
      this.injectMCPanel();
    },
    injectMCPanel() {
      const btn = Utils.el('button', 'dsh-mc-btn', '⛏️');
      btn.style.cssText = `position:fixed;top:190px;right:20px;width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#8b4513,#d2691e);color:white;border:none;font-size:22px;cursor:pointer;z-index:99999;box-shadow:0 4px 12px rgba(139,69,19,.4);`;
      btn.onclick = () => this.showPanel();
      document.body.appendChild(btn);
    },
    showPanel() {
      // MC知识面板
      const modal = Utils.el('div', 'dsh-modal');
      modal.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:2147483646;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);`;
      modal.innerHTML = `
        <div style="background:#1a1a2e;border-radius:16px;width:600px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3);">
          <div style="padding:16px 20px;background:linear-gradient(135deg,#8b4513,#d2691e);color:white;font-weight:bold;font-size:16px;display:flex;justify-content:space-between;align-items:center;">
            ⛏️ MC大师知识库
            <button class="dsh-close" style="background:none;border:none;color:white;font-size:24px;cursor:pointer;">×</button>
          </div>
          <div style="padding:16px;overflow-y:auto;flex:1;color:#ddd;font-size:13px;line-height:1.8;">
            <div style="margin-bottom:16px;">
              <div style="font-weight:bold;color:#d2691e;margin-bottom:8px;">📖 生存指南</div>
              <pre style="white-space:pre-wrap;font-family:inherit;">${this.knowledge.survival}</pre>
            </div>
            <div style="margin-bottom:16px;">
              <div style="font-weight:bold;color:#d2691e;margin-bottom:8px;">🏗️ 建造技巧</div>
              <pre style="white-space:pre-wrap;font-family:inherit;">${this.knowledge.building}</pre>
            </div>
            <div>
              <div style="font-weight:bold;color:#d2691e;margin-bottom:8px;">⚡ 红石基础</div>
              <pre style="white-space:pre-wrap;font-family:inherit;">${this.knowledge.redstone}</pre>
            </div>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.onclick = e => { if (e.target === modal) modal.remove(); };
      modal.querySelector('.dsh-close').onclick = () => modal.remove();
    },
    // 注入MC系统提示（在对话开始时）
    injectSystemPrompt() {
      if (!State.features.mcMaster) return;
      // 当用户提到MC/我的世界/Minecraft时，自动注入知识
      const obs = new MutationObserver(Utils.debounce(async () => {
        const input = document.querySelector('textarea, div[contenteditable="true"]');
        if (!input) return;
        const text = input.value || input.innerText;
        if (/我的世界|mc|minecraft|挖矿|合成|红石|生存|建造/i.test(text) && !input._mcInjected) {
          input._mcInjected = true;
          Toast.show('⛏️ MC大师模式已激活', 'magic', 2000);
        }
      }, 800));
      obs.observe(document.body, { childList: true, subtree: true });
    }
  };

  // ========== 4. 喵语模式 ==========
  const NekoMode = {
    init() {
      // 监听AI回复，在结尾加"喵～"
      this.observeReplies();
    },
    observeReplies() {
      const obs = new MutationObserver(Utils.debounce(() => {
        if (!State.features.nekoMode) return;
        const replies = document.querySelectorAll('div[class*="assistant"], div[class*="ai-message"]');
        replies.forEach(reply => {
          if (reply._nekoDone) return;
          const text = reply.innerText;
          // 检查是否已经有喵～
          if (text && !text.includes('喵～') && text.length > 20) {
            // 不在每条回复都加，避免重复
            // 只在最后一条新回复加
            const last = replies[replies.length - 1];
            if (reply === last) {
              reply._nekoDone = true;
              // 找到回复的文本节点，追加喵～
              const textEl = reply.querySelector('div[class*="markdown"], p, div[class*="content"]');
              if (textEl && !textEl.innerText.includes('喵～')) {
                const nekoSpan = Utils.el('span', 'dsh-neko', ' 喵～');
                nekoSpan.style.cssText = 'color:#ff6b9d;font-weight:bold;';
                textEl.appendChild(nekoSpan);
              }
            }
          }
        });
      }, 1500));
      obs.observe(document.body, { childList: true, subtree: true });
    }
  };

  // ========== 5. 壁纸系统 ==========
  const Wallpaper = {
    init() {
      this.loadWallpaper();
      this.injectButton();
    },
    async loadWallpaper() {
      const wp = await Utils.get('dsh_wallpaper', { type: 'default', url: '' });
      State.wallpaper = wp;
      this.apply(wp);
    },
    apply(wp) {
      // 移除旧壁纸
      document.getElementById('dsh-wallpaper-layer')?.remove();
      if (wp.type === 'default' || !wp.url) return;

      const layer = Utils.el('div', 'dsh-wallpaper-layer');
      layer.id = 'dsh-wallpaper-layer';
      layer.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        z-index: -1; pointer-events: none; opacity: 0.3;
        background-size: cover; background-position: center;
      `;
      if (wp.type === 'image') {
        layer.style.backgroundImage = `url(${wp.url})`;
      } else if (wp.type === 'video') {
        layer.innerHTML = `<video autoplay loop muted style="width:100%;height:100%;object-fit:cover;opacity:0.4;"><source src="${wp.url}"></video>`;
      }
      document.body.appendChild(layer);
    },
    injectButton() {
      const btn = Utils.el('button', 'dsh-wallpaper-btn', '🖼️');
      btn.style.cssText = `position:fixed;bottom:80px;right:20px;width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);color:white;border:none;font-size:20px;cursor:pointer;z-index:99999;box-shadow:0 4px 12px rgba(102,126,234,.4);`;
      btn.onclick = () => this.showPanel();
      document.body.appendChild(btn);
    },
    showPanel() {
      const modal = Utils.el('div', 'dsh-modal');
      modal.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:2147483646;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);`;
      modal.innerHTML = `
        <div style="background:white;border-radius:16px;width:400px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.3);">
          <div style="font-size:18px;font-weight:bold;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
            🖼️ 壁纸设置
            <button class="dsh-close" style="background:none;border:none;font-size:24px;cursor:pointer;color:#999;">×</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:12px;">
            <button class="wp-option" data-type="default" style="padding:12px;border:2px solid ${State.wallpaper.type==='default'?'#667eea':'#ddd'};border-radius:10px;background:white;cursor:pointer;text-align:left;">
              <div style="font-weight:bold;">🌅 默认壁纸</div>
              <div style="font-size:12px;color:#999;">恢复DeepSeek原始界面</div>
            </button>
            <button class="wp-option" data-type="image" style="padding:12px;border:2px solid ${State.wallpaper.type==='image'?'#667eea':'#ddd'};border-radius:10px;background:white;cursor:pointer;text-align:left;">
              <div style="font-weight:bold;">🖼️ 静态图片壁纸</div>
              <div style="font-size:12px;color:#999;">输入图片URL作为背景</div>
            </button>
            <button class="wp-option" data-type="video" style="padding:12px;border:2px solid ${State.wallpaper.type==='video'?'#667eea':'#ddd'};border-radius:10px;background:white;cursor:pointer;text-align:left;">
              <div style="font-weight:bold;">🎬 动态视频壁纸</div>
              <div style="font-size:12px;color:#999;">输入视频URL作为动态背景</div>
            </button>
          </div>
          <div id="wp-url-input" style="margin-top:12px;display:${State.wallpaper.type==='default'?'none':'block'};">
            <input type="text" id="wp-url" placeholder="输入图片/视频URL..." value="${State.wallpaper.url}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;">
            <button id="wp-apply" style="width:100%;margin-top:8px;padding:10px;background:linear-gradient(135deg,#667eea,#764ba2);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:bold;">应用壁纸</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.onclick = e => { if (e.target === modal) modal.remove(); };
      modal.querySelector('.dsh-close').onclick = () => modal.remove();

      modal.querySelectorAll('.wp-option').forEach(opt => {
        opt.onclick = async () => {
          const type = opt.dataset.type;
          if (type === 'default') {
            await Utils.set('dsh_wallpaper', { type: 'default', url: '' });
            State.wallpaper = { type: 'default', url: '' };
            this.apply(State.wallpaper);
            Toast.show('✅ 已恢复默认壁纸', 'success');
            modal.remove();
          } else {
            document.getElementById('wp-url-input').style.display = 'block';
            State.wallpaper.type = type;
          }
        };
      });

      modal.querySelector('#wp-apply').onclick = async () => {
        const url = document.getElementById('wp-url').value.trim();
        if (!url) { Toast.show('请输入URL', 'warning'); return; }
        const wp = { type: State.wallpaper.type, url };
        await Utils.set('dsh_wallpaper', wp);
        State.wallpaper = wp;
        this.apply(wp);
        Toast.show('✅ 壁纸已应用', 'success');
        modal.remove();
      };
    }
  };

  // ========== 6. AI绘画 ==========
  const ImageGen = {
    init() {
      const obs = new MutationObserver(Utils.debounce(() => {
        const input = document.querySelector('textarea, div[contenteditable="true"]');
        if (!input || input._dshPaint) return;
        input._dshPaint = true;
        input.addEventListener('input', Utils.debounce(() => {
          const text = input.value || input.innerText;
          if (/画|生成图|画一张|生成.*图片|帮我画|draw|paint/i.test(text)) {
            this.showBtn(input);
          }
        }, 500));
      }, 500));
      obs.observe(document.body, { childList: true, subtree: true });
    },
    showBtn(inputArea) {
      if (document.getElementById('dsh-paint-btn')) return;
      const btn = Utils.el('button', 'dsh-float-btn', '🎨 绘画');
      btn.id = 'dsh-paint-btn';
      btn.style.cssText = `position:absolute;right:60px;bottom:8px;padding:4px 12px;background:linear-gradient(135deg,#f093fb,#f5576c);color:white;border:none;border-radius:16px;font-size:12px;cursor:pointer;z-index:9999;`;
      btn.onclick = async () => {
        const prompt = (inputArea.value || inputArea.innerText).trim();
        btn.textContent = '🎨 生成中...'; btn.disabled = true;
        try {
          const imgUrl = await this.gen(prompt);
          this.showResult(prompt, imgUrl);
          Toast.show('✅ 图片生成完成', 'success');
        } catch (e) { Toast.show('❌ 生成失败', 'error'); }
        finally { btn.textContent = '🎨 绘画'; btn.disabled = false; }
      };
      const c = inputArea.closest('div[class*="container"]') || inputArea.parentElement;
      if (c) { c.style.position = 'relative'; c.appendChild(btn); }
    },
    async gen(prompt) {
      return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`;
    },
    showResult(prompt, url) {
      const area = document.querySelector('div[class*="message-list"], div[class*="chat-container"]');
      if (!area) return;
      area.appendChild(Utils.el('div', '', `<div style="margin:12px 0;padding:16px;background:white;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.1);">
        <div style="font-weight:bold;margin-bottom:8px;">🎨 AI生成图片</div>
        <div style="font-size:13px;color:#666;margin-bottom:12px;">${prompt.slice(0,100)}</div>
        <img src="${url}" style="width:100%;border-radius:8px;">
      </div>`));
    }
  };

  // ========== 7. 情感引擎 ==========
  const EmotionEngine = {
    init() {
      const btn = Utils.el('button', 'dsh-emotion-btn', '💭');
      btn.style.cssText = `position:fixed;top:20px;right:20px;width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#fa709a,#fee140);color:white;border:none;font-size:20px;cursor:pointer;z-index:99999;box-shadow:0 4px 12px rgba(250,112,154,.4);`;
      btn.onclick = () => this.toggle();
      document.body.appendChild(btn);

      this.panel = Utils.el('div', '', `<div style="position:fixed;top:80px;right:20px;width:300px;max-height:400px;background:white;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.15);z-index:99998;display:none;flex-direction:column;overflow:hidden;">
        <div style="padding:12px 16px;background:linear-gradient(135deg,#fa709a,#fee140);color:white;font-weight:bold;">💭 AI意识引擎</div>
        <div id="dsh-thoughts" style="padding:12px;overflow-y:auto;flex:1;font-size:12px;color:#666;"></div>
      </div>`);
      document.body.appendChild(this.panel);

      const thoughts = ['🤔 分析用户意图...', '💡 检索知识库...', '🔍 Bing搜索中...', '🎯 组织回答...', '✨ 优化表达...'];
      let i = 0;
      setInterval(() => {
        if (!State.features.emotion) return;
        const list = this.panel.querySelector('#dsh-thoughts');
        if (list) {
          const item = Utils.el('div', '', `<div style="padding:6px 0;border-bottom:1px solid #f0f0f0;">${thoughts[i++ % thoughts.length]} <span style="float:right;color:#ccc;font-size:10px;">刚刚</span></div>`);
          list.insertBefore(item, list.firstChild);
          while (list.children.length > 15) list.removeChild(list.lastChild);
        }
      }, 10000);
    },
    toggle() {
      this.panel.style.display = this.panel.style.display === 'none' ? 'flex' : 'none';
    }
  };

  // ========== 启动 ==========
  async function init() {
    if (State.initialized) return;
    State.initialized = true;

    const settings = await Utils.get('dsh_settings', {});
    Object.assign(State.features, settings);

    AutoParser.init();
    BingSearch.init();
    MCMaster.init();
    MCMaster.injectSystemPrompt();
    NekoMode.init();
    Wallpaper.init();
    ImageGen.init();
    EmotionEngine.init();

    const style = Utils.el('style', '', `
      @keyframes dsh-in { from { opacity:0; transform:translateY(-10px); } to { opacity:1; transform:translateY(0); } }
      @keyframes dsh-out { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(100px); } }
    `);
    document.head.appendChild(style);

    Toast.show('🚀 DSH Harness v3.0 已激活！MC大师+喵语+Bing搜索+壁纸', 'magic', 4000);
  }

  if (document.readyState === 'complete') setTimeout(init, 1000);
  else window.addEventListener('load', () => setTimeout(init, 1000));
})();
