/**
 * 术语字典设置面板（浏览器半边源码）。
 * 打包成 lib/client.js（window.__ModuleLoader__.load({id,factory}) 格式，id 必须等于包名）。
 * 数据走宿主 dsh-term-dict 的 HTTP 路由（list / read / write / rename），面板与文件之间只有这一个接口。
 *
 * 版式（2026-11-07 第四版）：
 *   左栏名册（通用 / 任务层 分组，行右小数字）→ 右栏标题行（层名 + 重命名 / 结构 / 设置）
 *   → 搜索 + 词条/原文 → 扁平的词条列表（点一条就地展开编辑卡，每个字段带标签）→ 底部文件与保存状态。
 *   低频操作收进二级：挪层是编辑卡里的一个下拉，跨层搜索折叠成列表下的一条。
 *
 * 交互：任务层可改名——显示名写回表头「任务类型」行，文件名＝dict\domains\<slug>.md 可一起改；
 *   改完重新拉名册并选中新 id。词条级改动先在浏览器重写整篇文本，再整篇写回。
 *
 * 踩过的坑：拼 URL 不能用 `new URL(相对路径, document.baseURI).pathname`——会丢掉查询串，
 * `?id=…` 到不了宿主，面板里每层都会显示 0 条。必须 pathname + search 一起带。
 */
import { Fragment, useEffect, useRef, useState } from 'react'
import { STATUSES, entryKind, listTerms, removeTerm, upsertTerm } from './term-text.js'

/** 把路由拼成当前页面挂载点下的路径（锚 document.baseURI，保留查询串）。 */
function api(path) {
  const relative = String(path).replace(/^\/+/, '')
  if (typeof document === 'undefined') return '/' + relative
  const url = new URL(relative, document.baseURI)
  return url.pathname + url.search
}

async function getJson(path) {
  const res = await fetch(api(path), { headers: { accept: 'application/json' } })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data || data.ok === false) throw new Error((data && data.error) || ('HTTP ' + res.status))
  return data
}

async function postJson(path, body) {
  const res = await fetch(api(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data || data.ok === false) throw new Error((data && data.error) || ('HTTP ' + res.status))
  return data
}

/** 宿主路由还没加载时 getJson 会拿到 HTTP 404；翻成人话，免得看着像面板坏了。 */
function friendlyHostError(e) {
  const s = String((e && e.message) || e)
  if (s.indexOf('HTTP 404') !== -1) return '宿主还没加载新路由（HTTP 404）：应用重启 dsh 后再进这一页'
  return s
}

const CSS = `
.td-root { display:flex; gap:30px; align-items:flex-start; width:100%; font-size:13px; line-height:1.55;
  color:var(--dsw-alias-label-primary); }
.td-roster { flex:0 0 196px; display:flex; flex-direction:column; gap:1px; }
.td-grouplabel { margin:16px 0 6px 10px; font-size:11px; color:var(--dsw-alias-label-primary); }
.td-grouplabel:first-child { margin-top:2px; }
.td-row { display:flex; align-items:center; gap:2px; width:100%; border-radius:6px; }
.td-row:hover { background:var(--dsw-alias-bg-layer-1); }
.td-row[aria-current="true"] { background:var(--dsw-alias-bg-layer-2); }
.td-row[aria-current="true"] .td-rowmain { font-weight:600; }
.td-rowmain { flex:1 1 auto; min-width:0; display:flex; justify-content:space-between; align-items:center; gap:8px;
  padding:6px 6px 6px 10px; border:0; border-radius:6px; background:none; color:inherit;
  font:inherit; text-align:left; cursor:pointer; }
.td-rowdel { flex:0 0 auto; padding:0 5px; border:0; background:none; color:var(--dsw-alias-label-primary);
  font:inherit; font-size:13px; line-height:1; cursor:pointer; opacity:0; }
.td-row:hover .td-rowdel, .td-row[aria-current="true"] .td-rowdel { opacity:.6; }
.td-rowdel:hover { color:var(--dsw-alias-state-error-primary); opacity:1; }
.td-confirm { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;
  margin:0; padding:8px 10px; border:1px solid var(--dsw-alias-state-error-primary); border-radius:6px;
  background:var(--dsw-alias-bg-layer-1); font-size:12px; line-height:1.6; }
.td-num { font-size:12px; font-weight:400; color:var(--dsw-alias-label-primary); }
.td-newlayer { display:flex; flex-direction:column; gap:4px; padding:4px 6px; }
.td-newlayerbtn { margin:2px 6px; padding:2px 0; text-align:left; }
.td-pane { flex:1 1 auto; min-width:0; display:flex; flex-direction:column; gap:14px; }
.td-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
.td-title { margin:0; font-size:15px; font-weight:600; line-height:1.3; }
.td-titlebtn { display:block; margin:0; padding:0; border:0; border-radius:4px; background:none; color:inherit;
  font:inherit; font-size:15px; font-weight:600; line-height:1.3; text-align:left; cursor:pointer; }
.td-titlebtn:hover { text-decoration:underline dotted var(--dsw-alias-border-l2); text-underline-offset:3px; }
.td-titlewrap { min-width:0; }
.td-inline { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.td-titleinput { width:240px; max-width:100%; padding:2px 6px; border:1px solid var(--dsw-alias-border-l1);
  border-radius:6px; background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary);
  font:inherit; font-size:15px; font-weight:600; }
.td-titleinput:focus { outline:none; border-color:var(--dsw-alias-brand-primary); }
.td-sub { margin:3px 0 0; font-size:12px; color:var(--dsw-alias-label-primary); }
.td-wsline { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.td-wspick { display:flex; flex-direction:column; gap:4px; padding:8px 10px; max-height:220px; overflow:auto;
  border:1px solid var(--dsw-alias-border-l1); border-radius:8px; background:var(--dsw-alias-bg-layer-1); }
.td-wsopt { display:flex; align-items:center; gap:6px; font-size:12px; min-width:0; }
.td-wsname { white-space:nowrap; }
.td-wspath { font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  color:var(--dsw-alias-label-primary); opacity:.75; }
.td-wscombo { position:relative; display:inline-flex; align-items:center; }
.td-wsbtn { display:inline-flex; align-items:center; gap:6px; max-width:360px; padding:3px 8px;
  border:1px solid var(--dsw-alias-border-l1); border-radius:6px; background:var(--dsw-alias-bg-base);
  color:var(--dsw-alias-label-primary); font:inherit; font-size:12px; cursor:pointer; }
.td-wsbtn:hover { border-color:var(--dsw-alias-brand-primary); }
.td-wssummary { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.td-wsinput { display:none; }
.td-wsdropdown { position:absolute; top:100%; left:0; z-index:30; width:320px; max-height:220px; overflow:auto;
  margin-top:4px; padding:4px; display:flex; flex-direction:column; gap:2px;
  border:1px solid var(--dsw-alias-border-l1); border-radius:8px; background:var(--dsw-alias-bg-base);
  box-shadow:0 8px 24px rgba(0,0,0,.16); }
.td-wsoptbtn { display:flex; flex-direction:column; align-items:flex-start; gap:1px; padding:5px 8px;
  border:0; border-radius:6px; background:none; color:var(--dsw-alias-label-primary); font:inherit;
  font-size:11px; text-align:left; cursor:pointer; }
.td-wsoptbtn:hover { background:var(--dsw-alias-bg-layer-2); }
.td-headacts { display:flex; gap:16px; align-items:center; padding-top:3px; }
.td-link { padding:0; border:0; background:none; color:var(--dsw-alias-label-primary);
  font:inherit; font-size:13px; cursor:pointer; white-space:nowrap; }
.td-link:hover:not(:disabled) { color:var(--dsw-alias-label-primary); }
.td-link:disabled { opacity:.45; cursor:default; }
.td-link.primary { color:var(--dsw-alias-brand-primary); }
.td-btn { padding:4px 12px; border:1px solid var(--dsw-alias-border-l1); border-radius:6px;
  background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary);
  font:inherit; font-size:13px; cursor:pointer; }
.td-btn:hover:not(:disabled) { border-color:var(--dsw-alias-brand-primary); }
.td-btn.primary { border-color:var(--dsw-alias-brand-primary); background:var(--dsw-alias-brand-primary); color:#fff; }
.td-btn:disabled { opacity:.45; cursor:default; }
.td-rlabel { font-size:12px; color:var(--dsw-alias-label-primary); white-space:nowrap; }
.td-input { width:140px; max-width:100%; padding:5px 8px; border:1px solid var(--dsw-alias-border-l1);
  border-radius:6px; background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary);
  font:inherit; font-size:13px; }
.td-input:focus { outline:none; border-color:var(--dsw-alias-brand-primary); }
.td-settings { display:flex; flex-direction:column; gap:10px; max-width:640px; }
.td-split { display:flex; gap:16px; align-items:flex-start; width:100%; }
.td-slist { flex:0 0 180px; display:flex; flex-direction:column; gap:1px;
  border-right:1px solid var(--dsw-alias-border-l1); padding-right:12px; }
.td-sitem { display:flex; justify-content:space-between; align-items:center; gap:8px;
  padding:4px 8px; border:1px solid transparent; border-radius:6px; background:none;
  color:inherit; font:inherit; font-size:12px; text-align:left; cursor:pointer; }
.td-sitem:hover { background:var(--dsw-alias-bg-layer-2); }
.td-sitem.on { border-color:var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-2); font-weight:600; }
.td-sdetail { flex:1 1 auto; min-width:0; display:flex; flex-direction:column; gap:8px; }
.td-sect { margin:12px 0 0; font-size:12px; color:var(--dsw-alias-label-primary); }
.td-srow { display:grid; grid-template-columns:84px minmax(0,1fr); gap:12px; align-items:center; }
.td-srow-top { align-items:start; }
.td-slabel { font-size:12px; color:var(--dsw-alias-label-primary); white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; line-height:1.6; }
.td-srow-top .td-slabel { padding-top:7px; }
.td-sfield { display:flex; align-items:center; gap:8px; min-width:0; }
.td-sfield-col { flex-direction:column; align-items:stretch; gap:5px; }
.td-unit { font-size:12px; color:var(--dsw-alias-label-primary); }
.td-chips { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.td-lock { font-size:11px; color:var(--dsw-alias-label-primary); padding:0 2px; }
.td-typegrid { display:grid; align-items:center; gap:8px 6px; width:100%; min-width:0; }
.td-typehead { padding-bottom:1px; }
.td-typecol { font-size:12px; font-weight:400; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.td-table { width:100%; border-collapse:collapse; }
.td-table th { padding:6px 8px; text-align:left; font-weight:400; font-size:12px;
  color:var(--dsw-alias-label-primary); border-bottom:1px solid var(--dsw-alias-border-l1); white-space:nowrap; }
.td-table td { padding:5px 8px; border-bottom:1px solid var(--dsw-alias-border-l1); font-size:13px; vertical-align:middle; }
.td-tdname { white-space:nowrap; width:1%; }
.td-tdact { white-space:nowrap; text-align:right; width:1%; }
.td-th-center, .td-td-center { text-align:center; }
.td-cell { width:100%; box-sizing:border-box; padding:2px 4px; border:1px solid transparent; border-radius:4px;
  background:transparent; color:var(--dsw-alias-label-primary); font:inherit; font-size:13px; }
.td-cell:hover { border-color:var(--dsw-alias-border-l1); }
.td-cell:focus { outline:none; border-color:var(--dsw-alias-brand-primary); background:var(--dsw-alias-bg-base); }
select.td-cell { padding:1px 2px; }
.td-checkmark { color:var(--dsw-alias-label-primary); }
.td-check { display:flex; align-items:center; gap:4px; min-width:0; font-size:12px;
  color:var(--dsw-alias-label-primary); }
.td-check input { flex:0 0 auto; }
.td-checkname { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.td-check-lock { min-width:0; overflow:hidden; white-space:nowrap; }
.td-chip { display:inline-flex; align-items:center; gap:2px; padding:1px 2px 1px 8px;
  border:1px solid var(--dsw-alias-border-l1); border-radius:999px; font-size:11px;
  color:var(--dsw-alias-label-primary); }
.td-chipx { border:0; background:none; color:var(--dsw-alias-label-primary); font:inherit;
  font-size:12px; line-height:1; padding:0 4px; cursor:pointer; }
.td-chipx:hover { color:var(--dsw-alias-state-error-primary); }
.td-pending { font-size:12px; color:var(--dsw-alias-state-error-primary); line-height:1.7; }
.td-confirm { display:flex; flex-direction:column; gap:6px; padding:8px 10px;
  border:1px solid var(--dsw-alias-state-error-primary); border-radius:6px;
  background:var(--dsw-alias-bg-layer-1); font-size:11px; line-height:1.7; }
.td-confirm-title { font-size:12px; font-weight:600; }
.td-link.danger { color:var(--dsw-alias-state-error-primary); }
.td-btn.danger { border-color:var(--dsw-alias-state-error-primary); background:var(--dsw-alias-state-error-primary); color:#fff; }
.td-tddesc { font-size:11px; font-weight:400; line-height:1.5; }
.td-iconbtn { padding:0 4px; border:0; background:none; color:var(--dsw-alias-label-primary);
  opacity:.5; font-size:14px; line-height:1; cursor:pointer; }
.td-iconbtn:hover { opacity:1; color:var(--dsw-alias-state-error-primary); }
.td-pendinglist { display:flex; flex-wrap:wrap; align-items:center; gap:4px 12px; margin:0; font-size:12px; }
.td-pendingitem { display:inline-flex; align-items:center; gap:4px; }
.td-numinput { width:96px; }
.td-toolbar { display:flex; gap:14px; align-items:center; border-bottom:1px solid var(--dsw-alias-border-l1);
  padding-bottom:8px; }
.td-search { flex:1 1 auto; min-width:0; padding:4px 0; border:0;
  border-bottom:1px solid var(--dsw-alias-border-l1); background:none; color:inherit;
  font:inherit; font-size:12px; }
.td-search:focus { outline:none; border-bottom-color:var(--dsw-alias-brand-primary); }
.td-tabs { display:flex; gap:0; flex:0 0 auto; border:1px solid var(--dsw-alias-border-l1); border-radius:6px; overflow:hidden; }
.td-tab { padding:2px 10px; border:0; background:none; color:var(--dsw-alias-label-primary);
  font:inherit; font-size:11px; cursor:pointer; }
.td-tab + .td-tab { border-left:1px solid var(--dsw-alias-border-l1); }
.td-tab[aria-selected="true"] { background:var(--dsw-alias-bg-layer-2); font-weight:500; }
.td-list { display:flex; flex-direction:column; }
.td-group { display:flex; justify-content:space-between; align-items:center; gap:8px; width:100%;
  margin:14px 0 0; padding:8px 6px; border-bottom:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary);
  font:inherit; font-size:14px; font-weight:700; letter-spacing:0; }
.td-group:first-child { margin-top:2px; }
.td-groupbtn { flex:1 1 auto; min-width:0; display:flex; justify-content:space-between; align-items:center;
  gap:8px; padding:6px 0; border:0; background:none; color:inherit; font:inherit;
  text-align:left; cursor:pointer; }
.td-groupbtn:hover { color:var(--dsw-alias-brand-primary); }
.td-groupnum { font-size:10px; font-weight:400; letter-spacing:0; padding:0 6px; border-radius:999px;
  background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-secondary); }
.td-groupadd { padding:0 2px; border:0; background:none; color:var(--dsw-alias-label-secondary);
  font:inherit; font-size:14px; line-height:1; cursor:pointer; }
.td-groupadd:hover { color:var(--dsw-alias-brand-primary); }
.td-addrow { display:block; width:100%; box-sizing:border-box; margin-top:10px; padding:7px 8px;
  border:1px dashed var(--dsw-alias-border-l2); border-radius:6px; background:none;
  color:var(--dsw-alias-label-secondary); font:inherit; font-size:12px; text-align:left; cursor:pointer; }
.td-addrow:hover { border-color:var(--dsw-alias-brand-primary); color:var(--dsw-alias-label-primary); }
.td-entry { display:flex; justify-content:space-between; align-items:center; gap:12px; width:100%;
  padding:8px 6px 8px 14px; border:0; border-bottom:1px solid var(--dsw-alias-border-l1); border-radius:4px;
  background:none; color:inherit; font:inherit; text-align:left; cursor:pointer; }
.td-entry:hover { background:var(--dsw-alias-bg-layer-1); }
.td-entry[aria-current="true"] { font-weight:600; background:var(--dsw-alias-bg-layer-1); }
.td-entry .td-entryname { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.td-entrymeta { display:flex; align-items:center; gap:8px; }
.td-kindtag { font-size:11px; line-height:1.5; padding:0 4px; border:1px solid var(--dsw-alias-border-l1);
  border-radius:3px; color:var(--dsw-alias-label-primary); }
.td-caret { font-size:14px; line-height:1; color:var(--dsw-alias-label-primary); transition:transform .15s ease; }
.td-entry:hover .td-caret { color:var(--dsw-alias-label-primary); }
.td-entry[aria-current="true"] .td-caret { transform:rotate(90deg); color:var(--dsw-alias-label-primary); }
.td-status { font-size:12px; color:var(--dsw-alias-label-primary); white-space:nowrap; font-weight:400; }
.td-status-ok { color:var(--dsw-alias-state-success-primary); }
.td-status-dead { color:var(--dsw-alias-state-error-primary); }
.td-card { display:flex; flex-direction:column; gap:8px; margin:8px 0 14px; padding:12px 14px;
  border:1px solid var(--dsw-alias-border-l1); border-radius:8px; background:var(--dsw-alias-bg-base); }
.td-cardhead { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
.td-cardid { display:flex; align-items:center; gap:8px; min-width:0; }
.td-cardtitle { font-size:13px; font-weight:600; }
.td-cardacts { display:flex; gap:14px; align-items:center; flex-wrap:wrap; }
.td-select { max-width:180px; padding:3px 6px; border:1px solid var(--dsw-alias-border-l1); border-radius:6px;
  background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font:inherit; font-size:13px; }
.td-select:focus { outline:none; border-color:var(--dsw-alias-brand-primary); }
.td-frow { display:grid; grid-template-columns:56px minmax(0,1fr); gap:10px; align-items:start; }
.td-flabel { padding-top:7px; font-size:12px; color:var(--dsw-alias-label-primary); white-space:nowrap; }
.td-area { width:100%; box-sizing:border-box; min-height:44px; resize:vertical; padding:6px 8px;
  border:1px solid var(--dsw-alias-border-l1); border-radius:6px; background:var(--dsw-alias-bg-base);
  color:var(--dsw-alias-label-primary); font-family:inherit; font-size:13px; line-height:1.6; }
.td-area:focus { outline:none; border-color:var(--dsw-alias-brand-primary); }
.td-line { width:100%; box-sizing:border-box; padding:5px 8px; border:1px solid var(--dsw-alias-border-l1);
  border-radius:6px; background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary);
  font-family:inherit; font-size:13px; }
.td-line:focus { outline:none; border-color:var(--dsw-alias-brand-primary); }
.td-other { display:flex; flex-direction:column; border-top:1px dashed var(--dsw-alias-border-l1); padding-top:6px; }
.td-other .td-entry { border-bottom:0; padding:5px 6px; }
.td-hint { margin:0; font-size:12px; color:var(--dsw-alias-label-primary); }
.td-error { margin:0; font-size:12px; color:var(--dsw-alias-state-error-primary); word-break:break-all; }
.td-foot { display:flex; justify-content:space-between; align-items:center; gap:12px;
  padding-top:10px; border-top:1px solid var(--dsw-alias-border-l1);
  font-size:11px; color:var(--dsw-alias-label-primary); }
.td-footleft { display:flex; align-items:center; gap:10px; min-width:0; flex:1 1 auto; }
.td-path { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
`

const EMPTY_DOC = { loading: false, content: '', draft: '', error: null, saving: false, savedAt: null }

/** 高级设置的默认值：与宿主 activation.js 的 DEFAULT_SETTINGS 一致。 */
const SETTINGS_DEFAULTS = {
  autoActivate: true,
  maxActive: 64,
  maxEntryChars: 0,
  maxTotalChars: 12000,
  skipWorkspaces: [],
  skipSessions: [],
  presets: [],
  schema: {
    modules: ['定义', '默认指代', '边界', '别称', '备注'],
    types: {
      term: { label: '称谓型', enabled: true, modules: ['定义', '默认指代', '边界', '别称', '备注'] },
      ref: { label: '落点型', enabled: true, modules: ['默认指代', '边界', '别称', '备注'] },
      grave: { label: '留档型', enabled: true, modules: ['定义', '备注'] },
    },
    moduleDefs: {
      定义: { hint: '它指什么（一句话）', multiline: true, inject: true },
      默认指代: { hint: '单独出现时默认优先指哪件事／哪份文件／哪条命令', multiline: true, inject: true },
      边界: { hint: '它不是什么；有例子就写「例：…」', multiline: true, inject: true },
      别称: { hint: '同一物还有哪些叫法，逗号分隔', multiline: false, inject: false },
      备注: { hint: '指向技能、撞名规则', multiline: false, inject: false },
    },
    pending: [],
    pendingTypes: [],
  },
}

/** 可删模块的判断：别称参与命中匹配，锁死不能删；其余都能删。 */
const LOCKED_MODULES = ['别称']
/** 内置类型：只能停用，不能删除。 */
const BUILTIN_TYPE_IDS = ['term', 'ref', 'grave']
/** 模块是做什么的（结构页名称下面的一行）。 */
const MODULE_DESC = {
  定义: '指什么',
  默认指代: '默认指哪件事',
  边界: '不是什么',
  别称: '别的叫法',
  备注: '技能/撞名备注',
}
/** 类型是做什么的。 */
const TYPE_DESC = {
  term: '给东西起名',
  ref: '默认指哪件事',
  grave: '已废留档',
}

/** 打开面板时默认选哪一层：先挑有词条的，其次任务层，最后才落到第一层。 */
function pickDefaultLayer(list) {
  if (!Array.isArray(list) || list.length === 0) return ''
  const withTerms = list.find((l) => l.terms > 0)
  if (withTerms) return withTerms.id
  const domain = list.find((l) => l.kind === 'domain')
  if (domain) return domain.id
  return list[0].id
}

/** 名册/标题上显示的层名：任务层优先用表头里的中文名，没写才退回 slug。 */
function layerLabel(layer) {
  if (!layer) return ''
  return layer.kind === 'domain' && layer.taskType ? layer.taskType : layer.label
}

/** 状态样式：只给「已确认／已废」上色。 */
function statusClass(status) {
  if (status === '已确认') return 'td-status td-status-ok'
  if (status === '已废') return 'td-status td-status-dead'
  return 'td-status'
}

/** 类型解析：词条写了「类型」就认它（名字或 id），否则按字段推断。 */
function resolveKind(fields, schema) {
  const f = fields || {}
  const stored = String(f['类型'] || '').trim()
  const types = (schema && schema.types) || SETTINGS_DEFAULTS.schema.types
  if (stored) {
    if (types[stored]) return stored
    for (const id of Object.keys(types)) {
      if (types[id].label === stored) return id
    }
  }
  return entryKind(f)
}

/** 类型名：优先用 schema 里的显示名。 */
function kindLabel(fields, schema) {
  const id = resolveKind(fields, schema)
  const types = (schema && schema.types) || SETTINGS_DEFAULTS.schema.types
  return (types[id] && types[id].label) || '称谓型'
}

/** 本地时间：YYYY-MM-DD HH:mm。 */
function formatTime(ms) {
  const date = new Date(Number(ms))
  if (!Number.isFinite(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

/** 一条词条的编辑卡（新增与修改共用）；字段带标签，挪层是一个下拉。 */
function TermForm(props) {
  const { term, fields, saving, onSave, onCancel, onDelete, layerOptions, layerId, isNew, schema } = props
  const [name, setName] = useState(term || '')
  const [f, setF] = useState(fields || {})
  const [targetId, setTargetId] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [kind, setKind] = useState(isNew ? 'term' : entryKind(fields || {}))
  const optionList = Array.isArray(layerOptions) ? layerOptions : []
  const set = (k, v) => setF((cur) => Object.assign({}, cur, { [k]: v }))
  /** 类型不存进文件，由字段推断；「词条结构」决定每种类型显示哪些模块、哪些类型还能新建。 */
  const schemaTypes = (schema && schema.types) || SETTINGS_DEFAULTS.schema.types
  const moduleDefs = (schema && schema.moduleDefs) || SETTINGS_DEFAULTS.schema.moduleDefs
  const typeList = Object.keys(schemaTypes).map((id) => ({
    id,
    label: schemaTypes[id].label || id,
  }))
  const enabledTypes = typeList.filter((t) => schemaTypes[t.id].enabled !== false)
  const requestedKind = isNew ? kind : resolveKind(f, schema)
  const kindId = enabledTypes.some((t) => t.id === requestedKind)
    ? requestedKind
    : (enabledTypes[0] ? enabledTypes[0].id : requestedKind)
  const kindInfo = typeList.find((t) => t.id === kindId) || { id: kindId, label: kindId }
  const allowed = (schemaTypes[kindId] && Array.isArray(schemaTypes[kindId].modules))
    ? schemaTypes[kindId].modules
    : []
  const status = (isNew && kindId === 'grave') ? '已废' : (STATUSES.indexOf(f['状态']) === -1 ? '待观察' : f['状态'])
  const hasDef = String(f['定义'] || '').trim() !== ''
  const hasRef = String(f['默认指代'] || '').trim() !== ''
  const requiredField = kindId === 'ref' ? '默认指代' : '定义'
  const anyAllowedFilled = allowed.length === 0
    || allowed.some((field) => String(f[field] || '').trim() !== '')
  const requiredOk = allowed.indexOf(requiredField) === -1
    ? anyAllowedFilled
    : (requiredField === '定义' ? hasDef : hasRef)
  const ready = String(name).trim() !== '' && (isNew ? requiredOk : (hasDef || hasRef))
  const movedTo = optionList.find((o) => o.id === targetId)
  /** 新增时按类型收字段：类型里没有的模块不写进文件；留档型状态＝已废。 */
  const submit = () => {
    const payload = Object.assign({}, f)
    if (isNew) {
      for (const key of Object.keys(payload)) {
        if (key === '状态' || key === '类型') continue
        if (allowed.indexOf(key) === -1) delete payload[key]
      }
      payload['类型'] = kindInfo.label
      if (kindId === 'grave') payload['状态'] = '已废'
    }
    onSave(String(name).trim(), payload, targetId)
  }

  return (
    <div className="td-card">
      <div className="td-cardhead">
        <span className="td-cardid">
          <span className="td-cardtitle">{isNew ? '新词条' : (term || name)}</span>
          {isNew ? null : <span className="td-kindtag" title="类型认词条里的「类型」字段，没有就按字段推断">{kindInfo.label}</span>}
        </span>
        <div className="td-cardacts">
          <select
            className="td-select"
            aria-label="状态"
            title="已废＝本阶段不用，随时可以改好复出"
            value={status}
            disabled={isNew && kindId === 'grave'}
            onChange={(e) => set('状态', e.target.value)}
          >
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            className="td-select"
            aria-label="挪层"
            title="把这一条挪到另一层（保存时才动）"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          >
            <option value="">留在本层</option>
            {optionList.filter((o) => o.id !== layerId).map((o) => (
              <option key={o.id} value={o.id}>{'移到 ' + o.label}</option>
            ))}
          </select>
          {onDelete
            ? (
              <button
                type="button"
                className="td-link"
                onClick={() => { if (confirmDelete) onDelete(); else setConfirmDelete(true) }}
              >
                {confirmDelete ? '确认删除？' : '删除'}
              </button>
            )
            : null}
          <button type="button" className="td-link" onClick={onCancel}>{'取消'}</button>
          <button
            type="button"
            className="td-link primary"
            disabled={!ready || saving}
            onClick={submit}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>

      {isNew
        ? (
          <label className="td-frow">
            <span className="td-flabel">{'名称'}</span>
            <input
              className="td-line"
              value={name}
              placeholder="词条名"
              spellCheck={false}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )
        : null}

      {allowed.map((field) => {
        const mdef = moduleDefs[field] || { hint: '', multiline: true }
        const placeholder = mdef.hint ? mdef.hint + '（可空）' : '（可空）'
        return (
          <label className="td-frow" key={field}>
            <span className="td-flabel">{field === '别称' ? '别名' : field}</span>
            {mdef.multiline
              ? (
                <textarea
                  className="td-area"
                  rows={field === '定义' ? 3 : 2}
                  value={f[field] || ''}
                  spellCheck={false}
                  placeholder={placeholder}
                  onChange={(e) => set(field, e.target.value)}
                />
              )
              : (
                <input
                  className="td-line"
                  value={f[field] || ''}
                  spellCheck={false}
                  placeholder={placeholder}
                  onChange={(e) => set(field, e.target.value)}
                />
              )}
          </label>
        )
      })}

      {movedTo ? <p className="td-hint">{'保存＝把这条挪到「' + movedTo.label + '」'}</p> : null}
    </div>
  )
}

/** 面板主体。 */
export function TermDictSection() {
  const [layers, setLayers] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [activeId, setActiveId] = useState('')
  const [docs, setDocs] = useState({})
  const [view, setView] = useState('terms')
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [addingStatus, setAddingStatus] = useState('待观察')
  const [nameEditing, setNameEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [slugEditing, setSlugEditing] = useState(false)
  const [creatingLayer, setCreatingLayer] = useState(false)
  const [newLayerName, setNewLayerName] = useState('')
  const [layerSaving, setLayerSaving] = useState(false)
  const [layerConfirm, setLayerConfirm] = useState(null)
  const [layerDeleting, setLayerDeleting] = useState(false)
  const [wsOpen, setWsOpen] = useState(false)
  const [wsOptions, setWsOptions] = useState([])
  const [wsError, setWsError] = useState(null)
  const [wsSaving, setWsSaving] = useState(false)
  const [slugDraft, setSlugDraft] = useState('')
  const [rnSaving, setRnSaving] = useState(false)
  const [rnError, setRnError] = useState(null)
  const [otherHits, setOtherHits] = useState([])
  const [otherBusy, setOtherBusy] = useState(false)
  const [showOther, setShowOther] = useState(false)
  const [pendingTerm, setPendingTerm] = useState('')
  const [collapsedStatus, setCollapsedStatus] = useState({})
  const groupBy = 'status'
  const [advanced, setAdvanced] = useState(false)
  const [structureView, setStructureView] = useState(false)
  const [moduleDrafts, setModuleDrafts] = useState({})
  const [settingsDraft, setSettingsDraft] = useState(null)
  const [settingsError, setSettingsError] = useState(null)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)
  /** 本机模式清单（null＝还没取到；[]＝取到但为空）。勾选用。 */
  const [presetRoster, setPresetRoster] = useState(null)
  /** 清单取不到时的一句话原因；拿到清单就清空。 */
  const [presetNote, setPresetNote] = useState('')
  /** 本机工作空间清单（null＝还没取到；[]＝取到但为空）。勾选用。 */
  const [workspaceRoster, setWorkspaceRoster] = useState(null)
  /** 工作空间清单取不到时的一句话原因。 */
  const [workspaceNote, setWorkspaceNote] = useState('')
  const [schema, setSchema] = useState(null)
  const [scanConfirm, setScanConfirm] = useState(null)
  const [newTypeName, setNewTypeName] = useState('')
  const [newModuleName, setNewModuleName] = useState('')
  const [typeConfirm, setTypeConfirm] = useState(null)

  const doc = docs[activeId] || EMPTY_DOC
  const active = layers.find((l) => l.id === activeId) || null
  const domains = layers.filter((l) => l.kind === 'domain')
  const generalLayers = layers.filter((l) => l.kind === 'general')
  const layerOptions = layers.map((l) => ({
    id: l.id,
    label: l.kind === 'general' ? '通用层' : '任务·' + (l.taskType || l.slug || l.label),
  }))
  const terms = listTerms(doc.draft)
  const keyword = filter.trim().toLowerCase()
  const shown = keyword
    ? terms.filter((t) => t.term.toLowerCase().indexOf(keyword) !== -1
      || String(t.fields['定义'] || '').toLowerCase().indexOf(keyword) !== -1)
    : terms
  // 分类：两种口径——按状态（已确认 → 部分确认 → 待观察 → 已废）或按类型（schema 里的类型顺序）；
  // 组内保持字典文件里的原顺序。
  const STATUS_SEQ = ['已确认', '部分确认', '待观察', '已废']
  const schemaTypesForGroup = (schema && schema.types) || SETTINGS_DEFAULTS.schema.types
  const KIND_SEQ = Object.keys(schemaTypesForGroup)
  const rankOf = (t) => {
    if (groupBy === 'kind') {
      const i = KIND_SEQ.indexOf(resolveKind(t.fields, schema))
      return i === -1 ? KIND_SEQ.length : i
    }
    const i = STATUS_SEQ.indexOf(t.fields['状态'] || '')
    return i === -1 ? STATUS_SEQ.length : i
  }
  const keyOf = (t) => (groupBy === 'kind'
    ? kindLabel(t.fields, schema)
    : (t.fields['状态'] || '缺状态'))
  const ordered = shown
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rankOf(a.t) - rankOf(b.t) || a.i - b.i)
    .map((x) => x.t)
  const groups = []
  for (const t of ordered) {
    const key = keyOf(t)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(t)
    else groups.push({ key, items: [t] })
  }
  const dirty = doc.content !== doc.draft

  async function loadList(opts) {
    const silent = Boolean(opts && opts.silent)
    if (!silent) { setStatus('loading'); setError(null) }
    try {
      const data = await getJson('/dsh-term-dict/api/list')
      const list = Array.isArray(data.layers) ? data.layers : []
      setLayers(list)
      setStatus('ready')
      setActiveId((cur) => (cur && list.some((l) => l.id === cur) ? cur : pickDefaultLayer(list)))
    } catch (e) {
      if (!silent) { setStatus('error'); setError(String((e && e.message) || e)) }
    }
  }

  async function loadDoc(id) {
    if (!id) return
    setDocs((d) => Object.assign({}, d, { [id]: Object.assign({}, EMPTY_DOC, d[id] || {}, { loading: true, error: null }) }))
    try {
      const data = await getJson('/dsh-term-dict/api/read?id=' + encodeURIComponent(id))
      const text = typeof data.content === 'string' ? data.content : ''
      setDocs((d) => Object.assign({}, d, {
        [id]: { loading: false, error: null, saving: false, savedAt: null, content: text, draft: text },
      }))
    } catch (e) {
      setDocs((d) => Object.assign({}, d, {
        [id]: Object.assign({}, EMPTY_DOC, d[id] || {}, { loading: false, error: String((e && e.message) || e) }),
      }))
    }
  }

  /** 把某一层整篇写回；成功就刷新名册（层名/条数可能变了），失败只报在这一层上。 */
  async function writeLayer(id, text) {
    if (!id) return false
    setDocs((d) => Object.assign({}, d, { [id]: Object.assign({}, d[id], { saving: true, error: null }) }))
    try {
      await postJson('/dsh-term-dict/api/write', { id, content: text })
      setDocs((d) => Object.assign({}, d, {
        [id]: Object.assign({}, d[id], { saving: false, error: null, content: text, draft: text, savedAt: Date.now() }),
      }))
      void loadList({ silent: true })
      return true
    } catch (e) {
      setDocs((d) => Object.assign({}, d, { [id]: Object.assign({}, d[id], { saving: false, error: String((e && e.message) || e) }) }))
      return false
    }
  }

  async function writeText(text) {
    return writeLayer(activeId, text)
  }

  /** 取某一层的当前文本：本地有草稿就用草稿，否则现读一次。 */
  async function readLayerText(id) {
    const cached = docs[id]
    if (cached && typeof cached.draft === 'string') return cached.draft
    try {
      const data = await getJson('/dsh-term-dict/api/read?id=' + encodeURIComponent(id))
      const text = typeof data.content === 'string' ? data.content : ''
      setDocs((d) => Object.assign({}, d, {
        [id]: { loading: false, error: null, saving: false, savedAt: null, content: text, draft: text },
      }))
      return text
    } catch (e) {
      throw new Error('读不到目标层：' + String((e && e.message) || e))
    }
  }

  /** 存一条：留在本层＝就地改写；换了层＝先写目标层，再从本层删掉（顺序固定，失败不会半截丢）。 */
  async function saveEntry(name, fields, targetId, isNew) {
    const same = !targetId || targetId === activeId
    if (same) {
      const base = isNew ? headerFor(doc.draft, active) : doc.draft
      return writeText(upsertTerm(base, name, fields))
    }
    const targetLayer = layers.find((l) => l.id === targetId) || null
    let targetText = ''
    try {
      targetText = await readLayerText(targetId)
    } catch (e) {
      setDocs((d) => Object.assign({}, d, { [activeId]: Object.assign({}, d[activeId], { error: String((e && e.message) || e) }) }))
      return false
    }
    const okTarget = await writeLayer(targetId, upsertTerm(headerFor(targetText, targetLayer), name, fields))
    if (!okTarget) return false
    if (isNew) return true
    const okSource = await writeLayer(activeId, removeTerm(doc.draft, name))
    if (!okSource) {
      setDocs((d) => Object.assign({}, d, {
        [activeId]: Object.assign({}, d[activeId], { error: '已写入目标层，但本层没删掉——请手动删这一条' }),
      }))
      return false
    }
    return true
  }

  /** 改名：只传 name＝改显示名（表头「任务类型」行），只传 slug＝把文件一起改名。 */
  async function submitRename(partial) {
    if (!active) return
    setRnSaving(true)
    setRnError(null)
    try {
      const data = await postJson('/dsh-term-dict/api/rename', Object.assign({ id: activeId }, partial))
      const before = activeId
      setNameEditing(false)
      setSlugEditing(false)
      await loadList({ silent: true })
      setActiveId(data.id)
      // 只改显示名时 id 不变，缓存里的整篇文本还是旧表头：手动重读一次。
      if (data.id === before) await loadDoc(data.id)
    } catch (e) {
      setRnError(String((e && e.message) || e))
    } finally {
      setRnSaving(false)
    }
  }

  /** 新建任务层：只填名称，文件名自动取 ASCII slug（中文名会给 task-xxx），之后可改名。 */
  async function createLayer() {
    const name = newLayerName.trim()
    if (!name) return
    setLayerSaving(true)
    setRnError(null)
    try {
      const data = await postJson('/dsh-term-dict/api/create-layer', { name })
      setCreatingLayer(false)
      setNewLayerName('')
      await loadList({ silent: true })
      if (data && data.layer && data.layer.id) setActiveId(data.layer.id)
    } catch (e) {
      setRnError(String((e && e.message) || e))
    } finally {
      setLayerSaving(false)
    }
  }

  /** 删除任务层：文件改名归档（.deleted-时间戳），词条不丢、可找回；删完回到默认层。 */
  async function deleteLayer(id) {
    if (!id || layerDeleting) return
    setLayerDeleting(true)
    setRnError(null)
    try {
      await postJson('/dsh-term-dict/api/delete-layer', { id })
      setLayerConfirm(null)
      setDocs((d) => {
        const next = Object.assign({}, d)
        delete next[id]
        return next
      })
      await loadList({ silent: true })
    } catch (e) {
      setRnError(String((e && e.message) || e))
    } finally {
      setLayerDeleting(false)
    }
  }

  /** 模块定义 → 表格草稿（与宿主 moduleDefs 对齐）。 */
  function draftsFromSchema(schemaObj) {
    const defs = (schemaObj && schemaObj.moduleDefs) || {}
    const out = {}
    for (const field of ((schemaObj && schemaObj.modules) || [])) {
      const def = defs[field] || {}
      out[field] = {
        hint: String(def.hint || ''),
        multiline: def.multiline !== false,
        inject: def.inject === true,
      }
    }
    return out
  }

  /** 词条结构页：读设置，铺开模块草稿。 */
  async function openStructure() {
    setStructureView(true)
    setAdvanced(true)
    setSettingsError(null)
    setSettingsSaved(false)
    try {
      const data = await getJson('/dsh-term-dict/api/settings')
      const next = Object.assign({}, SETTINGS_DEFAULTS, data.settings || {})
      setSettingsDraft(next)
      setSchema(next.schema || null)
      setModuleDrafts(draftsFromSchema(next.schema))
    } catch (e) {
      setSettingsError(friendlyHostError(e))
    }
  }

  /** 保存所有改过的模块定义（只提交变了的）。 */
  async function saveModuleDefs() {
    if (!schema) return
    const changed = (schema.modules || []).filter((field) => {
      const def = (schema.moduleDefs && schema.moduleDefs[field]) || {}
      const draft = moduleDrafts[field] || { hint: '', multiline: true, inject: false }
      return draft.hint !== String(def.hint || '')
        || draft.multiline !== (def.multiline !== false)
        || draft.inject !== (def.inject === true)
    })
    if (changed.length === 0) return
    setSettingsSaving(true)
    setSettingsError(null)
    try {
      for (const field of changed) {
        const draft = moduleDrafts[field]
        await postJson('/dsh-term-dict/api/schema/module-def', {
          field,
          hint: draft.hint,
          multiline: draft.multiline,
          inject: draft.inject,
        })
      }
      const next = await refreshSettings()
      setModuleDrafts(draftsFromSchema(next.schema))
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 2500)
    } catch (e) {
      setSettingsError(friendlyHostError(e))
    } finally {
      setSettingsSaving(false)
    }
  }

  /** 读 DSH 工作空间清单（宿主 workspaceRegistry）。 */
  async function loadWorkspaces() {
    setWsError(null)
    try {
      const data = await getJson('/dsh-term-dict/api/workspaces')
      const list = Array.isArray(data.workspaces) ? data.workspaces : []
      setWsOptions(list)
      if (list.length === 0) setWsError('宿主没有返回工作空间（应用重启后才有，或注册表为空）')
    } catch (e) {
      setWsOptions([])
      setWsError(String((e && e.message) || e))
    }
  }

  function openWsPicker() {
    setWsOpen(true)
    void loadWorkspaces()
  }

  /** 绑定的工作空间变了就写回文件；空数组＝所有工作空间。 */
  async function commitWorkspaces(next) {
    if (!active || active.kind !== 'domain') return
    setWsSaving(true)
    setWsError(null)
    try {
      await postJson('/dsh-term-dict/api/workspace', { id: active.id, workspaces: next })
      setLayers((cur) => cur.map((l) => (l.id === active.id ? Object.assign({}, l, { workspaces: next }) : l)))
    } catch (e) {
      setWsError(String((e && e.message) || e))
    } finally {
      setWsSaving(false)
    }
  }

  function addWorkspace(path) {
    const cur = active && Array.isArray(active.workspaces) ? active.workspaces : []
    if (!path || cur.indexOf(path) !== -1) return
    void commitWorkspaces(cur.concat([path]))
  }

  function toggleWorkspace(path) {
    const cur = active && Array.isArray(active.workspaces) ? active.workspaces : []
    if (cur.indexOf(path) !== -1) void commitWorkspaces(cur.filter((p) => p !== path))
    else void commitWorkspaces(cur.concat([path]))
  }

  function removeWorkspace(path) {
    const cur = active && Array.isArray(active.workspaces) ? active.workspaces : []
    void commitWorkspaces(cur.filter((p) => p !== path))
  }

  /** 高级设置：读 dict\.settings.json（走宿主 /settings 路由）。 */
  async function openAdvanced() {
    setAdvanced(true)
    setStructureView(false)
    setSettingsError(null)
    setSettingsSaved(false)
    void loadPresetRoster()
    void loadWorkspaceRoster()
    try {
      const data = await getJson('/dsh-term-dict/api/settings')
      const next = Object.assign({}, SETTINGS_DEFAULTS, data.settings || {})
      setSettingsDraft(next)
      setSchema(next.schema || null)
    } catch (e) {
      setSettingsError(friendlyHostError(e))
      setSettingsDraft((cur) => cur || Object.assign({}, SETTINGS_DEFAULTS))
    }
  }

  /** 高级设置：写回（宿主按区间夹取，非法值自动落回默认）。 */
  async function saveAdvanced() {
    if (!settingsDraft) return
    const clean = {
      autoActivate: Boolean(settingsDraft.autoActivate),
      maxActive: Math.round(Number(settingsDraft.maxActive)),
      maxEntryChars: Math.round(Number(settingsDraft.maxEntryChars)),
      maxTotalChars: Math.round(Number(settingsDraft.maxTotalChars)),
      skipWorkspaces: Array.isArray(settingsDraft.skipWorkspaces) ? settingsDraft.skipWorkspaces : [],
      presets: Array.isArray(settingsDraft.presets)
        ? settingsDraft.presets.map((s) => String(s).trim()).filter((s) => s.length > 0)
        : [],
    }
    if (!Number.isFinite(clean.maxActive) || !Number.isFinite(clean.maxEntryChars) || !Number.isFinite(clean.maxTotalChars)) {
      setSettingsError('三个上限都要填数字')
      return
    }
    setSettingsSaving(true)
    setSettingsError(null)
    try {
      const data = await postJson('/dsh-term-dict/api/settings', clean)
      const next = Object.assign({}, SETTINGS_DEFAULTS, data.settings || {})
      setSettingsDraft(next)
      setSchema(next.schema || null)
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 2500)
    } catch (e) {
      setSettingsError(friendlyHostError(e))
    } finally {
      setSettingsSaving(false)
    }
  }

  const setDraftField = (key, value) => setSettingsDraft((d) => Object.assign({}, d || SETTINGS_DEFAULTS, { [key]: value }))

  /** 取本机模式清单（「限定模式」勾选用）。取不到只记一句原因，退回手填，不拦设置页。 */
  async function loadPresetRoster() {
    setPresetNote('')
    try {
      const data = await getJson('/dsh-term-dict/api/presets')
      const rows = Array.isArray(data && data.presets) ? data.presets : []
      setPresetRoster(rows)
      if (data && data.unavailable) setPresetNote(String(data.unavailable))
    } catch (e) {
      setPresetRoster([])
      setPresetNote(friendlyHostError(e))
    }
  }

  /** 勾／取消一个模式：只存模式 id，写进 settingsDraft.presets。 */
  function togglePresetDraft(id) {
    setSettingsDraft((cur) => {
      const base = cur || SETTINGS_DEFAULTS
      const list = Array.isArray(base.presets) ? base.presets.slice() : []
      const at = list.indexOf(id)
      if (at === -1) list.push(id)
      else list.splice(at, 1)
      return Object.assign({}, base, { presets: list })
    })
  }

  /** 取本机工作空间清单（「不灌注的范围」勾选用）。取不到只记一句原因，退回手填。 */
  async function loadWorkspaceRoster() {
    setWorkspaceNote('')
    try {
      const data = await getJson('/dsh-term-dict/api/workspaces')
      const rows = Array.isArray(data && data.workspaces) ? data.workspaces : []
      const seen = []
      const list = []
      for (const w of rows) {
        const path = String((w && w.path) || '')
        const key = path.toLowerCase()
        if (!key || seen.indexOf(key) !== -1) continue
        seen.push(key)
        list.push({ id: String((w && w.id) || ''), title: String((w && w.title) || ''), path })
      }
      setWorkspaceRoster(list)
    } catch (e) {
      setWorkspaceRoster([])
      setWorkspaceNote(friendlyHostError(e))
    }
  }

  /** 勾／取消一个工作空间：按 path 写进 skipWorkspaces（判定就是 cwd 子串）。 */
  function toggleWorkspaceDraft(path) {
    const key = String(path || '').toLowerCase()
    if (!key) return
    setSettingsDraft((cur) => {
      const base = cur || SETTINGS_DEFAULTS
      const list = Array.isArray(base.skipWorkspaces) ? base.skipWorkspaces.slice() : []
      const at = list.findIndex((v) => String(v).toLowerCase() === key)
      if (at === -1) list.push(String(path))
      else list.splice(at, 1)
      return Object.assign({}, base, { skipWorkspaces: list })
    })
  }

  /** 手填区改动：保留已勾的工作空间项，其余片段按手填内容替换。 */
  function commitSkipWorkspaces(lines) {
    setSettingsDraft((cur) => {
      const base = cur || SETTINGS_DEFAULTS
      const roster = Array.isArray(workspaceRoster) ? workspaceRoster : []
      const lower = roster.map((w) => String(w.path || '').toLowerCase()).filter((s) => s.length > 0)
      const curList = Array.isArray(base.skipWorkspaces) ? base.skipWorkspaces : []
      const checked = roster
        .map((w) => String(w.path || ''))
        .filter((p) => p && curList.some((v) => String(v).toLowerCase() === p.toLowerCase()))
      const manual = []
      for (const raw of Array.isArray(lines) ? lines : []) {
        const s = String(raw == null ? '' : raw).trim()
        if (!s) continue
        if (lower.indexOf(s.toLowerCase()) !== -1) continue
        if (manual.indexOf(s) !== -1) continue
        manual.push(s)
      }
      return Object.assign({}, base, { skipWorkspaces: checked.concat(manual) })
    })
  }

  async function refreshSettings() {
    const data = await getJson('/dsh-term-dict/api/settings')
    const next = Object.assign({}, SETTINGS_DEFAULTS, data.settings || {})
    setSettingsDraft(next)
    setSchema(next.schema || null)
    return next
  }

  /** 删模块前先扫描：全字典多少条、多少条写了该字段。 */
  async function askRemoveModule(field) {
    setSettingsError(null)
    try {
      const data = await getJson('/dsh-term-dict/api/schema-scan?field=' + encodeURIComponent(field))
      setScanConfirm({ field, scan: data.scan })
    } catch (e) {
      setSettingsError(friendlyHostError(e))
    }
  }

  async function confirmRemoveModule() {
    if (!scanConfirm) return
    setSettingsSaving(true)
    setSettingsError(null)
    try {
      const data = await postJson('/dsh-term-dict/api/schema/module-remove', { field: scanConfirm.field })
      setScanConfirm(null)
      const next = Object.assign({}, SETTINGS_DEFAULTS, data.settings || {})
      setSettingsDraft(next)
      setSchema(next.schema || null)
      setModuleDrafts(draftsFromSchema(next.schema))
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 2500)
    } catch (e) {
      setSettingsError(friendlyHostError(e))
    } finally {
      setSettingsSaving(false)
    }
  }

  async function undoPendingModule(field) {
    setSettingsSaving(true)
    setSettingsError(null)
    try {
      await postJson('/dsh-term-dict/api/schema/module-cancel', { field })
      await refreshSettings()
    } catch (e) {
      setSettingsError(friendlyHostError(e))
    } finally {
      setSettingsSaving(false)
    }
  }

  async function addModule(field) {
    const name = String(field || '').trim()
    if (!name) return
    setSettingsSaving(true)
    setSettingsError(null)
    try {
      await postJson('/dsh-term-dict/api/schema/module-add', { name })
      setNewModuleName('')
      const next = await refreshSettings()
      setModuleDrafts(draftsFromSchema(next.schema))
    } catch (e) {
      setSettingsError(friendlyHostError(e))
    } finally {
      setSettingsSaving(false)
    }
  }

  async function toggleTypeModule(type, field, enabled) {
    setSettingsSaving(true)
    setSettingsError(null)
    try {
      await postJson('/dsh-term-dict/api/schema/type-module', { type, field, enabled })
      await refreshSettings()
    } catch (e) {
      setSettingsError(friendlyHostError(e))
    } finally {
      setSettingsSaving(false)
    }
  }

  async function toggleType(type, enabled) {
    setSettingsSaving(true)
    setSettingsError(null)
    try {
      await postJson('/dsh-term-dict/api/schema/type-enable', { type, enabled })
      await refreshSettings()
    } catch (e) {
      setSettingsError(friendlyHostError(e))
    } finally {
      setSettingsSaving(false)
    }
  }

  async function addType() {
    const name = newTypeName.trim()
    if (!name) return
    setSettingsSaving(true)
    setSettingsError(null)
    try {
      await postJson('/dsh-term-dict/api/schema/type-add', { name })
      setNewTypeName('')
      await refreshSettings()
    } catch (e) {
      setSettingsError(friendlyHostError(e))
    } finally {
      setSettingsSaving(false)
    }
  }

  /** 删自定义类型前先扫描：这个类型下多少条词条（词条不删，会退回按字段推断）。 */
  async function askRemoveType(type) {
    setSettingsError(null)
    try {
      const data = await getJson('/dsh-term-dict/api/schema/type-scan?type=' + encodeURIComponent(type))
      setTypeConfirm({ type, scan: data.scan })
    } catch (e) {
      setSettingsError(friendlyHostError(e))
    }
  }

  async function confirmRemoveType() {
    if (!typeConfirm) return
    setSettingsSaving(true)
    setSettingsError(null)
    try {
      const data = await postJson('/dsh-term-dict/api/schema/type-remove', { type: typeConfirm.type })
      setTypeConfirm(null)
      const next = Object.assign({}, SETTINGS_DEFAULTS, data.settings || {})
      setSettingsDraft(next)
      setSchema(next.schema || null)
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 2500)
    } catch (e) {
      setSettingsError(friendlyHostError(e))
    } finally {
      setSettingsSaving(false)
    }
  }

  /** 撤销待删类型：恢复原来的启用状态。 */
  async function undoPendingType(type) {
    setSettingsSaving(true)
    setSettingsError(null)
    try {
      await postJson('/dsh-term-dict/api/schema/type-unremove', { type })
      await refreshSettings()
    } catch (e) {
      setSettingsError(friendlyHostError(e))
    } finally {
      setSettingsSaving(false)
    }
  }

  /** 找其他层的命中：本层由输入框即时过滤，这里只管别的层（打字后延迟 300ms 跑一次）。 */
  async function searchOtherLayers(kw) {
    setOtherBusy(true)
    const out = []
    for (const l of layers) {
      if (l.id === activeId) continue
      let text = docs[l.id] && typeof docs[l.id].draft === 'string' ? docs[l.id].draft : ''
      if (!text) {
        try {
          const data = await getJson('/dsh-term-dict/api/read?id=' + encodeURIComponent(l.id))
          text = typeof data.content === 'string' ? data.content : ''
          setDocs((d) => Object.assign({}, d, {
            [l.id]: { loading: false, error: null, saving: false, savedAt: null, content: text, draft: text },
          }))
        } catch { continue }
      }
      for (const t of listTerms(text)) {
        const hay = (t.term + ' ' + Object.values(t.fields).join(' ')).toLowerCase()
        if (hay.indexOf(kw) === -1) continue
        out.push({ layer: l, term: t.term })
      }
    }
    setOtherHits(out)
    setOtherBusy(false)
  }

  function setDraft(text) {
    setDocs((d) => Object.assign({}, d, { [activeId]: Object.assign({}, d[activeId], { draft: text }) }))
  }

  useEffect(() => {
    void loadList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 词条结构（各类型的模块清单）跟设置一起读：它决定新建/编辑表单显示哪些字段。 */
  useEffect(() => {
    getJson('/dsh-term-dict/api/settings')
      .then((data) => { if (data && data.settings) setSchema(data.settings.schema || null) })
      .catch(() => { /* 宿主还没重启时按默认结构 */ })
  }, [])

  useEffect(() => {
    if (status !== 'ready' || !activeId) return
    if (!docs[activeId]) void loadDoc(activeId)
    setEditing(null)
    setAdding(false)
    setNameEditing(false)
    setSlugEditing(false)
    setFilter('')
    setShowOther(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, activeId])

  /** 跨层搜索点中一条：切到那一层后把它展开。 */
  useEffect(() => {
    if (!pendingTerm) return
    const d = docs[activeId]
    if (!d || d.loading) return
    if (listTerms(d.draft).some((t) => t.term === pendingTerm)) setEditing(pendingTerm)
    setPendingTerm('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTerm, docs, activeId])

  useEffect(() => {
    const kw = filter.trim().toLowerCase()
    if (!kw) { setOtherHits([]); setShowOther(false); return }
    const timer = setTimeout(() => { void searchOtherLayers(kw) }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  /** 原文视图：停手 1 秒自动落盘（离开输入框也会落一次）。 */
  useEffect(() => {
    if (view !== 'raw') return
    const d = docs[activeId]
    if (!d || d.loading || d.saving) return
    if (typeof d.draft !== 'string' || d.draft === d.content) return
    const timer = setTimeout(() => { void writeText(d.draft) }, 1000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, docs, activeId])

  if (status === 'loading') return <div className="td-pane"><p className="td-hint">{'正在读取术语字典…'}</p></div>

  if (status === 'error') {
    return (
      <div className="td-pane">
        <p className="td-error" role="alert">{'读取失败：' + error}</p>
        <div><button type="button" className="td-link" onClick={() => void loadList()}>{'重试'}</button></div>
      </div>
    )
  }

  if (advanced) {
    const d = settingsDraft || SETTINGS_DEFAULTS

    if (structureView) {
      const sc = d.schema || SETTINGS_DEFAULTS.schema
      const moduleList = sc.modules || []
      const types = sc.types || {}
      const pending = sc.pending || []
      const pendingTypes = sc.pendingTypes || []
      const typeKeys = Object.keys(types)
      const items = []
      for (const p of pending) items.push('模块 ' + p.field + '（' + formatTime(p.executeAt) + '）')
      for (const p of pendingTypes) {
        const tdef = types[p.type]
        items.push('类型 ' + ((tdef && tdef.label) || p.type) + '（' + formatTime(p.executeAt) + '）')
      }
      const dirtyModules = moduleList.filter((field) => {
        const def = (sc.moduleDefs && sc.moduleDefs[field]) || {}
        const draft = moduleDrafts[field] || { hint: '', multiline: true, inject: false }
        return draft.hint !== String(def.hint || '')
          || draft.multiline !== (def.multiline !== false)
          || draft.inject !== (def.inject === true)
      })
      return (
        <div className="td-root">
          <style>{CSS}</style>
          <div className="td-pane">
            <div className="td-head">
              <div className="td-titlewrap">
                <p className="td-title">{'词条结构'}</p>
                <p className="td-sub">{'模块是词条里的字段；改完点保存。删除先扫描，24 小时后才动文件。'}</p>
              </div>
              <div className="td-headacts">
                <button
                  type="button"
                  className="td-link"
                  onClick={() => { setAdvanced(false); setStructureView(false) }}
                >
                  {'返回'}
                </button>
              </div>
            </div>

            {settingsError ? <p className="td-error" role="alert">{settingsError}</p> : null}

            <table className="td-table">
              <thead>
                <tr>
                  <th>{'模块'}</th>
                  <th>{'填写说明'}</th>
                  <th className="td-th-center">{'多行'}</th>
                  <th className="td-th-center">{'灌注'}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {moduleList.map((field) => {
                  const draft = moduleDrafts[field] || { hint: '', multiline: true, inject: false }
                  const locked = LOCKED_MODULES.indexOf(field) !== -1
                  return (
                    <tr key={field}>
                      <td className="td-tdname">{field}</td>
                      <td>
                        <input
                          className="td-cell"
                          value={draft.hint}
                          placeholder={MODULE_DESC[field] || '填表时显示的提示'}
                          spellCheck={false}
                          onChange={(e) => setModuleDrafts((cur) => Object.assign({}, cur, {
                            [field]: Object.assign({}, draft, { hint: e.target.value }),
                          }))}
                        />
                      </td>
                      <td className="td-td-center">
                        <input
                          type="checkbox"
                          checked={draft.multiline}
                          onChange={(e) => setModuleDrafts((cur) => Object.assign({}, cur, {
                            [field]: Object.assign({}, draft, { multiline: e.target.checked }),
                          }))}
                        />
                      </td>
                      <td className="td-td-center">
                        <input
                          type="checkbox"
                          checked={draft.inject}
                          disabled={field === '别称'}
                          onChange={(e) => setModuleDrafts((cur) => Object.assign({}, cur, {
                            [field]: Object.assign({}, draft, { inject: e.target.checked }),
                          }))}
                        />
                      </td>
                      <td className="td-tdact">
                        {locked
                          ? <span className="td-lock" title="参与命中匹配，不能删除">{'锁'}</span>
                          : (
                            <button
                              type="button"
                              className="td-iconbtn"
                              title="删除：先扫描，确认后 24 小时才删字段"
                              onClick={() => void askRemoveModule(field)}
                            >
                              {'×'}
                            </button>
                          )}
                      </td>
                    </tr>
                  )
                })}
                {pending.filter((p) => moduleList.indexOf(p.field) === -1).map((p) => (
                  <tr key={'pending:' + p.field} className="td-row-pending">
                    <td className="td-tdname">{p.field}</td>
                    <td colSpan={3}>
                      <span className="td-hint">{formatTime(p.executeAt) + ' 删字段'}</span>
                    </td>
                    <td className="td-tdact">
                      <button type="button" className="td-link" onClick={() => void undoPendingModule(p.field)}>{'撤销'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="td-inline">
              <input
                className="td-input"
                style={{ width: 120 }}
                value={newModuleName}
                placeholder="新模块名"
                spellCheck={false}
                onChange={(e) => setNewModuleName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addModule(newModuleName) } }}
              />
              <button
                type="button"
                className="td-link"
                disabled={settingsSaving || !newModuleName.trim()}
                onClick={() => void addModule(newModuleName)}
              >
                {'＋ 新模块'}
              </button>
              {dirtyModules.length > 0
                ? (
                  <button
                    type="button"
                    className="td-btn primary"
                    disabled={settingsSaving}
                    onClick={() => void saveModuleDefs()}
                  >
                    {settingsSaving ? '保存中…' : '保存（' + dirtyModules.length + '）'}
                  </button>
                )
                : null}
              {settingsSaved ? <span className="td-hint">{'已保存'}</span> : null}
            </div>
            <p className="td-hint">{'删除：先扫描，确认后立即停灌注，24 小时后删字段（可撤销）。'}</p>

            {scanConfirm
              ? (
                <span className="td-confirm">
                  <span className="td-confirm-title">{'删除模块「' + scanConfirm.field + '」？'}</span>
                  <span>
                    {'全字典共 ' + scanConfirm.scan.total + ' 条词条，其中 ' + scanConfirm.scan.withField
                      + ' 条写了「' + scanConfirm.field + '」。确认后立即停止灌注，24 小时后（'
                      + formatTime(Date.now() + 24 * 3600 * 1000) + ' 左右）从所有字典文件删掉这些字段行（写前留 .bak）。'}
                  </span>
                  <span className="td-inline">
                    <button type="button" className="td-btn" onClick={() => setScanConfirm(null)}>{'取消'}</button>
                    <button type="button" className="td-btn danger" disabled={settingsSaving} onClick={() => void confirmRemoveModule()}>
                      {'确认删除'}
                    </button>
                  </span>
                </span>
              )
              : null}

            <p className="td-sect">{'类型用哪些模块'}</p>
            <table className="td-table">
              <thead>
                <tr>
                  <th>{'类型'}</th>
                  {moduleList.map((field) => <th key={field} className="td-th-center">{field}</th>)}
                  <th />
                </tr>
              </thead>
              <tbody>
                {typeKeys.map((typeId) => {
                  const typeDef = types[typeId] || { label: typeId, enabled: true, modules: [] }
                  const pendingType = pendingTypes.find((p) => p.type === typeId)
                  return (
                    <tr key={typeId}>
                      <td className="td-tdname" title={typeDef.label}>
                        <div>{typeDef.label}</div>
                        <div className="td-tddesc">
                          {pendingType ? (formatTime(pendingType.executeAt) + ' 移除配置') : (TYPE_DESC[typeId] || '自定义类型')}
                        </div>
                      </td>
                      {moduleList.map((field) => (
                        <td key={field} className="td-td-center">
                          {field === '别称'
                            ? <span className="td-checkmark" title="参与命中匹配，不能取消">{'✓'}</span>
                            : (
                              <input
                                type="checkbox"
                                checked={typeDef.modules.indexOf(field) !== -1}
                                onChange={() => void toggleTypeModule(typeId, field, typeDef.modules.indexOf(field) === -1)}
                              />
                            )}
                        </td>
                      ))}
                      <td className="td-tdact">
                        {pendingType
                          ? <button type="button" className="td-link" onClick={() => void undoPendingType(typeId)}>{'撤销'}</button>
                          : (
                            <span className="td-inline">
                              <button type="button" className="td-link" onClick={() => void toggleType(typeId, !typeDef.enabled)}>
                                {typeDef.enabled ? '停用' : '启用'}
                              </button>
                              {BUILTIN_TYPE_IDS.indexOf(typeId) === -1
                                ? (
                                  <button
                                    type="button"
                                    className="td-link danger"
                                    title="先扫描该类型词条；确认后立即停灌注，24 小时后移除配置"
                                    onClick={() => void askRemoveType(typeId)}
                                  >
                                    {'删除'}
                                  </button>
                                )
                                : null}
                            </span>
                          )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="td-inline">
              <input
                className="td-input"
                style={{ width: 130 }}
                value={newTypeName}
                placeholder="新类型名"
                spellCheck={false}
                onChange={(e) => setNewTypeName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addType() } }}
              />
              <button type="button" className="td-link" disabled={settingsSaving || !newTypeName.trim()} onClick={() => void addType()}>
                {'＋ 添加类型'}
              </button>
            </div>
            <p className="td-hint">{'删除类型：先扫描该类型词条 → 立即停止灌注 → 24 小时后移除类型配置（不删词条，可撤销）。'}</p>

            {typeConfirm
              ? (
                <span className="td-confirm">
                  <span className="td-confirm-title">{'删除类型「' + ((types[typeConfirm.type] && types[typeConfirm.type].label) || typeConfirm.type) + '」？'}</span>
                  <span>
                    {'该类型下有 ' + typeConfirm.scan.total + ' 条词条。确认后立即停用并停止灌注该类型词条；24 小时后移除类型配置（不删词条，之后退回按字段推断归类）。'}
                  </span>
                  <span className="td-inline">
                    <button type="button" className="td-btn" onClick={() => setTypeConfirm(null)}>{'取消'}</button>
                    <button type="button" className="td-btn danger" disabled={settingsSaving} onClick={() => void confirmRemoveType()}>
                      {'确认删除'}
                    </button>
                  </span>
                </span>
              )
              : null}
          </div>
        </div>
      )
    }

    const moduleList = (d.schema && d.schema.modules) || []
    return (
      <div className="td-root">
        <style>{CSS}</style>
        <div className="td-pane">
          <div className="td-head">
            <div className="td-titlewrap">
              <p className="td-title">{'高级设置'}</p>
              <p className="td-sub">{'自动激活与注入上限 · 写在 dict\\.settings.json'}</p>
            </div>
            <div className="td-headacts">
              <button type="button" className="td-link" onClick={() => setAdvanced(false)}>{'返回'}</button>
            </div>
          </div>

          {settingsError ? <p className="td-error" role="alert">{settingsError}</p> : null}

          <div className="td-settings">
            <p className="td-hint">
              {'这些值控制「词条第一次出现时自动注入定义」的行为。保存后下一次扫描起生效；已经注入的词条不会被撤掉，新值只影响之后命中的词条。'}
            </p>

            <p className="td-sect">{'自动激活'}</p>
            <label className="td-srow">
              <span className="td-slabel">{'开关'}</span>
              <span className="td-sfield">
                <input
                  type="checkbox"
                  checked={Boolean(d.autoActivate)}
                  onChange={(e) => setDraftField('autoActivate', e.target.checked)}
                />
                <span className="td-hint">{d.autoActivate ? '开：命中词条就注入' : '关：不再注入新词条（已注入的保留）'}</span>
              </span>
            </label>
            <label className="td-srow">
              <span className="td-slabel">{'单会话最多'}</span>
              <span className="td-sfield">
                <input
                  className="td-input td-numinput"
                  type="number"
                  min="1"
                  max="500"
                  value={d.maxActive}
                  onChange={(e) => setDraftField('maxActive', e.target.value)}
                />
                <span className="td-unit">{'条'}</span>
              </span>
            </label>
            <label className="td-srow">
              <span className="td-slabel">{'单条最多'}</span>
              <span className="td-sfield">
                <input
                  className="td-input td-numinput"
                  type="number"
                  min="0"
                  max="20000"
                  value={d.maxEntryChars}
                  onChange={(e) => setDraftField('maxEntryChars', e.target.value)}
                />
                <span className="td-unit">{'字（0＝整条完整注入）'}</span>
              </span>
            </label>
            <label className="td-srow">
              <span className="td-slabel">{'整段最多'}</span>
              <span className="td-sfield">
                <input
                  className="td-input td-numinput"
                  type="number"
                  min="500"
                  max="200000"
                  value={d.maxTotalChars}
                  onChange={(e) => setDraftField('maxTotalChars', e.target.value)}
                />
                <span className="td-unit">{'字（所有已注入词条合计）'}</span>
              </span>
            </label>

            <p className="td-sect">{'灌注的模式'}</p>
            <div className="td-srow td-srow-top">
              <span className="td-slabel">{'限定模式'}</span>
              <span className="td-sfield td-sfield-col">
                <span className="td-hint">{'全不勾＝只灌注通用会话（没有模式或判不出模式）；勾了就只在这些模式里灌注——其余模式（含新建的）既不注入词条，也看不到字典工具。'}</span>
                {Array.isArray(presetRoster) && presetRoster.length > 0
                  ? (
                    <span className="td-chips">
                      <label className="td-check">
                        <input
                          type="checkbox"
                          checked={presetRoster.every((p) => Array.isArray(d.presets) && d.presets.indexOf(p.id) !== -1)}
                          onChange={(e) => setDraftField('presets', e.target.checked ? presetRoster.map((p) => p.id) : [])}
                        />
                        <span className="td-checkname">{'全选'}</span>
                      </label>
                      {presetRoster.map((p) => {
                        const on = Array.isArray(d.presets) && d.presets.indexOf(p.id) !== -1
                        return (
                          <label
                            className="td-check"
                            key={p.id}
                            title={p.broken ? ('这个模式现在装不起来：' + p.broken) : (p.description || p.id)}
                          >
                            <input type="checkbox" checked={on} onChange={() => togglePresetDraft(p.id)} />
                            <span className="td-checkname">{p.name || p.id}</span>
                            {p.name && p.name !== p.id ? <span className="td-lock">{p.id}</span> : null}
                            {p.isDefault ? <span className="td-lock">{'默认'}</span> : null}
                            {p.broken ? <span className="td-lock">{'坏'}</span> : null}
                          </label>
                        )
                      })}
                    </span>
                  )
                  : (
                    <textarea
                      className="td-area"
                      rows={2}
                      value={Array.isArray(d.presets) ? d.presets.join('\n') : ''}
                      spellCheck={false}
                      placeholder={'一行一个模式的 agentPreset id；留空＝只灌注通用会话'}
                      onChange={(e) => setDraftField('presets', e.target.value.split('\n'))}
                    />
                  )}
                {presetNote ? <span className="td-hint">{'拿不到本机模式清单（' + presetNote + '），可手填 id。'}</span> : null}
                {(() => {
                  const known = Array.isArray(presetRoster) ? presetRoster.map((p) => p.id) : []
                  const extra = (Array.isArray(d.presets) ? d.presets : []).filter((id) => known.indexOf(id) === -1)
                  if (extra.length === 0) return null
                  return (
                    <span className="td-hint">
                      {'已保存、但本机清单里没有的模式：'}
                      {extra.map((id) => (
                        <button type="button" className="td-link" key={id} onClick={() => togglePresetDraft(id)}>{id + ' ×'}</button>
                      ))}
                    </span>
                  )
                })()}
              </span>
            </div>

            <p className="td-sect">{'不灌注的范围'}</p>
            <div className="td-srow td-srow-top">
              <span className="td-slabel">{'工作空间'}</span>
              <span className="td-sfield td-sfield-col">
                <span className="td-hint">{'勾上的工作空间不自动注入词条。判定按路径子串（不分大小写）：勾了上层目录，它下面的工作空间也会一起命中。'}</span>
                {(() => {
                  const list = Array.isArray(d.skipWorkspaces) ? d.skipWorkspaces : []
                  const roster = Array.isArray(workspaceRoster) ? workspaceRoster : []
                  const paths = roster.map((w) => String(w.path || '').toLowerCase())
                  const manual = list.filter((v) => paths.indexOf(String(v).toLowerCase()) === -1)
                  return (
                    <>
                      <label className="td-check">
                        <input
                          type="checkbox"
                          checked={roster.length > 0 && roster.every((w) => list.some((v) => String(v).toLowerCase() === String(w.path || '').toLowerCase()))}
                          onChange={(e) => commitSkipWorkspaces(e.target.checked ? roster.map((w) => String(w.path || '')).filter((v) => v !== '') : [])}
                        />
                        <span className="td-checkname">{'全选'}</span>
                      </label>
                      {roster.length > 0
                        ? (
                          <span className="td-chips">
                            {roster.map((w) => {
                              const on = list.some((v) => String(v).toLowerCase() === String(w.path || '').toLowerCase())
                              return (
                                <label className="td-check" key={w.path || w.id} title={w.path || w.id}>
                                  <input type="checkbox" checked={on} onChange={() => toggleWorkspaceDraft(w.path)} />
                                  <span className="td-checkname">{w.title || w.path || w.id}</span>
                                  {w.title && w.path ? <span className="td-lock">{w.path}</span> : null}
                                </label>
                              )
                            })}
                          </span>
                        )
                        : null}
                      <textarea
                        className="td-area"
                        rows={2}
                        value={manual.join('\n')}
                        spellCheck={false}
                        placeholder={'另加路径片段：一行一条，会话的工作目录含它就整个会话不灌注'}
                        onChange={(e) => commitSkipWorkspaces(e.target.value.split('\n'))}
                      />
                    </>
                  )
                })()}
                {workspaceNote ? <span className="td-hint">{'拿不到本机工作空间清单（' + workspaceNote + '），只能手填路径片段。'}</span> : null}
              </span>
            </div>

            {false ? (
            <Fragment>
            <p className="td-sect">{'词条结构'}</p>
            {(() => {
              const items = []
              for (const p of ((d.schema && d.schema.pending) || [])) {
                items.push('模块 ' + p.field + '（' + formatTime(p.executeAt) + '）')
              }
              for (const p of ((d.schema && d.schema.pendingTypes) || [])) {
                const def = d.schema.types && d.schema.types[p.type]
                items.push('类型 ' + ((def && def.label) || p.type) + '（' + formatTime(p.executeAt) + '）')
              }
              return items.length > 0
                ? <p className="td-pending">{'待删除：' + items.join('、')}</p>
                : null
            })()}
            <div className="td-srow td-srow-top">
              <span className="td-slabel">{'模块'}</span>
              <span className="td-sfield td-sfield-col">
                <span className="td-chips">
                  {moduleList.map((field) => (
                    <span className="td-chip" key={field}>
                      {field}
                      {LOCKED_MODULES.indexOf(field) !== -1
                        ? <span className="td-lock" title="参与类型推断或命中匹配，不能删除">{'锁'}</span>
                        : (
                          <button
                            type="button"
                            className="td-chipx"
                            title="删除这个模块（先扫描影响）"
                            onClick={() => void askRemoveModule(field)}
                          >
                            {'×'}
                          </button>
                        )}
                    </span>
                  ))}
                  <span className="td-inline">
                    <input
                      className="td-input"
                      style={{ width: 120 }}
                      value={newModuleName}
                      placeholder="新模块名"
                      spellCheck={false}
                      onChange={(e) => setNewModuleName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addModule(newModuleName) } }}
                    />
                    <button
                      type="button"
                      className="td-link"
                      disabled={settingsSaving || !newModuleName.trim()}
                      onClick={() => void addModule(newModuleName)}
                    >
                      {'＋ 模块'}
                    </button>
                  </span>
                </span>
                {((d.schema && d.schema.pending) || []).map((p) => (
                  <span className="td-pending" key={p.field}>
                    {'「' + p.field + '」已停止灌注，将于 ' + formatTime(p.executeAt) + ' 从所有词条删除'}
                    <button type="button" className="td-link" onClick={() => void undoPendingModule(p.field)}>{'撤销'}</button>
                  </span>
                ))}
                {settingsError
                  ? <span className="td-error" role="alert">{settingsError}</span>
                  : null}
                {scanConfirm
                  ? (
                    <span
                      className="td-confirm"
                      ref={(el) => { if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' }) }}
                    >
                      <span>
                        {'全字典共 ' + scanConfirm.scan.total + ' 条词条，其中 ' + scanConfirm.scan.withField
                          + ' 条写了「' + scanConfirm.field + '」。确认后立即停止灌注这个模块，24 小时后（'
                          + formatTime(Date.now() + 24 * 3600 * 1000) + ' 左右）从所有字典文件删除（写前留 .bak）。'}
                      </span>
                      <span className="td-inline">
                        <button type="button" className="td-link" onClick={() => setScanConfirm(null)}>{'取消'}</button>
                        <button
                          type="button"
                          className="td-link primary"
                          disabled={settingsSaving}
                          onClick={() => void confirmRemoveModule()}
                        >
                          {'确认删除'}
                        </button>
                      </span>
                    </span>
                  )
                  : null}
              </span>
            </div>

            <p className="td-sect">{'类型'}</p>
            {Object.keys((d.schema && d.schema.types) || SETTINGS_DEFAULTS.schema.types).map((typeId) => {
              const typeDef = (d.schema && d.schema.types && d.schema.types[typeId])
                || { label: typeId, enabled: true, modules: [] }
              const pendingType = ((d.schema && d.schema.pendingTypes) || []).find((p) => p.type === typeId)
              return (
                <div className="td-srow" key={typeId}>
                  <span className="td-slabel" title={typeDef.label}>{typeDef.label}</span>
                  <span className="td-sfield td-sfield-col">
                    <span
                      className="td-typegrid"
                      style={{ gridTemplateColumns: 'repeat(' + moduleList.length + ', minmax(0, 1fr)) auto' }}
                    >
                      {moduleList.map((field) => (
                        field === '别称'
                          ? (
                            <span className="td-check td-check-lock" key={field} title="别称参与命中匹配，不能取消">
                              {'✓' + field}
                            </span>
                          )
                          : (
                            <label className="td-check" key={field} title={field}>
                              <input
                                type="checkbox"
                                checked={typeDef.modules.indexOf(field) !== -1}
                                onChange={() => void toggleTypeModule(typeId, field, typeDef.modules.indexOf(field) === -1)}
                              />
                              <span className="td-checkname">{field}</span>
                            </label>
                          )
                      ))}
                      <span className="td-inline">
                        {pendingType
                          ? (
                            <button type="button" className="td-link" onClick={() => void undoPendingType(typeId)}>{'撤销'}</button>
                          )
                          : (
                            <Fragment>
                              <button type="button" className="td-link" onClick={() => void toggleType(typeId, !typeDef.enabled)}>
                                {typeDef.enabled ? '停用' : '启用'}
                              </button>
                              {BUILTIN_TYPE_IDS.indexOf(typeId) === -1
                                ? (
                                  <button type="button" className="td-link" onClick={() => void askRemoveType(typeId)}>
                                    {'删除'}
                                  </button>
                                )
                                : null}
                              {typeDef.enabled ? null : <span className="td-hint">{'已停用'}</span>}
                            </Fragment>
                          )}
                      </span>
                    </span>
                    {pendingType
                      ? (
                        <span className="td-pending">
                          {'类型「' + typeDef.label + '」将于 ' + formatTime(pendingType.executeAt) + ' 移除配置；期间不灌注该类型词条（不删词条）'}
                        </span>
                      )
                      : null}
                    {typeConfirm && typeConfirm.type === typeId
                      ? (
                        <span
                          className="td-confirm"
                          ref={(el) => { if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' }) }}
                        >
                          <span>
                            {'该类型下有 ' + typeConfirm.scan.total + ' 条词条。确认后立即停用、不再灌注该类型词条；24 小时后移除类型配置（不删词条，之后退回按字段推断归类）。'}
                          </span>
                          <span className="td-inline">
                            <button type="button" className="td-link" onClick={() => setTypeConfirm(null)}>{'取消'}</button>
                            <button
                              type="button"
                              className="td-link primary"
                              disabled={settingsSaving}
                              onClick={() => void confirmRemoveType()}
                            >
                              {'确认删除'}
                            </button>
                          </span>
                        </span>
                      )
                      : null}
                  </span>
                </div>
              )
            })}
            <div className="td-srow">
              <span className="td-slabel" />
              <span className="td-sfield">
                <input
                  className="td-input td-numinput"
                  style={{ width: 140 }}
                  value={newTypeName}
                  placeholder="新类型名"
                  spellCheck={false}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addType() } }}
                />
                <button
                  type="button"
                  className="td-link primary"
                  disabled={settingsSaving || !newTypeName.trim()}
                  onClick={() => void addType()}
                >
                  {'＋ 添加类型'}
                </button>
              </span>
            </div>
            </Fragment>
            ) : null}

            <div className="td-srow">
              <span className="td-slabel" />
              <span className="td-sfield">
                <button
                  type="button"
                  className="td-btn"
                  onClick={() => setSettingsDraft(Object.assign({}, SETTINGS_DEFAULTS, {
                    schema: (settingsDraft && settingsDraft.schema) || SETTINGS_DEFAULTS.schema,
                  }))}
                >
                  {'恢复默认'}
                </button>
                <button
                  type="button"
                  className="td-btn primary"
                  disabled={settingsSaving}
                  onClick={() => void saveAdvanced()}
                >
                  {settingsSaving ? '保存中…' : '保存'}
                </button>
                {settingsSaved ? <span className="td-hint">{'已保存，下一次扫描起生效'}</span> : null}
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /** 名册一行（通用层 / 任务层，按组平铺）；任务层行末可删。 */
  const row = (layer) => (
    <div
      key={layer.id}
      className="td-row"
      aria-current={layer.id === activeId ? 'true' : undefined}
      title={layer.path}
    >
      <button type="button" className="td-rowmain" onClick={() => setActiveId(layer.id)}>
        <span>{layerLabel(layer)}</span>
        <span className="td-num">{layer.exists ? String(layer.terms) : '—'}</span>
      </button>
      {layer.kind === 'domain' && layer.exists ? (
        <button
          type="button"
          className="td-rowdel"
          title={'删除这个任务层（文件改名归档，可找回）'}
          onClick={() => {
            setLayerConfirm(layer.id)
            setAdvanced(false)
            setStructureView(false)
            setView('terms')
          }}
        >
          {'×'}
        </button>
      ) : null}
    </div>
  )

  return (
    <div className="td-root">
      <style>{CSS}</style>
      <aside className="td-roster" aria-label="通用 / 任务层">
        <p className="td-grouplabel">{'通用'}</p>
        {generalLayers.map((l) => row(l))}
        <p className="td-grouplabel">{'任务层'}</p>
        {domains.map((d) => row(d))}
        {creatingLayer
          ? (
            <div className="td-newlayer">
              <input
                className="td-input"
                style={{ width: '100%' }}
                value={newLayerName}
                placeholder="任务层名称"
                spellCheck={false}
                autoFocus
                onChange={(e) => setNewLayerName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); void createLayer() }
                  if (e.key === 'Escape') { setCreatingLayer(false); setNewLayerName('') }
                }}
              />
              <span className="td-inline">
                <button type="button" className="td-link primary" disabled={layerSaving || !newLayerName.trim()} onClick={() => void createLayer()}>
                  {layerSaving ? '创建中…' : '创建'}
                </button>
                <button type="button" className="td-link" onClick={() => { setCreatingLayer(false); setNewLayerName('') }}>{'取消'}</button>
              </span>
            </div>
          )
          : (
            <button
              type="button"
              className="td-link td-newlayerbtn"
              onClick={() => { setCreatingLayer(true); setNewLayerName('') }}
            >
              {'＋ 新建任务层'}
            </button>
          )}
      </aside>

      <div className="td-pane">
        <div className="td-head">
          <div className="td-titlewrap">
            {nameEditing && active
              ? (
                <span className="td-inline">
                  <input
                    className="td-titleinput"
                    value={nameDraft}
                    spellCheck={false}
                    autoFocus
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const next = nameDraft.trim()
                        if (next && next !== (active.taskType || active.slug || '')) void submitRename({ name: next })
                      } else if (e.key === 'Escape') {
                        setNameEditing(false)
                      }
                    }}
                  />
                  <button type="button" className="td-link" onClick={() => setNameEditing(false)}>{'取消'}</button>
                  <button
                    type="button"
                    className="td-link primary"
                    disabled={rnSaving || !nameDraft.trim() || nameDraft.trim() === (active.taskType || active.slug || '')}
                    onClick={() => void submitRename({ name: nameDraft.trim() })}
                  >
                    {rnSaving ? '保存中…' : '保存'}
                  </button>
                </span>
              )
              : (active && active.kind === 'domain'
                ? (
                  <button
                    type="button"
                    className="td-titlebtn"
                    title="点一下改显示名"
                    onClick={() => {
                      setNameDraft(active.taskType || active.slug || '')
                      setRnError(null)
                      setNameEditing(true)
                    }}
                  >
                    {layerLabel(active)}
                  </button>
                )
                : <p className="td-title">{layerLabel(active)}</p>)}
            <p className="td-sub">
              {(active && active.kind === 'domain' ? '任务层 · ' : '') + (doc.loading ? '读取中…' : terms.length + ' 条词条')}
            </p>
            {active && active.kind === 'domain'
              ? (() => {
                const bound = Array.isArray(active.workspaces) ? active.workspaces.filter(Boolean) : []
                const titleOf = (path) => {
                  const hit = wsOptions.find((w) => w.path === path)
                  return (hit && (hit.title || hit.path)) || path
                }
                const summary = bound.length === 0 ? '所有工作空间' : bound.map(titleOf).join('、')
                const extras = bound.filter((p) => !wsOptions.some((w) => w.path === p))
                return (
                  <p className="td-sub td-wsline">
                    <span className="td-rlabel">{'工作空间'}</span>
                    <span className="td-wscombo">
                      <button
                        type="button"
                        className="td-wsbtn"
                        aria-expanded={wsOpen}
                        title={bound.join('、') || '所有工作空间都生效'}
                        onClick={() => (wsOpen ? setWsOpen(false) : openWsPicker())}
                      >
                        <span className="td-wssummary">{summary}</span>
                        <span aria-hidden="true">{'▾'}</span>
                      </button>
                      {wsOpen
                        ? (
                          <span className="td-wsdropdown">
                            {wsError ? <span className="td-error">{wsError}</span> : null}
                            <label className="td-wsopt">
                              <input
                                type="checkbox"
                                checked={bound.length === 0}
                                onChange={() => void commitWorkspaces([])}
                              />
                              <span className="td-wsname">{'所有工作空间（不绑定）'}</span>
                            </label>
                            {wsOptions.map((w) => (
                              <label className="td-wsopt" key={w.path}>
                                <input
                                  type="checkbox"
                                  checked={bound.indexOf(w.path) !== -1}
                                  onChange={() => toggleWorkspace(w.path)}
                                />
                                <span className="td-wsname">{w.title || w.path}</span>
                                <span className="td-wspath">{w.path}</span>
                              </label>
                            ))}
                            {extras.map((p) => (
                              <label className="td-wsopt" key={'extra:' + p}>
                                <input type="checkbox" checked onChange={() => toggleWorkspace(p)} />
                                <span className="td-wsname">{'已绑定片段'}</span>
                                <span className="td-wspath">{p}</span>
                              </label>
                            ))}
                            {wsOptions.length === 0 && !wsError
                              ? <span className="td-hint">{'没有工作空间清单'}</span>
                              : null}
                          </span>
                        )
                        : null}
                    </span>
                    {wsSaving ? <span className="td-hint">{'保存中…'}</span> : null}
                  </p>
                )
              })()
              : null}
          </div>
          <div className="td-headacts">
            <button type="button" className="td-link" onClick={() => void openStructure()}>{'结构'}</button>
            <button type="button" className="td-link" onClick={() => void openAdvanced()}>{'设置'}</button>
          </div>
        </div>

        {rnError ? <p className="td-error" role="alert">{rnError}</p> : null}

        {layerConfirm ? (() => {
          const target = layers.find((l) => l.id === layerConfirm) || null
          return (
            <p className="td-confirm">
              <span>
                {'删除任务层「' + (target ? layerLabel(target) : layerConfirm) + '」？'}
                {'文件会改名归档（.deleted-时间戳），词条不丢，改回文件名即可找回。'}
              </span>
              <span className="td-inline">
                <button
                  type="button"
                  className="td-btn primary"
                  disabled={layerDeleting}
                  onClick={() => void deleteLayer(layerConfirm)}
                >
                  {layerDeleting ? '删除中…' : '删除'}
                </button>
                <button type="button" className="td-btn" onClick={() => setLayerConfirm(null)}>{'取消'}</button>
              </span>
            </p>
          )
        })() : null}

        <div className="td-toolbar">
          {view === 'terms'
            ? (
              <input
                className="td-search"
                value={filter}
                placeholder="搜索本层词条…"
                spellCheck={false}
                onChange={(e) => setFilter(e.target.value)}
              />
            )
            : <span className="td-hint">{'原文视图：改完离开输入框即落盘。'}</span>}
          <div className="td-tabs">
            <button type="button" className="td-tab" aria-selected={view === 'terms'} onClick={() => setView('terms')}>{'词条'}</button>
            <button type="button" className="td-tab" aria-selected={view === 'raw'} onClick={() => setView('raw')}>{'原文'}</button>
          </div>
        </div>

        {view === 'terms'
          ? (
            <div className="td-list">

              {doc.loading
                ? <p className="td-hint">{'读取中…'}</p>
                : null}
              {doc.error !== null
                ? <p className="td-error" role="alert">{doc.error}</p>
                : null}

              {!doc.loading && shown.length === 0 && !adding
                ? <p className="td-hint">{keyword ? '没有匹配的词条。' : '这一层还没有词条，点下面的「＋ 新建词条」加一条。'}</p>
                : null}

              {groups.map((g) => {
                const folded = Boolean(collapsedStatus[g.key])
                return (
                  <Fragment key={'status:' + g.key}>
                    <div className="td-group">
                      <button
                        type="button"
                        className="td-groupbtn"
                        aria-expanded={!folded}
                        title={folded ? '展开这一组' : '收起这一组'}
                        onClick={() => setCollapsedStatus((c) => Object.assign({}, c, { [g.key]: !c[g.key] }))}
                      >
                        <span>{folded ? '▸ ' : '▾ '}{g.key}</span>
                        <span className="td-groupnum">{g.items.length}</span>
                      </button>
                      <button
                        type="button"
                        className="td-groupadd"
                        title={'在这一组加一条'}
                        onClick={() => {
                          setView('terms')
                          setCollapsedStatus((c) => Object.assign({}, c, { [g.key]: false }))
                          setAddingStatus(g.key)
                          setAdding(true)
                          setEditing(null)
                        }}
                      >
                        {'＋'}
                      </button>
                    </div>
                    {adding && addingStatus === g.key ? (
                      <TermForm
                        isNew
                        term=""
                        key={'new:' + g.key}
                        schema={schema}
                        fields={{ 状态: g.key }}
                        saving={doc.saving}
                        layerOptions={layerOptions}
                        layerId={activeId}
                        onCancel={() => setAdding(false)}
                        onSave={async (name, fields, targetId) => {
                          const ok = await saveEntry(name, fields, targetId, true)
                          if (ok) setAdding(false)
                        }}
                      />
                    ) : null}
                    {folded ? null : g.items.map((t) => (
                      <Fragment key={t.term}>
                        <button
                          type="button"
                          className="td-entry"
                          aria-current={editing === t.term ? 'true' : undefined}
                          title="点一下展开编辑"
                          onClick={() => setEditing(editing === t.term ? null : t.term)}
                        >
                          <span className="td-entryname">{t.term}</span>
                          <span className="td-entrymeta">
                            <span className="td-caret" aria-hidden="true">{'›'}</span>
                          </span>
                        </button>
                        {editing === t.term
                          ? (
                            <TermForm
                              key={t.term + ':form'}
                              term={t.term}
                              fields={t.fields}
                              schema={schema}
                              saving={doc.saving}
                              layerOptions={layerOptions}
                              layerId={activeId}
                              onCancel={() => setEditing(null)}
                              onSave={async (_name, fields, targetId) => {
                                const ok = await saveEntry(t.term, fields, targetId, false)
                                if (ok) setEditing(null)
                              }}
                              onDelete={async () => {
                                const ok = await writeText(removeTerm(doc.draft, t.term))
                                if (ok) setEditing(null)
                              }}
                            />
                          )
                          : null}
                      </Fragment>
                    ))}
                  </Fragment>
                )
              })}

              {groups.length === 0 ? (
                adding ? (
                  <TermForm
                    isNew
                    term=""
                    key="new-empty"
                    schema={schema}
                    fields={{ 状态: addingStatus }}
                    saving={doc.saving}
                    layerOptions={layerOptions}
                    layerId={activeId}
                    onCancel={() => setAdding(false)}
                    onSave={async (name, fields, targetId) => {
                      const ok = await saveEntry(name, fields, targetId, true)
                      if (ok) setAdding(false)
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="td-addrow"
                    onClick={() => { setView('terms'); setAddingStatus('待观察'); setAdding(true); setEditing(null) }}
                  >
                    {'＋ 新建词条'}
                  </button>
                )
              ) : null}

              {keyword && (otherBusy || otherHits.length > 0)
                ? (
                  <div className="td-other">
                    <button type="button" className="td-link" onClick={() => setShowOther((v) => !v)}>
                      {otherBusy ? '正在找其他层…' : '其他层命中 ' + otherHits.length + ' 条 ' + (showOther ? '（收起）' : '（展开）')}
                    </button>
                    {showOther
                      ? otherHits.map((h) => (
                        <button
                          key={h.layer.id + ':' + h.term}
                          type="button"
                          className="td-entry"
                          onClick={() => {
                            setShowOther(false)
                            setFilter('')
                            setPendingTerm(h.term)
                            setActiveId(h.layer.id)
                          }}
                        >
                          <span className="td-entryname">{h.term}</span>
                          <span className="td-status">{layerLabel(h.layer)}</span>
                        </button>
                      ))
                      : null}
                  </div>
                )
                : null}
            </div>
          )
          : (
            <textarea
              className="td-area"
              style={{ minHeight: 320, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', lineHeight: 1.7 }}
              value={doc.draft}
              spellCheck={false}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => { if (dirty) void writeText(doc.draft) }}
            />
          )}

        <div className="td-foot">
          <span className="td-footleft">
            {slugEditing && active
              ? (
                <span className="td-inline">
                  <span className="td-rlabel">{'文件名'}</span>
                  <input
                    className="td-input"
                    value={slugDraft}
                    spellCheck={false}
                    autoFocus
                    title="改后 dict\domains 下的 md 文件一并改名，词条内容不动"
                    onChange={(e) => setSlugDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const next = slugDraft.trim()
                        if (next && next !== (active.slug || '')) void submitRename({ slug: next })
                      } else if (e.key === 'Escape') {
                        setSlugEditing(false)
                      }
                    }}
                  />
                  <button type="button" className="td-link" onClick={() => setSlugEditing(false)}>{'取消'}</button>
                  <button
                    type="button"
                    className="td-link primary"
                    disabled={rnSaving || !slugDraft.trim() || slugDraft.trim() === (active.slug || '')}
                    onClick={() => void submitRename({ slug: slugDraft.trim() })}
                  >
                    {rnSaving ? '保存中…' : '保存'}
                  </button>
                </span>
              )
              : (
                <Fragment>
                  <span className="td-path">{active ? (active.rel || active.path) : ''}</span>
                  {active && active.kind === 'domain'
                    ? (
                      <button
                        type="button"
                        className="td-link"
                        title="改文件名＝dict\domains 下的 md 文件改名，词条内容不动"
                        onClick={() => {
                          setSlugDraft(active.slug || '')
                          setRnError(null)
                          setSlugEditing(true)
                        }}
                      >
                        {'改文件名'}
                      </button>
                    )
                    : null}
                </Fragment>
              )}
          </span>
          <span className="td-status">
            {doc.saving ? '保存中…' : (dirty ? '未保存' : (doc.savedAt ? '已保存' : ''))}
          </span>
        </div>
      </div>
    </div>
  )
}

/** 空层（文件还没建）上第一条词条落盘时，补一个与宿主一致的表头。 */
function headerFor(text, layer) {
  if (String(text == null ? '' : text).trim() !== '') return text
  if (layer && layer.kind === 'domain') {
    const slug = layer.slug || ''
    return '# 术语字典·任务层·' + slug + '\n\n'
      + '> 任务类型：' + (layer.taskType || slug) + '\n\n'
  }
  return '# 术语字典·通用层\n\n'
    + '> 收录判据：双方都在用、会出现口径分歧的词。格式：`## 词条名（别名：另一叫法）` 下面「- 定义／- 默认指代／- 边界／- 状态／- 备注」（除定义外可选）。\n\n'
}

/** 需要的客户端服务。 */
export const inject = ['slots']

const MUTE_CSS = `.pp-mutebtn { padding:2px 8px; border:1px solid var(--dsw-alias-border-l1); border-radius:999px; min-width:58px; text-align:center;
  background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font:inherit; font-size:11px;
  line-height:1.4; cursor:pointer; white-space:nowrap; }
.pp-mutebtn:hover { border-color:var(--dsw-alias-brand-primary); }
.pp-mutebtn[data-muted="true"] { color:var(--dsw-alias-state-error-primary); border-color:currentColor; }
.pp-mutebtn:disabled { opacity:.6; cursor:default; }`

/** apply 里注入：拿客户端的 sessions 服务。 */
let getSessionsService = () => undefined

/** 当前会话的 preset：订阅 session projection，切模式就跟着变（不用轮询）。 */
function useAgentPreset(sessionId) {
  const [preset, setPreset] = useState(undefined)
  useEffect(() => {
    if (!sessionId) return undefined
    let alive = true
    let face
    try {
      const service = getSessionsService()
      const binding = service && typeof service.binding === 'function' ? service.binding(sessionId) : undefined
      face = binding && binding.session && binding.session.projections
        ? binding.session.projections.faceOf('agentPreset')
        : undefined
    } catch {
      face = undefined
    }
    if (!face) return undefined
    const read = () => { if (alive) setPreset(face.getSnapshot()) }
    read()
    const off = typeof face.subscribe === 'function' ? face.subscribe(read) : undefined
    return () => {
      alive = false
      if (typeof off === 'function') off()
    }
  }, [sessionId])
  return preset
}

const MUTE_CACHE = new Map()

/** 会话里的小开关：本会话词条注／禁；当前模式不在灌注名单里就显示「禁」、点不动。 */
export function SessionDictToggle(props) {
  const sessionId = props && props.sessionId ? String(props.sessionId) : ''
  const preset = useAgentPreset(sessionId)
  const [muted, setMuted] = useState(() => (sessionId && MUTE_CACHE.has(sessionId) ? MUTE_CACHE.get(sessionId) : null))
  const [presets, setPresets] = useState(null)
  const [serverAllowed, setServerAllowed] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!sessionId) return undefined
    let alive = true
    const read = () => {
      getJson('/dsh-term-dict/api/session-state?id=' + encodeURIComponent(sessionId))
        .then((data) => {
          if (!alive) return
          const next = Boolean(data.muted)
          MUTE_CACHE.set(sessionId, next)
          setMuted(next)
          setPresets(Array.isArray(data.presets) ? data.presets : null)
          setServerAllowed(data.allowed === undefined ? null : Boolean(data.allowed))
        })
        .catch(() => {})
    }
    read()
    window.addEventListener('focus', read)
    return () => {
      alive = false
      window.removeEventListener('focus', read)
    }
  }, [sessionId])

  if (!sessionId) return null
  // 有模式且不在「灌注的模式」名单里＝禁（含新建的模式）；判不出模式（通用会话）按放行，
  // 名单清单取不到时退回宿主给的 allowed。
  const blocked = typeof preset === 'string' && preset !== ''
    ? (Array.isArray(presets) ? presets.indexOf(preset) === -1 : serverAllowed === false)
    : serverAllowed === false
  const label = blocked ? '词条·禁' : (busy ? '词条…' : (muted === null ? '词条…' : (muted ? '词条·禁' : '词条·注')))
  const toggle = async () => {
    if (busy || muted === null || blocked) return
    setBusy(true)
    try {
      const data = await postJson('/dsh-term-dict/api/session-mute', { id: sessionId, muted: !muted })
      const next = Boolean(data.muted)
      MUTE_CACHE.set(sessionId, next)
      setMuted(next)
    } catch {
      /* 失败保持原状态 */
    } finally {
      setBusy(false)
    }
  }
  return (
    <Fragment>
      <style>{MUTE_CSS}</style>
      <button
        type="button"
        className="pp-mutebtn"
        data-muted={blocked || muted === true ? 'true' : 'false'}
        disabled={busy || muted === null || blocked}
        title={blocked ? '当前模式不在词条灌注名单里（设置 → 术语字典 → 灌注）' : '术语字典：本会话是否灌注词条'}
        onClick={() => void toggle()}
      >
        {label}
      </button>
    </Fragment>
  )
}
/**
 * 把面板挂进设置页，并在会话标题旁放「词条·注／禁」开关。
 * @param ctx - 客户端根上下文。
 */
export function apply(ctx) {
  getSessionsService = () => { try { return ctx.get('sessions') } catch { return undefined } }

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'term-dict',
    order: 35,
    label: '术语字典',
  }, TermDictSection))

  try {
    ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
      name: 'conversation.input.right',
      id: 'term-dict-mute',
      order: 20,
      label: '词条灌注',
    }, SessionDictToggle))
  } catch {
    // 输入栏右侧没有座位时退回会话标题旁（标题区会裁剪溢出，优先级低）
    try {
      ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
        name: 'conversation.session.header.actions',
        id: 'term-dict-mute',
        order: 15,
        label: '词条灌注',
      }, SessionDictToggle))
    } catch {
      /* 没有可用座位：只留设置页 */
    }
  }
}