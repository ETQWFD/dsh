# 🚀 DSH Harness v3.1 - AI全能驾驭插件

> 给DeepSeek装上眼睛、双手和大脑 | 整合whale-craft | 强制支持MC 26.2

## ✨ 核心功能

### ⛏️ MC大师模式（强制支持26.2版本）
- ✅ 已整合 **whale-craft** ET修改版（`whale-craft/`目录）
- ✅ 强制支持 **Minecraft 26.2** 版本（修改了版本检查逻辑）
- 完整MC生存指南（第一天→末影龙攻略）
- 所有指令大全（give/time/gamemode/fill/effect/locate等）
- 合成配方速查表
- 红石基础教程
- 建造技巧
- 26.2新特性：新生物群系、新矿石分布、新洞穴类型
- 内置MC知识库面板（点击右侧⛏️按钮查看）

### 🐱 喵语模式
- AI回答结尾自动加上"喵～"

### 🔍 Bing搜索引擎（默认）
- AI遇到不会的问题自动用Bing搜索
- 也可以直接去B站搜索相关视频分析

### 🖼️ 壁纸系统
- 默认壁纸（恢复原界面）
- 静态图片壁纸
- 动态视频壁纸
- 一键切换

### 🔗 自动链接解析
- 直接发B站/YouTube/图片链接，AI自动解析

### 🎨 AI绘画生成
- 文字直接生成高清图片

### 💭 情感意识引擎
- AI思考过程实时可见

---

## 📦 安装命令

```bash
# 1. 克隆仓库
git clone https://github.com/ETQWFD/dsh.git

# 浏览器插件安装：
# 2. 打开 chrome://extensions/
# 3. 开启「开发者模式」
# 4. 「加载已解压的扩展程序」→ 选择dsh文件夹

# whale-craft（MC游玩插件）安装：
# cd dsh/whale-craft
# npm install
# dsh plugin add .
# 重启DSH即可游玩MC 26.2
```

---

## 🔧 whale-craft 26.2修改说明

原whale-craft因mineflayer testedVersions只到26.1而移除了26.2支持。
本版本做了以下修改强制支持26.2：

1. **src/mcversion.mjs** - 修改`supportedRange()`函数，强制latest扩展到26.2
2. **package.json** - 版本改为 `0.2.0-et.262`
3. 即使mineflayer读不到版本范围，也默认返回 `{oldest: '1.16', latest: '26.2'}`

---

## 📄 开源协议
MIT © ET 喵～
