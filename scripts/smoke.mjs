#!/usr/bin/env node
/**
 * 本机冒烟：不起应用、不发网络请求；默认词条用例只写系统临时目录，结束即删。
 *
 * 七关：
 *   1. 包结构      —— 要发布的文件都在（含已提交的 lib/client.js）
 *   2. 组合声明    —— dsh.bundle.patch 指向的文件在，里面的 insert id/name 等于包名；客户端声明齐
 *   3. 宿主半边    —— index.js 导出名等于包名，工具名、路由前缀与 23 条路由都在
 *   4. 自动激活    —— activation.js 的默认值带 presets（空数组＝所有模式），且导出模式判定函数
 *   5. 默认词条    —— 全新 DSH_HOME 首次写入一条称谓型词条，已有字典不覆盖
 *   6. 客户端产物  —— 外壳 id == 包名，产物里带本插件路由、模式白名单字段与面板文案
 *   7. 环境残留    —— 包内没有私有插件前缀、本机绝对路径、用户名
 *
 * 用法：node scripts/smoke.mjs   （任一条失败退出码 1）
 */

import { readFileSync, existsSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const problems = []
// 默认词条用例用临时 DSH_HOME：必须在 import activation.js 之前设置（它载入时读）。
const TMP_HOME = mkdtempSync(join(tmpdir(), 'dsh-term-dict-smoke-'))
process.env.DSH_HOME = TMP_HOME
const cleanup = () => { try { rmSync(TMP_HOME, { recursive: true, force: true }) } catch { /* 删不掉不影响判据 */ } }

const ok = (label, extra = '') => console.log('ok   ' + label + (extra ? '  ' + extra : ''))
const fail = (label, why) => {
  problems.push(label + ': ' + why)
  console.log('FAIL ' + label + '  ' + why)
}

/** 1. 包结构 */
const REQUIRED = [
  'index.js',
  'activation.js',
  'cordis.patch.yml',
  'assets/term-dict-workflow.md',
  'src/entry.jsx',
  'src/term-text.js',
  'lib/client.js',
  'README.md',
  'README.en.md',
  'LICENSE',
  'scripts/smoke.mjs',
  'scripts/build-client.mjs',
]
const missing = REQUIRED.filter((rel) => !existsSync(join(root, rel)))
if (missing.length > 0) fail('结构', '缺 ' + missing.join('、'))
else ok('结构', REQUIRED.length + ' 个必需文件齐全')

/** 2. 组合声明：dsh plugin add 靠这一条把包接进层栈 */
const patchRel = pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch
if (!patchRel) fail('组合声明', 'package.json 没声明 dsh.bundle.patch')
else if (!existsSync(join(root, patchRel))) fail('组合声明', 'dsh.bundle.patch 指向的文件不存在：' + patchRel)
else {
  const patch = readFileSync(join(root, patchRel), 'utf8')
  if (!patch.includes('id: ' + pkg.name)) fail('组合声明', patchRel + ' 里没有 id: ' + pkg.name)
  else if (!patch.includes('name: ' + pkg.name)) fail('组合声明', patchRel + ' 里没有 name: ' + pkg.name)
  else ok('组合声明', 'dsh.bundle.patch → ' + patchRel + '（id 与 name 都是 ' + pkg.name + '）')
}
if (!pkg.dsh || !pkg.dsh.client || pkg.dsh.client.platform !== 'web') fail('组合声明', 'dsh.client.platform 不是 web')
if (!pkg.exports || pkg.exports['./client'] !== './lib/client.js') fail('组合声明', 'exports["./client"] 没指向 ./lib/client.js')
if (pkg.files && (!pkg.files.includes('lib/client.js') || !pkg.files.includes('src') || !pkg.files.includes('assets'))) {
  fail('组合声明', 'files 里缺 lib/client.js、src 或 assets')
}

/** 3. 宿主半边：源码级断言（宿主入口依赖 @deepseek-ai/* 服务，不在包里解析，故只查静态标记） */
const hostSrc = readFileSync(join(root, 'index.js'), 'utf8')
if (!hostSrc.includes("export const name = '" + pkg.name + "'")) fail('宿主半边', 'index.js 的 export name 不等于包名 ' + pkg.name)
else ok('宿主半边', 'name = ' + pkg.name)

const TOOLS = ['dict', 'dict-lookup', 'dict-write', 'dict-lint']
const missingTools = TOOLS.filter((tool) => !hostSrc.includes("name: '" + tool + "'"))
if (missingTools.length > 0) fail('宿主半边', '缺工具：' + missingTools.join('、'))
else ok('宿主半边', TOOLS.length + ' 条工具已注册')

if (!hostSrc.includes("const API_PREFIX = '/" + pkg.name + "/api'")) fail('宿主半边', 'API_PREFIX 不是 /' + pkg.name + '/api')

const ROUTES = [
  'list', 'read', 'write', 'rename', 'create-layer', 'delete-layer', 'workspace', 'workspaces', 'settings', 'presets',
  'session-state', 'session-mute', 'session-mute-clear', 'session-layers',
  'schema-scan', 'schema/module-remove', 'schema/module-cancel', 'schema/module-add',
  'schema/module-def', 'schema/type-enable', 'schema/type-module', 'schema/type-add',
  'schema/type-scan', 'schema/type-remove', 'schema/type-unremove',
]
const missingRoutes = ROUTES.filter((rel) => !hostSrc.includes("API_PREFIX + '/" + rel + "'"))
if (missingRoutes.length > 0) fail('宿主半边', '缺路由：' + missingRoutes.join('、'))
else ok('宿主半边', ROUTES.length + ' 条本机路由都在')

if (!hostSrc.includes("name: 'term-dict-workflow'")) fail('宿主半边', '技能 term-dict-workflow 没注册')
if (!hostSrc.includes("file: 'term-dict-workflow.md'")) fail('宿主半边', '技能文件没指向 assets/term-dict-workflow.md')

const trusted = (hostSrc.match(/!isTrusted\(req\)/g) || []).length
if (trusted !== ROUTES.length) fail('宿主半边', '同源守卫 ' + trusted + ' 处，应为 ' + ROUTES.length + ' 处')
else if (!hostSrc.includes('sec-fetch-site')) fail('宿主半边', '同源校验里没读 sec-fetch-site')
else ok('宿主半边', trusted + ' 条路由都过本机同源校验')

/** 4. 自动激活：默认值与模式判定 */
const act = await import(pathToFileURL(join(root, 'activation.js')).href)
const defaults = act.DEFAULT_SETTINGS || {}
if (!Array.isArray(defaults.presets)) fail('自动激活', 'DEFAULT_SETTINGS.presets 不是数组（默认应为空数组＝全开）')
else if (defaults.presets.length !== 0) fail('自动激活', 'DEFAULT_SETTINGS.presets 默认不是空数组（应为全开）')
else if (defaults.autoActivate !== true) fail('自动激活', 'DEFAULT_SETTINGS.autoActivate 默认不是 true')
else ok('自动激活', 'presets 默认空＝全开，用户可在面板改；autoActivate 默认开')
if (typeof act.modeAllowed !== 'function') fail('自动激活', '没导出 modeAllowed（模式白名单判定）')
else ok('自动激活', 'modeAllowed 已导出')

/** 5. 默认词条：全新 DSH_HOME 首次运行写两条称谓型词条，已有字典不覆盖 */
const seedFile = join(TMP_HOME, 'evolve', 'dict', 'general.md')
const seedRel = 'assets/general-default.md'
if (!existsSync(join(root, seedRel))) fail('默认词条', '缺 ' + seedRel)
else if (typeof act.seedGeneral !== 'function') fail('默认词条', 'activation.js 没导出 seedGeneral')
else if (!hostSrc.includes('seedGeneral()')) fail('默认词条', 'index.js 没调用 seedGeneral（首次运行不会预置）')
else {
  let firstSeed = false
  try { firstSeed = act.seedGeneral() } catch (error) {
    fail('默认词条', '首次写入抛错：' + (error && error.message ? error.message : error))
  }
  let again = 'throw'
  try { again = act.seedGeneral() } catch { /* 已有字典时抛错也算不合格 */ }
  const seeded = existsSync(seedFile) ? act.parseEntries(readFileSync(seedFile, 'utf8')) : []
  const byTerm = new Map(seeded.map((e) => [e.term, e]))
  const want = ['定义', '默认指代', '边界', '反例', '状态', '备注']
  const missing = []
  for (const term of ['词条', '词典']) {
    const entry = byTerm.get(term)
    if (!entry) { missing.push(term); continue }
    if (String(entry.fields['类型'] || '') !== '称谓型') missing.push(term + ' 类型不是称谓型')
    for (const k of want) if (!String(entry.fields[k] || '').trim()) missing.push(term + ' 缺' + k)
  }
  const dict = byTerm.get('词典')
  const ci = byTerm.get('词条')
  if (firstSeed !== true) fail('默认词条', '全新 DSH_HOME 下没写入默认词条')
  else if (again !== false) fail('默认词条', '已有字典时又写了一次（应返回 false）')
  else if (seeded.length !== 2) fail('默认词条', '应正好 2 条，实际 ' + seeded.length + ' 条')
  else if (missing.length > 0) fail('默认词条', missing.join('；'))
  else if (!(Array.isArray(ci.aliases) && ci.aliases.includes('词目'))) fail('默认词条', '词条的别称里没有「词目」')
  else if (!(Array.isArray(dict.aliases) && dict.aliases.includes('字典'))) fail('默认词条', '词典的别称里没有「字典」')
  else ok('默认词条', '全新 DSH_HOME 首次写入 2 条称谓型词条（词条、词典，模块齐全；已有字典不覆盖）')
}

/** 6. 客户端产物 */
const client = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
const idMatch = /^\s*id:\s*"([^"]+)"/m.exec(client)
if (!idMatch) fail('客户端产物', '外壳里找不到 id')
else if (idMatch[1] !== pkg.name) fail('客户端产物', '外壳 id 是 ' + idMatch[1] + '，应等于包名 ' + pkg.name)
else if (!client.includes('/' + pkg.name + '/api/settings')) fail('客户端产物', '产物里没有设置路由（源码改了但没重新构建）')
else if (!client.includes('/' + pkg.name + '/api/presets')) fail('客户端产物', '产物里没有模式清单路由（源码改了但没重新构建）')
else if (!client.includes('/' + pkg.name + '/api/workspaces')) fail('客户端产物', '产物里没有工作空间清单路由（源码改了但没重新构建）')
else if (!client.includes('presets')) fail('客户端产物', '产物里没有模式白名单字段（源码改了但没重新构建）')
else if (!client.includes('灌注的模式')) fail('客户端产物', '产物里没有「灌注的模式」面板文案（源码改了但没重新构建）')
else ok('客户端产物', 'id=' + pkg.name + '，' + Buffer.byteLength(client, 'utf8') + ' 字节')

/** 7. 环境残留：发布包里不能有只在本机成立的东西 */
// 模式串拆开拼，免得本文件自己被扫中
const PRIVATE_PREFIX = 'zz' + 'user-'
const LOCAL_USER = 'a' + '1835'
const LEAK = [
  { pattern: new RegExp(PRIVATE_PREFIX, 'g'), what: '私有插件前缀' },
  { pattern: /[A-Za-z]:[\\/]{1,2}(?:Users|用户|chajian|DSH)/g, what: '本机绝对路径' },
  { pattern: new RegExp(LOCAL_USER, 'g'), what: '本机用户名' },
]
const SKIP_DIR = ['node_modules', '.git']
function walk(dir, out = []) {
  for (const ent of readdirSync(dir)) {
    if (SKIP_DIR.includes(ent)) continue
    const full = join(dir, ent)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(js|mjs|jsx|json|yml|md)$/.test(ent)) out.push(full)
  }
  return out
}
const leaks = []
for (const file of walk(root)) {
  if (file.endsWith(join('lib', 'client.js'))) continue
  const text = readFileSync(file, 'utf8')
  for (const rule of LEAK) {
    const hits = text.match(rule.pattern)
    if (hits) leaks.push(file.replace(root + '\\', '') + ' → ' + rule.what + '×' + hits.length)
  }
}
if (leaks.length > 0) fail('环境残留', leaks.join('；'))
else ok('环境残留', '无私有前缀、无本机绝对路径、无用户名')

console.log('')
if (problems.length > 0) {
  console.error('冒烟失败 ' + problems.length + ' 项')
  cleanup()
  process.exit(1)
}
cleanup()
console.log('冒烟通过')
