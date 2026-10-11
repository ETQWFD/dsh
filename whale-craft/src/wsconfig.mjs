// -*- coding: utf-8 -*-
/**
 * whale_craft / wsconfig.mjs —— **按工作区**的配置（`<记忆根>/config.json`）
 * ============================================================================
 * 用户 2026-10-03 定：按工作区独立的设置（提示词的版本 + 「MC设置→提示词」页的三个开关）
 * 统一存到工作区下的 `config.json`（默认 `<工作区>/.whale-craft/config.json`），
 * 取代原来散在两处的存法：
 *   · 提示词版本标记原来是独立文件 `.rules-version`（现在迁入 `rulesVersion` 字段）；
 *   · 三个开关原来存在**全局** `$DSH_HOME/whale_craft/config.json`（现在按工作区）。
 *
 * 这个文件对 MC 模式的 AI **可读不可写**（与 RULES.md 同一套保护，见 src/protected.mjs）；
 * 写入只来自插件内部与「MC设置」接口。
 *
 * 读取宽容、写入克制：
 *   · 读：文件缺失/坏 JSON → 默认值 + lastError，绝不抛（坏配置不能让插件起不来）；
 *   · 写：`config.json.tmp` + rename 原子替换；**文件坏/非本格式时拒绝写**（不覆盖可能含
 *     用户数据的内容）；未知键原样保留（前向兼容，patch 不吞）。
 * ============================================================================
 */
import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

/** 按工作区配置的文件名（与 RULES.md 同在记忆根根级） */
export const WS_CONFIG_FILE = 'config.json'
/** 文件格式版本（将来需要格式迁移时递增） */
export const WS_SCHEMA = 1
/** 旧版存提示词版本的独立标记文件（迁移后删除） */
export const LEGACY_VERSION_FILE = '.rules-version'

/** 三个开关的默认值（= 下放前的全局默认，行为不变） */
export const WS_DEFAULTS = {
  rulesFollowVersion: true,
  injectWhaleCraftAgentsMd: true,
  injectWorkspaceAgentsMd: false,
}
export const WS_TOGGLE_KEYS = Object.keys(WS_DEFAULTS)

export function wsConfigPath (root) { return join(root, WS_CONFIG_FILE) }
export function legacyVersionPath (root) { return join(root, LEGACY_VERSION_FILE) }

/**
 * 这个对象是不是"本插件按工作区的 config.json"。
 * 用来跟 ≤0.3.x 时期遗留在工作区里的**全局** config.json 区分（那个没有 schema / 这些键）。
 */
export function isWsConfigData (parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false
  if (typeof parsed.schema === 'number') return true
  if ('rulesVersion' in parsed) return true
  return WS_TOGGLE_KEYS.some((k) => k in parsed)
}

/** 读旧标记文件（没有/读不到 = null） */
export function readLegacyVersion (root) {
  try {
    const v = readFileSync(legacyVersionPath(root), 'utf8').trim()
    return v || null
  } catch { return null }
}

/**
 * 读配置（不建目录、不抛）。
 * @returns {{file:string, exists:boolean, data:object, values:typeof WS_DEFAULTS, rulesVersion:string|null, lastError:string|null}}
 */
export function load (root) {
  const file = wsConfigPath(root)
  const out = {
    file,
    exists: false,
    data: {},
    values: { ...WS_DEFAULTS },
    rulesVersion: null,
    lastError: null,
  }
  if (!existsSync(file)) {
    out.rulesVersion = readLegacyVersion(root)   // 未迁移的老工作区：先按旧标记行事
    return out
  }
  out.exists = true
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (!isWsConfigData(parsed)) {
      out.lastError = `不是本插件的工作区配置（没有 schema/自有键），已按默认值运行：${file}`
      out.rulesVersion = readLegacyVersion(root)
      return out
    }
    out.data = parsed
    for (const k of WS_TOGGLE_KEYS) {
      if (typeof parsed[k] === 'boolean') out.values[k] = parsed[k]
    }
    out.rulesVersion = typeof parsed.rulesVersion === 'string' && parsed.rulesVersion.trim()
      ? parsed.rulesVersion.trim()
      : readLegacyVersion(root)
  } catch (e) {
    out.lastError = `工作区配置读取失败（已按默认值运行）：${e.message}`
    out.rulesVersion = readLegacyVersion(root)
  }
  return out
}

/** 生效值（默认值 + 文件值；未知键不在这里，patch 时会原样保留） */
export function values (root) { return load(root).values }

export function get (root, key) { return values(root)[String(key)] }

/** 原子写：同目录 .tmp + rename（失败不动原文件） */
function writeAtomic (file, data) {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8')
  renameSync(tmp, file)
}

/**
 * 改三个开关（「MC设置→提示词」页）。深合并进文件，保留未知键与 rulesVersion。
 * 文件存在但坏/非本格式 → 拒绝（先修再写，免得把用户数据冲掉）。
 */
export function patch (root, partial) {
  const p = partial ?? {}
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined) continue
    if (!WS_TOGGLE_KEYS.includes(k)) {
      throw new Error(`未知的工作区配置项 "${k}"；可用：${WS_TOGGLE_KEYS.join(', ')}`)
    }
    if (typeof v !== 'boolean') throw new Error(`${k} 必须是 true/false`)
  }
  const cur = load(root)
  if (cur.exists && cur.lastError) {
    throw new Error(`工作区配置有问题，未写入（请先修复或删除 ${cur.file}）：${cur.lastError}`)
  }
  const data = { ...cur.data, schema: WS_SCHEMA }
  for (const [k, v] of Object.entries(p)) if (v !== undefined) data[k] = v
  writeAtomic(cur.file, data)
  return values(root)
}

/** 读"当前 RULES.md 内容对应的插件版本"（新字段 → 旧标记兜底） */
export function readRulesVersion (root) { return load(root).rulesVersion }

/** 记版本（失败只当没记上，不影响使用；不碰坏文件） */
export function setRulesVersion (root, version) {
  try {
    const cur = load(root)
    if (cur.exists && cur.lastError) return false
    const data = { ...cur.data, schema: WS_SCHEMA, rulesVersion: String(version ?? '').trim() || 'unknown' }
    writeAtomic(cur.file, data)
    return true
  } catch { return false }
}

/** 写后回读校验（迁移删旧标记前必须确认值真的落进去了） */
function verifyRulesVersion (file, expected) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return parsed?.rulesVersion === expected
  } catch { return false }
}

/**
 * 迁移/建档（幂等；只在"备好记忆目录"那两个时机调）。
 *
 *   · 无 config.json → 建：`{schema:1}` + `seed` 里显式给过的开关值；旧 `.rules-version`
 *     在 → 一并写进 `rulesVersion`，**写后回读校验通过才删**旧文件（失败就留着下次再迁）；
 *   · 有 config.json（本格式）→ 缺 `rulesVersion` 而旧标记在 → 补上（同样校验后删）；
 *     残留旧标记（文件已有版本）→ 直接删（文件是权威）；
 *   · 有 config.json 但坏/非本格式 → 一概不碰，返回 `error`（可能是用户数据，宁可不动）。
 * @param {string} root 记忆根
 * @param {{seed?: Record<string, boolean>}} [opts] 全局旧值（只取显式设过的；见 PluginConfig.legacyPromptSwitches）
 * @returns {{created:boolean, seeded:string[], migratedMarker:boolean, markerRemoved:boolean, error:string|null}}
 */
export function migrate (root, { seed } = {}) {
  const out = { created: false, seeded: [], migratedMarker: false, markerRemoved: false, error: null }
  try {
    const file = wsConfigPath(root)
    const markerPath = legacyVersionPath(root)
    const marker = readLegacyVersion(root)
    const seeded = {}
    for (const k of WS_TOGGLE_KEYS) {
      if (seed && typeof seed[k] === 'boolean') seeded[k] = seed[k]
    }

    if (!existsSync(file)) {
      const data = { schema: WS_SCHEMA, ...seeded }
      if (marker) data.rulesVersion = marker
      writeAtomic(file, data)
      out.created = true
      out.seeded = Object.keys(seeded)     // seed 只在**建档那一次**生效
      if (marker && verifyRulesVersion(file, marker)) {
        try { unlinkSync(markerPath); out.markerRemoved = true } catch { /* 删不掉就留着，不影响判断（文件是权威） */ }
      }
      return out
    }

    const cur = load(root)
    if (cur.lastError) { out.error = cur.lastError; return out }
    if (!cur.rulesVersion && marker) {
      const data = { ...cur.data, schema: WS_SCHEMA, rulesVersion: marker }
      writeAtomic(file, data)
      out.migratedMarker = true
      if (verifyRulesVersion(file, marker)) {
        try { unlinkSync(markerPath); out.markerRemoved = true } catch { /* 同上 */ }
      }
    } else if (marker) {
      // 文件里已有版本（权威）→ 旧标记只剩清场
      try { unlinkSync(markerPath); out.markerRemoved = true } catch { /* 同上 */ }
    }
    return out
  } catch (e) {
    out.error = e.message
    return out
  }
}
