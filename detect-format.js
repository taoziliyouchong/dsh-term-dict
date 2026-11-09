/**
 * 检测账本的标准格式与硬校验。
 *
 * 模板：$DSH_HOME/evolve/dict/auto/template.md
 * 规则：一个候选一个 `## ` 块；每个块必须有 `EVID:` 一行和 `结论：` 一行；
 *       结论去掉空白后必须大于 10 个字，否则写入失败（由 tools/pre-execute 拦）。
 *
 * 这里只放「格式与校验」，不碰字典、不碰权重；activation.js 建文件，index.js 拦写入。
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
export const DETECT_ROOT = join(DSH_HOME, 'evolve', 'dict', 'auto')
export const DETECT_WORK_DIR = join(DETECT_ROOT, 'work')
export const TEMPLATE_FILE = join(DETECT_ROOT, 'template.md')
/** 结论最少字数（去空白后必须大于这个数）。 */
export const MIN_CONCLUSION = 10

export const TEMPLATE_TEXT = `# 词条检测·标准模板

> 一个候选一个块；每个块必须有 \`EVID:\` 一行和 \`结论：\` 一行。
> 结论去掉空白后必须大于 ${MIN_CONCLUSION} 个字，否则写入失败。
> EVID 写用户原话片段；结论写收/不收以及为什么。

## 候选：<词>

EVID: <引用用户原话>

- 结论：<理由>
- 定义：<收时写一句话>
- 默认指代：<可选>
`

/** 建好标准模板（已存在不动）；返回模板路径。 */
export function ensureTemplate() {
  try {
    mkdirSync(DETECT_ROOT, { recursive: true })
    if (!existsSync(TEMPLATE_FILE)) writeFileSync(TEMPLATE_FILE, TEMPLATE_TEXT, 'utf8')
  } catch {
    /* 建不了也把路径给出去 */
  }
  return TEMPLATE_FILE
}

/** 取一个块里的结论正文。 */
function conclusionOf(block) {
  const m = /^[-*]?\s*结论\s*[：:]\s*(.*)$/m.exec(String(block))
  return m ? m[1].trim() : ''
}

/**
 * 校验一份检测文本：每个 `## ` 块都要有 EVID: 与 结论：，结论去空白后 > MIN_CONCLUSION。
 * 没有候选块的文件算通过（允许清空）。
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateDetectText(text) {
  const src = String(text || '')
  const blocks = src.split(/^##\s+/m).slice(1)
  const errors = []
  blocks.forEach((block, index) => {
    const first = String(block).split(/\r?\n/)[0] || ''
    const name = first.trim() || ('第 ' + (index + 1) + ' 块')
    const hasEvid = /^[-*]?\s*EVID\s*[：:]/m.test(String(block))
    const conclusion = conclusionOf(block)
    const count = [...conclusion.replace(/\s/g, '')].length
    if (!hasEvid) errors.push(name + '：缺 EVID: 行')
    if (!conclusion) errors.push(name + '：缺 结论：行')
    else if (count <= MIN_CONCLUSION) {
      errors.push(name + '：结论只有 ' + count + ' 个字（必须大于 ' + MIN_CONCLUSION + ' 个字）')
    }
  })
  return { ok: errors.length === 0, errors }
}

/** 正文开头的检测报告行：`> **词条检测**：…`（一行几个字）。 */
export function hasReportLine(text) {
  return /^>\s*\*\*词条检测\*\*\s*[：:]/m.test(String(text || ''))
}
