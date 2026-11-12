/**
 * 术语字典自动激活（首次触发即注入）
 *
 * 触发面（三处，同一会话里每个词条只算第一次）：
 *   ① 用户消息——Agent 的 pre-step 拿到本轮用户消息时扫一遍（source.kind === 'user'）；
 *   ② AI 思考——每一步落盘的 assistant/message 里的 reasoning 块；
 *   ③ AI 输出——同一个 assistant/message 里的 text 块。
 *
 * 生效面：systemPrompt 的 runtime-context（本插件注册一条 context，名字 dsh-term-dict:activated）。
 *   用户消息里的词在本次模型调用前就生效（pre-step 之后还有一次 refreshContext）；
 *   思考／输出里的词只能从下一步或下一轮起生效——模型正在流式生成的那一段改不了。
 *
 * 首次判定：状态按会话存 $DSH_HOME/evolve/dict/.activation.json，按会话 id 记已激活的词条名；
 *   同一会话同一词条只注入一次，重启／恢复会话后仍按已激活算。
 *
 * 模式门：通用会话（没有模式／判不出模式）永远灌注；其余模式默认不灌注——要灌注就在设置里勾
 *   「灌注的模式」，新建的模式默认不在名单里，因此默认不灌。判据读 Session 投影 agentPreset
 *   （切过模式也准），判不出再退回 <会话id>.preset 标记。
 */

import {
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync, copyFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { zstdDecompressSync } from 'node:zlib'
import { DETECT_WORK_DIR, ensureTemplate } from './detect-format.js'

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const DICT_ROOT = join(DSH_HOME, 'evolve', 'dict')
const GENERAL_FILE = join(DICT_ROOT, 'general.md')
const DOMAIN_DIR = join(DICT_ROOT, 'domains')
const STATE_FILE = join(DICT_ROOT, '.activation.json')
/** 高级设置：自动激活开关、三个上限、不灌注范围；面板「高级设置」写这份文件，读的时候按 mtime 缓存。 */
export const SETTINGS_FILE = join(DICT_ROOT, '.settings.json')
/** 词条检测：本会话临时账本与结束后的归档，和字典同根；卸载插件不删。
 *  路径、标准模板与格式校验在 detect-format.js；activation 只负责建本会话账本。 */

/** 默认初始状态：通用层不存在就放一条完整的称谓型词条；已有字典一个字都不动。 */
export function seedGeneral() {
  if (existsSync(GENERAL_FILE)) return false
  const template = fileURLToPath(new URL('./assets/general-default.md', import.meta.url))
  mkdirSync(DICT_ROOT, { recursive: true })
  copyFileSync(template, GENERAL_FILE)
  return true
}

/** 本会话检测账本的绝对路径。 */
export function detectFile(sessionId) {
  const id = String(sessionId || '').trim().replace(/[^A-Za-z0-9._-]/g, '')
  return id ? join(DETECT_WORK_DIR, id + '.md') : ''
}

/** 确保本会话检测账本存在：建目录、按模板写入；已存在不动。返回绝对路径。 */
export function ensureDetectFile(sessionId) {
  const file = detectFile(sessionId)
  if (!file) return ''
  ensureTemplate()
  try {
    mkdirSync(DETECT_WORK_DIR, { recursive: true })
    if (!existsSync(file)) {
      const id = String(sessionId || '').trim().replace(/[^A-Za-z0-9._-]/g, '')
      writeFileSync(file, [
        '# 词条检测·临时账本',
        '',
        '> 会话：' + id,
        '> 写法：每个候选起一行「## 候选：词名」，下面写「EVID: 引用用户原话」「- 结论：收/不收及理由（去空白后必须大于 10 个字）」「- 定义：一句话」「- 默认指代：…」；空条不写。',
        '> 本文件由 dsh-term-dict 建好，对话结束后归档到 auto/archive/。',
        '',
      ].join('\n'), 'utf8')
    }
  } catch {
    /* 建不了也把路径给模型；写失败会暴露出来 */
  }
  return file
}

/** 注入文本：判别机制、落盘、报告、修改判别；只多一行本会话落盘文件的指针。 */
export function detectPrompt(file) {
  return [
    '【术语字典·词条检测（本会话）】',
    '判据（按理解缺口判，不按词性判）：',
    '1. 标记：扫用户原话，找出你并没有真正理解的词／短语——指代不明、自造叫法、简称、没见过的代号，或一般词的默认落点不清楚；上下文能唯一落实的不记，有缺口才标记。',
    '2. 归位：结合上下文和字典判它指什么（真实语义）；判不出就问用户，不猜。跨任务用进通用层，本类任务用进任务层。',
    '不收：你已理解且上下文唯一落实的词；文件名／路径、书名／文章名、工程名／产品名、版本号／编号、代码标识符、URL、纯描述短语、文件地图已写清的东西。',
    '落地：判完必须真写，不能只在回复里说。检测文档按 auto/template.md 的模板；条目写法、类型、修改判别与正文报告见技能 term-dict-workflow。',
    '落盘文件：' + String(file || ''),
    '正文开头一行（引用块，渲染同对齐栏，只一行几个字）：> **词条检测**：<简短结果>',
  ].join('\n')
}

/** 词条结构：模块（字段）是全局清单，类型只是从清单里挑模块；机制用的模块锁死不能删。
 *  - 模块：定义／默认指代／边界／别称／备注（白名单，不开放自定义新字段）
 *  - 锁定：定义、默认指代（决定类型推断）、别称（参与命中匹配）——不可删除
 *  - 类型：称谓型／落点型／留档型，各自勾选模块 + 停用开关
 *  - 待删：删除模块确认后 24 小时执行，期间立即停止灌注，可撤销 */
export const TYPE_IDS = ['term', 'ref', 'grave']
export const TYPE_LABELS = { term: '称谓型', ref: '落点型', grave: '留档型' }
export const MODULE_FIELDS = ['定义', '默认指代', '边界', '别称', '备注']
export const LOCKED_MODULES = ['别称']
export const DAY_MS = 24 * 3600 * 1000
export const MODULE_DEF_DEFAULTS = {
  定义: { hint: '它指什么（一句话）', multiline: true, inject: true },
  默认指代: { hint: '单独出现时默认优先指哪件事／哪份文件／哪条命令', multiline: true, inject: true },
  边界: { hint: '它不是什么；有例子就写「例：…」', multiline: true, inject: true },
  别称: { hint: '同一物还有哪些叫法，逗号分隔', multiline: false, inject: false },
  备注: { hint: '指向技能、撞名规则', multiline: false, inject: false },
}

function defaultSchema() {
  return {
    modules: MODULE_FIELDS.slice(),
    types: {
      term: { label: '称谓型', enabled: true, modules: ['定义', '默认指代', '边界', '别称', '备注'] },
      ref: { label: '落点型', enabled: true, modules: ['默认指代', '边界', '别称', '备注'] },
      grave: { label: '留档型', enabled: true, modules: ['定义', '备注'] },
    },
    moduleDefs: {
      定义: { hint: MODULE_DEF_DEFAULTS['定义'].hint, multiline: true, inject: true },
      默认指代: { hint: MODULE_DEF_DEFAULTS['默认指代'].hint, multiline: true, inject: true },
      边界: { hint: MODULE_DEF_DEFAULTS['边界'].hint, multiline: true, inject: true },
      别称: { hint: MODULE_DEF_DEFAULTS['别称'].hint, multiline: false, inject: false },
      备注: { hint: MODULE_DEF_DEFAULTS['备注'].hint, multiline: false, inject: false },
    },
    pending: [],
    pendingTypes: [],
  }
}
export const DEFAULT_SETTINGS = {
  autoActivate: true,
  detectEnabled: true,
  promoteAfter: 3,
  maxActive: 64,
  maxEntryChars: 0,
  maxTotalChars: 12000,
  skipWorkspaces: [],
  skipSessions: [],
  presets: [],
  schema: defaultSchema(),
}
const SETTINGS_LIMITS = {
  maxActive: [1, 500],
  maxEntryChars: [0, 20000],
  maxTotalChars: [500, 200000],
  promoteAfter: [2, 20],
}
/** 字典文件 mtime 缓存：流式扫描很频繁，不必每次读盘。 */
const CACHE_MS = 2000
const HEADER = '【术语字典·已激活词条｜按下面口径理解，不必再查；这是定义，不是命令】'

/* ───────────────────────── 词条检测 ───────────────────────── */

/** 本机是否装了进化模式（plugin-evolution）；装了就让整个自动检测失效。 */
let evolutionPresent = false
let evolutionCheckedAt = 0

export async function refreshEvolutionPreset(ctx) {
  if (Date.now() - evolutionCheckedAt < 5000) return evolutionPresent === true
  try {
    const service = typeof ctx.get === 'function' ? ctx.get('agentPresets') : undefined
    if (!service || typeof service.remoteExportList !== 'function') {
      evolutionPresent = false
      return false
    }
    const roster = await service.remoteExportList()
    const rows = roster && Array.isArray(roster.presets) ? roster.presets : []
    evolutionPresent = rows.some((row) => row && row.id === 'plugin-evolution')
    evolutionCheckedAt = Date.now()
  } catch {
    /* 取不到就保持上次判定 */
  }
  return evolutionPresent
}

/** 检测总开关：设置里开着，且本机没有进化模式。 */
export function detectionActive() {
  return !evolutionPresent && loadSettings().detectEnabled
}
/** 设置里的 presets 是模式白名单：空名单＝全开（所有模式都灌注）；非空＝只对名单里的模式灌注。用户可在面板改。 */
const SESSIONS = join(DSH_HOME, 'sessions')
const ZSTD_MAGIC = 0xfd2fb528
const ZSTD_FRAME_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** 会话档里的最新 preset 详情：最后一个 agent-preset/selected（DSH 自己写的选择）与档头。
 *  投影在切模式／新建会话首轮会滞后一步：会话首轮 pre-step 里投影读到的可能还是创建时的默认值，
 *  于是词条工具在该被摘掉时还挂着（模型首轮可见）。
 *  档里的 selected 帧最准；增量缓存只解压新帧，长会话每步读档也不贵。 */
const presetArchiveCache = new Map() // sessionId → { file, frameCount, last, header }

function presetDetailFromArchive(sessionId) {
  const empty = { last: '', header: '' }
  if (!sessionId || typeof zstdDecompressSync !== 'function') return empty
  try {
    for (const ent of readdirSync(SESSIONS, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue
      const dir = join(SESSIONS, ent.name, sessionId)
      if (!existsSync(dir)) continue
      let best = null
      let bestGen = -1
      for (const f of readdirSync(dir)) {
        const m = /^session(?:\.v(\d+))?\.jsonl\.zstd$/.exec(f)
        if (!m) continue
        const gen = m[1] ? Number(m[1]) : 0
        if (gen > bestGen) {
          bestGen = gen
          best = join(dir, f)
        }
      }
      if (!best) continue
      const buf = readFileSync(best)
      const frames = []
      let start = 0
      while (start < buf.length) {
        if (buf.readUInt32LE(start) !== ZSTD_MAGIC) break
        const next = buf.indexOf(ZSTD_FRAME_MAGIC, start + 4)
        const end = next === -1 ? buf.length : next
        frames.push([start, end])
        start = end
      }
      const cached = presetArchiveCache.get(sessionId)
      const same = cached && cached.file === best && cached.frameCount <= frames.length
      let last = same ? cached.last : ''
      let header = same ? cached.header : ''
      for (let i = same ? cached.frameCount : 0; i < frames.length; i++) {
        const [s, e] = frames[i]
        let text = ''
        try {
          text = zstdDecompressSync(buf.subarray(s, e)).toString('utf8')
        } catch {
          continue
        }
        for (const line of text.split('\n')) {
          if (!line.trim()) continue
          let j = null
          try {
            j = JSON.parse(line)
          } catch {
            continue
          }
          if (j.type === 'session' && typeof j.agentPreset === 'string') header = j.agentPreset
          else if (j.type === 'agent-preset/selected' && typeof j.data?.agentPreset === 'string') last = j.data.agentPreset
        }
      }
      presetArchiveCache.set(sessionId, { file: best, frameCount: frames.length, last, header })
      return { last, header }
    }
  } catch {
    /* 档读不出：交给标记兜底 */
  }
  return empty
}

function presetFromArchive(sessionId) {
  const detail = presetDetailFromArchive(sessionId)
  return detail.last || detail.header
}

/* ───────────────────────── 读字典 ───────────────────────── */

function readText(file) {
  try {
    return existsSync(file) ? readFileSync(file, 'utf8') : ''
  } catch {
    return ''
  }
}

/** 数字项：夹到区间内，非数字就落回默认。 */
function clampInt(value, range, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(range[1], Math.max(range[0], Math.round(n)))
}

/** 字符串列表项：去空、去重、限长（最多 100 条、每条 300 字）。 */
function cleanList(value, fallback) {
  if (!Array.isArray(value)) return fallback
  const out = []
  for (const raw of value) {
    const s = String(raw == null ? '' : raw).trim().slice(0, 300)
    if (!s || out.indexOf(s) !== -1) continue
    out.push(s)
    if (out.length >= 100) break
  }
  return out
}

/** 待删类型：只收仍存在的自定义类型，内置类型不能进待删。 */
function buildPendingTypes(source, types) {
  const out = []
  const rawList = source && Array.isArray(source.pendingTypes) ? source.pendingTypes : []
  for (const item of rawList) {
    if (!item) continue
    const type = String(item.type || '')
    if (!types[type]) continue
    if (TYPE_IDS.indexOf(type) !== -1) continue
    const at = Number(item.at) || Date.now()
    const executeAt = Number(item.executeAt) || at + DAY_MS
    out.push({ type, at, executeAt, wasEnabled: item.wasEnabled !== false })
  }
  return out
}

/** 词条类型：词条里写了 `- 类型：<名>` 就认它（名字或 id 都行），否则按字段推断。 */
export function kindOf(fields, schema) {
  const f = fields || {}
  const stored = String(f['类型'] || '').trim()
  if (stored) {
    const types = (schema || loadSettings().schema || {}).types || {}
    if (types[stored]) return stored
    for (const id of Object.keys(types)) {
      if (types[id].label === stored) return id
    }
  }
  if (String(f['状态'] || '').trim() === '已废') return 'grave'
  if (String(f['默认指代'] || '').trim() !== '' && String(f['定义'] || '').trim() === '') return 'ref'
  return 'term'
}

/** 模块名：1~12 个字，不能带冒号/换行/竖线；空名不收。 */
export function validModuleName(raw) {
  const s = String(raw == null ? '' : raw).trim()
  if (!s || s.length > 12) return ''
  if (/[：:\n\r\t|]/.test(s)) return ''
  return s
}

/** 词条结构校验（兼容旧形态：旧版是每类型一份 fields）：模块清单、类型勾选、待删。 */
export function cleanSchema(raw, fallback) {
  const base = fallback || defaultSchema()
  const source = raw && typeof raw === 'object' ? raw : {}
  const oldShape = !Array.isArray(source.modules)

  const collect = (list) => {
    const out = []
    for (const rawItem of Array.isArray(list) ? list : []) {
      const name = validModuleName(rawItem)
      if (name && out.indexOf(name) === -1) out.push(name)
    }
    return out
  }
  let modules
  if (Array.isArray(source.modules)) {
    modules = collect(source.modules)
  } else if (oldShape && (source.types || source.term)) {
    const union = []
    for (const id of TYPE_IDS) {
      const t = source.types ? source.types[id] : source[id]
      const list = t && (Array.isArray(t.modules) ? t.modules : t.fields)
      for (const name of collect(list)) if (union.indexOf(name) === -1) union.push(name)
    }
    modules = union
  } else {
    modules = base.modules.slice()
  }
  for (const locked of LOCKED_MODULES) if (modules.indexOf(locked) === -1) modules.push(locked)
  const builtinOrder = MODULE_FIELDS.filter((f) => modules.indexOf(f) !== -1)
  const customs = modules.filter((f) => MODULE_FIELDS.indexOf(f) === -1)
  modules = builtinOrder.concat(customs)

  const types = {}
  const oldTypes = oldShape ? { term: source.term, ref: source.ref, grave: source.grave } : null
  const rawTypes = oldShape
    ? oldTypes
    : (source.types && typeof source.types === 'object' ? source.types : {})
  const buildType = (id, rawType, fb) => {
    const rawModules = rawType && Array.isArray(rawType.modules)
      ? rawType.modules
      : rawType && Array.isArray(rawType.fields) ? rawType.fields : (fb ? fb.modules : ['别称'])
    const label = String((rawType && rawType.label) || (fb && fb.label) || id).trim().slice(0, 24) || id
    return {
      label,
      enabled: rawType && rawType.enabled !== undefined ? Boolean(rawType.enabled) : (fb ? fb.enabled : true),
      modules: modules.filter((f) => rawModules.map(String).indexOf(f) !== -1),
    }
  }
  for (const id of TYPE_IDS) types[id] = buildType(id, rawTypes[id], base.types[id])
  for (const id of Object.keys(rawTypes)) {
    if (TYPE_IDS.indexOf(id) !== -1) continue
    const rawType = rawTypes[id]
    if (!rawType || typeof rawType !== 'object') continue
    const name = String(rawType.label || id).trim().slice(0, 24) || id
    if (!name) continue
    types[id] = buildType(id, rawType, null)
  }
  // 别称参与命中匹配：每个类型都必须带着它，不能在类型里取消
  for (const id of Object.keys(types)) {
    if (modules.indexOf('别称') !== -1 && types[id].modules.indexOf('别称') === -1) {
      types[id].modules = MODULE_FIELDS.filter((f) => types[id].modules.indexOf(f) !== -1 || f === '别称')
    }
  }

  const pending = []
  const rawPending = Array.isArray(source.pending) ? source.pending : []
  for (const item of rawPending) {
    if (!item) continue
    const field = validModuleName(item.field)
    if (!field) continue
    if (LOCKED_MODULES.indexOf(field) !== -1) continue
    const at = Number(item.at) || Date.now()
    const executeAt = Number(item.executeAt) || at + DAY_MS
    const inTypes = Array.isArray(item.in)
      ? item.in.map(String).filter((t) => Boolean(types[t]))
      : []
    if (inTypes.length === 0 && item.type && types[String(item.type)]) inTypes.push(String(item.type))
    pending.push({ field, at, executeAt, in: inTypes })
  }
  const rawDefs = (source.moduleDefs && typeof source.moduleDefs === 'object') ? source.moduleDefs : {}
  const moduleDefs = {}
  for (const name of modules) {
    const rawDef = rawDefs[name] && typeof rawDefs[name] === 'object' ? rawDefs[name] : {}
    const baseDef = MODULE_DEF_DEFAULTS[name] || { hint: '', multiline: true, inject: false }
    const hint = String(rawDef.hint !== undefined ? rawDef.hint : baseDef.hint).slice(0, 200)
    const multiline = rawDef.multiline !== undefined ? Boolean(rawDef.multiline) : Boolean(baseDef.multiline)
    const inject = name === '别称' ? false : (rawDef.inject !== undefined ? Boolean(rawDef.inject) : Boolean(baseDef.inject))
    moduleDefs[name] = { hint, multiline, inject }
  }

  return { modules, types, pending, pendingTypes: buildPendingTypes(source, types), moduleDefs }
}

let settingsCache = { at: 0, mtime: -1, value: null }

/** 读高级设置（$DSH_HOME/evolve/dict/.settings.json）；文件不在／坏了按默认，按 mtime 缓存 2 秒。 */
export function loadSettings() {
  const now = Date.now()
  if (settingsCache.value && now - settingsCache.at < CACHE_MS) return settingsCache.value
  let mtime = -1
  try {
    mtime = statSync(SETTINGS_FILE).mtimeMs
  } catch {
    mtime = -1
  }
  if (settingsCache.value && mtime === settingsCache.mtime) {
    settingsCache.at = now
    return settingsCache.value
  }
  let raw = {}
  try {
    raw = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8').replace(/^\uFEFF/, '')) || {}
  } catch {
    raw = {}
  }
  const value = {
    autoActivate: raw.autoActivate === undefined ? DEFAULT_SETTINGS.autoActivate : Boolean(raw.autoActivate),
    detectEnabled: raw.detectEnabled === undefined ? DEFAULT_SETTINGS.detectEnabled : Boolean(raw.detectEnabled),
    promoteAfter: clampInt(raw.promoteAfter, SETTINGS_LIMITS.promoteAfter, DEFAULT_SETTINGS.promoteAfter),
    maxActive: clampInt(raw.maxActive, SETTINGS_LIMITS.maxActive, DEFAULT_SETTINGS.maxActive),
    maxEntryChars: clampInt(raw.maxEntryChars, SETTINGS_LIMITS.maxEntryChars, DEFAULT_SETTINGS.maxEntryChars),
    maxTotalChars: clampInt(raw.maxTotalChars, SETTINGS_LIMITS.maxTotalChars, DEFAULT_SETTINGS.maxTotalChars),
    skipWorkspaces: cleanList(raw.skipWorkspaces, DEFAULT_SETTINGS.skipWorkspaces),
    skipSessions: cleanList(raw.skipSessions, DEFAULT_SETTINGS.skipSessions),
    presets: cleanList(raw.presets, DEFAULT_SETTINGS.presets),
    schema: cleanSchema(raw.schema, DEFAULT_SETTINGS.schema),
  }
  settingsCache = { at: now, mtime, value }
  return value
}

/** 写高级设置（只覆盖给了的字段），返回落盘后的值。 */
export function saveSettings(next) {
  const cur = loadSettings()
  const merged = {
    autoActivate: next && next.autoActivate !== undefined ? Boolean(next.autoActivate) : cur.autoActivate,
    detectEnabled: next && next.detectEnabled !== undefined ? Boolean(next.detectEnabled) : cur.detectEnabled,
    promoteAfter: clampInt(next && next.promoteAfter !== undefined ? next.promoteAfter : cur.promoteAfter,
      SETTINGS_LIMITS.promoteAfter, cur.promoteAfter),
    maxActive: clampInt(next && next.maxActive !== undefined ? next.maxActive : cur.maxActive,
      SETTINGS_LIMITS.maxActive, cur.maxActive),
    maxEntryChars: clampInt(next && next.maxEntryChars !== undefined ? next.maxEntryChars : cur.maxEntryChars,
      SETTINGS_LIMITS.maxEntryChars, cur.maxEntryChars),
    maxTotalChars: clampInt(next && next.maxTotalChars !== undefined ? next.maxTotalChars : cur.maxTotalChars,
      SETTINGS_LIMITS.maxTotalChars, cur.maxTotalChars),
    skipWorkspaces: next && next.skipWorkspaces !== undefined
      ? cleanList(next.skipWorkspaces, cur.skipWorkspaces)
      : cur.skipWorkspaces,
    skipSessions: next && next.skipSessions !== undefined
      ? cleanList(next.skipSessions, cur.skipSessions)
      : cur.skipSessions,
    presets: next && next.presets !== undefined
      ? cleanList(next.presets, cur.presets)
      : cur.presets,
    schema: next && next.schema !== undefined
      ? cleanSchema(next.schema, cur.schema)
      : cur.schema,
  }
  mkdirSync(DICT_ROOT, { recursive: true })
  const tmp = SETTINGS_FILE + '.tmp'
  writeFileSync(tmp, JSON.stringify(merged, null, 2), 'utf8')
  renameSync(tmp, SETTINGS_FILE)
  settingsCache = { at: Date.now(), mtime: -1, value: merged }
  // 截断长度变了，字典索引里拼好的行要重拼。
  entriesCache = { at: 0, mtime: -1, entryChars: -1, list: [] }
  return merged
}

/** 从一份字典文本里删掉所有词条的某字段行；返回新文本与删掉的字段处数。 */
function stripFieldFromText(text, field) {
  const lines = String(text).split(/\r?\n/)
  const blocks = []
  let cur = null
  for (const line of lines) {
    if (/^##\s/.test(line)) {
      if (cur) blocks.push(cur)
      cur = [line]
    } else if (cur) cur.push(line)
    else blocks.push([line])
  }
  if (cur) blocks.push(cur)
  let removed = 0
  const kept = blocks.map((block) => {
    if (!block.length || !/^##\s/.test(block[0])) return block
    const next = []
    for (const line of block) {
      const m = /^-\s*([^：:\s]{1,8})\s*[：:]\s*/.exec(line)
      if (m && m[1].trim() === field) {
        removed += 1
        continue
      }
      next.push(line)
    }
    return next
  })
  return { text: kept.map((b) => b.join('\n')).join('\n'), removed }
}

/** 执行到期的删除（确认后 24 小时）：模块删字段行、类型删配置；写文件前留 .bak。 */
export function sweepSchema() {
  const settings = loadSettings()
  const pending = settings.schema.pending || []
  const pendingTypes = settings.schema.pendingTypes || []
  const now = Date.now()
  const due = pending.filter((p) => now >= p.executeAt)
  const dueTypes = pendingTypes.filter((p) => now >= p.executeAt)
  if (due.length === 0 && dueTypes.length === 0) return 0
  let removed = 0
  for (const file of dictFiles()) {
    let text = ''
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (!text) continue
    let next = text
    let changedHere = 0
    for (const p of due) {
      const res = stripFieldFromText(next, p.field)
      next = res.text
      changedHere += res.removed
    }
    if (changedHere > 0) {
      try {
        copyFileSync(file, file + '.bak')
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, next, 'utf8')
        removed += changedHere
      } catch {
        /* 单份写失败不影响别的 */
      }
    }
  }
  const schema = Object.assign({}, settings.schema, {
    pending: pending.filter((p) => now < p.executeAt),
    pendingTypes: pendingTypes.filter((p) => now < p.executeAt),
  })
  if (dueTypes.length > 0) {
    const types = Object.assign({}, settings.schema.types)
    for (const p of dueTypes) delete types[p.type]
    schema.types = types
  }
  saveSettings({ schema })
  return removed
}

/** 这个会话是否被排除灌注：会话 id 在静音名单里，或工作目录命中「不灌注的工作空间」片段。 */
export function isMuted(session) {
  if (!session) return false
  const settings = loadSettings()
  const id = session.id ? String(session.id) : ''
  if (id && settings.skipSessions.indexOf(id) !== -1) return true
  const cwd = session.header && typeof session.header.cwd === 'string' ? session.header.cwd : ''
  if (!cwd) return false
  const lower = cwd.toLowerCase()
  for (const word of settings.skipWorkspaces) {
    const w = word.toLowerCase()
    if (w && lower.indexOf(w) !== -1) return true
  }
  return false
}

function dictFiles() {
  const files = []
  if (existsSync(GENERAL_FILE)) files.push(GENERAL_FILE)
  try {
    for (const name of readdirSync(DOMAIN_DIR)) {
      if (name.endsWith('.md')) files.push(join(DOMAIN_DIR, name))
    }
  } catch {
    /* 任务层目录不在就只读通用层 */
  }
  return files
}

/** 解析一份字典：`## 词条（别名：…）` + `- 字段：正文`。 */
export function parseEntries(text) {
  const out = []
  let cur = null
  for (const line of String(text).replace(/\r/g, '').split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line)
    if (h) {
      const raw = h[1].trim()
      const m = /^(.+?)[（(]别名[：:](.*)[）)]\s*$/.exec(raw)
      cur = {
        term: (m ? m[1] : raw).trim(),
        aliases: m ? m[2].split(/[,，、;；\/]+/).map((s) => s.trim()).filter(Boolean) : [],
        fields: {},
      }
      out.push(cur)
      continue
    }
    if (!cur) continue
    const f = /^-\s*([^：:\s]{1,8})\s*[：:]\s*(.*)$/.exec(line)
    if (f) cur.fields[f[1].trim()] = f[2].trim()
  }
  return out
}

/** 任务层文件头：任务类型（显示名）＋工作空间绑定（> 工作空间：路径片段，可多条/逗号分隔）。 */
export function parseDomainHeader(text) {
  const src = String(text || '')
  const taskType = ((/^>\s*任务类型\s*[：:]\s*(.+?)\s*$/m.exec(src) || [])[1] || '').trim()
  const workspaces = []
  const re = /^>\s*工作空间\s*[：:]\s*(.+?)\s*$/gm
  let m
  while ((m = re.exec(src))) {
    for (const part of m[1].split(/[,，、;；]+/)) {
      const s = part.trim()
      if (s && workspaces.indexOf(s) === -1) workspaces.push(s)
    }
  }
  return { taskType, workspaces }
}

/** 词条名＋别名（含 `- 别称：` 字段与斜杠拆开的写法）→ 可匹配的名字。 */
export function namesOf(entry) {
  const out = new Set()
  const fieldAliases = String((entry.fields && entry.fields['别称']) || '')
    .split(/[,，、;；\/]+/).map((s) => s.trim()).filter(Boolean)
  for (const raw of [entry.term, ...entry.aliases, ...fieldAliases]) {
    for (const part of String(raw).split(/[／/]/)) {
      const n = part.trim().replace(/[…\.]+$/, '').trim()
      if (n.length >= 2) out.add(n)
      const noDe = n.replace(/的$/, '').trim()
      if (noDe.length >= 3) out.add(noDe)
    }
  }
  return [...out]
}

/** 注入的那一行：默认指代／定义／边界／反例，按字段原样拼；单条上限取高级设置。
 *  字段受「词条结构」约束：某类型停用的模块（含等待删除的）不再灌注。 */
export function lineOf(entry, maxChars) {
  const f = entry.fields || {}
  const settings = loadSettings()
  const kind = kindOf(f, settings.schema)
  if ((settings.schema.pendingTypes || []).some((p) => p.type === kind)) return ''
  const typeDef = settings.schema.types && settings.schema.types[kind]
  const allowed = (typeDef && typeDef.modules) || []
  const can = (field) => allowed.indexOf(field) !== -1
  const clean = (s) => String(s).trim().replace(/[。；;，,]+$/, '')
  const defs = settings.schema.moduleDefs || {}
  const injectOn = (field) => field !== '别称' && !(defs[field] && defs[field].inject === false)
  const order = []
  for (const field of ['默认指代', '定义', '边界']) if (order.indexOf(field) === -1) order.push(field)
  for (const field of (settings.schema.modules || [])) if (order.indexOf(field) === -1) order.push(field)
  const parts = []
  for (const field of order) {
    if (field === '别称' || !can(field) || !injectOn(field)) continue
    if (!f[field]) continue
    parts.push(field + '：' + clean(f[field]))
    if (field === '边界' && f['反例']) parts.push('反例：' + clean(f['反例']))
  }
  if (parts.length === 0) return ''
  const limit = Number.isFinite(Number(maxChars)) ? Math.max(0, Math.round(Number(maxChars))) : settings.maxEntryChars
  let body = parts.join('；')
  if (limit > 0 && body.length > limit) body = body.slice(0, limit) + '…'
  else body += '。'
  return '- 「' + entry.term + '」' + body
}

/* ───────────────────────── 匹配 ───────────────────────── */

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 拉丁名按词边界匹配（免得 DS 命中 DSH）；中文名按子串。 */
export function hitName(text, name) {
  if (!name || !text.includes(name)) return false
  if (!/^[A-Za-z0-9 .+-]+$/.test(name)) return true
  return new RegExp(`(?<![A-Za-z0-9])${escapeRe(name)}(?![A-Za-z0-9])`, 'i').test(text)
}

/** 口令类只在整条消息的开头或结尾命中（「不用」是口令，「这个不用管」不是）。 */
export function atEdge(text, name) {
  const t = String(text).trim().replace(/^[，,。.！!？?\s]+/, '').replace(/[，,。.！!？?\s]+$/, '')
  return t === name || t.startsWith(name) || t.endsWith(name)
}

/* ───────────────────────── 字典索引（带 mtime 缓存） ───────────────────────── */

let entriesCache = { at: 0, mtime: -1, entryChars: -1, list: [] }

/** 当前可用的词条索引：跳过已废、没有可注入正文、没有可匹配名字的条目。
 *  单条截断长度进缓存键——高级设置改了截断，索引要重拼，不能沿用旧的行。 */
export function entries() {
  const now = Date.now()
  const settings = loadSettings()
  const sameLimit = entriesCache.entryChars === settings.maxEntryChars
  if (entriesCache.list.length > 0 && sameLimit && now - entriesCache.at < CACHE_MS) return entriesCache.list
  const files = dictFiles()
  let mtime = 0
  for (const file of files) {
    try {
      mtime = Math.max(mtime, statSync(file).mtimeMs)
    } catch {
      /* 单份读不到不影响其余 */
    }
  }
  if (entriesCache.list.length > 0 && mtime === entriesCache.mtime && sameLimit) {
    entriesCache.at = now
    return entriesCache.list
  }
  const list = []
  for (const file of files) {
    const text = readText(file)
    const isGeneral = file === GENERAL_FILE
    const slug = isGeneral ? '' : basename(file).replace(/\.md$/, '')
    const meta = isGeneral ? { workspaces: [] } : parseDomainHeader(text)
    for (const entry of parseEntries(text)) {
      if ((entry.fields['状态'] || '').trim() === '已废') continue
      const line = lineOf(entry, settings.maxEntryChars)
      if (!line) continue
      const names = namesOf(entry)
      if (names.length === 0) continue
      const command = /口令/.test(entry.fields['定义'] || '') || /口令/.test(entry.fields['默认指代'] || '')
      list.push({
        term: entry.term,
        names,
        line,
        command,
        layer: isGeneral ? 'general' : 'domain:' + slug,
        workspaces: meta.workspaces,
      })
    }
  }
  entriesCache = { at: now, mtime, entryChars: settings.maxEntryChars, list }
  return list
}

/* ───────────────────────── 会话状态 ───────────────────────── */

const states = new Map()
let persisted = loadPersisted()

function emptySession() {
  return { terms: new Set(), lines: [], text: '', on: new Set(), off: new Set() }
}

function loadPersisted() {
  try {
    const raw = JSON.parse(readFileSync(STATE_FILE, 'utf8').replace(/^\uFEFF/, ''))
    const sessions = raw && typeof raw.sessions === 'object' && raw.sessions !== null ? raw.sessions : {}
    const kept = {}
    const now = Date.now()
    for (const [id, rec] of Object.entries(sessions)) {
      if (!rec || !Array.isArray(rec.terms)) continue
      if (typeof rec.at === 'number' && now - rec.at > 90 * 24 * 3600 * 1000) continue
      kept[id] = {
        terms: rec.terms.filter((t) => typeof t === 'string'),
        at: rec.at || now,
        on: Array.isArray(rec.on) ? rec.on.filter((t) => typeof t === 'string') : [],
        off: Array.isArray(rec.off) ? rec.off.filter((t) => typeof t === 'string') : [],
      }
    }
    return { version: 1, sessions: kept }
  } catch {
    return { version: 1, sessions: {} }
  }
}

function savePersisted() {
  persisted = { version: 1, sessions: { ...persisted.sessions } }
  for (const [id, state] of states) {
    persisted.sessions[id] = {
      terms: [...state.terms],
      at: Date.now(),
      on: [...state.on],
      off: [...state.off],
    }
  }
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true })
    const tmp = STATE_FILE + '.tmp'
    writeFileSync(tmp, JSON.stringify(persisted), 'utf8')
    renameSync(tmp, STATE_FILE)
  } catch {
    /* 落盘失败不影响本会话内的注入 */
  }
}

function render(state) {
  return state.lines.length === 0 ? '' : HEADER + '\n' + state.lines.join('\n')
}

/** 会话状态：优先取内存；第一次用到时从磁盘恢复（保留原顺序，删掉的词条自动丢）。 */
export function ensure(sessionId) {
  if (!sessionId) return emptySession()
  let state = states.get(sessionId)
  if (state) return state
  state = emptySession()
  const saved = persisted.sessions[sessionId]
  if (saved) {
    if (Array.isArray(saved.on)) for (const id of saved.on) state.on.add(id)
    if (Array.isArray(saved.off)) for (const id of saved.off) state.off.add(id)
  }
  if (saved && Array.isArray(saved.terms)) {
    const byTerm = new Map(entries().map((entry) => [entry.term, entry]))
    for (const term of saved.terms) {
      const entry = byTerm.get(term)
      if (!entry) continue
      state.terms.add(term)
      state.lines.push(entry.line)
    }
    state.text = render(state)
  }
  states.set(sessionId, state)
  return state
}

function activate(sessionId, entry) {
  const settings = loadSettings()
  if (!settings.autoActivate) return false
  const state = ensure(sessionId)
  if (state.terms.has(entry.term)) return false
  if (state.lines.length >= settings.maxActive) return false
  if (state.text.length + entry.line.length > settings.maxTotalChars) return false
  state.terms.add(entry.term)
  state.lines.push(entry.line)
  state.text = render(state)
  savePersisted()
  return true
}

/* ───────────────────────── 扫描与激活 ───────────────────────── */

/** 这一条词条在本会话是否可灌注：会话覆盖优先；通用层永远生效；任务层要绑了工作空间才默认生效，
 *  没绑＝默认不灌（新建的任务层不会自动对所有工作空间生效）；绑定则按 cwd 子串。 */
function layerAllowed(sessionId, entry, cwd) {
  const state = ensure(sessionId)
  if (state.off.has(entry.layer)) return false
  if (state.on.has(entry.layer)) return true
  if (!entry.layer || entry.layer === 'general') return true
  const list = entry.workspaces || []
  if (list.length === 0) return false
  const c = String(cwd || '').toLowerCase()
  if (!c) return false
  return list.some((w) => c.indexOf(String(w).toLowerCase()) !== -1)
}

/** 任务层清单（给面板与会话菜单）：id、slug、显示名、工作空间绑定。 */
export function layerCatalog() {
  const out = []
  try {
    for (const name of readdirSync(DOMAIN_DIR).sort()) {
      if (!name.endsWith('.md')) continue
      const slug = name.replace(/\.md$/, '')
      const meta = parseDomainHeader(readText(join(DOMAIN_DIR, name)))
      out.push({ id: 'domain:' + slug, slug, label: meta.taskType || slug, workspaces: meta.workspaces })
    }
  } catch {
    /* 任务层目录不在就空清单 */
  }
  return out
}

/** 会话的层覆盖（on/off 两名单）。 */
export function sessionLayerState(sessionId) {
  const state = ensure(sessionId)
  return { on: [...state.on], off: [...state.off] }
}

/** 设会话覆盖：override = 'on' | 'off' | null（null＝跟随工作空间绑定）。 */
export function setSessionLayer(sessionId, layer, override) {
  if (!sessionId) return { on: [], off: [] }
  const state = ensure(sessionId)
  state.on.delete(layer)
  state.off.delete(layer)
  if (override === 'on') state.on.add(layer)
  if (override === 'off') state.off.add(layer)
  savePersisted()
  return { on: [...state.on], off: [...state.off] }
}

/** 扫一段文本：命中未激活的词条就激活。kind='user' 才认口令类。 */
export function scan(sessionId, text, kind, cwd) {
  if (!sessionId || !text) return []
  if (!loadSettings().autoActivate) return []
  const body = String(text).slice(0, 20000)
  const state = ensure(sessionId)
  const hits = []
  for (const entry of entries()) {
    if (state.terms.has(entry.term)) continue
    if (!layerAllowed(sessionId, entry, cwd)) continue
    let hit = false
    for (const name of entry.names) {
      if (entry.command) {
        if (kind === 'user' && atEdge(body, name)) { hit = true; break }
      } else if (hitName(body, name)) {
        hit = true
        break
      }
    }
    if (!hit) continue
    if (activate(sessionId, entry)) hits.push(entry.term)
  }
  return hits
}

function textOfMessage(message) {
  if (!message || !Array.isArray(message.content)) return ''
  return message.content.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('\n')
}

/**
 * 本会话当前跑的是哪个 preset（不是就放行/拦下，判不出按「不是」）。
 * 判定顺序（2026-11-04）：档里最后一个 agent-preset/selected（DSH 写、最准）→ Session 投影
 * （可能滞后一步）→ 档头 → task-tree 标记。投影优先的旧写法会让标准模式会话首轮仍带着词条
 * 工具（实测 924e3525 首轮 step 1 工具表有 dict，step 2 才摘）。
 */
export function presetOfSession(ctx, session) {
  if (!session) return undefined
  const detail = presetDetailFromArchive(session.id)
  if (detail.last) return detail.last
  // DSH 0.2.2 起的官方入口：agentPresets.presetForSession（注册表级 sessionProjections.stateOf 已弃用）。
  // 旧版没有这个服务时退回投影，两边都能跑。
  try {
    const presets = ctx && typeof ctx.get === 'function' ? ctx.get('agentPresets') : undefined
    if (presets && typeof presets.presetForSession === 'function') {
      const got = presets.presetForSession(session)
      const value = typeof got === 'string' ? got : (got && typeof got.id === 'string' ? got.id : undefined)
      if (typeof value === 'string' && value.length > 0) return value
    }
  } catch {
    /* 没有 agentPresets：退回投影 */
  }
  try {
    const projections = ctx && typeof ctx.get === 'function' ? ctx.get('sessionProjections') : undefined
    if (projections && typeof projections.stateOf === 'function') {
      const value = projections.stateOf(session, 'agentPreset')
      if (typeof value === 'string' && value.length > 0) return value
    }
  } catch {
    /* 投影拿不到：读档 */
  }
  if (detail.header) return detail.header
  try {
    const marker = readFileSync(join(DSH_HOME, 'task-trees', 'sessions', `${session.id}.preset`), 'utf8').trim()
    return marker.length > 0 ? marker : undefined
  } catch {
    return undefined
  }
}

/**
 * 本会话该不该灌注／注册工具：通用会话（没有模式／判不出模式）永远放行；其余模式要设置里勾了
 * 「灌注的模式」才放行——新建的模式默认不在名单里，因此默认不灌。
 */
export function modeAllowed(ctx, session) {
  const preset = presetOfSession(ctx, session)
  if (typeof preset !== 'string' || preset.length === 0) return true
  const allow = loadSettings().presets
  if (!Array.isArray(allow) || allow.length === 0) return false
  return allow.indexOf(preset) !== -1
}

/* ───────────────────────── 接进运行时 ───────────────────────── */

/**
 * 装自动激活：一条 runtime-context + 两个监听。
 * @param ctx - 插件 ctx（Cordis）。
 */
export function installActivation(ctx) {
  try { void refreshEvolutionPreset(ctx) } catch { /* 取不到就当没有进化模式 */ }
  const install = (c) => {
    try {
      const sp = c && c.systemPrompt
      if (!sp || typeof sp.context !== 'function') return
      sp.context({
        name: 'dsh-term-dict:activated',
        order: 300,
        interpolate: false,
        text: (context) => {
          try {
            const session = context && context.agent && context.agent.session
            if (!session) return ''
            if (!modeAllowed(ctx, session)) return ''
            if (isMuted(session)) return ''
            return ensure(session.id).text
          } catch {
            return ''
          }
        },
      })
      // 词条检测：判别机制＋本会话账本链接。和自动激活同一套门控；关检测就不注入。
      sp.context({
        name: 'dsh-term-dict:detect',
        order: 301,
        interpolate: false,
        text: (context) => {
          try {
            const session = context && context.agent && context.agent.session
            if (!session || !session.id) return ''
            if (!detectionActive()) return ''
            if (!modeAllowed(ctx, session)) return ''
            if (isMuted(session)) return ''
            const file = ensureDetectFile(session.id)
            return file ? detectPrompt(file) : ''
          } catch {
            return ''
          }
        },
      })
    } catch {
      /* 注册失败不拦工具与面板 */
    }
  }
  try {
    if (typeof ctx.inject === 'function') ctx.inject(['systemPrompt'], install)
    else install({ systemPrompt: typeof ctx.get === 'function' ? ctx.get('systemPrompt') : undefined })
  } catch {
    /* 无 systemPrompt 服务的环境：自动激活跳过 */
  }

  // 会话开始就把账本建好；恢复的会话由注入时 ensureDetectFile 兜底。
  try {
    ctx.on('session/created', (session) => {
      try {
        if (detectionActive() && session && session.id
          && modeAllowed(ctx, session) && !isMuted(session)) ensureDetectFile(session.id)
      } catch {
        /* 建不了不影响会话 */
      }
    })
  } catch {
    /* 没有 session 事件就靠注入时懒建 */
  }

  // agent 建好后再确认一次进化模式：服务在 apply 阶段可能还没注册。
  try {
    ctx.on('agent/created', async () => {
      try { await refreshEvolutionPreset(ctx) } catch { /* 保持上次判定 */ }
    })
  } catch {
    /* 没有 agent 事件就只靠 apply 时那次 */
  }

  // 每次进入模型调用前确认一次：进化模式在就整段检测失效。
  try {
    ctx.on('agent/pre-step', async (payload, next) => {
      try { await refreshEvolutionPreset(ctx) } catch { /* 保持上次判定 */ }
      return next()
    })
  } catch {
    /* 没有 pre-step 就靠 agent/created */
  }

  // 用户消息：pre-step 拿到的就是本轮进入模型的用户消息，扫完再放行。
  try {
    ctx.on('agent/pre-step', (payload, next) => {
      try {
        const session = payload && payload.agent && payload.agent.session
        if (session && modeAllowed(ctx, session) && !isMuted(session)) {
          const cwd = session.header && typeof session.header.cwd === 'string' ? session.header.cwd : ''
          for (const message of payload.messages || []) {
            if (!message || !message.source || message.source.kind !== 'user') continue
            scan(session.id, textOfMessage(message), 'user', cwd)
          }
        }
      } catch {
        /* 扫描失败不能拦模型调用 */
      }
      return next()
    })
  } catch {
    /* 事件挂不上时自动激活只剩思考／输出面 */
  }

  // AI 每一步落盘的完整消息：reasoning 块＋text 块一起扫，下一步的模型调用就能读到。
  try {
    ctx.on('session/event', (session, event) => {
      try {
        if (!event || event.type !== 'assistant/message') return
        if (!session || !modeAllowed(ctx, session) || isMuted(session)) return
        const content = event.data && event.data.message && event.data.message.content
        if (!Array.isArray(content)) return
        const text = content
          .filter((b) => b && (b.type === 'text' || b.type === 'reasoning'))
          .map((b) => b.text || '')
          .join('\n')
        scan(session.id, text, 'assistant', session.header && typeof session.header.cwd === 'string' ? session.header.cwd : '')
      } catch {
        /* 单条消息解析失败不影响后续 */
      }
    })
  } catch {
    /* 事件挂不上时自动激活只剩用户消息面 */
  }
}
