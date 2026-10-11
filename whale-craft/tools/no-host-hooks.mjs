/**
 * "无宿主模拟"的解析拦截钩子 —— 只给 selfcheck 的子进程用，不参与插件运行。
 *
 * 把两个**宿主包**（optional peer）变成"解析不到"，精确复现官方 dsh-desktop /
 * 干净 npm 安装里 index.js 顶层 import 失败的现场（见 src/tool-def.mjs 头注释）。
 * 配合 tools/no-host-init.mjs 使用：`node --import <init> selfcheck.mjs`。
 */
const BLOCKED = ['@deepseek-ai/schemastery', '@deepseek-ai/dsh-tools']

export async function resolve (specifier, context, next) {
  if (BLOCKED.some((name) => specifier === name || specifier.startsWith(`${name}/`))) {
    const err = new Error(`Cannot find package '${specifier}'（selfcheck 无宿主模拟：蓄意屏蔽）`)
    err.code = 'ERR_MODULE_NOT_FOUND'
    throw err
  }
  return next(specifier, context)
}
