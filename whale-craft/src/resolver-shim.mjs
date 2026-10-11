/**
 * 🔴 宿主解析器兜底 —— 绕过 DSH 0.2.0-rc.2 的一个模块解析 bug（2026-10-06）。
 * ============================================================================
 * 症状：**从 npm/registry 安装**（非 link）的插件一律 `failed to import`、整个插件不激活；
 *      本机 link 调试却完全正常。
 * 根因（隔离实例复现 + 宿主源码逐字核实）：
 *   DSH 桌面宿主的 `dsh-app-boot` 用 `ResolutionRouter` 补丁了 CJS 的 `Module._resolveFilename`。
 *   它的 `routeScoped()` 对 **link 层**提前 `routeLinked()` 返回；**非 link 层**才会走到
 *     `for (const p of createRequire(parent).resolve.paths(name))`
 *   而 `readable-stream@4` 里写着 `require('process/')`（**尾部带斜杠**，它给打包器留的写法）——
 *   普通 Node 会把 `process/` 当内置 `process` 解析，但 `resolve.paths('process/')` 返回 **null**，
 *   `for...of null` 抛
 *     `TypeError: createRequire.resolve.paths is not a function or its return value is not iterable`
 *   ⇒ 插件加载 mineflayer（其依赖链含 readable-stream）时 import 失败。
 * 修法：在我们自己模块图的最前面包一层 `Module._resolveFilename`：先原样调用宿主那份；
 *   只在它抛上述**特定** TypeError 时按标准语义兜底（去尾部斜杠后是内置名就直接返回，否则退回 `_findPath`）。
 *   其余请求**行为完全不变**。
 * ⚠️ 这是对宿主内部的 monkey-patch；宿主修好此 bug 后本模块可删。
 * ============================================================================
 */
import Module from 'node:module'

const M = Module

function isBuiltin (name) {
  try { if (typeof M.isBuiltin === 'function') return M.isBuiltin(name) } catch {}
  try { return Array.isArray(M.builtinModules) && M.builtinModules.includes(name) } catch {}
  return false
}

const original = M._resolveFilename
if (typeof original === 'function') {
  M._resolveFilename = function (request, parent, isMain, options) {
    try {
      return original.call(this, request, parent, isMain, options)
    } catch (error) {
      const message = (error && error.message) || ''
      if (!/resolve\.paths is not a function|is not iterable/.test(message)) throw error
      const bare = String(request).replace(/[\\/]+$/, '')
      if (isBuiltin(bare)) return bare
      try {
        const paths = M._resolveLookupPaths ? (M._resolveLookupPaths(request, parent) || []) : []
        const found = M._findPath ? M._findPath(request, paths, !!isMain) : false
        if (found) return found
      } catch {}
      throw error
    }
  }
}
