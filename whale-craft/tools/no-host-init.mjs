/**
 * 注册「无宿主模拟」解析钩子（selfcheck 的子进程用）。
 * `module.register` 的钩子要跑在单独的线程里，所以必须拆成两个文件：
 * 本文件负责注册，逻辑在 ./no-host-hooks.mjs。
 */
import { register } from 'node:module'

register('./no-host-hooks.mjs', import.meta.url)
