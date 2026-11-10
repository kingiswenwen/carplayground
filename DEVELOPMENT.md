# 通用开发说明

## 本地运行

使用 `.nvmrc` 指定的 Node.js 版本，或满足 `package.json` 中的版本要求。

```bash
npm ci
npm run dev
```

打开终端显示的本地地址，进入 `/#/explore`。开发与 Vite preview 默认只监听本机；需要局域网时显式传 `--host 0.0.0.0`。`scripts/dev-security.ts` 对 dev/preview 请求设独立 HTTP 边界，私有文档、回执、密钥、未知根文件、编码路径和越界符号链接不会因 Git 忽略与否而变为可访问。新增运行时内容入口需审查白名单，不要直接开放整个仓库。私有 trace/report 不参与热重载。

安全浏览器专项需在真实开发服务上显式运行 `DEV_SECURITY_E2E=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 npx playwright test tests/e2e/dev-security.spec.ts --project=chromium --workers=1`；它不适用于构建包，普通构建包全套会明确跳过该 dev-only 专项。CI 另启独立 dev 环境执行它。

## 检查与构建

```bash
npm run build
npm run check:public
npm test
npm run test:release
python3 -m unittest discover -s tests -p 'test_*.py'
```

浏览器测试：

```bash
npx playwright install chromium firefox
npm run test:e2e -- --workers=1
```

Python 音频处理测试需要 FFmpeg。浏览器模拟结果不代表真机实测结果。

发布工具回归会生成真实模型包及破坏性独立副本，因此临时沙箱建在项目父目录的同一文件系统（不占用可能很小的 `/tmp` tmpfs，且不进入源码或公开资源）。每项负例/组合输出在 `finally` 释放，整批结束清理本轮独占沙箱；不使用硬链接代替独立副本。请保留足够的同盘可用空间，且不要并发执行会重建 `dist/` 的生产构建或其他发布测试。源码恢复测试只验证当前 Git 提交，不能据此宣称未提交改动已经归档恢复。

可运行 `git config core.hooksPath .githooks` 启用提交前的公开内容检查；CI 也执行同一检查。

## 分支与发布

`main` 是默认主分支，用于发布和自动部署；日常开发使用 `dev`。`dev` 提交只运行检查，准备发布时通过 Pull Request 合并到 `main`，检查通过后部署。

`main` 要求 Pull Request 和 CI 检查通过，并禁止强制推送及删除。提交前检查暂存文件，推送前及 CI 检查当前提交的完整历史，避免先提交私有文件、再删除后仍把内容公开。

拉取“最新代码”时先检查工作区并执行 `git fetch origin`，同时比较 `origin/dev` 与 `origin/main`，不能只因本地与 `origin/dev` 一致就认定已包含最新发布。若当前开发分支是主线的祖先，可用 `git merge --ff-only origin/main` 安全快进；分支分叉或存在冲突时停止并先保留本地修改，不使用强制重置。这只更新本地代码，不推送、不触发部署。

当前版本以 `package.json`、`content/r3.json`、当前 Git 提交和实际测试结果交叉核对。本机忽略的交接记录是历史资料，不会随远端代码自动更新；旧版本的车型计数、技术路线及测试次数不能覆盖现行源码。

仓库保持公开，所有分支及其提交历史均可被查看。分支不提供隐私隔离，私有资料必须放在 Git 跟踪范围之外。

## 目录

- `src/`：页面、玩法、存储和音频服务。
- `content/`：内容清单、素材来源及发布审核状态。
- `public/media/`：图片、模型与音频资源。
- `scripts/`：校验、素材处理和通用发布工具。
- `tests/`：单元、发布工具和浏览器测试。

车型扩充按 `docs/CATALOG_WORKFLOW.md` 执行：先核对真实量产车型及系列别名，再核对独立 GLB 的作者、许可和实际外观。当前 106 款立体车使用登记来源的独立模型；GPT Image 负责车辆插画，不直接输出这些 GLB。

新增目录插画的图集、提示词、图帧及哈希记录在 `content/catalog-illustrations.json`。`node scripts/prepare-catalog-illustrations.mjs <本机图集索引.json>` 将经过检查的 GPT 图集裁成透明 WebP。玩法继续使用从同车型模型渲染的侧视、俯视图及登记轮位，避免插画换图后点击位置失准。

保留的 24 款 GPT 六角度图与玩具侧视/俯视图的生成记录分别保留在 `content/car-turnarounds-production.json`、`content/play-cars-production.json`。来源索引中的本机绝对路径不进入公开记录。

素材来源与署名保留在 `content/photo-sources.json`、`content/photo-view-sources.json` 等清单中。素材的许可范围需分别核对；声音听审与分发依据仍待确认。

玩法规则位于 `src/game/TouchBoard.ts`，部件命中、固定形状道路旋转与分阶段路线位于 `src/domain/play-guidance.ts`。动作失败提供局部回弹和重复示范；拖动和点选放置共用接受规则。开放活动的记录为 `participated`，不能当作自动评估儿童表达或概念掌握的结果。

`src/domain/play-difficulty.ts` 是两引擎共享的操作辅助参数：默认 `gentle` 保留原放置/擦洗辅助，`explore` 只适当收紧额外放置容错和擦洗范围；两档部件热点保持原尺寸，不靠缩热点加难，也不改变颜色、顺序、数量、桥长的正确规则。家长选择持久化，活动以入场时冻结的会话难度初始化规则；切屏、切换平面/立体和模型失败回退不另起难度。重玩产生新会话，使用届时的本机设置。明确网格部件的识别、物件拾取的最小触控尺寸和键盘辅助不因难度失效。这不是26套不同内容关卡。专项回归为 `tests/play-difficulty.test.ts` 和 `tests/e2e/difficulty.spec.ts`。

`src/domain/play-level.ts` 单独定义内容梯度：`starter` 为 E01 红蓝两色、E02/T01 车轮目标及 M01 一车停车；`discover` 为原来的三色、三部件、两车。只覆盖这四项活动，不宣称全26项都有独立内容梯度。旧设置或旧备份没有 `contentLevel` 时按 `discover` 处理；会话冻结该字段并保存实际阶段，图示、键盘、任务说明和完成反馈都随目标变化。

洗车的固定污点 ID、已清集合与本车投影归规则层 `src/domain/wash-state.ts` 管理；切屏或切引擎只重建表现，不重抽污点，也不能通过切换刷进度。下一辆车生成新集合。轮印绘制以内容修订号刷新，达到保留上限后新点仍能替换旧点并重绘。

备份导出、导入、下载及替换前快照使用同一 UTF-8 64 MiB／跨表100000条总记录安全上限，保留字段与重复编号校验；不再用500幅作品或单表10000条限制正常累积。超限在下载或替换前明确拒绝，保留本机和旧恢复点，不静默丢弃记录；不要清空当前设备，应先联系维护者协助分批备份。外来集合长度在逐行校验前预检，避免小文件巨量无效行放大内存。旧格式1备份继续兼容。

旧测试截图已统一使用 Playwright 当前测试输出路径，请为每批传独立 `--output`，不写回旧历史目录。新增内容阶段、洗车/轮印连续性在 CI 中增加 Firefox 代表性回归。

选车与详情查看器的换色选择独立记录在 `content/viewer-paints.json`，保留来源模型、贴图与哈希；语义材质按车身映射，单张图集按颜色与轮位遮罩换色，支持标准光照与无光照材质。还原按钮关闭着色并恢复原材质参数。查看器支持换色不代表玩法模型能准确识别目标色，不能因此修改 `vehicle-models.json` 的 `paintMaterials` 资格。`tests/e2e/showroom-updates.spec.ts` 在Chromium逐车比较106款模型的红蓝实际像素，而非只断言按钮状态；`VIEWER_PAINT_IDS` 可在本地复核指定车型，CI默认检查全量。

选车缩略图和加载占位统一使用 `vehiclePreview` 选择对应独立模型的已登记前左渲染图，不把插画当作模型预览。切换同步隐藏/清除旧画布，加载图片按车型重新挂载，实际绘制后才显示画布。品牌与发源地的 `CatalogueSelect` 使用可搜索的自定义面板，支持方向键、Escape、Tab和视口内定位。

不能独立换漆的车型，在 E01/M04/L03 主动使用颜色准确的平面车图；其他活动仍可使用其独立 GLB。`tests/e2e/color-models.spec.ts` 检查实际颜色像素和触摸完成，不以内部字段代替视觉正确性；其截图使用 `testInfo.outputPath`，可用 Playwright `--output` 为每批保存独立证据。

车型查看器识别为软件GPU时，保留同一真实网格和登记贴图，但使用0.65像素比、不烘焙昂贵演播室环境、不绘制实时阴影、不持续计算拖动惯性；硬件GPU原路径不变。控件的 `change` 必须标记重绘，因为事件内的 `update()` 可能先消费变化，不能仅凭下一帧 `update()` 的返回值决定是否画出输入结果。组件使用 layout cleanup 在DOM移除前销毁控件，确保文档级监听器从原事件根解除。查看器切车同步清空旧画面，但同步WebGL构造失败需在父组件切车布局重置后通知图片回退，避免失败状态被重置为无画面的模型模式；CI在长矩阵前先检查此降级与重试路径。Chromium专用CDP回归覆盖玩法20轮、查看器10轮的监听器稳定，不等于GPU内存或真机验收。

构建产物位于 `dist/`。可选公开素材路径见 `.env.example`；`VITE_` 变量会进入网页，不能放凭据。

实际部署配置、云资源标识、连接说明和运维回执只保存在私有环境中。自动部署从 GitHub 的 `production` Environment Secrets 读取配置；本地部署可通过 `CARPLAYGROUND_DEPLOYMENT_DIR` 指向仓库外的私有配置目录。公开代码不包含真实目标配置。

首次加载只启动当前路由的原生模块请求；可选页面、备份校验和图片导出按需加载。`scripts/startup-imports.ts` 根据实际构建产物生成当前页的并行导入列表，不启用会影响部分 WebKit 失败重试的 `modulepreload`。完整内容 schema 位于 `src/domain/content-schema.ts`，由 `npm run validate` 在每次构建前执行，文件哈希检查保持不变；用户导入的备份继续在浏览器中校验。立体引擎准备期间先展示同车型预览，只有实际渲染后才标记模型就绪。

统一绘制图形位于 `src/visual/play-symbols.ts`，React与Canvas共用，不依赖平台Emoji字体。`src/domain/play-journey.ts` 提供覆盖26项活动的可选下一站邀请；故事上下文仍走原故事下一幕，完成记录与儿童掌握程度分开。

## 模型交付

保留来源 GLB 及其署名哈希。发布打包将超过 512 KiB 的模型拆成最大 256 KiB 的有序分块，在公开内容清单中附带 `delivery` 引用。浏览器核对每一块与重组后的完整 GLB，再解析模型；请求失败或取消仍可返回同车型图片并重试。本地开发直接读取原文件。

发布前还会检查实际上传请求的大小：较大的文本使用标准 gzip 内容编码，其他资源不得超过 512 KiB。源站与 CDN 校验解码后的原始字节，浏览器自动处理内容编码。

## 汽车小镇界面与素材

全站地点映射位于`src/domain/town.ts`，保留原活动ID、四场景存储字段和备份结构。新增界面使用`src/styles/town.css`，规则和操作状态继续由TouchBoard共用，换视图不重建教学进度。设计约束见`DESIGN.md`，逐项教学保留依据见`docs/TOWN_ACTIVITY_INVENTORY.json`。

开发服务器启动后，`node scripts/capture-town-covers.mjs`从实际玩法生成26张动作封面；C03、A01、A02通过真实指针操作呈现场景、海报和轮印。`node scripts/capture-town-preview.mjs`导出九页×三尺寸的页面审阅图，包含滚动加载的车型图片。封面脚本同步更新内容清单哈希，运行后需要检查画面、来源记录并执行内容校验。

字体属于登记媒体，通过FontFace和`assetUrl`使用版本/CDN媒体前缀；不要在CSS中硬编码未版本化的字体根路径。发布包支持登记的WOFF，仍校验完整文件SHA-256、MIME和不可变缓存。
