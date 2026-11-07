/**
 * 词条文本的解析与重写（纯函数，无 React，便于单独测）。
 * 规则必须与宿主 dsh-term-dict/index.js 的 parseEntries 保持一致：
 *   词条 = `## 名称` 起头的一段；字段 = 段内 `- 键：值` 行（键不超过 10 个字符，冒号中英文都认）。
 */

export const FIELD_ORDER = ['类型', '定义', '默认指代', '边界', '状态', '备注']
export const STATUSES = ['已确认', '部分确认', '待观察', '已废']

/** 三类词条：类型不写进文件，由主字段推断（写工具与体检用同一判据）。
 *  「反例」并进「边界」写（给得出例子就写「例：…」）；「排他性」并进「备注」写（「排他性＝…」）。 */
export const KINDS = [
  { id: 'term', label: '称谓型', hint: '给东西起的名字——定义为主', fields: ['定义', '默认指代', '边界', '别称', '备注'] },
  { id: 'ref', label: '落点型', hint: '一般词默认指哪件事／哪份文件／哪条命令——默认指代为主', fields: ['默认指代', '边界', '别称', '备注'] },
  { id: 'grave', label: '留档型', hint: '已废——只记为什么不用', fields: ['定义', '备注'] },
]

/** 推断词条类型：已废＝留档型；只写默认指代＝落点型；其余＝称谓型（定义与默认指代都有时算称谓型带落点）。 */
export function entryKind(fields) {
  const f = fields || {}
  const has = (k) => String(f[k] || '').trim() !== ''
  if (String(f['状态'] || '').trim() === '已废') return 'grave'
  if (has('默认指代') && !has('定义')) return 'ref'
  return 'term'
}
const HEADING_RE = /^##\s+(.+?)\s*$/
const FIELD_RE = /^\s*[-*]\s*([^：:]{1,10})\s*[：:]\s*(.*)$/

/** 标题里可能带别名：`## 词典（别名：字典、术语字典）`；别名在内存里仍当「别称」字段用。 */
export function parseHeading(raw) {
  const t = String(raw || '').trim()
  const m = /^(.+?)（别名：(.+?)）$/.exec(t)
  if (m) return { term: m[1].trim(), aliases: m[2].trim() }
  return { term: t, aliases: '' }
}

/** 把整篇文本切成块：块 0 是表头（无 heading），其余每块是一条词条。 */
export function splitBlocks(text) {
  const blocks = []
  let cur = { heading: null, aliases: '', lines: [] }
  for (const line of String(text == null ? '' : text).split(/\r?\n/)) {
    const h = HEADING_RE.exec(line)
    if (h) {
      blocks.push(cur)
      const parsed = parseHeading(h[1])
      cur = { heading: parsed.term, aliases: parsed.aliases, lines: [line] }
    } else {
      cur.lines.push(line)
    }
  }
  blocks.push(cur)
  return blocks
}

/** 一块里的字段表（标题里的别名也并进「别称」）。 */
export function blockFields(block) {
  const fields = {}
  for (const line of block.lines.slice(1)) {
    const m = FIELD_RE.exec(line)
    if (m) fields[m[1].trim()] = m[2].trim()
  }
  if (!fields['别称'] && block.aliases) fields['别称'] = block.aliases
  return fields
}

/** 列出全部词条（含各自字段）。 */
export function listTerms(text) {
  return splitBlocks(text).filter((b) => b.heading).map((b) => ({ term: b.heading, fields: blockFields(b) }))
}

function renderBlockLines(term, fields) {
  const aliases = String(fields['别称'] || '').trim()
  const keys = FIELD_ORDER
    .filter((k) => k !== '别称' && fields[k] !== undefined && String(fields[k]).trim() !== '')
    .concat(Object.keys(fields).filter((k) => k !== '别称' && FIELD_ORDER.indexOf(k) === -1 && String(fields[k]).trim() !== ''))
  const lines = ['## ' + term + (aliases ? '（别名：' + aliases + '）' : '')]
  for (const k of keys) lines.push('- ' + k + '：' + String(fields[k]).trim())
  return lines
}

function joinBlocks(blocks) {
  return blocks
    .map((b) => b.lines.join('\n').replace(/\s+$/, ''))
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+/, '')
    .replace(/\s+$/, '') + '\n'
}

/** 新增或改写一条词条，返回新的整篇文本（未给的字段保留原值）。 */
export function upsertTerm(text, term, fields) {
  const blocks = splitBlocks(text)
  const idx = blocks.findIndex((b) => b.heading === term)
  if (idx >= 0) {
    const merged = Object.assign({}, blockFields(blocks[idx]), fields)
    blocks[idx] = { heading: term, lines: renderBlockLines(term, merged) }
  } else {
    blocks.push({ heading: term, lines: renderBlockLines(term, Object.assign({ 状态: '待观察' }, fields)) })
  }
  return joinBlocks(blocks)
}

/** 删掉一条词条，返回新的整篇文本。 */
export function removeTerm(text, term) {
  const blocks = splitBlocks(text)
  const idx = blocks.findIndex((b) => b.heading === term)
  if (idx < 0) return text
  blocks.splice(idx, 1)
  return joinBlocks(blocks)
}
