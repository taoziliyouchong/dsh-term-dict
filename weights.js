/**
 * 候选权重（隐形）：跨会话计数，够高就转正，不再当候选。
 *
 * 口径：
 *   - 一个会话结束时，读这个会话的检测账本；账本里「判定：收」的词记一次，权重＝不同会话数。
 *   - 同一个词在另一个会话的账本里再出现一次，+1；同一会话重复写不重复计。
 *   - 权重 >= promoteAfter（默认 3 个不同会话）且已有定义／默认指代 → 转正：由调用方写进通用层，
 *     状态 待观察；本文件只记 promotedAt，不直接碰字典。
 *   - 权重文件在 $DSH_HOME/evolve/dict/auto/weights.json；不注入、不显示，属于插件内部账。
 *
 * 这个模块不写字典，避免和 index.js 的写入口重复；调用方拿到 readyToPromote() 后自己落条。
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const DICT_ROOT = join(DSH_HOME, 'evolve', 'dict')
export const WEIGHTS_FILE = join(DICT_ROOT, 'auto', 'weights.json')
/** 默认阈值：跨 3 个不同会话用到，才转正。 */
export const DEFAULT_PROMOTE_AFTER = 3

let cache = null

function normalize(rec, term) {
  return {
    term,
    weight: Math.max(0, Number(rec && rec.weight) || 0),
    sessions: Array.isArray(rec && rec.sessions)
      ? rec.sessions.map((s) => String(s)).filter(Boolean)
      : [],
    definition: String((rec && rec.definition) || '').trim(),
    defaultRef: String((rec && rec.defaultRef) || '').trim(),
    firstAt: Number(rec && rec.firstAt) || 0,
    lastAt: Number(rec && rec.lastAt) || 0,
    promotedAt: Number(rec && rec.promotedAt) || 0,
  }
}

/** 读权重账；文件不在／坏了当空账。按进程缓存。 */
export function loadWeights() {
  if (cache) return cache
  let raw = null
  try {
    raw = JSON.parse(readFileSync(WEIGHTS_FILE, 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    raw = null
  }
  const terms = raw && raw.terms && typeof raw.terms === 'object' ? raw.terms : {}
  const clean = {}
  for (const [term, rec] of Object.entries(terms)) {
    const name = String(term).trim()
    if (name) clean[name] = normalize(rec, name)
  }
  cache = { version: 1, terms: clean }
  return cache
}

/** 写权重账（原子替换）。 */
export function saveWeights(state) {
  cache = state
  try {
    mkdirSync(dirname(WEIGHTS_FILE), { recursive: true })
    const tmp = WEIGHTS_FILE + '.tmp'
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8')
    renameSync(tmp, WEIGHTS_FILE)
  } catch {
    /* 落盘失败不影响本会话内计数 */
  }
}

/** 记一个候选：首次进 watchlist；同一会话只记一次；定义／默认指代补空。 */
export function registerCandidate({ sessionId, term, definition, defaultRef }) {
  const name = String(term || '').trim()
  const sid = String(sessionId || '').trim()
  if (!name || !sid) return null
  const state = loadWeights()
  const rec = state.terms[name] || normalize(null, name)
  if (!rec.sessions.includes(sid)) rec.sessions.push(sid)
  rec.weight = Math.max(rec.weight, rec.sessions.length)
  if (!rec.definition && definition) rec.definition = String(definition).trim()
  if (!rec.defaultRef && defaultRef) rec.defaultRef = String(defaultRef).trim()
  rec.firstAt = rec.firstAt || Date.now()
  rec.lastAt = Date.now()
  state.terms[name] = rec
  saveWeights(state)
  return rec
}

/** 够格转正的：权重到阈值、还没转正、且有定义或默认指代。 */
export function readyToPromote(threshold = DEFAULT_PROMOTE_AFTER) {
  const limit = Number.isFinite(Number(threshold)) ? Math.max(2, Math.round(Number(threshold))) : DEFAULT_PROMOTE_AFTER
  return Object.values(loadWeights().terms)
    .filter((rec) => !rec.promotedAt && rec.weight >= limit && (rec.definition || rec.defaultRef))
}

/** 标记已转正，之后不再参与计数。 */
export function markPromoted(term) {
  const name = String(term || '').trim()
  const state = loadWeights()
  const rec = state.terms[name]
  if (!rec) return false
  rec.promotedAt = Date.now()
  saveWeights(state)
  return true
}

/**
 * 把够格的候选一次性转正：调用方给写入口与查重，模块只负责挑和标记。
 * @param {{ threshold?: number, writeEntry?: (term: string, fields: object) => void, hasTerm?: (term: string) => boolean }} options
 * @returns {string[]} 本次转正的词名
 */
export function promoteReady({ threshold = DEFAULT_PROMOTE_AFTER, writeEntry, hasTerm } = {}) {
  const promoted = []
  for (const rec of readyToPromote(threshold)) {
    try {
      if (typeof hasTerm === 'function' && hasTerm(rec.term)) {
        markPromoted(rec.term)
        continue
      }
      if (typeof writeEntry === 'function') {
        const fields = { 状态: '待观察' }
        if (rec.definition) fields['定义'] = rec.definition
        if (rec.defaultRef) fields['默认指代'] = rec.defaultRef
        writeEntry(rec.term, fields)
      }
      markPromoted(rec.term)
      promoted.push(rec.term)
    } catch {
      /* 单条失败不拦其它 */
    }
  }
  return promoted
}

/**
 * 从检测账本里登记候选：`## 候选：词名` + `EVID:` + `- 结论：收…` + `- 定义／- 默认指代`。
 * 只收结论以「收」开头的条目（「不收」不算）；没写结论但有定义也按收处理。
 * 返回登记条数。
 */
export function registerFromLedger(sessionId, text) {
  const sid = String(sessionId || '').trim()
  const src = String(text || '')
  if (!sid || !src.trim()) return 0
  let count = 0
  const blocks = src.split(/^##\s+/m).slice(1)
  for (const block of blocks) {
    const lines = block.split(/\r?\n/)
    const head = String(lines.shift() || '').trim()
    const term = head
      .replace(/^候选[：:]\s*/, '')
      .replace(/[（(]别名[：:].*?[）)]\s*$/, '')
      .trim()
    if (!term) continue
    const fields = {}
    for (const line of lines) {
      const m = /^\s*[-*]\s*([^：:]{1,10})\s*[：:]\s*(.*)$/.exec(line)
      if (m) fields[m[1].trim()] = m[2].trim()
    }
    const verdict = String(fields['判定'] || '').trim()
    const conclusion = String(fields['结论'] || '').trim()
    const definition = String(fields['定义'] || '').trim()
    const defaultRef = String(fields['默认指代'] || '').trim()
    const accepted = verdict
      ? verdict === '收' || verdict === '保留'
      : /^收/.test(conclusion) && !/^不收/.test(conclusion)
    if (!accepted) continue
    if (!definition && !defaultRef) continue
    registerCandidate({ sessionId: sid, term, definition, defaultRef })
    count += 1
  }
  return count
}
