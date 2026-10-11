/**
 * 发布侧回归：**干净目录安装后 `import('whale_craft')` 必须成功**（CI 必跑）。
 * ============================================================================
 * 🔴 为什么必须"npm pack → 独立目录 npm install"：
 *   开发机的 node_modules（含 link 安装）解析得到宿主包（@deepseek-ai/dsh-tools / schemastery），
 *   永远复现不了 GitHub issue #5 —— 用户干净安装 / 官方 dsh-desktop（宿主包在 app.asar 里）
 *   上插件在**模块链接期**就失败，宿主只报一句 `failed to import`。
 *   所以本脚本模拟"用户实际环境"，只做 import、不启动 DSH。
 *
 * 反证（写完手动验一次）：把 index.js 改回**静态** import 两个宿主包，本脚本必须变红。
 * ============================================================================
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'whale-standalone-'))

/** npm 入口：优先 <node>/node_modules/npm/bin/npm-cli.js（Windows 官方包装法），
 *  POSIX 官方布局在 ../lib/node_modules/…；都没有再退到 PATH 上的 npm（Windows 需要 shell 才能跑 .cmd）。 */
const npmCli = [
  join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  join(dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
].find((p) => existsSync(p))
const runNpm = (args) => npmCli
  ? execFileSync(process.execPath, [npmCli, ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  : execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' })

let ok = false
let detail = ''
try {
  // 1) 打包本仓库（files 白名单生效，与被发布的包一致）
  const packed = runNpm(['pack', '--pack-destination', dir, root])
  const tgz = packed.trim().split('\n').map((l) => l.trim()).filter((l) => l.endsWith('.tgz')).pop()
  if (!tgz) throw new Error(`npm pack 没产出 tgz；输出：${packed.slice(0, 200)}`)
  console.log(`📦 ${tgz}`)

  // 2) 干净目录安装：--omit=optional 不装 sharp（专测最小安装；两个 optional peer 本来就不会被装）
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'standalone-repro', private: true, type: 'module' }))
  runNpm(['install', `./${tgz}`, '--omit=optional', '--no-audit', '--no-fund'])

  // 3) 只做 import（不启动 DSH）；Config 允许缺（宿主 schemastery 不可用时按设计不导出）
  detail = execFileSync(process.execPath, ['-e', `
    import('whale_craft').then((m) => {
      if (m.name !== 'whale_craft') throw new Error('name 不对：' + String(m.name))
      if (typeof m.apply !== 'function') throw new Error('apply 不是函数')
      if (!Array.isArray(m.inject)) throw new Error('inject 不是数组')
      console.log('OK: ' + Object.keys(m).sort().join(', ') + '｜Config ' + (m.Config ? '有 schema' : '无（宿主 schemastery 不可用，按设计）'))
    }).catch((e) => { console.error('FAIL: ' + String(e?.code ?? '') + ' ' + String(e?.message ?? e)); process.exit(1) })
  `], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  ok = true
} catch (e) {
  detail = String(e.stdout ?? '').trim() || String(e.stderr ?? '').trim() || String(e.message ?? e)
} finally {
  if (ok) { try { rmSync(dir, { recursive: true, force: true }) } catch {} }
}

if (ok) {
  console.log(`✅ 干净目录安装后 import('whale_craft') 成功：${detail}`)
  process.exit(0)
} else {
  console.log('❌ 干净目录安装后 import(\'whale_craft\') 失败（干净环境是用户实际环境，必须通过）：')
  console.log(detail.split('\n').slice(0, 15).map((l) => '   ' + l).join('\n'))
  console.log(`（保留现场供排查：${dir}）`)
  process.exit(1)
}
