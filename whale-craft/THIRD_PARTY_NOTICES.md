# 第三方组件与许可（THIRD PARTY NOTICES）

whale_craft 自身以 **MIT** 发布（见 `LICENSE`）。它**不打包**任何第三方**代码模块**，只在运行时
`import` 下列组件；唯一内联的第三方素材是**一个图标**（见「内联的第三方素材」）。请按各自许可使用与分发。

## 运行时依赖

| 组件 | 许可 | 说明 |
| --- | --- | --- |
| [`mineflayer`](https://github.com/PrismarineJS/mineflayer) | MIT | 无头 Minecraft 机器人 API。**由部署方安装**（见 README「关于 mineflayer」） |
| [`minecraft-protocol`](https://github.com/PrismarineJS/node-minecraft-protocol) | MIT | 协议层（mineflayer 的依赖） |
| [`minecraft-data`](https://github.com/PrismarineJS/minecraft-data) | MIT | 方块/实体/协议数据（mineflayer 的依赖） |
| `prismarine-*`（block / chunk / entity / item / physics / registry / windows / world 等） | MIT | mineflayer 的一组依赖 |
| [`vec3`](https://github.com/PrismarineJS/vec3) | MIT | 坐标向量类 |

## 宿主（DSH）提供的包

| 组件 | 许可 | 说明 |
| --- | --- | --- |
| `@deepseek-ai/dsh-tools` | MIT | 工具注册契约（`defineTool`）——由宿主提供，不随本包分发 |
| `@deepseek-ai/schemastery` | MIT | 插件配置 schema——由宿主提供 |
| `@deepseek-ai/dsh-client-ui-primitives` | MIT | 浏览器半端的 **DSH 官方图标集与控件**——由宿主**作为平台内置模块**提供（`require` 取得，不随本包分发）。本插件只用它的图标（如 `IconSettingsOutlineRegular`），与 DSH 原生 UI 同款 |

## 内联的第三方素材（图标）

| 素材 | 许可 | 说明 |
| --- | --- | --- |
| [Lucide](https://lucide.dev) —— `box` 图标 | ISC | **唯一**一个内联的第三方图标。用在浏览器半端「创建MC+分支」按钮上（`client.js` 的 `CUBE_PATHS`）：DSH 官方图标集里**没有立方体**，故取 Lucide 的 `box`。本 bundle **无构建步骤、不引运行时依赖**，所以只把该图标的 path 数据**原样内联**（不改路径）。 |

Lucide 的 ISC 许可全文（`lucide-static@1.52.0`，`icons/box.svg`）：

```
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

## 可选

| 组件 | 许可 | 说明 |
| --- | --- | --- |
| [`sharp`](https://github.com/lovell/sharp) | Apache-2.0 | **可选**：`mc_kit_image` 的 SVG→PNG 光栅化。没装也能用（地图出图走自带零依赖 PNG 编码器；`mc_kit_image` 会明确报"图像引擎不可用"） |

> 本包内的 `src/png.mjs` 是**自己写的零依赖 PNG 编码器**（`node:zlib` + 手写 CRC32），
> 不引用任何第三方图像库。
