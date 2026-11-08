window.__ModuleLoader__.load({
	id: "dsh-term-dict",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/entry.jsx
var entry_exports = {};
__export(entry_exports, {
  SessionDictToggle: () => SessionDictToggle,
  TermDictSection: () => TermDictSection,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(entry_exports);
var import_react = require("react");

// src/term-text.js
var FIELD_ORDER = ["类型", "定义", "默认指代", "边界", "状态", "备注"];
var STATUSES = ["已确认", "部分确认", "待观察", "已废"];
function entryKind(fields) {
  const f = fields || {};
  const has = (k) => String(f[k] || "").trim() !== "";
  if (String(f["状态"] || "").trim() === "已废") return "grave";
  if (has("默认指代") && !has("定义")) return "ref";
  return "term";
}
var HEADING_RE = /^##\s+(.+?)\s*$/;
var FIELD_RE = /^\s*[-*]\s*([^：:]{1,10})\s*[：:]\s*(.*)$/;
function parseHeading(raw) {
  const t = String(raw || "").trim();
  const m = /^(.+?)（别名：(.+?)）$/.exec(t);
  if (m) return { term: m[1].trim(), aliases: m[2].trim() };
  return { term: t, aliases: "" };
}
function splitBlocks(text) {
  const blocks = [];
  let cur = { heading: null, aliases: "", lines: [] };
  for (const line of String(text == null ? "" : text).split(/\r?\n/)) {
    const h = HEADING_RE.exec(line);
    if (h) {
      blocks.push(cur);
      const parsed = parseHeading(h[1]);
      cur = { heading: parsed.term, aliases: parsed.aliases, lines: [line] };
    } else {
      cur.lines.push(line);
    }
  }
  blocks.push(cur);
  return blocks;
}
function blockFields(block) {
  const fields = {};
  for (const line of block.lines.slice(1)) {
    const m = FIELD_RE.exec(line);
    if (m) fields[m[1].trim()] = m[2].trim();
  }
  if (!fields["别称"] && block.aliases) fields["别称"] = block.aliases;
  return fields;
}
function listTerms(text) {
  return splitBlocks(text).filter((b) => b.heading).map((b) => ({ term: b.heading, fields: blockFields(b) }));
}
function renderBlockLines(term, fields) {
  const aliases = String(fields["别称"] || "").trim();
  const keys = FIELD_ORDER.filter((k) => k !== "别称" && fields[k] !== void 0 && String(fields[k]).trim() !== "").concat(Object.keys(fields).filter((k) => k !== "别称" && FIELD_ORDER.indexOf(k) === -1 && String(fields[k]).trim() !== ""));
  const lines = ["## " + term + (aliases ? "（别名：" + aliases + "）" : "")];
  for (const k of keys) lines.push("- " + k + "：" + String(fields[k]).trim());
  return lines;
}
function joinBlocks(blocks) {
  return blocks.map((b) => b.lines.join("\n").replace(/\s+$/, "")).join("\n\n").replace(/\n{3,}/g, "\n\n").replace(/^\s+/, "").replace(/\s+$/, "") + "\n";
}
function upsertTerm(text, term, fields) {
  const blocks = splitBlocks(text);
  const idx = blocks.findIndex((b) => b.heading === term);
  if (idx >= 0) {
    const merged = Object.assign({}, blockFields(blocks[idx]), fields);
    blocks[idx] = { heading: term, lines: renderBlockLines(term, merged) };
  } else {
    blocks.push({ heading: term, lines: renderBlockLines(term, Object.assign({ 状态: "待观察" }, fields)) });
  }
  return joinBlocks(blocks);
}
function removeTerm(text, term) {
  const blocks = splitBlocks(text);
  const idx = blocks.findIndex((b) => b.heading === term);
  if (idx < 0) return text;
  blocks.splice(idx, 1);
  return joinBlocks(blocks);
}

// src/entry.jsx
var import_jsx_runtime = require("react/jsx-runtime");
function api(path) {
  const relative = String(path).replace(/^\/+/, "");
  if (typeof document === "undefined") return "/" + relative;
  const url = new URL(relative, document.baseURI);
  return url.pathname + url.search;
}
async function getJson(path) {
  const res = await fetch(api(path), { headers: { accept: "application/json" } });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.ok === false) throw new Error(data && data.error || "HTTP " + res.status);
  return data;
}
async function postJson(path, body) {
  const res = await fetch(api(path), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.ok === false) throw new Error(data && data.error || "HTTP " + res.status);
  return data;
}
function friendlyHostError(e) {
  const s = String(e && e.message || e);
  if (s.indexOf("HTTP 404") !== -1) return "宿主还没加载新路由（HTTP 404）：应用重启 dsh 后再进这一页";
  return s;
}
var CSS = `
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
`;
var EMPTY_DOC = { loading: false, content: "", draft: "", error: null, saving: false, savedAt: null };
var SETTINGS_DEFAULTS = {
  autoActivate: true,
  maxActive: 64,
  maxEntryChars: 0,
  maxTotalChars: 12e3,
  skipWorkspaces: [],
  skipSessions: [],
  presets: [],
  schema: {
    modules: ["定义", "默认指代", "边界", "别称", "备注"],
    types: {
      term: { label: "称谓型", enabled: true, modules: ["定义", "默认指代", "边界", "别称", "备注"] },
      ref: { label: "落点型", enabled: true, modules: ["默认指代", "边界", "别称", "备注"] },
      grave: { label: "留档型", enabled: true, modules: ["定义", "备注"] }
    },
    moduleDefs: {
      定义: { hint: "它指什么（一句话）", multiline: true, inject: true },
      默认指代: { hint: "单独出现时默认优先指哪件事／哪份文件／哪条命令", multiline: true, inject: true },
      边界: { hint: "它不是什么；有例子就写「例：…」", multiline: true, inject: true },
      别称: { hint: "同一物还有哪些叫法，逗号分隔", multiline: false, inject: false },
      备注: { hint: "指向技能、撞名规则", multiline: false, inject: false }
    },
    pending: [],
    pendingTypes: []
  }
};
var LOCKED_MODULES = ["别称"];
var BUILTIN_TYPE_IDS = ["term", "ref", "grave"];
var MODULE_DESC = {
  定义: "指什么",
  默认指代: "默认指哪件事",
  边界: "不是什么",
  别称: "别的叫法",
  备注: "技能/撞名备注"
};
var TYPE_DESC = {
  term: "给东西起名",
  ref: "默认指哪件事",
  grave: "已废留档"
};
function pickDefaultLayer(list) {
  if (!Array.isArray(list) || list.length === 0) return "";
  const withTerms = list.find((l) => l.terms > 0);
  if (withTerms) return withTerms.id;
  const domain = list.find((l) => l.kind === "domain");
  if (domain) return domain.id;
  return list[0].id;
}
function layerLabel(layer) {
  if (!layer) return "";
  return layer.kind === "domain" && layer.taskType ? layer.taskType : layer.label;
}
function resolveKind(fields, schema) {
  const f = fields || {};
  const stored = String(f["类型"] || "").trim();
  const types = schema && schema.types || SETTINGS_DEFAULTS.schema.types;
  if (stored) {
    if (types[stored]) return stored;
    for (const id of Object.keys(types)) {
      if (types[id].label === stored) return id;
    }
  }
  return entryKind(f);
}
function kindLabel(fields, schema) {
  const id = resolveKind(fields, schema);
  const types = schema && schema.types || SETTINGS_DEFAULTS.schema.types;
  return types[id] && types[id].label || "称谓型";
}
function formatTime(ms) {
  const date = new Date(Number(ms));
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
}
function TermForm(props) {
  const { term, fields, saving, onSave, onCancel, onDelete, layerOptions, layerId, isNew, schema } = props;
  const [name, setName] = (0, import_react.useState)(term || "");
  const [f, setF] = (0, import_react.useState)(fields || {});
  const [targetId, setTargetId] = (0, import_react.useState)("");
  const [confirmDelete, setConfirmDelete] = (0, import_react.useState)(false);
  const [kind, setKind] = (0, import_react.useState)(isNew ? "term" : entryKind(fields || {}));
  const optionList = Array.isArray(layerOptions) ? layerOptions : [];
  const set = (k, v) => setF((cur) => Object.assign({}, cur, { [k]: v }));
  const schemaTypes = schema && schema.types || SETTINGS_DEFAULTS.schema.types;
  const moduleDefs = schema && schema.moduleDefs || SETTINGS_DEFAULTS.schema.moduleDefs;
  const typeList = Object.keys(schemaTypes).map((id) => ({
    id,
    label: schemaTypes[id].label || id
  }));
  const enabledTypes = typeList.filter((t) => schemaTypes[t.id].enabled !== false);
  const requestedKind = isNew ? kind : resolveKind(f, schema);
  const kindId = enabledTypes.some((t) => t.id === requestedKind) ? requestedKind : enabledTypes[0] ? enabledTypes[0].id : requestedKind;
  const kindInfo = typeList.find((t) => t.id === kindId) || { id: kindId, label: kindId };
  const allowed = schemaTypes[kindId] && Array.isArray(schemaTypes[kindId].modules) ? schemaTypes[kindId].modules : [];
  const status = isNew && kindId === "grave" ? "已废" : STATUSES.indexOf(f["状态"]) === -1 ? "待观察" : f["状态"];
  const hasDef = String(f["定义"] || "").trim() !== "";
  const hasRef = String(f["默认指代"] || "").trim() !== "";
  const requiredField = kindId === "ref" ? "默认指代" : "定义";
  const anyAllowedFilled = allowed.length === 0 || allowed.some((field) => String(f[field] || "").trim() !== "");
  const requiredOk = allowed.indexOf(requiredField) === -1 ? anyAllowedFilled : requiredField === "定义" ? hasDef : hasRef;
  const ready = String(name).trim() !== "" && (isNew ? requiredOk : hasDef || hasRef);
  const movedTo = optionList.find((o) => o.id === targetId);
  const submit = () => {
    const payload = Object.assign({}, f);
    if (isNew) {
      for (const key of Object.keys(payload)) {
        if (key === "状态" || key === "类型") continue;
        if (allowed.indexOf(key) === -1) delete payload[key];
      }
      payload["类型"] = kindInfo.label;
      if (kindId === "grave") payload["状态"] = "已废";
    }
    onSave(String(name).trim(), payload, targetId);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-card", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-cardhead", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-cardid", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-cardtitle", children: isNew ? "新词条" : term || name }),
        isNew ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-kindtag", title: "类型认词条里的「类型」字段，没有就按字段推断", children: kindInfo.label })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-cardacts", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "select",
          {
            className: "td-select",
            "aria-label": "状态",
            title: "已废＝本阶段不用，随时可以改好复出",
            value: status,
            disabled: isNew && kindId === "grave",
            onChange: (e) => set("状态", e.target.value),
            children: STATUSES.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: s, children: s }, s))
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "select",
          {
            className: "td-select",
            "aria-label": "挪层",
            title: "把这一条挪到另一层（保存时才动）",
            value: targetId,
            onChange: (e) => setTargetId(e.target.value),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: "留在本层" }),
              optionList.filter((o) => o.id !== layerId).map((o) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: o.id, children: "移到 " + o.label }, o.id))
            ]
          }
        ),
        onDelete ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "td-link",
            onClick: () => {
              if (confirmDelete) onDelete();
              else setConfirmDelete(true);
            },
            children: confirmDelete ? "确认删除？" : "删除"
          }
        ) : null,
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-link", onClick: onCancel, children: "取消" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "td-link primary",
            disabled: !ready || saving,
            onClick: submit,
            children: saving ? "保存中…" : "保存"
          }
        )
      ] })
    ] }),
    isNew ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "td-frow", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-flabel", children: "名称" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          className: "td-line",
          value: name,
          placeholder: "词条名",
          spellCheck: false,
          autoFocus: true,
          onChange: (e) => setName(e.target.value)
        }
      )
    ] }) : null,
    allowed.map((field) => {
      const mdef = moduleDefs[field] || { hint: "", multiline: true };
      const placeholder = mdef.hint ? mdef.hint + "（可空）" : "（可空）";
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "td-frow", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-flabel", children: field === "别称" ? "别名" : field }),
        mdef.multiline ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "textarea",
          {
            className: "td-area",
            rows: field === "定义" ? 3 : 2,
            value: f[field] || "",
            spellCheck: false,
            placeholder,
            onChange: (e) => set(field, e.target.value)
          }
        ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            className: "td-line",
            value: f[field] || "",
            spellCheck: false,
            placeholder,
            onChange: (e) => set(field, e.target.value)
          }
        )
      ] }, field);
    }),
    movedTo ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-hint", children: "保存＝把这条挪到「" + movedTo.label + "」" }) : null
  ] });
}
function TermDictSection() {
  const [layers, setLayers] = (0, import_react.useState)([]);
  const [status, setStatus] = (0, import_react.useState)("loading");
  const [error, setError] = (0, import_react.useState)(null);
  const [activeId, setActiveId] = (0, import_react.useState)("");
  const [docs, setDocs] = (0, import_react.useState)({});
  const [view, setView] = (0, import_react.useState)("terms");
  const [filter, setFilter] = (0, import_react.useState)("");
  const [editing, setEditing] = (0, import_react.useState)(null);
  const [adding, setAdding] = (0, import_react.useState)(false);
  const [addingStatus, setAddingStatus] = (0, import_react.useState)("待观察");
  const [nameEditing, setNameEditing] = (0, import_react.useState)(false);
  const [nameDraft, setNameDraft] = (0, import_react.useState)("");
  const [slugEditing, setSlugEditing] = (0, import_react.useState)(false);
  const [creatingLayer, setCreatingLayer] = (0, import_react.useState)(false);
  const [newLayerName, setNewLayerName] = (0, import_react.useState)("");
  const [layerSaving, setLayerSaving] = (0, import_react.useState)(false);
  const [layerConfirm, setLayerConfirm] = (0, import_react.useState)(null);
  const [layerDeleting, setLayerDeleting] = (0, import_react.useState)(false);
  const [wsOpen, setWsOpen] = (0, import_react.useState)(false);
  const [wsOptions, setWsOptions] = (0, import_react.useState)([]);
  const [wsError, setWsError] = (0, import_react.useState)(null);
  const [wsSaving, setWsSaving] = (0, import_react.useState)(false);
  const [slugDraft, setSlugDraft] = (0, import_react.useState)("");
  const [rnSaving, setRnSaving] = (0, import_react.useState)(false);
  const [rnError, setRnError] = (0, import_react.useState)(null);
  const [otherHits, setOtherHits] = (0, import_react.useState)([]);
  const [otherBusy, setOtherBusy] = (0, import_react.useState)(false);
  const [showOther, setShowOther] = (0, import_react.useState)(false);
  const [pendingTerm, setPendingTerm] = (0, import_react.useState)("");
  const [collapsedStatus, setCollapsedStatus] = (0, import_react.useState)({});
  const groupBy = "status";
  const [advanced, setAdvanced] = (0, import_react.useState)(false);
  const [structureView, setStructureView] = (0, import_react.useState)(false);
  const [moduleDrafts, setModuleDrafts] = (0, import_react.useState)({});
  const [settingsDraft, setSettingsDraft] = (0, import_react.useState)(null);
  const [settingsError, setSettingsError] = (0, import_react.useState)(null);
  const [settingsSaving, setSettingsSaving] = (0, import_react.useState)(false);
  const [settingsSaved, setSettingsSaved] = (0, import_react.useState)(false);
  const [presetRoster, setPresetRoster] = (0, import_react.useState)(null);
  const [presetNote, setPresetNote] = (0, import_react.useState)("");
  const [workspaceRoster, setWorkspaceRoster] = (0, import_react.useState)(null);
  const [workspaceNote, setWorkspaceNote] = (0, import_react.useState)("");
  const [schema, setSchema] = (0, import_react.useState)(null);
  const [scanConfirm, setScanConfirm] = (0, import_react.useState)(null);
  const [newTypeName, setNewTypeName] = (0, import_react.useState)("");
  const [newModuleName, setNewModuleName] = (0, import_react.useState)("");
  const [typeConfirm, setTypeConfirm] = (0, import_react.useState)(null);
  const doc = docs[activeId] || EMPTY_DOC;
  const active = layers.find((l) => l.id === activeId) || null;
  const domains = layers.filter((l) => l.kind === "domain");
  const generalLayers = layers.filter((l) => l.kind === "general");
  const layerOptions = layers.map((l) => ({
    id: l.id,
    label: l.kind === "general" ? "通用层" : "任务·" + (l.taskType || l.slug || l.label)
  }));
  const terms = listTerms(doc.draft);
  const keyword = filter.trim().toLowerCase();
  const shown = keyword ? terms.filter((t) => t.term.toLowerCase().indexOf(keyword) !== -1 || String(t.fields["定义"] || "").toLowerCase().indexOf(keyword) !== -1) : terms;
  const STATUS_SEQ = ["已确认", "部分确认", "待观察", "已废"];
  const schemaTypesForGroup = schema && schema.types || SETTINGS_DEFAULTS.schema.types;
  const KIND_SEQ = Object.keys(schemaTypesForGroup);
  const rankOf = (t) => {
    if (groupBy === "kind") {
      const i2 = KIND_SEQ.indexOf(resolveKind(t.fields, schema));
      return i2 === -1 ? KIND_SEQ.length : i2;
    }
    const i = STATUS_SEQ.indexOf(t.fields["状态"] || "");
    return i === -1 ? STATUS_SEQ.length : i;
  };
  const keyOf = (t) => groupBy === "kind" ? kindLabel(t.fields, schema) : t.fields["状态"] || "缺状态";
  const ordered = shown.map((t, i) => ({ t, i })).sort((a, b) => rankOf(a.t) - rankOf(b.t) || a.i - b.i).map((x) => x.t);
  const groups = [];
  for (const t of ordered) {
    const key = keyOf(t);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(t);
    else groups.push({ key, items: [t] });
  }
  const dirty = doc.content !== doc.draft;
  async function loadList(opts) {
    const silent = Boolean(opts && opts.silent);
    if (!silent) {
      setStatus("loading");
      setError(null);
    }
    try {
      const data = await getJson("/dsh-term-dict/api/list");
      const list = Array.isArray(data.layers) ? data.layers : [];
      setLayers(list);
      setStatus("ready");
      setActiveId((cur) => cur && list.some((l) => l.id === cur) ? cur : pickDefaultLayer(list));
    } catch (e) {
      if (!silent) {
        setStatus("error");
        setError(String(e && e.message || e));
      }
    }
  }
  async function loadDoc(id) {
    if (!id) return;
    setDocs((d) => Object.assign({}, d, { [id]: Object.assign({}, EMPTY_DOC, d[id] || {}, { loading: true, error: null }) }));
    try {
      const data = await getJson("/dsh-term-dict/api/read?id=" + encodeURIComponent(id));
      const text = typeof data.content === "string" ? data.content : "";
      setDocs((d) => Object.assign({}, d, {
        [id]: { loading: false, error: null, saving: false, savedAt: null, content: text, draft: text }
      }));
    } catch (e) {
      setDocs((d) => Object.assign({}, d, {
        [id]: Object.assign({}, EMPTY_DOC, d[id] || {}, { loading: false, error: String(e && e.message || e) })
      }));
    }
  }
  async function writeLayer(id, text) {
    if (!id) return false;
    setDocs((d) => Object.assign({}, d, { [id]: Object.assign({}, d[id], { saving: true, error: null }) }));
    try {
      await postJson("/dsh-term-dict/api/write", { id, content: text });
      setDocs((d) => Object.assign({}, d, {
        [id]: Object.assign({}, d[id], { saving: false, error: null, content: text, draft: text, savedAt: Date.now() })
      }));
      void loadList({ silent: true });
      return true;
    } catch (e) {
      setDocs((d) => Object.assign({}, d, { [id]: Object.assign({}, d[id], { saving: false, error: String(e && e.message || e) }) }));
      return false;
    }
  }
  async function writeText(text) {
    return writeLayer(activeId, text);
  }
  async function readLayerText(id) {
    const cached = docs[id];
    if (cached && typeof cached.draft === "string") return cached.draft;
    try {
      const data = await getJson("/dsh-term-dict/api/read?id=" + encodeURIComponent(id));
      const text = typeof data.content === "string" ? data.content : "";
      setDocs((d) => Object.assign({}, d, {
        [id]: { loading: false, error: null, saving: false, savedAt: null, content: text, draft: text }
      }));
      return text;
    } catch (e) {
      throw new Error("读不到目标层：" + String(e && e.message || e));
    }
  }
  async function saveEntry(name, fields, targetId, isNew) {
    const same = !targetId || targetId === activeId;
    if (same) {
      const base = isNew ? headerFor(doc.draft, active) : doc.draft;
      return writeText(upsertTerm(base, name, fields));
    }
    const targetLayer = layers.find((l) => l.id === targetId) || null;
    let targetText = "";
    try {
      targetText = await readLayerText(targetId);
    } catch (e) {
      setDocs((d) => Object.assign({}, d, { [activeId]: Object.assign({}, d[activeId], { error: String(e && e.message || e) }) }));
      return false;
    }
    const okTarget = await writeLayer(targetId, upsertTerm(headerFor(targetText, targetLayer), name, fields));
    if (!okTarget) return false;
    if (isNew) return true;
    const okSource = await writeLayer(activeId, removeTerm(doc.draft, name));
    if (!okSource) {
      setDocs((d) => Object.assign({}, d, {
        [activeId]: Object.assign({}, d[activeId], { error: "已写入目标层，但本层没删掉——请手动删这一条" })
      }));
      return false;
    }
    return true;
  }
  async function submitRename(partial) {
    if (!active) return;
    setRnSaving(true);
    setRnError(null);
    try {
      const data = await postJson("/dsh-term-dict/api/rename", Object.assign({ id: activeId }, partial));
      const before = activeId;
      setNameEditing(false);
      setSlugEditing(false);
      await loadList({ silent: true });
      setActiveId(data.id);
      if (data.id === before) await loadDoc(data.id);
    } catch (e) {
      setRnError(String(e && e.message || e));
    } finally {
      setRnSaving(false);
    }
  }
  async function createLayer() {
    const name = newLayerName.trim();
    if (!name) return;
    setLayerSaving(true);
    setRnError(null);
    try {
      const data = await postJson("/dsh-term-dict/api/create-layer", { name });
      setCreatingLayer(false);
      setNewLayerName("");
      await loadList({ silent: true });
      if (data && data.layer && data.layer.id) setActiveId(data.layer.id);
    } catch (e) {
      setRnError(String(e && e.message || e));
    } finally {
      setLayerSaving(false);
    }
  }
  async function deleteLayer(id) {
    if (!id || layerDeleting) return;
    setLayerDeleting(true);
    setRnError(null);
    try {
      await postJson("/dsh-term-dict/api/delete-layer", { id });
      setLayerConfirm(null);
      setDocs((d) => {
        const next = Object.assign({}, d);
        delete next[id];
        return next;
      });
      await loadList({ silent: true });
    } catch (e) {
      setRnError(String(e && e.message || e));
    } finally {
      setLayerDeleting(false);
    }
  }
  function draftsFromSchema(schemaObj) {
    const defs = schemaObj && schemaObj.moduleDefs || {};
    const out = {};
    for (const field of schemaObj && schemaObj.modules || []) {
      const def = defs[field] || {};
      out[field] = {
        hint: String(def.hint || ""),
        multiline: def.multiline !== false,
        inject: def.inject === true
      };
    }
    return out;
  }
  async function openStructure() {
    setStructureView(true);
    setAdvanced(true);
    setSettingsError(null);
    setSettingsSaved(false);
    try {
      const data = await getJson("/dsh-term-dict/api/settings");
      const next = Object.assign({}, SETTINGS_DEFAULTS, data.settings || {});
      setSettingsDraft(next);
      setSchema(next.schema || null);
      setModuleDrafts(draftsFromSchema(next.schema));
    } catch (e) {
      setSettingsError(friendlyHostError(e));
    }
  }
  async function saveModuleDefs() {
    if (!schema) return;
    const changed = (schema.modules || []).filter((field) => {
      const def = schema.moduleDefs && schema.moduleDefs[field] || {};
      const draft = moduleDrafts[field] || { hint: "", multiline: true, inject: false };
      return draft.hint !== String(def.hint || "") || draft.multiline !== (def.multiline !== false) || draft.inject !== (def.inject === true);
    });
    if (changed.length === 0) return;
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      for (const field of changed) {
        const draft = moduleDrafts[field];
        await postJson("/dsh-term-dict/api/schema/module-def", {
          field,
          hint: draft.hint,
          multiline: draft.multiline,
          inject: draft.inject
        });
      }
      const next = await refreshSettings();
      setModuleDrafts(draftsFromSchema(next.schema));
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch (e) {
      setSettingsError(friendlyHostError(e));
    } finally {
      setSettingsSaving(false);
    }
  }
  async function loadWorkspaces() {
    setWsError(null);
    try {
      const data = await getJson("/dsh-term-dict/api/workspaces");
      const list = Array.isArray(data.workspaces) ? data.workspaces : [];
      setWsOptions(list);
      if (list.length === 0) setWsError("宿主没有返回工作空间（应用重启后才有，或注册表为空）");
    } catch (e) {
      setWsOptions([]);
      setWsError(String(e && e.message || e));
    }
  }
  function openWsPicker() {
    setWsOpen(true);
    void loadWorkspaces();
  }
  async function commitWorkspaces(next) {
    if (!active || active.kind !== "domain") return;
    setWsSaving(true);
    setWsError(null);
    try {
      await postJson("/dsh-term-dict/api/workspace", { id: active.id, workspaces: next });
      setLayers((cur) => cur.map((l) => l.id === active.id ? Object.assign({}, l, { workspaces: next }) : l));
    } catch (e) {
      setWsError(String(e && e.message || e));
    } finally {
      setWsSaving(false);
    }
  }
  function addWorkspace(path) {
    const cur = active && Array.isArray(active.workspaces) ? active.workspaces : [];
    if (!path || cur.indexOf(path) !== -1) return;
    void commitWorkspaces(cur.concat([path]));
  }
  function toggleWorkspace(path) {
    const cur = active && Array.isArray(active.workspaces) ? active.workspaces : [];
    if (cur.indexOf(path) !== -1) void commitWorkspaces(cur.filter((p) => p !== path));
    else void commitWorkspaces(cur.concat([path]));
  }
  function removeWorkspace(path) {
    const cur = active && Array.isArray(active.workspaces) ? active.workspaces : [];
    void commitWorkspaces(cur.filter((p) => p !== path));
  }
  async function openAdvanced() {
    setAdvanced(true);
    setStructureView(false);
    setSettingsError(null);
    setSettingsSaved(false);
    void loadPresetRoster();
    void loadWorkspaceRoster();
    try {
      const data = await getJson("/dsh-term-dict/api/settings");
      const next = Object.assign({}, SETTINGS_DEFAULTS, data.settings || {});
      setSettingsDraft(next);
      setSchema(next.schema || null);
    } catch (e) {
      setSettingsError(friendlyHostError(e));
      setSettingsDraft((cur) => cur || Object.assign({}, SETTINGS_DEFAULTS));
    }
  }
  async function saveAdvanced() {
    if (!settingsDraft) return;
    const clean = {
      autoActivate: Boolean(settingsDraft.autoActivate),
      maxActive: Math.round(Number(settingsDraft.maxActive)),
      maxEntryChars: Math.round(Number(settingsDraft.maxEntryChars)),
      maxTotalChars: Math.round(Number(settingsDraft.maxTotalChars)),
      skipWorkspaces: Array.isArray(settingsDraft.skipWorkspaces) ? settingsDraft.skipWorkspaces : [],
      presets: Array.isArray(settingsDraft.presets) ? settingsDraft.presets.map((s) => String(s).trim()).filter((s) => s.length > 0) : []
    };
    if (!Number.isFinite(clean.maxActive) || !Number.isFinite(clean.maxEntryChars) || !Number.isFinite(clean.maxTotalChars)) {
      setSettingsError("三个上限都要填数字");
      return;
    }
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const data = await postJson("/dsh-term-dict/api/settings", clean);
      const next = Object.assign({}, SETTINGS_DEFAULTS, data.settings || {});
      setSettingsDraft(next);
      setSchema(next.schema || null);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch (e) {
      setSettingsError(friendlyHostError(e));
    } finally {
      setSettingsSaving(false);
    }
  }
  const setDraftField = (key, value) => setSettingsDraft((d) => Object.assign({}, d || SETTINGS_DEFAULTS, { [key]: value }));
  async function loadPresetRoster() {
    setPresetNote("");
    try {
      const data = await getJson("/dsh-term-dict/api/presets");
      const rows = Array.isArray(data && data.presets) ? data.presets : [];
      setPresetRoster(rows);
      if (data && data.unavailable) setPresetNote(String(data.unavailable));
    } catch (e) {
      setPresetRoster([]);
      setPresetNote(friendlyHostError(e));
    }
  }
  function togglePresetDraft(id) {
    setSettingsDraft((cur) => {
      const base = cur || SETTINGS_DEFAULTS;
      const list = Array.isArray(base.presets) ? base.presets.slice() : [];
      const at = list.indexOf(id);
      if (at === -1) list.push(id);
      else list.splice(at, 1);
      return Object.assign({}, base, { presets: list });
    });
  }
  async function loadWorkspaceRoster() {
    setWorkspaceNote("");
    try {
      const data = await getJson("/dsh-term-dict/api/workspaces");
      const rows = Array.isArray(data && data.workspaces) ? data.workspaces : [];
      const seen = [];
      const list = [];
      for (const w of rows) {
        const path = String(w && w.path || "");
        const key = path.toLowerCase();
        if (!key || seen.indexOf(key) !== -1) continue;
        seen.push(key);
        list.push({ id: String(w && w.id || ""), title: String(w && w.title || ""), path });
      }
      setWorkspaceRoster(list);
    } catch (e) {
      setWorkspaceRoster([]);
      setWorkspaceNote(friendlyHostError(e));
    }
  }
  function toggleWorkspaceDraft(path) {
    const key = String(path || "").toLowerCase();
    if (!key) return;
    setSettingsDraft((cur) => {
      const base = cur || SETTINGS_DEFAULTS;
      const list = Array.isArray(base.skipWorkspaces) ? base.skipWorkspaces.slice() : [];
      const at = list.findIndex((v) => String(v).toLowerCase() === key);
      if (at === -1) list.push(String(path));
      else list.splice(at, 1);
      return Object.assign({}, base, { skipWorkspaces: list });
    });
  }
  function commitSkipWorkspaces(lines) {
    setSettingsDraft((cur) => {
      const base = cur || SETTINGS_DEFAULTS;
      const roster = Array.isArray(workspaceRoster) ? workspaceRoster : [];
      const lower = roster.map((w) => String(w.path || "").toLowerCase()).filter((s) => s.length > 0);
      const curList = Array.isArray(base.skipWorkspaces) ? base.skipWorkspaces : [];
      const checked = roster.map((w) => String(w.path || "")).filter((p) => p && curList.some((v) => String(v).toLowerCase() === p.toLowerCase()));
      const manual = [];
      for (const raw of Array.isArray(lines) ? lines : []) {
        const s = String(raw == null ? "" : raw).trim();
        if (!s) continue;
        if (lower.indexOf(s.toLowerCase()) !== -1) continue;
        if (manual.indexOf(s) !== -1) continue;
        manual.push(s);
      }
      return Object.assign({}, base, { skipWorkspaces: checked.concat(manual) });
    });
  }
  async function refreshSettings() {
    const data = await getJson("/dsh-term-dict/api/settings");
    const next = Object.assign({}, SETTINGS_DEFAULTS, data.settings || {});
    setSettingsDraft(next);
    setSchema(next.schema || null);
    return next;
  }
  async function askRemoveModule(field) {
    setSettingsError(null);
    try {
      const data = await getJson("/dsh-term-dict/api/schema-scan?field=" + encodeURIComponent(field));
      setScanConfirm({ field, scan: data.scan });
    } catch (e) {
      setSettingsError(friendlyHostError(e));
    }
  }
  async function confirmRemoveModule() {
    if (!scanConfirm) return;
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const data = await postJson("/dsh-term-dict/api/schema/module-remove", { field: scanConfirm.field });
      setScanConfirm(null);
      const next = Object.assign({}, SETTINGS_DEFAULTS, data.settings || {});
      setSettingsDraft(next);
      setSchema(next.schema || null);
      setModuleDrafts(draftsFromSchema(next.schema));
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch (e) {
      setSettingsError(friendlyHostError(e));
    } finally {
      setSettingsSaving(false);
    }
  }
  async function undoPendingModule(field) {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      await postJson("/dsh-term-dict/api/schema/module-cancel", { field });
      await refreshSettings();
    } catch (e) {
      setSettingsError(friendlyHostError(e));
    } finally {
      setSettingsSaving(false);
    }
  }
  async function addModule(field) {
    const name = String(field || "").trim();
    if (!name) return;
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      await postJson("/dsh-term-dict/api/schema/module-add", { name });
      setNewModuleName("");
      const next = await refreshSettings();
      setModuleDrafts(draftsFromSchema(next.schema));
    } catch (e) {
      setSettingsError(friendlyHostError(e));
    } finally {
      setSettingsSaving(false);
    }
  }
  async function toggleTypeModule(type, field, enabled) {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      await postJson("/dsh-term-dict/api/schema/type-module", { type, field, enabled });
      await refreshSettings();
    } catch (e) {
      setSettingsError(friendlyHostError(e));
    } finally {
      setSettingsSaving(false);
    }
  }
  async function toggleType(type, enabled) {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      await postJson("/dsh-term-dict/api/schema/type-enable", { type, enabled });
      await refreshSettings();
    } catch (e) {
      setSettingsError(friendlyHostError(e));
    } finally {
      setSettingsSaving(false);
    }
  }
  async function addType() {
    const name = newTypeName.trim();
    if (!name) return;
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      await postJson("/dsh-term-dict/api/schema/type-add", { name });
      setNewTypeName("");
      await refreshSettings();
    } catch (e) {
      setSettingsError(friendlyHostError(e));
    } finally {
      setSettingsSaving(false);
    }
  }
  async function askRemoveType(type) {
    setSettingsError(null);
    try {
      const data = await getJson("/dsh-term-dict/api/schema/type-scan?type=" + encodeURIComponent(type));
      setTypeConfirm({ type, scan: data.scan });
    } catch (e) {
      setSettingsError(friendlyHostError(e));
    }
  }
  async function confirmRemoveType() {
    if (!typeConfirm) return;
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const data = await postJson("/dsh-term-dict/api/schema/type-remove", { type: typeConfirm.type });
      setTypeConfirm(null);
      const next = Object.assign({}, SETTINGS_DEFAULTS, data.settings || {});
      setSettingsDraft(next);
      setSchema(next.schema || null);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch (e) {
      setSettingsError(friendlyHostError(e));
    } finally {
      setSettingsSaving(false);
    }
  }
  async function undoPendingType(type) {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      await postJson("/dsh-term-dict/api/schema/type-unremove", { type });
      await refreshSettings();
    } catch (e) {
      setSettingsError(friendlyHostError(e));
    } finally {
      setSettingsSaving(false);
    }
  }
  async function searchOtherLayers(kw) {
    setOtherBusy(true);
    const out = [];
    for (const l of layers) {
      if (l.id === activeId) continue;
      let text = docs[l.id] && typeof docs[l.id].draft === "string" ? docs[l.id].draft : "";
      if (!text) {
        try {
          const data = await getJson("/dsh-term-dict/api/read?id=" + encodeURIComponent(l.id));
          text = typeof data.content === "string" ? data.content : "";
          setDocs((d) => Object.assign({}, d, {
            [l.id]: { loading: false, error: null, saving: false, savedAt: null, content: text, draft: text }
          }));
        } catch {
          continue;
        }
      }
      for (const t of listTerms(text)) {
        const hay = (t.term + " " + Object.values(t.fields).join(" ")).toLowerCase();
        if (hay.indexOf(kw) === -1) continue;
        out.push({ layer: l, term: t.term });
      }
    }
    setOtherHits(out);
    setOtherBusy(false);
  }
  function setDraft(text) {
    setDocs((d) => Object.assign({}, d, { [activeId]: Object.assign({}, d[activeId], { draft: text }) }));
  }
  (0, import_react.useEffect)(() => {
    void loadList();
  }, []);
  (0, import_react.useEffect)(() => {
    getJson("/dsh-term-dict/api/settings").then((data) => {
      if (data && data.settings) setSchema(data.settings.schema || null);
    }).catch(() => {
    });
  }, []);
  (0, import_react.useEffect)(() => {
    if (status !== "ready" || !activeId) return;
    if (!docs[activeId]) void loadDoc(activeId);
    setEditing(null);
    setAdding(false);
    setNameEditing(false);
    setSlugEditing(false);
    setFilter("");
    setShowOther(false);
  }, [status, activeId]);
  (0, import_react.useEffect)(() => {
    if (!pendingTerm) return;
    const d = docs[activeId];
    if (!d || d.loading) return;
    if (listTerms(d.draft).some((t) => t.term === pendingTerm)) setEditing(pendingTerm);
    setPendingTerm("");
  }, [pendingTerm, docs, activeId]);
  (0, import_react.useEffect)(() => {
    const kw = filter.trim().toLowerCase();
    if (!kw) {
      setOtherHits([]);
      setShowOther(false);
      return;
    }
    const timer = setTimeout(() => {
      void searchOtherLayers(kw);
    }, 300);
    return () => clearTimeout(timer);
  }, [filter]);
  (0, import_react.useEffect)(() => {
    if (view !== "raw") return;
    const d = docs[activeId];
    if (!d || d.loading || d.saving) return;
    if (typeof d.draft !== "string" || d.draft === d.content) return;
    const timer = setTimeout(() => {
      void writeText(d.draft);
    }, 1e3);
    return () => clearTimeout(timer);
  }, [view, docs, activeId]);
  if (status === "loading") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "td-pane", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-hint", children: "正在读取术语字典…" }) });
  if (status === "error") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-pane", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-error", role: "alert", children: "读取失败：" + error }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-link", onClick: () => void loadList(), children: "重试" }) })
    ] });
  }
  if (advanced) {
    const d = settingsDraft || SETTINGS_DEFAULTS;
    if (structureView) {
      const sc = d.schema || SETTINGS_DEFAULTS.schema;
      const moduleList2 = sc.modules || [];
      const types = sc.types || {};
      const pending = sc.pending || [];
      const pendingTypes = sc.pendingTypes || [];
      const typeKeys = Object.keys(types);
      const items = [];
      for (const p of pending) items.push("模块 " + p.field + "（" + formatTime(p.executeAt) + "）");
      for (const p of pendingTypes) {
        const tdef = types[p.type];
        items.push("类型 " + (tdef && tdef.label || p.type) + "（" + formatTime(p.executeAt) + "）");
      }
      const dirtyModules = moduleList2.filter((field) => {
        const def = sc.moduleDefs && sc.moduleDefs[field] || {};
        const draft = moduleDrafts[field] || { hint: "", multiline: true, inject: false };
        return draft.hint !== String(def.hint || "") || draft.multiline !== (def.multiline !== false) || draft.inject !== (def.inject === true);
      });
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-root", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("style", { children: CSS }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-pane", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-titlewrap", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-title", children: "词条结构" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-sub", children: "模块是词条里的字段；改完点保存。删除先扫描，24 小时后才动文件。" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "td-headacts", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: "td-link",
                onClick: () => {
                  setAdvanced(false);
                  setStructureView(false);
                },
                children: "返回"
              }
            ) })
          ] }),
          settingsError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-error", role: "alert", children: settingsError }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "td-table", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "模块" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "填写说明" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "td-th-center", children: "多行" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "td-th-center", children: "灌注" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {})
            ] }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tbody", { children: [
              moduleList2.map((field) => {
                const draft = moduleDrafts[field] || { hint: "", multiline: true, inject: false };
                const locked = LOCKED_MODULES.indexOf(field) !== -1;
                return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "td-tdname", children: field }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "input",
                    {
                      className: "td-cell",
                      value: draft.hint,
                      placeholder: MODULE_DESC[field] || "填表时显示的提示",
                      spellCheck: false,
                      onChange: (e) => setModuleDrafts((cur) => Object.assign({}, cur, {
                        [field]: Object.assign({}, draft, { hint: e.target.value })
                      }))
                    }
                  ) }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "td-td-center", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "input",
                    {
                      type: "checkbox",
                      checked: draft.multiline,
                      onChange: (e) => setModuleDrafts((cur) => Object.assign({}, cur, {
                        [field]: Object.assign({}, draft, { multiline: e.target.checked })
                      }))
                    }
                  ) }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "td-td-center", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "input",
                    {
                      type: "checkbox",
                      checked: draft.inject,
                      disabled: field === "别称",
                      onChange: (e) => setModuleDrafts((cur) => Object.assign({}, cur, {
                        [field]: Object.assign({}, draft, { inject: e.target.checked })
                      }))
                    }
                  ) }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "td-tdact", children: locked ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-lock", title: "参与命中匹配，不能删除", children: "锁" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "button",
                    {
                      type: "button",
                      className: "td-iconbtn",
                      title: "删除：先扫描，确认后 24 小时才删字段",
                      onClick: () => void askRemoveModule(field),
                      children: "×"
                    }
                  ) })
                ] }, field);
              }),
              pending.filter((p) => moduleList2.indexOf(p.field) === -1).map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { className: "td-row-pending", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "td-tdname", children: p.field }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { colSpan: 3, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-hint", children: formatTime(p.executeAt) + " 删字段" }) }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "td-tdact", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-link", onClick: () => void undoPendingModule(p.field), children: "撤销" }) })
              ] }, "pending:" + p.field))
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-inline", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                className: "td-input",
                style: { width: 120 },
                value: newModuleName,
                placeholder: "新模块名",
                spellCheck: false,
                onChange: (e) => setNewModuleName(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addModule(newModuleName);
                  }
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: "td-link",
                disabled: settingsSaving || !newModuleName.trim(),
                onClick: () => void addModule(newModuleName),
                children: "＋ 新模块"
              }
            ),
            dirtyModules.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: "td-btn primary",
                disabled: settingsSaving,
                onClick: () => void saveModuleDefs(),
                children: settingsSaving ? "保存中…" : "保存（" + dirtyModules.length + "）"
              }
            ) : null,
            settingsSaved ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-hint", children: "已保存" }) : null
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-hint", children: "删除：先扫描，确认后立即停灌注，24 小时后删字段（可撤销）。" }),
          scanConfirm ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-confirm", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-confirm-title", children: "删除模块「" + scanConfirm.field + "」？" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "全字典共 " + scanConfirm.scan.total + " 条词条，其中 " + scanConfirm.scan.withField + " 条写了「" + scanConfirm.field + "」。确认后立即停止灌注，24 小时后（" + formatTime(Date.now() + 24 * 3600 * 1e3) + " 左右）从所有字典文件删掉这些字段行（写前留 .bak）。" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-inline", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-btn", onClick: () => setScanConfirm(null), children: "取消" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-btn danger", disabled: settingsSaving, onClick: () => void confirmRemoveModule(), children: "确认删除" })
            ] })
          ] }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-sect", children: "类型用哪些模块" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "td-table", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "类型" }),
              moduleList2.map((field) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "td-th-center", children: field }, field)),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {})
            ] }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: typeKeys.map((typeId) => {
              const typeDef = types[typeId] || { label: typeId, enabled: true, modules: [] };
              const pendingType = pendingTypes.find((p) => p.type === typeId);
              return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { className: "td-tdname", title: typeDef.label, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: typeDef.label }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "td-tddesc", children: pendingType ? formatTime(pendingType.executeAt) + " 移除配置" : TYPE_DESC[typeId] || "自定义类型" })
                ] }),
                moduleList2.map((field) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "td-td-center", children: field === "别称" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-checkmark", title: "参与命中匹配，不能取消", children: "✓" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    type: "checkbox",
                    checked: typeDef.modules.indexOf(field) !== -1,
                    onChange: () => void toggleTypeModule(typeId, field, typeDef.modules.indexOf(field) === -1)
                  }
                ) }, field)),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "td-tdact", children: pendingType ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-link", onClick: () => void undoPendingType(typeId), children: "撤销" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-inline", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-link", onClick: () => void toggleType(typeId, !typeDef.enabled), children: typeDef.enabled ? "停用" : "启用" }),
                  BUILTIN_TYPE_IDS.indexOf(typeId) === -1 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "button",
                    {
                      type: "button",
                      className: "td-link danger",
                      title: "先扫描该类型词条；确认后立即停灌注，24 小时后移除配置",
                      onClick: () => void askRemoveType(typeId),
                      children: "删除"
                    }
                  ) : null
                ] }) })
              ] }, typeId);
            }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-inline", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                className: "td-input",
                style: { width: 130 },
                value: newTypeName,
                placeholder: "新类型名",
                spellCheck: false,
                onChange: (e) => setNewTypeName(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addType();
                  }
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-link", disabled: settingsSaving || !newTypeName.trim(), onClick: () => void addType(), children: "＋ 添加类型" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-hint", children: "删除类型：先扫描该类型词条 → 立即停止灌注 → 24 小时后移除类型配置（不删词条，可撤销）。" }),
          typeConfirm ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-confirm", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-confirm-title", children: "删除类型「" + (types[typeConfirm.type] && types[typeConfirm.type].label || typeConfirm.type) + "」？" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "该类型下有 " + typeConfirm.scan.total + " 条词条。确认后立即停用并停止灌注该类型词条；24 小时后移除类型配置（不删词条，之后退回按字段推断归类）。" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-inline", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-btn", onClick: () => setTypeConfirm(null), children: "取消" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-btn danger", disabled: settingsSaving, onClick: () => void confirmRemoveType(), children: "确认删除" })
            ] })
          ] }) : null
        ] })
      ] });
    }
    const moduleList = d.schema && d.schema.modules || [];
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-root", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("style", { children: CSS }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-pane", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-titlewrap", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-title", children: "高级设置" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-sub", children: "自动激活与注入上限 · 写在 dict\\.settings.json" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "td-headacts", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-link", onClick: () => setAdvanced(false), children: "返回" }) })
        ] }),
        settingsError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-error", role: "alert", children: settingsError }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-settings", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-hint", children: "这些值控制「词条第一次出现时自动注入定义」的行为。保存后下一次扫描起生效；已经注入的词条不会被撤掉，新值只影响之后命中的词条。" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-sect", children: "自动激活" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "td-srow", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-slabel", children: "开关" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-sfield", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "checkbox",
                  checked: Boolean(d.autoActivate),
                  onChange: (e) => setDraftField("autoActivate", e.target.checked)
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-hint", children: d.autoActivate ? "开：命中词条就注入" : "关：不再注入新词条（已注入的保留）" })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "td-srow", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-slabel", children: "单会话最多" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-sfield", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  className: "td-input td-numinput",
                  type: "number",
                  min: "1",
                  max: "500",
                  value: d.maxActive,
                  onChange: (e) => setDraftField("maxActive", e.target.value)
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-unit", children: "条" })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "td-srow", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-slabel", children: "单条最多" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-sfield", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  className: "td-input td-numinput",
                  type: "number",
                  min: "0",
                  max: "20000",
                  value: d.maxEntryChars,
                  onChange: (e) => setDraftField("maxEntryChars", e.target.value)
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-unit", children: "字（0＝整条完整注入）" })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "td-srow", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-slabel", children: "整段最多" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-sfield", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  className: "td-input td-numinput",
                  type: "number",
                  min: "500",
                  max: "200000",
                  value: d.maxTotalChars,
                  onChange: (e) => setDraftField("maxTotalChars", e.target.value)
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-unit", children: "字（所有已注入词条合计）" })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-sect", children: "灌注的模式" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-srow td-srow-top", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-slabel", children: "限定模式" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-sfield td-sfield-col", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-hint", children: "全不勾＝只灌注通用会话（没有模式或判不出模式）；勾了就只在这些模式里灌注——其余模式（含新建的）既不注入词条，也看不到字典工具。" }),
              Array.isArray(presetRoster) && presetRoster.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-chips", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "td-check", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "input",
                    {
                      type: "checkbox",
                      checked: presetRoster.every((p) => Array.isArray(d.presets) && d.presets.indexOf(p.id) !== -1),
                      onChange: (e) => setDraftField("presets", e.target.checked ? presetRoster.map((p) => p.id) : [])
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-checkname", children: "全选" })
                ] }),
                presetRoster.map((p) => {
                  const on = Array.isArray(d.presets) && d.presets.indexOf(p.id) !== -1;
                  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                    "label",
                    {
                      className: "td-check",
                      title: p.broken ? "这个模式现在装不起来：" + p.broken : p.description || p.id,
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: on, onChange: () => togglePresetDraft(p.id) }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-checkname", children: p.name || p.id }),
                        p.name && p.name !== p.id ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-lock", children: p.id }) : null,
                        p.isDefault ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-lock", children: "默认" }) : null,
                        p.broken ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-lock", children: "坏" }) : null
                      ]
                    },
                    p.id
                  );
                })
              ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "textarea",
                {
                  className: "td-area",
                  rows: 2,
                  value: Array.isArray(d.presets) ? d.presets.join("\n") : "",
                  spellCheck: false,
                  placeholder: "一行一个模式的 agentPreset id；留空＝只灌注通用会话",
                  onChange: (e) => setDraftField("presets", e.target.value.split("\n"))
                }
              ),
              presetNote ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-hint", children: "拿不到本机模式清单（" + presetNote + "），可手填 id。" }) : null,
              (() => {
                const known = Array.isArray(presetRoster) ? presetRoster.map((p) => p.id) : [];
                const extra = (Array.isArray(d.presets) ? d.presets : []).filter((id) => known.indexOf(id) === -1);
                if (extra.length === 0) return null;
                return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-hint", children: [
                  "已保存、但本机清单里没有的模式：",
                  extra.map((id) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-link", onClick: () => togglePresetDraft(id), children: id + " ×" }, id))
                ] });
              })()
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-sect", children: "不灌注的范围" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-srow td-srow-top", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-slabel", children: "工作空间" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-sfield td-sfield-col", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-hint", children: "勾上的工作空间不自动注入词条。判定按路径子串（不分大小写）：勾了上层目录，它下面的工作空间也会一起命中。" }),
              (() => {
                const list = Array.isArray(d.skipWorkspaces) ? d.skipWorkspaces : [];
                const roster = Array.isArray(workspaceRoster) ? workspaceRoster : [];
                const paths = roster.map((w) => String(w.path || "").toLowerCase());
                const manual = list.filter((v) => paths.indexOf(String(v).toLowerCase()) === -1);
                return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "td-check", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      "input",
                      {
                        type: "checkbox",
                        checked: roster.length > 0 && roster.every((w) => list.some((v) => String(v).toLowerCase() === String(w.path || "").toLowerCase())),
                        onChange: (e) => commitSkipWorkspaces(e.target.checked ? roster.map((w) => String(w.path || "")).filter((v) => v !== "") : [])
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-checkname", children: "全选" })
                  ] }),
                  roster.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-chips", children: roster.map((w) => {
                    const on = list.some((v) => String(v).toLowerCase() === String(w.path || "").toLowerCase());
                    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "td-check", title: w.path || w.id, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: on, onChange: () => toggleWorkspaceDraft(w.path) }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-checkname", children: w.title || w.path || w.id }),
                      w.title && w.path ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-lock", children: w.path }) : null
                    ] }, w.path || w.id);
                  }) }) : null,
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "textarea",
                    {
                      className: "td-area",
                      rows: 2,
                      value: manual.join("\n"),
                      spellCheck: false,
                      placeholder: "另加路径片段：一行一条，会话的工作目录含它就整个会话不灌注",
                      onChange: (e) => commitSkipWorkspaces(e.target.value.split("\n"))
                    }
                  )
                ] });
              })(),
              workspaceNote ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-hint", children: "拿不到本机工作空间清单（" + workspaceNote + "），只能手填路径片段。" }) : null
            ] })
          ] }),
          false ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_react.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-sect", children: "词条结构" }),
            (() => {
              const items = [];
              for (const p of d.schema && d.schema.pending || []) {
                items.push("模块 " + p.field + "（" + formatTime(p.executeAt) + "）");
              }
              for (const p of d.schema && d.schema.pendingTypes || []) {
                const def = d.schema.types && d.schema.types[p.type];
                items.push("类型 " + (def && def.label || p.type) + "（" + formatTime(p.executeAt) + "）");
              }
              return items.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-pending", children: "待删除：" + items.join("、") }) : null;
            })(),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-srow td-srow-top", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-slabel", children: "模块" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-sfield td-sfield-col", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-chips", children: [
                  moduleList.map((field) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-chip", children: [
                    field,
                    LOCKED_MODULES.indexOf(field) !== -1 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-lock", title: "参与类型推断或命中匹配，不能删除", children: "锁" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      "button",
                      {
                        type: "button",
                        className: "td-chipx",
                        title: "删除这个模块（先扫描影响）",
                        onClick: () => void askRemoveModule(field),
                        children: "×"
                      }
                    )
                  ] }, field)),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-inline", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      "input",
                      {
                        className: "td-input",
                        style: { width: 120 },
                        value: newModuleName,
                        placeholder: "新模块名",
                        spellCheck: false,
                        onChange: (e) => setNewModuleName(e.target.value),
                        onKeyDown: (e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void addModule(newModuleName);
                          }
                        }
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      "button",
                      {
                        type: "button",
                        className: "td-link",
                        disabled: settingsSaving || !newModuleName.trim(),
                        onClick: () => void addModule(newModuleName),
                        children: "＋ 模块"
                      }
                    )
                  ] })
                ] }),
                (d.schema && d.schema.pending || []).map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-pending", children: [
                  "「" + p.field + "」已停止灌注，将于 " + formatTime(p.executeAt) + " 从所有词条删除",
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-link", onClick: () => void undoPendingModule(p.field), children: "撤销" })
                ] }, p.field)),
                settingsError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-error", role: "alert", children: settingsError }) : null,
                scanConfirm ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                  "span",
                  {
                    className: "td-confirm",
                    ref: (el) => {
                      if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
                    },
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "全字典共 " + scanConfirm.scan.total + " 条词条，其中 " + scanConfirm.scan.withField + " 条写了「" + scanConfirm.field + "」。确认后立即停止灌注这个模块，24 小时后（" + formatTime(Date.now() + 24 * 3600 * 1e3) + " 左右）从所有字典文件删除（写前留 .bak）。" }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-inline", children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-link", onClick: () => setScanConfirm(null), children: "取消" }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                          "button",
                          {
                            type: "button",
                            className: "td-link primary",
                            disabled: settingsSaving,
                            onClick: () => void confirmRemoveModule(),
                            children: "确认删除"
                          }
                        )
                      ] })
                    ]
                  }
                ) : null
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-sect", children: "类型" }),
            Object.keys(d.schema && d.schema.types || SETTINGS_DEFAULTS.schema.types).map((typeId) => {
              const typeDef = d.schema && d.schema.types && d.schema.types[typeId] || { label: typeId, enabled: true, modules: [] };
              const pendingType = (d.schema && d.schema.pendingTypes || []).find((p) => p.type === typeId);
              return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-srow", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-slabel", title: typeDef.label, children: typeDef.label }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-sfield td-sfield-col", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                    "span",
                    {
                      className: "td-typegrid",
                      style: { gridTemplateColumns: "repeat(" + moduleList.length + ", minmax(0, 1fr)) auto" },
                      children: [
                        moduleList.map((field) => field === "别称" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-check td-check-lock", title: "别称参与命中匹配，不能取消", children: "✓" + field }, field) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "td-check", title: field, children: [
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                            "input",
                            {
                              type: "checkbox",
                              checked: typeDef.modules.indexOf(field) !== -1,
                              onChange: () => void toggleTypeModule(typeId, field, typeDef.modules.indexOf(field) === -1)
                            }
                          ),
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-checkname", children: field })
                        ] }, field)),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-inline", children: pendingType ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-link", onClick: () => void undoPendingType(typeId), children: "撤销" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_react.Fragment, { children: [
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-link", onClick: () => void toggleType(typeId, !typeDef.enabled), children: typeDef.enabled ? "停用" : "启用" }),
                          BUILTIN_TYPE_IDS.indexOf(typeId) === -1 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-link", onClick: () => void askRemoveType(typeId), children: "删除" }) : null,
                          typeDef.enabled ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-hint", children: "已停用" })
                        ] }) })
                      ]
                    }
                  ),
                  pendingType ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-pending", children: "类型「" + typeDef.label + "」将于 " + formatTime(pendingType.executeAt) + " 移除配置；期间不灌注该类型词条（不删词条）" }) : null,
                  typeConfirm && typeConfirm.type === typeId ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                    "span",
                    {
                      className: "td-confirm",
                      ref: (el) => {
                        if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
                      },
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "该类型下有 " + typeConfirm.scan.total + " 条词条。确认后立即停用、不再灌注该类型词条；24 小时后移除类型配置（不删词条，之后退回按字段推断归类）。" }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-inline", children: [
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-link", onClick: () => setTypeConfirm(null), children: "取消" }),
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                            "button",
                            {
                              type: "button",
                              className: "td-link primary",
                              disabled: settingsSaving,
                              onClick: () => void confirmRemoveType(),
                              children: "确认删除"
                            }
                          )
                        ] })
                      ]
                    }
                  ) : null
                ] })
              ] }, typeId);
            }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-srow", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-slabel" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-sfield", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    className: "td-input td-numinput",
                    style: { width: 140 },
                    value: newTypeName,
                    placeholder: "新类型名",
                    spellCheck: false,
                    onChange: (e) => setNewTypeName(e.target.value),
                    onKeyDown: (e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void addType();
                      }
                    }
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    type: "button",
                    className: "td-link primary",
                    disabled: settingsSaving || !newTypeName.trim(),
                    onClick: () => void addType(),
                    children: "＋ 添加类型"
                  }
                )
              ] })
            ] })
          ] }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-srow", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-slabel" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-sfield", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  type: "button",
                  className: "td-btn",
                  onClick: () => setSettingsDraft(Object.assign({}, SETTINGS_DEFAULTS, {
                    schema: settingsDraft && settingsDraft.schema || SETTINGS_DEFAULTS.schema
                  })),
                  children: "恢复默认"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  type: "button",
                  className: "td-btn primary",
                  disabled: settingsSaving,
                  onClick: () => void saveAdvanced(),
                  children: settingsSaving ? "保存中…" : "保存"
                }
              ),
              settingsSaved ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-hint", children: "已保存，下一次扫描起生效" }) : null
            ] })
          ] })
        ] })
      ] })
    ] });
  }
  const row = (layer) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      className: "td-row",
      "aria-current": layer.id === activeId ? "true" : void 0,
      title: layer.path,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className: "td-rowmain", onClick: () => setActiveId(layer.id), children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: layerLabel(layer) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-num", children: layer.exists ? String(layer.terms) : "—" })
        ] }),
        layer.kind === "domain" && layer.exists ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "td-rowdel",
            title: "删除这个任务层（文件改名归档，可找回）",
            onClick: () => {
              setLayerConfirm(layer.id);
              setAdvanced(false);
              setStructureView(false);
              setView("terms");
            },
            children: "×"
          }
        ) : null
      ]
    },
    layer.id
  );
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-root", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("style", { children: CSS }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", { className: "td-roster", "aria-label": "通用 / 任务层", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-grouplabel", children: "通用" }),
      generalLayers.map((l) => row(l)),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-grouplabel", children: "任务层" }),
      domains.map((d) => row(d)),
      creatingLayer ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-newlayer", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            className: "td-input",
            style: { width: "100%" },
            value: newLayerName,
            placeholder: "任务层名称",
            spellCheck: false,
            autoFocus: true,
            onChange: (e) => setNewLayerName(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void createLayer();
              }
              if (e.key === "Escape") {
                setCreatingLayer(false);
                setNewLayerName("");
              }
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-inline", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-link primary", disabled: layerSaving || !newLayerName.trim(), onClick: () => void createLayer(), children: layerSaving ? "创建中…" : "创建" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-link", onClick: () => {
            setCreatingLayer(false);
            setNewLayerName("");
          }, children: "取消" })
        ] })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "td-link td-newlayerbtn",
          onClick: () => {
            setCreatingLayer(true);
            setNewLayerName("");
          },
          children: "＋ 新建任务层"
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-pane", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-titlewrap", children: [
          nameEditing && active ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-inline", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                className: "td-titleinput",
                value: nameDraft,
                spellCheck: false,
                autoFocus: true,
                onChange: (e) => setNameDraft(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const next = nameDraft.trim();
                    if (next && next !== (active.taskType || active.slug || "")) void submitRename({ name: next });
                  } else if (e.key === "Escape") {
                    setNameEditing(false);
                  }
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-link", onClick: () => setNameEditing(false), children: "取消" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: "td-link primary",
                disabled: rnSaving || !nameDraft.trim() || nameDraft.trim() === (active.taskType || active.slug || ""),
                onClick: () => void submitRename({ name: nameDraft.trim() }),
                children: rnSaving ? "保存中…" : "保存"
              }
            )
          ] }) : active && active.kind === "domain" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "td-titlebtn",
              title: "点一下改显示名",
              onClick: () => {
                setNameDraft(active.taskType || active.slug || "");
                setRnError(null);
                setNameEditing(true);
              },
              children: layerLabel(active)
            }
          ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-title", children: layerLabel(active) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-sub", children: (active && active.kind === "domain" ? "任务层 · " : "") + (doc.loading ? "读取中…" : terms.length + " 条词条") }),
          active && active.kind === "domain" ? (() => {
            const bound = Array.isArray(active.workspaces) ? active.workspaces.filter(Boolean) : [];
            const titleOf = (path) => {
              const hit = wsOptions.find((w) => w.path === path);
              return hit && (hit.title || hit.path) || path;
            };
            const summary = bound.length === 0 ? "所有工作空间" : bound.map(titleOf).join("、");
            const extras = bound.filter((p) => !wsOptions.some((w) => w.path === p));
            return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "td-sub td-wsline", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-rlabel", children: "工作空间" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-wscombo", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                  "button",
                  {
                    type: "button",
                    className: "td-wsbtn",
                    "aria-expanded": wsOpen,
                    title: bound.join("、") || "所有工作空间都生效",
                    onClick: () => wsOpen ? setWsOpen(false) : openWsPicker(),
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-wssummary", children: summary }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": "true", children: "▾" })
                    ]
                  }
                ),
                wsOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-wsdropdown", children: [
                  wsError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-error", children: wsError }) : null,
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "td-wsopt", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      "input",
                      {
                        type: "checkbox",
                        checked: bound.length === 0,
                        onChange: () => void commitWorkspaces([])
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-wsname", children: "所有工作空间（不绑定）" })
                  ] }),
                  wsOptions.map((w) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "td-wsopt", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      "input",
                      {
                        type: "checkbox",
                        checked: bound.indexOf(w.path) !== -1,
                        onChange: () => toggleWorkspace(w.path)
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-wsname", children: w.title || w.path }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-wspath", children: w.path })
                  ] }, w.path)),
                  extras.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "td-wsopt", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: true, onChange: () => toggleWorkspace(p) }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-wsname", children: "已绑定片段" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-wspath", children: p })
                  ] }, "extra:" + p)),
                  wsOptions.length === 0 && !wsError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-hint", children: "没有工作空间清单" }) : null
                ] }) : null
              ] }),
              wsSaving ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-hint", children: "保存中…" }) : null
            ] });
          })() : null
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-headacts", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-link", onClick: () => void openStructure(), children: "结构" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-link", onClick: () => void openAdvanced(), children: "设置" })
        ] })
      ] }),
      rnError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-error", role: "alert", children: rnError }) : null,
      layerConfirm ? (() => {
        const target = layers.find((l) => l.id === layerConfirm) || null;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "td-confirm", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            "删除任务层「" + (target ? layerLabel(target) : layerConfirm) + "」？",
            "文件会改名归档（.deleted-时间戳），词条不丢，改回文件名即可找回。"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-inline", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: "td-btn primary",
                disabled: layerDeleting,
                onClick: () => void deleteLayer(layerConfirm),
                children: layerDeleting ? "删除中…" : "删除"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-btn", onClick: () => setLayerConfirm(null), children: "取消" })
          ] })
        ] });
      })() : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-toolbar", children: [
        view === "terms" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            className: "td-search",
            value: filter,
            placeholder: "搜索本层词条…",
            spellCheck: false,
            onChange: (e) => setFilter(e.target.value)
          }
        ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-hint", children: "原文视图：改完离开输入框即落盘。" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-tabs", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-tab", "aria-selected": view === "terms", onClick: () => setView("terms"), children: "词条" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-tab", "aria-selected": view === "raw", onClick: () => setView("raw"), children: "原文" })
        ] })
      ] }),
      view === "terms" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-list", children: [
        doc.loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-hint", children: "读取中…" }) : null,
        doc.error !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-error", role: "alert", children: doc.error }) : null,
        !doc.loading && shown.length === 0 && !adding ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "td-hint", children: keyword ? "没有匹配的词条。" : "这一层还没有词条，点下面的「＋ 新建词条」加一条。" }) : null,
        groups.map((g) => {
          const folded = Boolean(collapsedStatus[g.key]);
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_react.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-group", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "button",
                {
                  type: "button",
                  className: "td-groupbtn",
                  "aria-expanded": !folded,
                  title: folded ? "展开这一组" : "收起这一组",
                  onClick: () => setCollapsedStatus((c) => Object.assign({}, c, { [g.key]: !c[g.key] })),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                      folded ? "▸ " : "▾ ",
                      g.key
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-groupnum", children: g.items.length })
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  type: "button",
                  className: "td-groupadd",
                  title: "在这一组加一条",
                  onClick: () => {
                    setView("terms");
                    setCollapsedStatus((c) => Object.assign({}, c, { [g.key]: false }));
                    setAddingStatus(g.key);
                    setAdding(true);
                    setEditing(null);
                  },
                  children: "＋"
                }
              )
            ] }),
            adding && addingStatus === g.key ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              TermForm,
              {
                isNew: true,
                term: "",
                schema,
                fields: { 状态: g.key },
                saving: doc.saving,
                layerOptions,
                layerId: activeId,
                onCancel: () => setAdding(false),
                onSave: async (name, fields, targetId) => {
                  const ok = await saveEntry(name, fields, targetId, true);
                  if (ok) setAdding(false);
                }
              },
              "new:" + g.key
            ) : null,
            folded ? null : g.items.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_react.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "button",
                {
                  type: "button",
                  className: "td-entry",
                  "aria-current": editing === t.term ? "true" : void 0,
                  title: "点一下展开编辑",
                  onClick: () => setEditing(editing === t.term ? null : t.term),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-entryname", children: t.term }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-entrymeta", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-caret", "aria-hidden": "true", children: "›" }) })
                  ]
                }
              ),
              editing === t.term ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                TermForm,
                {
                  term: t.term,
                  fields: t.fields,
                  schema,
                  saving: doc.saving,
                  layerOptions,
                  layerId: activeId,
                  onCancel: () => setEditing(null),
                  onSave: async (_name, fields, targetId) => {
                    const ok = await saveEntry(t.term, fields, targetId, false);
                    if (ok) setEditing(null);
                  },
                  onDelete: async () => {
                    const ok = await writeText(removeTerm(doc.draft, t.term));
                    if (ok) setEditing(null);
                  }
                },
                t.term + ":form"
              ) : null
            ] }, t.term))
          ] }, "status:" + g.key);
        }),
        groups.length === 0 ? adding ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          TermForm,
          {
            isNew: true,
            term: "",
            schema,
            fields: { 状态: addingStatus },
            saving: doc.saving,
            layerOptions,
            layerId: activeId,
            onCancel: () => setAdding(false),
            onSave: async (name, fields, targetId) => {
              const ok = await saveEntry(name, fields, targetId, true);
              if (ok) setAdding(false);
            }
          },
          "new-empty"
        ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "td-addrow",
            onClick: () => {
              setView("terms");
              setAddingStatus("待观察");
              setAdding(true);
              setEditing(null);
            },
            children: "＋ 新建词条"
          }
        ) : null,
        keyword && (otherBusy || otherHits.length > 0) ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-other", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-link", onClick: () => setShowOther((v) => !v), children: otherBusy ? "正在找其他层…" : "其他层命中 " + otherHits.length + " 条 " + (showOther ? "（收起）" : "（展开）") }),
          showOther ? otherHits.map((h) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              type: "button",
              className: "td-entry",
              onClick: () => {
                setShowOther(false);
                setFilter("");
                setPendingTerm(h.term);
                setActiveId(h.layer.id);
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-entryname", children: h.term }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-status", children: layerLabel(h.layer) })
              ]
            },
            h.layer.id + ":" + h.term
          )) : null
        ] }) : null
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "textarea",
        {
          className: "td-area",
          style: { minHeight: 320, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", lineHeight: 1.7 },
          value: doc.draft,
          spellCheck: false,
          onChange: (e) => setDraft(e.target.value),
          onBlur: () => {
            if (dirty) void writeText(doc.draft);
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "td-foot", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-footleft", children: slugEditing && active ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "td-inline", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-rlabel", children: "文件名" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              className: "td-input",
              value: slugDraft,
              spellCheck: false,
              autoFocus: true,
              title: "改后 dict\\domains 下的 md 文件一并改名，词条内容不动",
              onChange: (e) => setSlugDraft(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const next = slugDraft.trim();
                  if (next && next !== (active.slug || "")) void submitRename({ slug: next });
                } else if (e.key === "Escape") {
                  setSlugEditing(false);
                }
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "td-link", onClick: () => setSlugEditing(false), children: "取消" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "td-link primary",
              disabled: rnSaving || !slugDraft.trim() || slugDraft.trim() === (active.slug || ""),
              onClick: () => void submitRename({ slug: slugDraft.trim() }),
              children: rnSaving ? "保存中…" : "保存"
            }
          )
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_react.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-path", children: active ? active.rel || active.path : "" }),
          active && active.kind === "domain" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "td-link",
              title: "改文件名＝dict\\domains 下的 md 文件改名，词条内容不动",
              onClick: () => {
                setSlugDraft(active.slug || "");
                setRnError(null);
                setSlugEditing(true);
              },
              children: "改文件名"
            }
          ) : null
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "td-status", children: doc.saving ? "保存中…" : dirty ? "未保存" : doc.savedAt ? "已保存" : "" })
      ] })
    ] })
  ] });
}
function headerFor(text, layer) {
  if (String(text == null ? "" : text).trim() !== "") return text;
  if (layer && layer.kind === "domain") {
    const slug = layer.slug || "";
    return "# 术语字典·任务层·" + slug + "\n\n> 任务类型：" + (layer.taskType || slug) + "\n\n";
  }
  return "# 术语字典·通用层\n\n> 收录判据：双方都在用、会出现口径分歧的词。格式：`## 词条名（别名：另一叫法）` 下面「- 定义／- 默认指代／- 边界／- 状态／- 备注」（除定义外可选）。\n\n";
}
var inject = ["slots"];
var MUTE_CSS = `.pp-mutebtn { padding:2px 8px; border:1px solid var(--dsw-alias-border-l1); border-radius:999px; min-width:58px; text-align:center;
  background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font:inherit; font-size:11px;
  line-height:1.4; cursor:pointer; white-space:nowrap; }
.pp-mutebtn:hover { border-color:var(--dsw-alias-brand-primary); }
.pp-mutebtn[data-muted="true"] { color:var(--dsw-alias-state-error-primary); border-color:currentColor; }
.pp-mutebtn:disabled { opacity:.6; cursor:default; }`;
var getSessionsService = () => void 0;
function useAgentPreset(sessionId) {
  const [preset, setPreset] = (0, import_react.useState)(void 0);
  (0, import_react.useEffect)(() => {
    if (!sessionId) return void 0;
    let alive = true;
    let face;
    try {
      const service = getSessionsService();
      const binding = service && typeof service.binding === "function" ? service.binding(sessionId) : void 0;
      face = binding && binding.session && binding.session.projections ? binding.session.projections.faceOf("agentPreset") : void 0;
    } catch {
      face = void 0;
    }
    if (!face) return void 0;
    const read = () => {
      if (alive) setPreset(face.getSnapshot());
    };
    read();
    const off = typeof face.subscribe === "function" ? face.subscribe(read) : void 0;
    return () => {
      alive = false;
      if (typeof off === "function") off();
    };
  }, [sessionId]);
  return preset;
}
var MUTE_CACHE = /* @__PURE__ */ new Map();
function SessionDictToggle(props) {
  const sessionId = props && props.sessionId ? String(props.sessionId) : "";
  const preset = useAgentPreset(sessionId);
  const [muted, setMuted] = (0, import_react.useState)(() => sessionId && MUTE_CACHE.has(sessionId) ? MUTE_CACHE.get(sessionId) : null);
  const [presets, setPresets] = (0, import_react.useState)(null);
  const [serverAllowed, setServerAllowed] = (0, import_react.useState)(null);
  const [busy, setBusy] = (0, import_react.useState)(false);
  (0, import_react.useEffect)(() => {
    if (!sessionId) return void 0;
    let alive = true;
    const read = () => {
      getJson("/dsh-term-dict/api/session-state?id=" + encodeURIComponent(sessionId)).then((data) => {
        if (!alive) return;
        const next = Boolean(data.muted);
        MUTE_CACHE.set(sessionId, next);
        setMuted(next);
        setPresets(Array.isArray(data.presets) ? data.presets : null);
        setServerAllowed(data.allowed === void 0 ? null : Boolean(data.allowed));
      }).catch(() => {
      });
    };
    read();
    window.addEventListener("focus", read);
    return () => {
      alive = false;
      window.removeEventListener("focus", read);
    };
  }, [sessionId]);
  if (!sessionId) return null;
  const blocked = typeof preset === "string" && preset !== "" ? Array.isArray(presets) ? presets.indexOf(preset) === -1 : serverAllowed === false : serverAllowed === false;
  const label = blocked ? "词条·禁" : busy ? "词条…" : muted === null ? "词条…" : muted ? "词条·禁" : "词条·注";
  const toggle = async () => {
    if (busy || muted === null || blocked) return;
    setBusy(true);
    try {
      const data = await postJson("/dsh-term-dict/api/session-mute", { id: sessionId, muted: !muted });
      const next = Boolean(data.muted);
      MUTE_CACHE.set(sessionId, next);
      setMuted(next);
    } catch {
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_react.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("style", { children: MUTE_CSS }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        className: "pp-mutebtn",
        "data-muted": blocked || muted === true ? "true" : "false",
        disabled: busy || muted === null || blocked,
        title: blocked ? "当前模式不在词条灌注名单里（设置 → 术语字典 → 灌注）" : "术语字典：本会话是否灌注词条",
        onClick: () => void toggle(),
        children: label
      }
    )
  ] });
}
function apply(ctx) {
  getSessionsService = () => {
    try {
      return ctx.get("sessions");
    } catch {
      return void 0;
    }
  };
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "term-dict",
    order: 35,
    label: "术语字典"
  }, TermDictSection));
  try {
    ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
      name: "conversation.input.right",
      id: "term-dict-mute",
      order: 20,
      label: "词条灌注"
    }, SessionDictToggle));
  } catch {
    try {
      ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
        name: "conversation.session.header.actions",
        id: "term-dict-mute",
        order: 15,
        label: "词条灌注"
      }, SessionDictToggle));
    } catch {
    }
  }
}

		return module.exports;
	}
});
