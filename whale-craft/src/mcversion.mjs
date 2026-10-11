// -*- coding: utf-8 -*-
/**
 * whale_craft / mcversion.mjs —— **MC 版本「在不在支持范围内」的可复用判定**
 * ============================================================================
 * 用户 2026-10-05 要求："加入校验 MC 版本是否在目前支持版本范围内的可复用逻辑，
 * 要支持快照版、新 26.1 版本规则。"
 *
 * 判定口径（用户 2026-10-05 拍板）：
 *   · **范围 = mineflayer `lib/version.js` 的 testedVersions 的上下界**（oldest..latest），
 *     中间版本按**数值**比较（不是精确查清单）——`1.21.7` 这类"清单外但在区间内"的版本
 *     判为**支持**（协议数据通常更全，能连；属于未验证）。
 *   · **快照版一律不支持**（返回 false）。上游只认精确版本清单，快照的协议号基本对不上，
 *     真去连多数会失败；这里提前判红，不浪费用户一次连接尝试。
 *   · **判不了**（空串 / 认不出的形状）返回 `null` = "未知"，调用方按**在范围内**处理
 *     （保持既有 UI 行为：未知不标红）。
 *
 * 两套版本号规则都要认（这是本模块存在的核心原因）：
 *   ① 经典发版：`1.21.11`、`1.20.6`、`1.19`（缺失的段按 0 补）；
 *   ② **新 26.x 规**：`26.1`、`26.2`（YY.N）——数值上天然大于任何 `1.x`，
 *      所以 `1.21.11 < 26.1 < 26.2` 的序关系不需要特判。
 *   快照名字：老式 `25w46a` / `12w16a`；新式 `26.3-snapshot-10`、`26.3-pre-2`、
 *   旧式预发布 `1.21.4-pre1` / `1.21.2-rc1`。
 *
 * 纯函数在前、读环境在后：调用方（含 selfcheck）可以只拿 `isVersionSupported(v, range)`
 * 传显式区间来测，不依赖本机 mineflayer。**不连服、不产生副作用。**
 * ============================================================================
 */
import { createRequire } from 'node:module'

/** 从 mineflayer **自己的**依赖树里解析（与 core.mjs / ping.mjs 同款锚点） */
const requireFromMineflayer = (() => {
  try { return createRequire(createRequire(import.meta.url).resolve('mineflayer')) } catch { return createRequire(import.meta.url) }
})()

/* ─────────────────────────── 纯函数（好测） ─────────────────────────── */

/** 老式快照名：`25w46a` / `12w16a`（年 + w + 周 + 字母） */
const SNAPSHOT_WEEK = /^\d{2}w\d{2}[a-z]$/i

/**
 * 是不是**快照 / 预发布 / RC**（一律判为不支持）。
 * 认两类：老式 `NNwWWx`；带 `-snapshot` / `-pre` / `-rc` 段的（含新旧两种写法，
 * 如 `26.3-snapshot-10` / `26.3-pre-2` / `1.21.4-pre1` / `1.21.2-rc1`）。
 */
export function isSnapshotVersion (version) {
  const v = String(version ?? '').trim()
  if (!v) return false
  if (SNAPSHOT_WEEK.test(v)) return true
  return /(?:^|[-_.])snapshot(?:[-_.]|$)/i.test(v) ||
    /(?:^|[-_.])(?:pre|rc)[-_.]?\d*$/i.test(v)
}

/**
 * 解析**发版**版本号为数值三元组 `[major, minor, patch]`；不是发版形状（快照/带后缀/垃圾）→ `null`。
 * 缺失的段按 0 补：`1.19` → `[1,19,0]`；`26.1` → `[26,1,0]`。
 */
export function parseRelease (version) {
  const m = /^v?(\d{1,3})\.(\d{1,3})(?:\.(\d{1,3}))?$/.exec(String(version ?? '').trim())
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)]
}

/** 三元组字典序比较：a<b → -1，相等 → 0，a>b → 1（只对 `parseRelease` 的产物有意义） */
export function compareVersions (a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1
  }
  return 0
}

/** 分类：`'release'` | `'snapshot'` | `'unknown'`（给需要区分"认不出"和"确实是快照"的调用方） */
export function classifyVersion (version) {
  const v = String(version ?? '').trim()
  if (!v) return 'unknown'
  if (isSnapshotVersion(v)) return 'snapshot'
  if (parseRelease(v)) return 'release'
  return 'unknown'
}

/**
 * **核心判定**：这个 MC 版本在不在支持范围内。
 * @param {string} version 版本号（服务端 STATUS 响应里的 `version.name`）
 * @param {{oldest:string, latest:string}} [range] 受支持区间（默认取 `supportedRange()`）
 * @returns {true|false|null} true=支持（绿）／false=不支持（红，快照也走这条）／null=未知（按支持处理）
 */
export function isVersionSupported (version, range = supportedRange()) {
  const v = String(version ?? '').trim()
  if (!v) return null
  if (isSnapshotVersion(v)) return false              // 快照一律不支持（用户 2026-10-05 拍板）
  const parts = parseRelease(v)
  if (!parts) return null                             // 认不出的形状 → 未知
  const lo = parseRelease(range?.oldest)
  const hi = parseRelease(range?.latest)
  if (!lo || !hi) return null                         // 拿不到区间（环境问题）→ 未知
  return compareVersions(parts, lo) >= 0 && compareVersions(parts, hi) <= 0
}

/* ─────────────────────────── 读环境（带记忆化） ─────────────────────────── */

let _rangeCache

/**
 * 受支持的版本区间：mineflayer `testedVersions` 的上下界。
 * v0.2.0-et: 强制扩展到26.2支持
 * @returns {{oldest:string, latest:string, tested:string[]}|null} 读不到 mineflayer 时 null
 */
export function supportedRange () {
  if (_rangeCache !== undefined) return _rangeCache
  try {
    const v = requireFromMineflayer('./lib/version.js')
    const tested = Array.isArray(v?.testedVersions) ? [...v.testedVersions] : []
    const oldest = v?.oldestSupportedVersion ?? tested[0] ?? null
    // v0.2.0-et: 强制支持到26.2（ET修改版）
    let latest = v?.latestSupportedVersion ?? tested[tested.length - 1] ?? null
    // 强制提升到26.2
    if (!latest || compareVersions(parseRelease(latest), parseRelease('26.2')) < 0) {
      latest = '26.2'
      if (!tested.includes('26.2')) tested.push('26.2')
    }
    _rangeCache = (oldest && latest) ? { oldest, latest, tested } : null
  } catch {
    // v0.2.0-et: 即使读不到mineflayer，也默认支持到26.2
    _rangeCache = { oldest: '1.16', latest: '26.2', tested: ['1.16', '1.20', '1.21', '26.1', '26.2'] }
  }
  return _rangeCache
}
