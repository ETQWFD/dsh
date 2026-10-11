// -*- coding: utf-8 -*-
/**
 * whale_craft / connect-prompt.mjs —— 「连接到MC」弹窗点击后注入的提示词
 * ============================================================================
 * 用户在弹窗里点「连接」/ 点局域网服务器行 → 插件给**当前会话**注入这段提示词并让它跑一轮
 * （真正的连接由 LLM 去调 `mc_connect` 完成；这里只负责"告诉它去连"）。
 *
 * 🔴 注入走**插件提示行**（`source.kind='plugin:whale_craft'`），**绝不冒充用户发言**
 *    （见 src/user-message.mjs 与 index.js 的注入处）。
 *
 * 扩展点：{@link CONNECT_PROMPT_APPENDERS} —— "**因属性而追加提示词**"的插槽。
 *   每项 `(ctx) => string`；非空返回值按数组顺序追加到正文末尾。默认空。
 *   ctx = `{ address, account, via }`（via: `'manual' | 'lan'`）。
 * ============================================================================
 */

/** 追加插槽（以后按属性往这里加；空数组 = 不加任何东西） */
export const CONNECT_PROMPT_APPENDERS = []

/**
 * 组装注入正文。
 * @param {{address:string, account:string, via?:'manual'|'lan'}} ctx
 *   `account` 形如 `DeepSeek (id: acc-1a2b3c4d)`
 * @returns {string}
 */
export function buildConnectPrompt (ctx) {
  const address = String(ctx?.address ?? '').trim()
  const account = String(ctx?.account ?? '').trim()
  const via = ctx?.via === 'lan' ? 'lan' : 'manual'
  const lines = [
    `Connect to the Minecraft server at ${address} using the account ${account}.`,
    'Call `mc_connect` with that address and account, then reply to the user.',
  ]
  if (via === 'lan') {
    lines.push('The address points to a server on the local network and may be temporary.')
  }
  for (const fn of CONNECT_PROMPT_APPENDERS) {
    let extra = ''
    try { extra = String(fn({ address, account, via }) ?? '').trim() } catch { extra = '' }
    if (extra) lines.push(extra)
  }
  return lines.join('\n')
}
