// -*- coding: utf-8 -*-
/**
 * whale_craft / serverhistory.mjs —— 「连接到MC」弹窗的**服务器地址历史**（全局）
 * ============================================================================
 * 用户在弹窗里**手动**连过的服务器地址（**只存地址字符串**，不存账户、不存凭据）。
 * 落盘：`<状态目录>/servers.json`（= `$DSH_HOME/whale_craft/servers.json`）—— **全局**，不按工作区。
 *
 * 规矩：
 *   · 只记"在本弹窗里点「连接」"的地址；**局域网探测到的直连不记**（调用方负责别调 `record`）；
 *   · 去重、最近优先、封顶 {@link MAX_SERVERS} 条；
 *   · 读宽容（坏文件按空跑、绝不抛）、写克制（失败只记 `lastError`）。
 * ============================================================================
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** 文件名（与 accounts.json / config.json 同在状态目录根级） */
export const SERVERS_FILE = 'servers.json'
/** 封顶条数 */
export const MAX_SERVERS = 20

export class ServerHistory {
  /** @param {{dir:string}} opts dir = 状态目录（`$DSH_HOME/whale_craft`；自检里是临时目录） */
  constructor ({ dir } = {}) {
    this.dir = dir
    this.file = join(dir, SERVERS_FILE)
    this.data = { version: 1, recent: [] }
    this.lastError = null
    this.load()
  }

  load () {
    try {
      if (!existsSync(this.file)) { this.data = { version: 1, recent: [] }; return }
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'))
      const recent = Array.isArray(parsed?.recent)
        ? parsed.recent.map((x) => String(x ?? '').trim()).filter(Boolean)
        : []
      this.data = { version: 1, recent }
    } catch (e) {
      this.data = { version: 1, recent: [] }
      this.lastError = `服务器历史读取失败（已按空跑）：${e.message}`
    }
  }

  save () {
    try {
      if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
      writeFileSync(this.file, JSON.stringify(this.data, null, 2) + '\n', 'utf8')
      return true
    } catch (e) {
      this.lastError = `服务器历史写入失败：${e.message}`
      return false
    }
  }

  /** 最近优先的地址列表（副本） */
  list () { return this.data.recent.slice() }

  /** 记一条（去重、最近优先、封顶）。空串忽略。返回最新列表。 */
  record (address) {
    const addr = String(address ?? '').trim()
    if (!addr) return this.list()
    this.data.recent = [addr, ...this.data.recent.filter((a) => a !== addr)].slice(0, MAX_SERVERS)
    this.save()
    return this.list()
  }

  /** 删一条（没这条就原样）。返回最新列表。 */
  remove (address) {
    const addr = String(address ?? '').trim()
    this.data.recent = this.data.recent.filter((a) => a !== addr)
    this.save()
    return this.list()
  }
}
