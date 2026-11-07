# 发布清单（DSH 社区）

这个目录就是可直接推到 GitHub 公开仓库的内容。下面每一步做完再进下一步。

## 0. 发布前在本机验证

```sh
npm install
npm run build:client    # 从 src/entry.jsx 重新生成 lib/client.js
npm run check:client    # 已提交产物与源码一致
npm run check           # 语法
npm run smoke           # 结构 / 组合声明 / 宿主工具与路由 / 自动激活默认值 / 默认词条 / 客户端产物 / 环境残留 七关
```

`scripts/smoke.mjs` 不起应用、不发网络请求；默认词条用例只写系统临时目录，结束即删。查包结构、组合声明里的 id/name、宿主半边的工具名与
24 条路由（含同源守卫处数）、自动激活的默认值（`presets` 默认空＝所有模式）、全新 DSH_HOME 首次写入的默认词条，再核对 `lib/client.js` 的外壳 id
与面板标记，最后扫一遍环境残留。任一条失败退出码 1。

## 0.5 检查打包内容

```sh
npm pack --dry-run
```

包里只应出现：`index.js`、`activation.js`、`cordis.patch.yml`、`assets/`、`src/`、`lib/client.js`、
`scripts/`、两个 README、`LICENSE`。`node_modules/`、`publish/`、`*.tgz` 都不该进包。

**`lib/client.js` 必须提交进 git。** 它不是构建垃圾：从 GitHub 安装时不跑构建，缺了它面板不会出现。

## 1. 建 GitHub 仓库

- 公开仓库与包名同名：`dsh-term-dict`，安装命令写 `github:OWNER/dsh-term-dict`。
- 推送本目录内容（不含 `node_modules/`）。
- 给仓库加 topic：`dsh-plugin`（收录检查会看）。
- 仓库创建要满 24 小时才能进社区目录，当天建好、第二天同一时刻之后再提 PR。

## 2. 填占位符

- `package.json` 的 `repository` / `homepage` / `bugs` 三处 URL（现在已填 `taoziliyouchong`）。
- `publish/registry-entry.yml` 的两处 URL 与 `name`。
- 若走 npm，先确认包名可用：`npm view dsh-term-dict version`（404 表示未被占用）。

## 3. 发布到 npm（可选但推荐）

```sh
npm publish --access public
```

不发 npm 也能被收录：安装命令走 GitHub。发 npm 的好处是市场能做版本更新检查。

## 4. 提交目录收录

到 GitHub 仓库 `awesome-dsh-plugin/awesome-dsh-plugin` 开 PR，只加一个文件：

- 路径：`data/plugins/<OWNER>__dsh-term-dict.yml`
- 内容：`publish/registry-entry.yml` 全文

分类填 `tools`。本包不含图片资源，条目里不写 `icon` 行。

## 5. 之后的版本更新

1. 改 `package.json` 的 `version`（只升补丁位：文案、排序、行为微调都算补丁；接口不兼容才升次版本）。
2. 改了界面就重新 `npm run build:client`，把 `lib/client.js` 一起提交。
3. 打 tag：`git tag v0.1.0 && git push && git push --tags`。
4. `npm publish`（如果走 npm）。
5. 目录条目本身不用改，市场按 npm 版本或 GitHub HEAD 检查更新。

## 收录要求对照

| 要求 | 本仓库状态 |
| --- | --- |
| `package.json` 声明 `dsh.bundle.patch` | 已声明，指向 `cordis.patch.yml` |
| 仓库有真实可用代码 | 有（4 条工具、23 条本机路由、自动激活、面板） |
| 仓库满 24 小时 | 建库后次日同一时刻再提 PR |
| 加 `dsh-plugin` topic | 建库时加 |
| 描述只说功能、不夸大 | `registry-entry.yml` 按实际能力写 |
| 分类贴合 | `tools` |
| 客户端半边可复现 | `lib/client.js` 已提交，`npm run check:client` 可核对 |
| 版本号 | 三段式，从 `0.1.0` 起 |

## 已知注意事项

- 数据在 `$DSH_HOME/dict/`，与包分开；卸载插件不会删数据，要清就手工删这个目录。
- 宿主半边只响应回环地址且改数据要求同源；远程访问的 DSH 上面板会 403。
- 自动激活默认所有模式灌注；只想在部分模式生效，就在面板「高级设置 → 灌注的模式」里勾选（清单来自宿主 agentPresets，自动列出）。
- `engines.dsh` 写的是 `>=0.2.2-0`（实测 0.2.2-rc.1）。换了 DSH 版本要实测一遍再改这个下限。
