# dsh-term-dict

[中文](README.md) | **English**

A cross-session glossary for DSH: keep the terms you and the model agreed on in plain text files. When a term
first shows up in a session, its definition is injected into the model context automatically. Ships with three
tools (look up / write / lint) and a settings panel.

Every new session starts blank: the model no longer knows what *your* "report" or "the table" means. Write it
down once; from then on the first mention in any session carries the agreed meaning.

## Layout

| Layer | File | Holds |
| --- | --- | --- |
| General | `$DSH_HOME/dict/general.md` | terms valid across every kind of work |
| Task | `$DSH_HOME/dict/domains/<task-slug>.md` | terms valid only inside one kind of work, including per-workspace default targets |

One file per kind of work. The file header carries `> 任务类型：<display name>`; the panel lists that name.
A task layer may bind workspaces with `> 工作空间：<path fragment>` lines — the term only matches when the
session working directory contains one of the fragments.

## Entry format

```md
## term name (alias: another name)

- 定义: one sentence, what it is
- 默认指代: what it points at by default when used alone
- 边界: what it is not
- 状态: 已确认 / 部分确认 / 待观察 / 已废
- 备注: optional; put "which one wins when names collide" here
```

Only the definition is required. Aliases go into the heading parentheses; looking up an alias is equivalent
to looking up the term name. The type (term / target / archived) is inferred from which fields are present
and is not written to the file.

## Tools

| Tool | Purpose |
| --- | --- |
| `dict` | Single entry: `action=lookup` (index when `term` is omitted) / `write` / `lint` / `mute` / `unmute` |
| `dict-lookup` | Look up only: index or full entry text; aliases match too |
| `dict-write` | Write only: add or update one entry, keeping a `.bak` first |
| `dict-lint` | Lint only: empty definitions, missing status, duplicate names, alias clashes, cross-layer copies, near-identical names |

A miss is a normal result, not an error: the tool answers with near-miss candidates instead of failing.

## Auto-activation

The first time a term or alias appears in a session, its meaning is injected into the model context through
the official runtime-context channel. Once per session per term; the state lives in
`$DSH_HOME/dict/.activation.json`, so restarting or resuming does not inject twice.

- **Timing**: words in the user message apply before that model call; words in the model's own reasoning or
  output apply from the next step or next turn (the stream already being generated cannot be changed).
- **Scope**: general sessions (no preset, or a preset that cannot be detected) always get it. Pick presets in *Settings → Advanced → presets*
  (the local roster is listed for you); a preset outside that list — including any newly created one — gets nothing, and the dictionary tools
  are not registered there. An empty list means only general sessions.
- **Limits**: 64 terms per session, 12000 characters in total, entries not truncated — all adjustable.
- **Skipping**: pick local workspaces in the panel (path-substring match, so a parent directory also covers its subdirectories) or type extra fragments (`skipWorkspaces`); session ids go through `skipSessions`; the
  composer button controls the current session, and each task layer can be forced on or off per session.

## Settings panel

Settings → *Term dictionary*: a layer tree on the left, term editing and raw-text editing on the right, and a
settings page for auto-activation, the three limits, the preset allowlist and skipped workspaces. A separate
*Structure* page manages modules and types; removing a module scans its impact first and only touches data
after 24 hours, with an undo window.

## Local routes

The host half registers 24 loopback-only routes under `/dsh-term-dict`; state-changing requests must also be
same-origin (cross-site writes from a browser get 403). Non-browser clients without those headers still work.

| Group | Routes |
| --- | --- |
| Layers and entries | `GET /api/list`, `GET /api/read`, `POST /api/write`, `POST /api/rename`, `POST /api/create-layer`, `POST /api/workspace`, `GET /api/workspaces` |
| Sessions | `GET /api/session-state`, `POST /api/session-mute`, `POST /api/session-mute-clear`, `GET|POST /api/session-layers` |
| Structure | `GET /api/schema-scan`, `POST /api/schema/module-remove`, `POST /api/schema/module-cancel`, `POST /api/schema/module-add`, `POST /api/schema/module-def`, `POST /api/schema/type-enable`, `POST /api/schema/type-module`, `POST /api/schema/type-add`, `GET /api/schema/type-scan`, `POST /api/schema/type-remove`, `POST /api/schema/type-unremove` |
| Settings | `GET|POST /api/settings`, `GET /api/presets` (the local preset roster used by the allowlist) |

## Data

Everything lives in `$DSH_HOME/dict/`: `general.md`, `domains/<slug>.md`, `.settings.json`,
`.activation.json`. The dictionary files are plain text and can be edited by hand; the plugin keeps a `.bak`
before writing. Uninstalling does not delete them.
On first run, if the general layer does not exist, the plugin seeds two term entries ("词条", alias 词目,
and "词典", aliases 字典/术语字典; both type 称谓型 with all modules filled in). An
existing dictionary is never overwritten.

## Install

```sh
dsh plugin --profile desktop add github:taoziliyouchong/dsh-term-dict
```

Restart DSH afterwards; replace `desktop` with your profile name if you use another one.
Requires DSH >= 0.2.1-alpha.1 (lower bound inferred from the services and slots the plugin uses, all present in alpha.1); verified on 0.2.1-alpha.3 and 0.2.2-rc.1, later versions untested.

## Development

```sh
npm install
npm run build:client    # regenerate lib/client.js from src/entry.jsx
npm run check:client    # committed bundle matches the source
npm run check           # syntax
npm run smoke           # structure, composition, host tools and routes, activation defaults, default entry, bundle, leftovers
```

`lib/client.js` is a committed build artifact: installing from GitHub does not run a build, and without the
bundle the panel never appears. `react`, `react/jsx-runtime` and `react-dom` stay external (the DSH client
module table provides them), and the envelope `window.__ModuleLoader__.load({ id, factory })` must carry the
package name as `id`.

## Limitations

- Auto-activation matches exact term names and aliases only; near-misses are suggestions, not automatic.
- Task-layer terms only match when workspace binding or a session override allows them.
- The panel routes are loopback-only: on a remotely accessed DSH the panel returns 403.
- Entries are plain text split by level-2 headings; hand edits must keep the `## name` heading.

## Feedback

Open an issue: https://github.com/taoziliyouchong/dsh-term-dict/issues

Please include the DSH version, the plugin version, the exact error text and a screenshot.

## License

MIT
