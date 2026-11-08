/**
 * 类型：工具＋面板后端＋自动激活；解决：跨会话的术语口径散在对话里，下次要用得重新对一遍；作用：两级（通用／任务）纯文本术语字典——查、写、体检三条工具，外加设置面板用的 HTTP 路由，以及「首次触发即注入」的自动激活（activation.js）。
 *   - dict-lookup：列索引或查词条正文（默认扫通用层与全部任务层）。
 *   - dict-write：增改一条词条（写前自动留 .bak）。
 *   - dict-lint：空定义／缺状态／同层重名／跨层同名体检。
 *   - 路由（给设置面板用）：GET /dsh-term-dict/api/list、GET /dsh-term-dict/api/read?id=…、POST /dsh-term-dict/api/write、POST /dsh-term-dict/api/rename、GET|POST /dsh-term-dict/api/settings。
 *   - 高级设置（dict\.settings.json）：自动激活开关、单会话条数、单条字数、整段字数；面板「高级设置」读写，改完下一次扫描起生效。
 *   - 自动激活：用户消息／AI 思考／AI 输出里第一次出现某词条时，把该词条作为 runtime-context 注入（同会话一次）。
 *
 * 落点（两层全部集中在一个根目录 $DSH_HOME\dict\ 下）：通用层 dict\general.md；任务层 dict\domains\<任务slug>.md（一个文件＝一类任务，目录名沿用 domains）。
 * 词条格式（纯文本，可直接手改；后四个字段可选）：
 *   ## 词条名
 *   - 定义：一句话
 *   - 边界：不是什么
 *   - 反例：一个具体例子——出现这种情况，就不算这个称谓
 *   - 别称：同一物还有哪些叫法（逗号分隔；查这些叫法也能查到本条）
 *   - 排他性：跟别的词条撞了时认哪条（如 任务层优先）；留空＝按 任务>通用
 *   - 状态：已确认 / 部分确认 / 待观察 / 已废
 *   - 备注：可选
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, unlinkSync, renameSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  installActivation, presetOfSession, loadSettings, saveSettings, DEFAULT_SETTINGS,
  sweepSchema, TYPE_IDS, MODULE_FIELDS, LOCKED_MODULES, DAY_MS, validModuleName, kindOf,
  parseDomainHeader, layerCatalog, sessionLayerState, setSessionLayer, seedGeneral,
} from './activation.js'

/**
 * 技能排序档位：与宿主内置 bundled 技能同档。
 * 宿主导出过这个常量（BUNDLED_SKILL_RANK = 600），但那是宿主内部包，装进别人的 profile
 * 不一定解析得到，所以写定值；不用它作依赖，免得把宿主核心包再装一份。
 */
const BUNDLED_SKILL_RANK = 600

/** Cordis 插件名。 */
export const name = 'dsh-term-dict'
/** 需要的服务（webServer 走可选获取：非 web 组合里没有这个服务也不该拦加载）。 */
export const inject = ['tools', 'skills']

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
/** 字典根目录：两层（通用／任务）全部集中在这下面。 */
const DICT_ROOT = join(DSH_HOME, 'dict')
const GENERAL_FILE = join(DICT_ROOT, 'general.md')
/** 任务层（原领域层）：一个文件＝一类任务，文件名即任务 slug。 */
const DOMAIN_DIR = join(DICT_ROOT, 'domains')
const STATUSES = ['已确认', '部分确认', '待观察', '已废']
const FIELD_ORDER = ['类型', '定义', '默认指代', '边界', '状态', '备注']
const API_PREFIX = '/dsh-term-dict/api'
const MAX_WRITE_BYTES = 1 << 20

const OUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', required: true },
    text: { type: 'string', required: true },
  },
  additionalProperties: false,
}

function readText(file) {
  try {
    return existsSync(file) ? readFileSync(file, 'utf8') : ''
  } catch {
    return ''
  }
}

function defaultHeader(kind, domain) {
  if (kind === 'general') {
    return '# 术语字典·通用层\n\n> 收录判据：双方都在用、会出现口径分歧的称谓。格式：`## 词条名` 下面「- 定义／- 默认指代／- 边界／- 状态／- 备注（别名写进标题：`## 词条名（别名：另一叫法）`）」（除定义外可选）。\n'
  }
  return '# 术语字典·任务层·' + domain + '\n\n'
    + '> 任务类型：' + domain + '（把冒号后面改成这一类任务的中文名，例如 网络小说创作）\n'
    + '> 收录判据：只在本类任务里成立、别处用不到的称谓——我和你约定俗成的叫法。格式：`## 词条名` 下面「- 定义／- 默认指代／- 边界／- 状态／- 备注（别名写进标题：`## 词条名（别名：另一叫法）`）」（除定义外可选）。\n'
}

/** 「别称」拆成单个叫法（逗号／顿号／分号／斜杠分隔），用于查得到与查重；空串＝没有别称。 */
function aliasesOf(entry) {
  const raw = String((entry && entry.fields && entry.fields['别称']) || '')
  if (!raw.trim()) return []
  return raw.split(/[,，、;；\/]+/).map((s) => s.trim()).filter(Boolean)
}

/** 编辑距离（Levenshtein）：只用于短词的形近判断。 */
function editDistance(a, b) {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    const cur = new Array(n + 1)
    cur[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = cur
  }
  return prev[n]
}

/** 查不到精确词时找疑似：词条名（含别称）与输入只差一个字——类似的词，说不定就是同一个。 */
function nearWords(term, targets) {
  const out = []
  for (const t of targets) {
    for (const e of parseEntries(readText(t.file))) {
      for (const name of [e.term].concat(aliasesOf(e))) {
        if (name === term || name.length < 3) continue
        const d = editDistance(name, term)
        if (d === 1 || (d === 2 && name.length === term.length && term.length >= 5)) {
          out.push({ term: name, layer: t.label, d })
        }
      }
    }
  }
  out.sort((a, b) => a.d - b.d || b.term.length - a.term.length)
  return out.slice(0, 3)
}

function splitHeader(text) {
  const m = /^##\s/m.exec(text)
  return m ? text.slice(0, m.index) : text
}

/** 标题里可能带别名：`## 词典（别名：字典、术语字典）`；别名在内存里仍当「别称」字段用（lookup 与体检都不用改）。 */
function parseHeading(raw) {
  const t = String(raw || '').trim()
  const m = /^(.+?)（别名：(.+?)）$/.exec(t)
  if (m) return { term: m[1].trim(), aliases: m[2].trim() }
  return { term: t, aliases: '' }
}

function parseEntries(text) {
  const entries = []
  let cur = null
  for (const line of String(text).split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line)
    if (h) {
      if (cur) entries.push(cur)
      const parsed = parseHeading(h[1])
      cur = { term: parsed.term, aliases: parsed.aliases, fields: {} }
      continue
    }
    if (!cur) continue
    const f = /^\s*[-*]\s*([^：:]{1,10})\s*[：:]\s*(.*)$/.exec(line)
    if (f) cur.fields[f[1].trim()] = f[2].trim()
  }
  if (cur) entries.push(cur)
  for (const e of entries) if (!e.fields['别称'] && e.aliases) e.fields['别称'] = e.aliases
  return entries
}

function renderEntry(entry) {
  const aliases = String(entry.fields['别称'] || '').trim()
  const keys = FIELD_ORDER.filter((k) => k !== '别称' && entry.fields[k] !== undefined)
    .concat(Object.keys(entry.fields).filter((k) => k !== '别称' && FIELD_ORDER.indexOf(k) === -1))
  const out = ['## ' + entry.term + (aliases ? '（别名：' + aliases + '）' : '')]
  for (const k of keys) out.push('- ' + k + '：' + entry.fields[k])
  return out.join('\n')
}

function backup(file) {
  if (existsSync(file)) copyFileSync(file, file + '.bak')
}

function writeEntries(file, header, entries) {
  const body = entries.map(renderEntry).join('\n\n')
  const text = String(header).replace(/\s*$/, '') + '\n\n' + body + '\n'
  backup(file)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text, 'utf8')
  return text
}

function upsert(file, kind, domain, term, fields) {
  const text = readText(file)
  let header = text ? splitHeader(text) : ''
  if (!header.trim()) header = defaultHeader(kind, domain)
  const entries = parseEntries(text)
  const i = entries.findIndex((e) => e.term === term)
  if (i >= 0) entries[i] = { term, fields: Object.assign({}, entries[i].fields, fields) }
  else entries.push({ term, fields })
  writeEntries(file, header, entries)
  return { created: i === -1 }
}

/** 任务 slug 清单：dict\domains 下的文件（一个文件＝一类任务）。 */
function domainSlugs() {
  const slugs = []
  if (existsSync(DOMAIN_DIR)) {
    for (const f of readdirSync(DOMAIN_DIR).sort()) {
      if (f.endsWith('.md')) slugs.push(basename(f, '.md'))
    }
  }
  return slugs
}

/** 任务层文件自己声明的任务类型：读该文件表头里的「任务类型：…」一行；没写就退回空串（面板显示 slug）。
 *  刻意不读用户画像——任务字典与任务画像只是「同一任务类型的两个记录」（字典记称谓、画像记做法），互不依赖。 */
function domainTaskType(slug) {
  const text = readText(join(DOMAIN_DIR, slug + '.md'))
  const m = /^>\s*任务类型\s*[：:]\s*(.+?)\s*$/m.exec(text)
  if (!m) return ''
  return m[1].replace(/（.*?）\s*$/, '').trim()
}

/** 任务层的工作空间绑定：读表头「> 工作空间：…」行。 */
function domainWorkspaces(slug) {
  return parseDomainHeader(readText(join(DOMAIN_DIR, slug + '.md'))).workspaces
}

/** 工作空间清单兜底：服务不可用时直接读 DSH 的 storages/workspace.json。 */
function workspacesFromStorage() {
  try {
    const raw = JSON.parse(readFileSync(join(DSH_HOME, 'storages', 'workspace.json'), 'utf8'))
    const table = raw && raw.tables && raw.tables.workspaces
    if (!table || typeof table !== 'object') return []
    return Object.keys(table).map((id) => ({
      id,
      title: String(table[id].title || ''),
      path: String(table[id].path || ''),
    })).filter((w) => w.path)
  } catch {
    return []
  }
}

/** 两层各自的 id→文件映射。id 是面板与工具之间唯一的选择器。 */
function layerDefs() {
  const defs = [{ id: 'general', label: '通用层', kind: 'general', parent: '', file: GENERAL_FILE }]
  for (const slug of domainSlugs()) {
    defs.push({
      id: 'domain:' + slug,
      label: '任务层·' + slug,
      kind: 'domain',
      slug,
      parent: '',
      file: join(DOMAIN_DIR, slug + '.md'),
      taskType: domainTaskType(slug),
      workspaces: domainWorkspaces(slug),
    })
  }
  return defs
}

function resolveLayer(id) {
  const key = String(id || '')
  return layerDefs().find((d) => d.id === key) || null
}

function collectTargets(args) {
  const layer = args && args.layer ? String(args.layer).trim() : ''
  const all = layer === ''
  const want = (re) => all || re.test(layer)
  const targets = []
  if (want(/通用|general/i)) targets.push({ kind: 'general', label: '通用', file: GENERAL_FILE })
  if (want(/任务|领域|domain|task/i)) {
    const dom = args && args.domain ? String(args.domain).trim() : ''
    const labelOf = (slug) => '任务·' + slug + (domainTaskType(slug) ? '（' + domainTaskType(slug) + '）' : '')
    if (dom) targets.push({ kind: 'domain', label: labelOf(dom), file: join(DOMAIN_DIR, dom + '.md') })
    else if (existsSync(DOMAIN_DIR)) {
      for (const f of readdirSync(DOMAIN_DIR).sort()) {
        if (f.endsWith('.md')) {
          const slug = basename(f, '.md')
          targets.push({ kind: 'domain', label: labelOf(slug), file: join(DOMAIN_DIR, f) })
        }
      }
    }
  }
  return targets
}

// ── 设置面板用的 HTTP 路由（只收本机请求） ────────────────────────────────

function isLocal(req) {
  const addr = (req.socket && req.socket.remoteAddress) || ''
  return addr === '' || addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

/**
 * 读写入口的准入：本机回环 + 改数据的请求必须同源。
 * 浏览器从别的站点发来的写请求带 sec-fetch-site: cross-site，直接拒；
 * 非浏览器来源（命令行、脚本）不带这些头，照旧放行。
 */
function isTrusted(req) {
  if (!isLocal(req)) return false
  const method = String(req.method || '').toUpperCase()
  if (method === 'GET' || method === 'HEAD') return true
  const headers = req.headers || {}
  const site = headers['sec-fetch-site'] || headers['Sec-Fetch-Site']
  if (site && site !== 'same-origin' && site !== 'none') return false
  const origin = headers.origin || headers.Origin
  if (origin) {
    let host = ''
    try {
      host = new URL(origin).host
    } catch {
      return false
    }
    const reqHost = headers.host || headers.Host
    if (reqHost && host !== reqHost) return false
  }
  return true
}

function sendJson(res, code, value) {
  const body = JSON.stringify(value)
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_WRITE_BYTES) {
        reject(new Error('内容超过 1MB 上限'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** 面板里显示用的相对路径：dict\…（绝对路径太长，底部一行放不下）。 */
function relPath(file) {
  return 'dict/' + String(file).slice(DICT_ROOT.length + 1).replace(/\\/g, '/')
}

/** 两层字典的所有 md 文件（通用层在前，任务层按文件名）。 */
function dictFilesAll() {
  const files = []
  if (existsSync(GENERAL_FILE)) files.push(GENERAL_FILE)
  try {
    for (const name of readdirSync(DOMAIN_DIR)) {
      if (name.endsWith('.md')) files.push(join(DOMAIN_DIR, name))
    }
  } catch {
    /* 没有任务层目录 */
  }
  return files
}

/** 删模块前的扫描：全字典多少条词条、其中多少条写了这个字段、抽几个词条名。 */
function schemaScan(field) {
  let total = 0
  let withField = 0
  const samples = []
  for (const file of dictFilesAll()) {
    for (const entry of parseEntries(readText(file))) {
      total += 1
      if (String(entry.fields[field] || '').trim() !== '') {
        withField += 1
        if (samples.length < 5) samples.push(entry.term)
      }
    }
  }
  return { total, withField, samples }
}

function layerSummary(def) {
  const text = readText(def.file)
  return {
    id: def.id,
    label: def.label,
    kind: def.kind,
    parent: def.parent || '',
    domain: def.domain || def.slug || '',
    slug: def.slug || '',
    path: def.file,
    rel: relPath(def.file),
    exists: existsSync(def.file),
    terms: parseEntries(text).length,
    taskType: def.taskType || '',
    workspaces: def.workspaces || [],
  }
}

/** 文件名（slug）合法性：Windows 不允许的字符、结尾点/空格、过长都不收；空串不允许。 */
function checkSlug(slug) {
  const s = String(slug || '').trim()
  if (!s) throw new Error('文件名不能为空')
  if (/[\\/:*?"<>|]/.test(s)) throw new Error('文件名不能含 \\ / : * ? " < > |')
  if (s === '.' || s === '..' || /[. ]$/.test(s)) throw new Error('文件名不能以点或空格结尾')
  if (s.length > 64) throw new Error('文件名最长 64 个字符')
  return s
}

/**
 * 任务层改名：改表头「任务类型」行（显示名），可选把 dict\domains\<slug>.md 一起改名。
 * 顺序固定：先备份 → 写新文件 → 删旧文件；写失败时不留半截（新文件回滚掉，旧文件原样）。
 * 词条正文一字不动：只改表头，body 原样搬过去。
 */
function renameLayer(def, nextName, nextSlug) {
  const oldFile = def.file
  const oldSlug = def.slug || ''
  const wantSlug = nextSlug === undefined || nextSlug === null || String(nextSlug).trim() === ''
    ? oldSlug
    : checkSlug(nextSlug)
  const text = readText(oldFile)
  const oldHeader = text ? splitHeader(text) : ''
  let header = oldHeader.trim() ? oldHeader : defaultHeader('domain', wantSlug)
  const body = text && oldHeader ? text.slice(oldHeader.length) : (text || '')

  const name = nextName === undefined || nextName === null ? '' : String(nextName).trim()
  if (name) {
    const line = '> 任务类型：' + name
    if (/^>\s*任务类型\s*[：:].*$/m.test(header)) {
      header = header.replace(/^>\s*任务类型\s*[：:].*$/m, line)
    } else if (/^#\s+.*$/m.test(header)) {
      header = header.replace(/^(#\s+.*)$/m, '$1\n' + line)
    } else {
      header = line + '\n' + header
    }
  }
  if (wantSlug !== oldSlug) {
    header = header.replace(/^#\s*术语字典·任务层·.*$/m, '# 术语字典·任务层·' + wantSlug)
  }
  const content = header.replace(/\s*$/, '') + '\n\n' + (body || '').replace(/^\s+/, '')

  if (wantSlug === oldSlug) {
    backup(oldFile)
    mkdirSync(dirname(oldFile), { recursive: true })
    writeFileSync(oldFile, content, 'utf8')
    return { slug: oldSlug, file: oldFile }
  }

  const newFile = join(DOMAIN_DIR, wantSlug + '.md')
  if (existsSync(newFile)) throw new Error('已经有同名文件：' + relPath(newFile))
  backup(oldFile)
  mkdirSync(DOMAIN_DIR, { recursive: true })
  try {
    writeFileSync(newFile, content, 'utf8')
    if (existsSync(oldFile)) unlinkSync(oldFile)
    const oldBak = oldFile + '.bak'
    if (existsSync(oldBak)) {
      try { renameSync(oldBak, newFile + '.bak') } catch { /* 备份搬不动不影响改名结果 */ }
    }
  } catch (error) {
    try { if (existsSync(newFile)) unlinkSync(newFile) } catch { /* 回滚失败就保持原样，下面报错 */ }
    throw error
  }
  return { slug: wantSlug, file: newFile }
}

/** 注册三条面板路由。
 *  webServer 不写进 inject 硬依赖（非 web 组合里没有它也不该拦加载），也不能只靠 ctx.get——
 *  实测 apply 期 ctx.get('webServer') 拿不到（服务还没进这个上下文），得走 ctx.inject 等到位再挂。
 */
/** 本会话当前 preset：读 profile-inject 写下的运行态文件；读不到返回 ''（判不出按允许处理，不误禁）。 */
function presetLive(id) {
  if (!id) return ''
  try {
    return readFileSync(join(DSH_HOME, 'codex-hooks', 'state', id + '.preset-live'), 'utf8').trim()
  } catch {
    return ''
  }
}

function registerRoutes(ctx) {
  const direct = typeof ctx.get === 'function' ? ctx.get('webServer') : undefined
  if (direct && typeof direct.register === 'function') {
    registerOnRoutes(ctx, direct)
    return
  }
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (hostCtx) => {
      const webServer = hostCtx
        && (hostCtx.webServer || (typeof hostCtx.get === 'function' ? hostCtx.get('webServer') : undefined))
      if (!webServer || typeof webServer.register !== 'function') return
      registerOnRoutes(hostCtx, webServer)
    })
  }
}

/** 把三条路由挂到给定 webServer 上。 */
function registerOnRoutes(ctx, webServer) {
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/list',
    handler: (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: '只支持 GET' })
      sendJson(res, 200, { ok: true, layers: layerDefs().map(layerSummary) })
    },
  }), 'dsh-term-dict: list route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/read',
    handler: (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: '只支持 GET' })
      const id = new URL(req.url || '/', 'http://localhost').searchParams.get('id') || 'general'
      const def = resolveLayer(id)
      if (!def) return sendJson(res, 404, { ok: false, error: '没有这一层：' + id })
      sendJson(res, 200, { ok: true, id: def.id, path: def.file, exists: existsSync(def.file), content: readText(def.file) })
    },
  }), 'dsh-term-dict: read route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/write',
    handler: async (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: '只支持 POST' })
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        const def = resolveLayer(body.id)
        if (!def) return sendJson(res, 404, { ok: false, error: '没有这一层：' + String(body.id) })
        const content = String(body.content ?? '')
        if (Buffer.byteLength(content, 'utf8') > MAX_WRITE_BYTES) return sendJson(res, 413, { ok: false, error: '内容超过 1MB 上限' })
        backup(def.file)
        mkdirSync(dirname(def.file), { recursive: true })
        writeFileSync(def.file, content, 'utf8')
        sendJson(res, 200, { ok: true, id: def.id, path: def.file })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String((error && error.message) || error) })
      }
    },
  }), 'dsh-term-dict: write route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/rename',
    handler: async (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: '只支持 POST' })
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        const def = resolveLayer(body.id)
        if (!def) return sendJson(res, 404, { ok: false, error: '没有这一层：' + String(body.id) })
        if (def.kind !== 'domain') return sendJson(res, 400, { ok: false, error: '通用层只有一层，名字固定，不能改名' })
        const renamed = renameLayer(def, body.name, body.slug)
        const next = resolveLayer('domain:' + renamed.slug)
        sendJson(res, 200, {
          ok: true,
          id: 'domain:' + renamed.slug,
          slug: renamed.slug,
          path: renamed.file,
          rel: relPath(renamed.file),
          taskType: next ? next.taskType : '',
        })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String((error && error.message) || error) })
      }
    },
  }), 'dsh-term-dict: rename route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/create-layer',
    handler: async (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: '只支持 POST' })
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        const name = String(body.name || '').trim().slice(0, 40)
        if (!name) return sendJson(res, 400, { ok: false, error: '任务层名称不能为空' })
        let slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
        if (!slug) slug = 'task-' + Date.now().toString(36)
        checkSlug(slug)
        let finalSlug = slug
        let n = 2
        while (existsSync(join(DOMAIN_DIR, finalSlug + '.md'))) {
          finalSlug = slug + '-' + n
          n += 1
        }
        const file = join(DOMAIN_DIR, finalSlug + '.md')
        const content = '# 术语字典·任务层·' + finalSlug + '\n\n'
          + '> 任务类型：' + name + '\n'
          + '> 收录判据：只在本类任务里成立、别处用不到的称谓。\n\n'
        mkdirSync(DOMAIN_DIR, { recursive: true })
        writeFileSync(file, content, 'utf8')
        const def = resolveLayer('domain:' + finalSlug)
        sendJson(res, 200, { ok: true, layer: def ? layerSummary(def) : null })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String((error && error.message) || error) })
      }
    },
  }), 'dsh-term-dict: create-layer route')

  // 删除任务层：文件改名归档（<slug>.md.deleted-时间戳），词条不丢、可改回名字找回；通用层不能删。
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/delete-layer',
    handler: async (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: '只支持 POST' })
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        const def = resolveLayer(body.id)
        if (!def) return sendJson(res, 404, { ok: false, error: '没有这一层：' + String(body.id) })
        if (def.kind !== 'domain') return sendJson(res, 400, { ok: false, error: '通用层是全局的，不能删' })
        if (!existsSync(def.file)) return sendJson(res, 404, { ok: false, error: '文件不在：' + relPath(def.file) })
        const archived = def.file + '.deleted-' + Date.now()
        renameSync(def.file, archived)
        sendJson(res, 200, { ok: true, id: def.id, slug: def.slug, archived: relPath(archived) })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String((error && error.message) || error) })
      }
    },
  }), 'dsh-term-dict: delete-layer route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/workspace',
    handler: async (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: '只支持 POST' })
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        const def = resolveLayer(body.id)
        if (!def) return sendJson(res, 404, { ok: false, error: '没有这一层：' + String(body.id) })
        if (def.kind !== 'domain') return sendJson(res, 400, { ok: false, error: '通用层是全局的，不绑工作空间' })
        const rawList = Array.isArray(body.workspaces) ? body.workspaces : String(body.workspaces || '').split(/[\n,，、;；]+/)
        const workspaces = []
        for (const item of rawList) {
          const s = String(item || '').trim()
          if (!s) continue
          if (s.length > 200) return sendJson(res, 400, { ok: false, error: '路径片段最长 200 字' })
          if (workspaces.indexOf(s) === -1) workspaces.push(s)
        }
        if (workspaces.length > 20) return sendJson(res, 400, { ok: false, error: '最多 20 条工作空间片段' })
        let text = readText(def.file)
        if (!text.trim()) text = '# 术语字典·任务层·' + def.slug + '\n\n'
        text = text.replace(/^>\s*工作空间\s*[：:].*$/gm, '').replace(/\n{3,}/g, '\n\n')
        const lines = workspaces.map((w) => '> 工作空间：' + w).join('\n')
        if (lines) {
          const m = /^>\s*任务类型\s*[：:].*$/m.exec(text)
          if (m) {
            const at = m.index + m[0].length
            text = text.slice(0, at) + '\n' + lines + text.slice(at)
          } else {
            const first = text.indexOf('\n')
            text = first === -1 ? text + '\n\n' + lines + '\n' : text.slice(0, first + 1) + lines + '\n' + text.slice(first + 1)
          }
        }
        backup(def.file)
        writeFileSync(def.file, text, 'utf8')
        sendJson(res, 200, { ok: true, id: def.id, workspaces })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String((error && error.message) || error) })
      }
    },
  }), 'dsh-term-dict: workspace route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/workspaces',
    handler: (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: '只支持 GET' })
      let list = []
      try {
        const registry = ctx.get('workspaceRegistry')
        if (registry && typeof registry.list === 'function') {
          for (const ws of registry.list()) {
            list.push({ id: String(ws.id || ''), title: String(ws.title || ''), path: String(ws.path || '') })
          }
        }
      } catch {
        /* 注册表不可用时退回文件 */
      }
      if (list.length === 0) list = workspacesFromStorage()
      sendJson(res, 200, { ok: true, workspaces: list })
    },
  }), 'dsh-term-dict: workspaces route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/settings',
    handler: async (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method === 'GET') {
        return sendJson(res, 200, { ok: true, settings: loadSettings(), defaults: DEFAULT_SETTINGS })
      }
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: '只支持 GET／POST' })
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        sendJson(res, 200, { ok: true, settings: saveSettings(body) })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String((error && error.message) || error) })
      }
    },
  }), 'dsh-term-dict: settings route')

  // 模式清单：面板上「限定模式」勾选用。roster 由宿主的 agentPresets 服务给（含显示名与坏掉原因），
  // 取不到就回空清单并带一句原因，面板据此退回手填。
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/presets',
    handler: async (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: '只支持 GET' })
      let service
      try {
        service = typeof ctx.get === 'function' ? ctx.get('agentPresets') : undefined
      } catch {
        service = undefined
      }
      if (!service || typeof service.remoteExportList !== 'function') {
        return sendJson(res, 200, {
          ok: true,
          presets: [],
          unavailable: '宿主没有 agentPresets 服务（这个 profile 没装 agent-presets）',
        })
      }
      try {
        const roster = await service.remoteExportList()
        const rows = roster && Array.isArray(roster.presets) ? roster.presets : []
        const presets = rows.map((row) => ({
          id: String(row.id || ''),
          name: typeof row.name === 'string' ? row.name : '',
          description: typeof row.description === 'string' ? row.description : '',
          broken: typeof row.broken === 'string' ? row.broken : '',
          isDefault: Boolean(row.isDefault),
        })).filter((row) => row.id !== '')
        sendJson(res, 200, { ok: true, presets })
      } catch (error) {
        sendJson(res, 200, { ok: true, presets: [], unavailable: String((error && error.message) || error) })
      }
    },
  }), 'dsh-term-dict: presets route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/session-state',
    handler: (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: '只支持 GET' })
      const id = new URL(req.url || '/', 'http://localhost').searchParams.get('id') || ''
      const settings = loadSettings()
      const preset = presetLive(id)
      // 通用会话（判不出模式）永远放行；有模式时必须在「灌注的模式」名单里——新建的模式默认不在名单。
      const allowed = preset === ''
        || settings.presets.indexOf(preset) !== -1
      sendJson(res, 200, {
        ok: true,
        id,
        muted: id !== '' && settings.skipSessions.indexOf(id) !== -1,
        mutedCount: settings.skipSessions.length,
        preset,
        allowed,
        presets: settings.presets,
      })
    },
  }), 'dsh-term-dict: session-state route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/session-mute',
    handler: async (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: '只支持 POST' })
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        const id = String(body.id || '').trim()
        if (!id) return sendJson(res, 400, { ok: false, error: '缺 session id' })
        const cur = loadSettings()
        const list = cur.skipSessions.slice()
        const at = list.indexOf(id)
        const muted = body.muted === undefined ? at === -1 : Boolean(body.muted)
        if (muted && at === -1) list.push(id)
        if (!muted && at !== -1) list.splice(at, 1)
        const next = saveSettings({ skipSessions: list })
        sendJson(res, 200, {
          ok: true,
          id,
          muted: next.skipSessions.indexOf(id) !== -1,
          mutedCount: next.skipSessions.length,
        })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String((error && error.message) || error) })
      }
    },
  }), 'dsh-term-dict: session-mute route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/session-mute-clear',
    handler: async (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: '只支持 POST' })
      try {
        const next = saveSettings({ skipSessions: [] })
        sendJson(res, 200, { ok: true, mutedCount: next.skipSessions.length })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String((error && error.message) || error) })
      }
    },
  }), 'dsh-term-dict: session-mute-clear route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/session-layers',
    handler: async (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method === 'GET') {
        const id = new URL(req.url || '/', 'http://localhost').searchParams.get('session') || ''
        const st = sessionLayerState(id)
        const layers = layerCatalog().map((l) => ({
          id: l.id,
          label: l.label,
          workspaces: l.workspaces,
          override: st.on.indexOf(l.id) !== -1 ? 'on' : (st.off.indexOf(l.id) !== -1 ? 'off' : null),
        }))
        return sendJson(res, 200, { ok: true, session: id, layers })
      }
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: '只支持 GET／POST' })
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        const session = String(body.session || '').trim()
        const layer = String(body.layer || '').trim()
        const override = body.override === 'on' || body.override === 'off' ? body.override : null
        if (!session) return sendJson(res, 400, { ok: false, error: '缺会话 id' })
        if (!layerCatalog().some((l) => l.id === layer)) return sendJson(res, 400, { ok: false, error: '没有这个任务层' })
        const st = setSessionLayer(session, layer, override)
        sendJson(res, 200, { ok: true, session, on: st.on, off: st.off })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String((error && error.message) || error) })
      }
    },
  }), 'dsh-term-dict: session-layers route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/schema-scan',
    handler: (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: '只支持 GET' })
      const params = new URL(req.url || '/', 'http://localhost').searchParams
      const field = validModuleName(params.get('field') || '')
      if (!field) return sendJson(res, 400, { ok: false, error: '模块名不对' })
      sendJson(res, 200, { ok: true, field, scan: schemaScan(field) })
    },
  }), 'dsh-term-dict: schema-scan route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/schema/module-remove',
    handler: async (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: '只支持 POST' })
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        const field = validModuleName(body.field)
        if (!field) return sendJson(res, 400, { ok: false, error: '模块名不对' })
        if (LOCKED_MODULES.indexOf(field) !== -1) {
          return sendJson(res, 400, { ok: false, error: '「' + field + '」参与命中匹配，不能删除' })
        }
        const cur = loadSettings()
        if (cur.schema.modules.indexOf(field) === -1) {
          return sendJson(res, 400, { ok: false, error: '模块清单里没有「' + field + '」' })
        }
        const scan = schemaScan(field)
        const schema = JSON.parse(JSON.stringify(cur.schema))
        schema.modules = schema.modules.filter((f) => f !== field)
        const inTypes = []
        for (const id of TYPE_IDS) {
          if (schema.types[id].modules.indexOf(field) !== -1) {
            inTypes.push(id)
            schema.types[id].modules = schema.types[id].modules.filter((f) => f !== field)
          }
        }
        const now = Date.now()
        schema.pending = (schema.pending || []).filter((p) => p.field !== field)
        schema.pending.push({ field, at: now, executeAt: now + DAY_MS, in: inTypes })
        const next = saveSettings({ schema })
        sendJson(res, 200, { ok: true, settings: next, scan, executeAt: now + DAY_MS })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String((error && error.message) || error) })
      }
    },
  }), 'dsh-term-dict: schema module-remove route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/schema/module-cancel',
    handler: async (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: '只支持 POST' })
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        const field = validModuleName(body.field)
        if (!field) return sendJson(res, 400, { ok: false, error: '模块名不对' })
        const cur = loadSettings()
        const schema = JSON.parse(JSON.stringify(cur.schema))
        const pendingItem = (schema.pending || []).find((p) => p.field === field)
        const inTypes = (pendingItem && Array.isArray(pendingItem.in)) ? pendingItem.in : []
        const names = schema.modules.concat([field])
        schema.modules = MODULE_FIELDS.filter((f) => names.indexOf(f) !== -1)
          .concat(names.filter((f) => MODULE_FIELDS.indexOf(f) === -1))
        for (const id of TYPE_IDS) {
          if (inTypes.indexOf(id) === -1) continue
          schema.types[id].modules = schema.modules.filter((f) => schema.types[id].modules.indexOf(f) !== -1 || f === field)
        }
        schema.pending = (schema.pending || []).filter((p) => p.field !== field)
        const next = saveSettings({ schema })
        sendJson(res, 200, { ok: true, settings: next })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String((error && error.message) || error) })
      }
    },
  }), 'dsh-term-dict: schema module-cancel route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/schema/module-add',
    handler: async (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: '只支持 POST' })
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        const field = validModuleName(body.name !== undefined ? body.name : body.field)
        if (!field) return sendJson(res, 400, { ok: false, error: '模块名不对（1~12 个字，不能带冒号）' })
        const cur = loadSettings()
        if (cur.schema.modules.indexOf(field) !== -1) {
          return sendJson(res, 400, { ok: false, error: '模块清单里已经有「' + field + '」' })
        }
        if ((cur.schema.pending || []).some((p) => p.field === field)) {
          return sendJson(res, 400, { ok: false, error: '这个模块还在待删名单里，先撤销' })
        }
        const schema = JSON.parse(JSON.stringify(cur.schema))
        const names = schema.modules.concat([field])
        schema.modules = MODULE_FIELDS.filter((f) => names.indexOf(f) !== -1)
          .concat(names.filter((f) => MODULE_FIELDS.indexOf(f) === -1))
        const next = saveSettings({ schema })
        sendJson(res, 200, { ok: true, settings: next })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String((error && error.message) || error) })
      }
    },
  }), 'dsh-term-dict: schema module-add route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/schema/module-def',
    handler: async (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: '只支持 POST' })
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        const field = validModuleName(body.field)
        if (!field) return sendJson(res, 400, { ok: false, error: '模块名不对' })
        const cur = loadSettings()
        if (cur.schema.modules.indexOf(field) === -1) {
          return sendJson(res, 400, { ok: false, error: '模块清单里没有「' + field + '」' })
        }
        const schema = JSON.parse(JSON.stringify(cur.schema))
        const def = schema.moduleDefs[field] || {}
        if (body.hint !== undefined) def.hint = String(body.hint).slice(0, 200)
        if (body.multiline !== undefined) def.multiline = Boolean(body.multiline)
        if (body.inject !== undefined) def.inject = field === '别称' ? false : Boolean(body.inject)
        schema.moduleDefs[field] = def
        const next = saveSettings({ schema })
        sendJson(res, 200, { ok: true, settings: next })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String((error && error.message) || error) })
      }
    },
  }), 'dsh-term-dict: schema module-def route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/schema/type-enable',
    handler: async (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: '只支持 POST' })
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        const type = String(body.type || '').trim()
        const cur = loadSettings()
        if (!cur.schema.types[type]) return sendJson(res, 400, { ok: false, error: '类型不对' })
        const schema = JSON.parse(JSON.stringify(cur.schema))
        schema.types[type].enabled = body.enabled === undefined ? !schema.types[type].enabled : Boolean(body.enabled)
        const next = saveSettings({ schema })
        sendJson(res, 200, { ok: true, settings: next })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String((error && error.message) || error) })
      }
    },
  }), 'dsh-term-dict: schema type-enable route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/schema/type-module',
    handler: async (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: '只支持 POST' })
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        const type = String(body.type || '').trim()
        const field = validModuleName(body.field)
        if (!field) return sendJson(res, 400, { ok: false, error: '模块名不对' })
        const cur = loadSettings()
        if (!cur.schema.types[type]) return sendJson(res, 400, { ok: false, error: '类型不对' })
        if (cur.schema.modules.indexOf(field) === -1) {
          return sendJson(res, 400, { ok: false, error: '这个模块已不在模块清单里' })
        }
        const schema = JSON.parse(JSON.stringify(cur.schema))
        const has = schema.types[type].modules.indexOf(field) !== -1
        const want = body.enabled === undefined ? !has : Boolean(body.enabled)
        if (field === '别称' && want === false) {
          return sendJson(res, 400, { ok: false, error: '「别称」参与命中匹配，不能在类型里取消' })
        }
        schema.types[type].modules = schema.modules.filter((f) => (want
          ? (schema.types[type].modules.indexOf(f) !== -1 || f === field)
          : (schema.types[type].modules.indexOf(f) !== -1 && f !== field)))
        const next = saveSettings({ schema })
        sendJson(res, 200, { ok: true, settings: next })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String((error && error.message) || error) })
      }
    },
  }), 'dsh-term-dict: schema type-module route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/schema/type-add',
    handler: async (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: '只支持 POST' })
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        const name = String(body.name || '').trim().slice(0, 24)
        if (!name) return sendJson(res, 400, { ok: false, error: '类型名不能为空' })
        const cur = loadSettings()
        const exists = Object.values(cur.schema.types).some((t) => t.label === name) || Boolean(cur.schema.types[name])
        if (exists) return sendJson(res, 400, { ok: false, error: '已有同名类型' })
        const schema = JSON.parse(JSON.stringify(cur.schema))
        schema.types[name] = { label: name, enabled: true, modules: ['别称'] }
        const next = saveSettings({ schema })
        sendJson(res, 200, { ok: true, id: name, settings: next })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String((error && error.message) || error) })
      }
    },
  }), 'dsh-term-dict: schema type-add route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/schema/type-scan',
    handler: (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: '只支持 GET' })
      const type = new URL(req.url || '/', 'http://localhost').searchParams.get('type') || ''
      const cur = loadSettings()
      if (!cur.schema.types[type]) return sendJson(res, 400, { ok: false, error: '类型不对' })
      let total = 0
      const samples = []
      for (const file of dictFilesAll()) {
        for (const entry of parseEntries(readText(file))) {
          if (kindOf(entry.fields, cur.schema) !== type) continue
          total += 1
          if (samples.length < 5) samples.push(entry.term)
        }
      }
      sendJson(res, 200, { ok: true, type, scan: { total, samples } })
    },
  }), 'dsh-term-dict: schema type-scan route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/schema/type-remove',
    handler: async (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: '只支持 POST' })
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        const type = String(body.type || '').trim()
        const cur = loadSettings()
        if (!cur.schema.types[type]) return sendJson(res, 400, { ok: false, error: '类型不对' })
        if (TYPE_IDS.indexOf(type) !== -1) {
          return sendJson(res, 400, { ok: false, error: '内置类型不能删除，只能停用' })
        }
        if ((cur.schema.pendingTypes || []).some((p) => p.type === type)) {
          return sendJson(res, 400, { ok: false, error: '这个类型已经在待删名单里' })
        }
        let total = 0
        for (const file of dictFilesAll()) {
          for (const entry of parseEntries(readText(file))) {
            if (kindOf(entry.fields, cur.schema) === type) total += 1
          }
        }
        const schema = JSON.parse(JSON.stringify(cur.schema))
        const wasEnabled = schema.types[type].enabled !== false
        schema.types[type].enabled = false
        const now = Date.now()
        schema.pendingTypes = (schema.pendingTypes || []).filter((p) => p.type !== type)
        schema.pendingTypes.push({ type, at: now, executeAt: now + DAY_MS, wasEnabled })
        const next = saveSettings({ schema })
        sendJson(res, 200, { ok: true, settings: next, scan: { total }, executeAt: now + DAY_MS })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String((error && error.message) || error) })
      }
    },
  }), 'dsh-term-dict: schema type-remove route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/schema/type-unremove',
    handler: async (req, res) => {
      if (!isTrusted(req)) return sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: '只支持 POST' })
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        const type = String(body.type || '').trim()
        const cur = loadSettings()
        const item = (cur.schema.pendingTypes || []).find((p) => p.type === type)
        if (!item) return sendJson(res, 400, { ok: false, error: '这个类型不在待删名单里' })
        const schema = JSON.parse(JSON.stringify(cur.schema))
        schema.pendingTypes = (schema.pendingTypes || []).filter((p) => p.type !== type)
        if (schema.types[type]) schema.types[type].enabled = item.wasEnabled !== false
        const next = saveSettings({ schema })
        sendJson(res, 200, { ok: true, settings: next })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String((error && error.message) || error) })
      }
    },
  }), 'dsh-term-dict: schema type-unremove route')
}

/**
 * 注册工具、路由与内置技能。
 *
 * 2026-10-18 工具减法：三个工具（lookup/write/lint，目录 2,531 字节）并成一个入口
 * `dict`，用 action 选动作。做法是先把原注册体接到一个收集器上，再注册伞形工具，
 * 三个具体实现的 execute/render 原样复用 —— 行为不变，只是目录里少两条。
 */
export function apply(ctx) {
  // 默认初始状态：新装的通用层先有一条称谓型词条（模块齐全）；已有字典不覆盖。
  try {
    seedGeneral()
  } catch (error) {
    try {
      ctx.logger?.warn?.(`dsh-term-dict: 默认词条没写进去：${error instanceof Error ? error.message : String(error)}`)
    } catch {
      /* 日志不可用不影响工具 */
    }
  }
  const parts = {}
  const sink = {
    register: (def) => {
      const key = String(def?.name ?? '').replace('dict-', '')
      if (key === 'lookup' || key === 'write' || key === 'lint') parts[key] = def
    },
  }
  const toolCtx = new Proxy(ctx, {
    get(target, prop, receiver) {
      if (prop === 'tools') return sink
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  applyInner(toolCtx)

  // 工具定义只构造一次；注册动作在下面的模式门里按 agent 作用域做（2026-11-07）。
  const DICT_TOOL = defineTool({
    name: 'dict',
    description: '术语字典（一个入口）：action=lookup 查（不传 term 列索引；传 term 给词条正文，**别名也查得到**；可传 layer／domain 收窄）；action=write 增或改一条并落盘（term 必填；definition 与 defaultRef 至少给一个；layer 必填，任务层要 domain；可补 boundary／counterExample／aliases／precedence／status／note；写前自动备份）；action=lint 体检（空定义／缺状态／重名／别称冲突／跨层同名同义）；action=mute／unmute 把**当前会话**加到／移出「不灌注词条」名单（用户说"这个会话别灌词条"时用）。涉及术语口径先 lookup，定下新口径用 write 落条，改完跑 lint。',
    parameters: {
      action: { type: 'string', required: true, description: 'lookup（查）｜write（写）｜lint（体检）｜mute（本会话不灌注）｜unmute（恢复本会话灌注）' },
      term: { type: 'string', description: '词条名（lookup 不填＝列索引；write 必填）' },
      layer: { type: 'string', description: '限定层／写入层：通用／任务，或 general／task（write 必填）' },
      domain: { type: 'string', description: '任务名（如 story-writing；layer=任务 时必填）' },
      definition: { type: 'string', description: '定义：一句话说清它是什么（write 用）' },
      boundary: { type: 'string', description: '边界：它不是什么（write 可选）' },
      defaultRef: { type: 'string', description: '默认指代：这个词默认优先指的那件事（write 可选，与 definition 至少给一个）' },
      counterExample: { type: 'string', description: '反例：出现这个就不算它（write 可选）' },
      aliases: { type: 'string', description: '别称：逗号分隔（write 可选；写了也查得到）' },
      precedence: { type: 'string', description: '排他性：撞名时认哪条（write 可选）' },
      status: { type: 'string', description: '状态：已确认／部分确认／待观察／已废（write 可选，默认 待观察）' },
      note: { type: 'string', description: '备注（write 可选）' },
      type: { type: 'string', description: '词条类型（write 可选）：称谓型／落点型／留档型或自定义类型名；给了就写进词条的「类型」字段' },
    },
    output: {
      schema: OUT_SCHEMA,
      render: (args, value) => {
        const tool = parts[String(args?.action ?? '').trim()]
        return tool && tool.output && typeof tool.output.render === 'function'
          ? tool.output.render(args, value)
          : [{ type: 'text', text: String(value?.text ?? '') }]
      },
    },
    async execute(args, exec) {
      const action = String(args?.action ?? '').trim()
      if (action === 'mute' || action === 'unmute') {
        const session = exec && exec.agent && exec.agent.session
        const sid = session && session.id ? String(session.id) : ''
        if (!sid) throw new Error('拿不到当前会话 id，切不了灌注开关')
        const cur = loadSettings()
        const list = cur.skipSessions.slice()
        const at = list.indexOf(sid)
        if (action === 'mute' && at === -1) list.push(sid)
        if (action === 'unmute' && at !== -1) list.splice(at, 1)
        const next = saveSettings({ skipSessions: list })
        return {
          ok: true,
          text: (action === 'mute' ? '✅ 这个会话不再灌注词条' : '✅ 这个会话恢复灌注词条')
            + '（当前静音会话 ' + next.skipSessions.length + ' 个）',
        }
      }
      const tool = parts[action]
      if (!tool) throw new Error('action 只能是 lookup（查）／write（写）／lint（体检）／mute（本会话不灌注）／unmute（恢复灌注）')
      const rest = { ...args }
      delete rest.action
      return tool.execute(rest)
    },
  })

  // 自动激活（首次触发即注入）：用户消息／AI 思考／AI 输出三面都扫，只在本模式里跑。
  try {
    installActivation(ctx)
  } catch (error) {
    try {
      ctx.logger?.warn?.(`dsh-term-dict: 自动激活没挂上：${error instanceof Error ? error.message : String(error)}`)
    } catch {
      /* 日志不可用不影响工具 */
    }
  }

  // 词条结构：执行到期的模块删除（确认后 24 小时）。启动时一次，之后每 10 分钟一次。
  try { sweepSchema() } catch { /* 到期清理失败不影响启动 */ }
  try {
    const timer = setInterval(() => { try { sweepSchema() } catch { /* 下一轮再试 */ } }, 10 * 60 * 1000)
    if (timer && typeof timer.unref === 'function') timer.unref()
  } catch { /* 没有定时器就只靠启动清理 */ }

  // 模式门：通用会话（无模式／判不出模式）默认注册字典工具；其余模式默认不注册，只有设置里
  // presets 勾了才注册（别的模式从未注册过，模型第一步就看不到，也不会留「工具已更新 · 移除」）。
  // 切模式时按判到的 preset 注册／注销，dispose 挂在 agent 作用域上自动回收。
  // 技能面板里的词条用法技能是用户手动调用的，不在此列。
  const dictToolGate = new WeakMap()
  const gateDictTool = (agent, allowHeader) => {
    try {
      const session = agent && agent.session
      if (!session || !session.id) return
      let preset = presetOfSession(ctx, session)
      // 新建/恢复时档可能还没写全：档头（创建时的 agentPreset）在这一步是准的，只在 agent/created 兜底；
      // pre-step 不兜——切过模式后档头是旧值，会把工具错注册回别的模式。
      if (preset === undefined && allowHeader === true) {
        const header = session.header
        if (header && typeof header.agentPreset === 'string' && header.agentPreset.length > 0) preset = header.agentPreset
      }
      const allow = loadSettings().presets
      const allowed = (typeof preset !== 'string' || preset.length === 0)
        ? true
        : allow.indexOf(preset) !== -1
      const held = dictToolGate.get(agent)
      if (allowed) {
        if (!held) dictToolGate.set(agent, agent.ctx.tools.register(DICT_TOOL))
      } else if (held) {
        held()
        dictToolGate.delete(agent)
      }
    } catch {
      /* 注册不进去：保持现状——不拦主流程 */
    }
  }
  try {
    ctx.on('agent/created', ({ agent }) => {
      try { gateDictTool(agent, true) } catch { /* 拿不到就先放着 */ }
    })
    ctx.on('agent/pre-step', ({ agent }, next) => {
      try { gateDictTool(agent, false) } catch { /* 判不出就维持现状 */ }
      return next()
    })
  } catch {
    /* 组合里没有 agent 事件：工具不注册（模型看不到） */
  }
}

/** 原注册体：三个工具定义照旧写，注册动作被上面的包装层接住（不落进真注册表）。 */
function applyInner(ctx) {
  ctx.tools.register(defineTool({
    name: 'dict-lookup',
    description: '查术语字典（两级：通用／任务）。不传 term＝列各层词条索引；传 term＝给词条正文（含定义／边界／反例／别称／排他性／状态／备注）。**别名也查得到**（词条「别称」里列的叫法与词条名等价）。默认扫通用层与全部任务层；要收窄就传 layer／domain。涉及术语口径（"你说的 X 指什么"）时先跑它。',
    parameters: {
      term: { type: 'string', description: '词条名（不填＝只列索引）' },
      layer: { type: 'string', description: '限定层：通用／任务，或 general／task（领域、domain 也认）；不填＝全部' },
      domain: { type: 'string', description: '任务名（如 story-writing）；不填时自动列出 dict\\domains 下的全部任务文件' },
    },
    output: {
      schema: OUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(args) {
      const targets = collectTargets(args || {})
      if (targets.length === 0) return { ok: false, text: '没有可检索的层（layer／domain 组合后为空）。' }
      const term = args && args.term ? String(args.term).trim() : ''
      if (!term) {
        const lines = []
        for (const t of targets) {
          const entries = parseEntries(readText(t.file))
          if (entries.length === 0) {
            lines.push('【' + t.label + '】' + (existsSync(t.file) ? '（暂无词条）' : '（文件未建：' + t.file + '）'))
            continue
          }
          lines.push('【' + t.label + '】' + entries.length + ' 条')
          for (const e of entries) lines.push('  - ' + e.term + '（' + (e.fields['状态'] || '缺状态') + '）')
        }
        return { ok: true, text: lines.join('\n') }
      }
      let hits = []
      for (const t of targets) {
        for (const e of parseEntries(readText(t.file))) {
          const alias = aliasesOf(e)
          if (e.term === term) hits.push({ t, e, exact: true, by: 'term' })
          else if (alias.indexOf(term) !== -1) hits.push({ t, e, exact: true, by: 'alias' })
          else if (e.term.indexOf(term) !== -1 || term.indexOf(e.term) !== -1) hits.push({ t, e, exact: false, by: '' })
          else if (alias.some((a) => a.indexOf(term) !== -1 || term.indexOf(a) !== -1)) hits.push({ t, e, exact: false, by: 'alias' })
        }
      }
      hits = hits.filter(Boolean)
      // 未收录是正常业务结果、不是工具失败：一律返回 ok:true，结论只写进 text。
      // （旧写法未命中返回 ok:false，查不到时会被当成工具报错——搜索没有结果就出错的 bug 在此。）
      if (hits.length === 0) {
        const near = nearWords(term, targets)
        if (near.length === 0) {
          return { ok: true, text: '未收录「' + term + '」。检索范围：' + targets.map((t) => t.label).join('、') }
        }
        return {
          ok: true,
          text: '未收录「' + term + '」。\n疑似同一词（类似的词，说不定就是同一个）：\n'
            + near.map((n) => '- ' + n.term + '（' + n.layer + '，与「' + term + '」只差 ' + n.d + ' 个字）').join('\n')
            + '\n\n检索范围：' + targets.map((t) => t.label).join('、'),
        }
      }
      hits.sort((a, b) => Number(b.exact) - Number(a.exact))
      const text = hits.map((h) => '【' + h.t.label + '】' + (h.by === 'alias' ? '（命中别称「' + term + '」）' : (h.exact ? '' : '（近似匹配）')) + '\n' + renderEntry(h.e)).join('\n\n')
      return { ok: true, text }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'dict-write',
    description: '写术语字典：增或改一条词条并落盘（写前把原文件备份成同名 .bak）。term 必填，definition 与 defaultRef 至少给一个（三类词条：称谓型＝给东西起的名字，写 definition；落点型＝一般词默认指哪件事／哪份文件／哪条命令，只写 defaultRef；留档型＝已废，写 definition 说明为什么不用，状态给 已废）。layer 必填；任务层要 domain。同名词条＝更新（未给的字段保留原值）。可选补：boundary 边界、counterExample 反例、aliases 别称、precedence 排他性（撞名时认哪条）、status、note。收录判据：约定俗称的称谓，或一个词在我们这儿默认优先指的那件事（不记下次还得重对）。',
    parameters: {
      term: { type: 'string', required: true, description: '词条名' },
      definition: { type: 'string', required: true, description: '定义：一句话说清它是什么' },
      layer: { type: 'string', required: true, description: '落哪层：通用／任务，或 general／task（领域、domain 也认）' },
      domain: { type: 'string', description: '任务名（layer=任务 时必填，如 story-writing）' },
      boundary: { type: 'string', description: '边界：它不是什么（可选）' },
      defaultRef: { type: 'string', description: '默认指代：这个词单独出现、没有别的限定时默认优先指的那件事（可选）' },
      counterExample: { type: 'string', description: '反例：一个具体例子——出现这个就不算它（会并进「边界」写成「例：…」）' },
      aliases: { type: 'string', description: '别称：同一物还有哪些叫法，逗号分隔（可选；写了这些叫法也查得到本条）' },
      precedence: { type: 'string', description: '排他性：跟别的词条撞名时认哪条（会并进「备注」写成「排他性＝…」；留空＝按 任务>通用）' },
      status: { type: 'string', description: '状态：已确认／部分确认／待观察／已废（默认 待观察）。已废＝本阶段不用，不代表这个词以后永不录用、也不代表不能改好复出' },
      note: { type: 'string', description: '备注（可选，如待定项、出处）' },
      type: { type: 'string', description: '词条类型（可选）：称谓型／落点型／留档型或自定义类型名；写入词条的「类型」字段，不写就按字段推断' },
    },
    output: {
      schema: OUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(args) {
      const term = String(args.term || '').trim()
      const definition = String(args.definition || '').trim()
      const defaultRef = String(args.defaultRef || '').trim()
      if (!term) throw new Error('term 必填')
      if (!definition && !defaultRef) throw new Error('definition 与 defaultRef 至少给一个（落点型可只给 defaultRef）')
      const layerRaw = String(args.layer || '').trim()
      const fields = {}
      if (definition) fields['定义'] = definition
      if (args.boundary) fields['边界'] = String(args.boundary).trim()
      if (args.defaultRef) fields['默认指代'] = String(args.defaultRef).trim()
      if (args.counterExample) fields['边界'] = (fields['边界'] ? fields['边界'] + ' ' : '') + '例：' + String(args.counterExample).trim()
      if (args.aliases) fields['别称'] = String(args.aliases).trim()
      const status = args.status ? String(args.status).trim() : '待观察'
      if (STATUSES.indexOf(status) === -1) throw new Error('status 只能是：' + STATUSES.join('／'))
      fields['状态'] = status
      if (args.note) fields['备注'] = String(args.note).trim()
      if (args.precedence) fields['备注'] = (fields['备注'] ? fields['备注'] + ' ' : '') + '排他性＝' + String(args.precedence).trim()
      if (args.type) {
        const wanted = String(args.type).trim()
        const types = loadSettings().schema.types || {}
        const found = Object.keys(types).find((id) => id === wanted || types[id].label === wanted)
        if (!found) throw new Error('没有这个类型：' + wanted + '（先在设置面板「词条结构」里加类型）')
        fields['类型'] = types[found].label
      }

      let file = ''
      let kind = ''
      let domain = ''
      if (/通用|general/i.test(layerRaw)) {
        kind = 'general'
        file = GENERAL_FILE
      } else if (/任务|领域|domain|task/i.test(layerRaw)) {
        domain = args.domain ? String(args.domain).trim() : ''
        if (!domain) throw new Error('layer=任务 时必须给 domain（如 story-writing）')
        kind = 'domain'
        file = join(DOMAIN_DIR, domain + '.md')
      } else {
        throw new Error('layer 只能是：通用／任务（或 general／domain）')
      }

      const res = upsert(file, kind, domain, term, fields)
      const entry = parseEntries(readText(file)).find((e) => e.term === term)
      return {
        ok: true,
        text: (res.created ? '✅ 新建词条' : '✅ 已更新词条') + '：' + term + '（' + status + '）\n落点：' + file + '\n\n' + (entry ? renderEntry(entry) : ''),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'dict-lint',
    description: '术语字典体检（只读）：查空定义、缺状态、非标准状态、同层重名、**别称冲突（同层撞名／与别的词条名撞车／跨层被多条共用）**、跨层同名同义（可删重）、跨层同名异义却没写排他性；跨层同名异义的正常情形另出「审计（非问题）」行，说明认哪条。改完字典跑一次。',
    parameters: {
      domain: { type: 'string', description: '任务名；不填＝扫 dict\\domains 下全部任务' },
    },
    output: {
      schema: OUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: (value.ok ? '✅ 字典体检通过' : '❌ 有 ' + String(value.text).split('\n').length + ' 条问题') + '：\n' + value.text }],
    },
    async execute(args) {
      const targets = collectTargets(args || {})
      const problems = []
      const audits = []
      const seen = new Map()
      const allAlias = new Map()
      for (const t of targets) {
        const entries = parseEntries(readText(t.file))
        const local = new Set()
        const localIndex = new Map()
        for (const e of entries) {
          const hasDef = String(e.fields['定义'] || '').trim() !== ''
          const hasRef = String(e.fields['默认指代'] || '').trim() !== ''
          if (!hasDef && !hasRef) problems.push(t.label + '｜' + e.term + '：缺定义（落点型可只写「默认指代」）')
          const st = e.fields['状态']
          if (!st) problems.push(t.label + '｜' + e.term + '：缺状态')
          else if (STATUSES.indexOf(st) === -1) problems.push(t.label + '｜' + e.term + '：状态非标准（' + st + '）')
          if (local.has(e.term)) problems.push(t.label + '｜' + e.term + '：同层重名')
          local.add(e.term)
          localIndex.set(e.term, e)
          const arr = seen.get(e.term) || []
          arr.push(t.label)
          seen.set(e.term, arr)
        }
        // 别名：同层撞名、别名与同层其它词条名撞车，都算冲突（撞了查出来就是两条，认哪条不知道）
        const aliasSeen = new Map()
        for (const e of entries) {
          for (const a of aliasesOf(e)) {
            if (a === e.term) problems.push(t.label + '｜' + e.term + '：别称与词条名相同')
            else if (localIndex.has(a)) problems.push(t.label + '｜' + e.term + '：别称「' + a + '」与同层词条重名')
            const map = aliasSeen.get(a) || new Map()
            map.set(e.term, true)
            aliasSeen.set(a, map)
          }
        }
        for (const [a, owners] of aliasSeen) {
          const names = Array.from(owners.keys())
          if (names.length > 1) problems.push(t.label + '｜别称「' + a + '」被多条共用（' + names.join('、') + '）')
        }
        for (const [term, e] of localIndex) {
          for (const a of aliasesOf(e)) {
            const map = allAlias.get(a) || new Map()
            map.set(e.term, true)
            allAlias.set(a, map)
          }
        }
      }
      for (const [term, labels] of seen) {
        if (labels.length < 2) continue
        // 跨层同名是分层本来就会有的：定义不同＝各层各说各的，不报问题，只出审计行；
        // 定义完全相同＝高层白抄一份，报「可删重」。
        const defs = new Set()
        for (const t of targets) {
          const e = parseEntries(readText(t.file)).find((x) => x.term === term)
          if (e) defs.add(String(e.fields['定义'] || ''))
        }
        if (defs.size === 1) problems.push(term + '：跨层同名且定义相同（' + labels.join('、') + '），可删掉一份只留最通用的一层')
        const miss = []
        if (defs.size > 1) {
          for (const t of targets) {
            const e = parseEntries(readText(t.file)).find((x) => x.term === term)
            if (e && !/排他性/.test(String(e.fields['备注'] || ''))) miss.push(t.label)
          }
        }
        if (miss.length > 0) problems.push(term + '：跨层同名、定义不同、却没写排他性（' + miss.join('、') + '）——不写就按 任务>通用 认')
        audits.push(term + '：跨层同名（' + labels.join('、') + '）→ 按 任务 > 通用 认；要反过来就在「排他性」字段写明')
      }
      for (const [alias, owners] of allAlias) {
        const names = Array.from(owners.keys())
        if (names.length < 2) continue
        if (seen.has(alias)) problems.push('别称「' + alias + '」与词条名「' + alias + '」撞车（' + names.concat([alias]).join('、') + '）')
        else problems.push('别称「' + alias + '」跨层被多条共用（' + names.join('、') + '）')
      }
      // 模糊审查：名字只差一个字的两条词条，可能是同一个词——确认是合并还是并进别称
      const flat = []
      for (const t of targets) {
        for (const e of parseEntries(readText(t.file))) {
          flat.push({ label: t.label, entry: e, name: e.term })
          for (const a of aliasesOf(e)) flat.push({ label: t.label, entry: e, name: a })
        }
      }
      for (let i = 0; i < flat.length; i++) {
        for (let j = i + 1; j < flat.length; j++) {
          const A = flat[i]
          const B = flat[j]
          if (A.entry === B.entry) continue
          if (A.name.length < 4 || A.name.length !== B.name.length) continue
          if (editDistance(A.name, B.name) !== 1) continue
          problems.push('疑似同一个词：「' + A.name + '」（' + A.label + '）与「' + B.name + '」（' + B.label + '）只差一个字——确认是合并还是并进别称')
        }
      }
      return {
        ok: problems.length === 0,
        text: (problems.length ? problems.join('\n') : '（无问题）') + (audits.length ? '\n\n审计（非问题）：\n' + audits.join('\n') : ''),
      }
    },
  }))

  registerRoutes(ctx)

  // 内置技能（bundled 来源，rank 600 与官方 bundled 技能一致）——单 provider 挂全部技能
  const skillEntries = [
    { name: 'term-dict-workflow', description: '术语字典用法：两级（通用/任务）各收什么、收录判据、词条格式（定义/边界/反例/别称/排他性）与状态用法、撞名认哪条、何时查何时写', file: 'term-dict-workflow.md' },
  ]
  ctx.skills.registerProvider(() => ({
    name: 'dsh-term-dict',
    list: () => Promise.resolve(skillEntries.map((s) => ({
      name: s.name,
      description: s.description,
      invocation: { modelInvocable: false, userInvocable: true },
      provider: 'dsh-term-dict',
      source: 'bundled',
      resourceBase: { kind: 'directory', path: fileURLToPath(new URL('./assets/', import.meta.url)) },
      rank: BUNDLED_SKILL_RANK,
      locator: new URL(`./assets/${s.file}`, import.meta.url),
    }))),
    async get(candidate) {
      const s = skillEntries.find((x) => x.name === candidate.name) ?? skillEntries[0]
      return { ...candidate, content: readFileSync(new URL(`./assets/${s.file}`, import.meta.url), 'utf8') }
    },
  }))
}
