# 通用开发说明

## 本地运行

使用 `.nvmrc` 指定的 Node.js 版本，或满足 `package.json` 中的版本要求。

```bash
npm ci
npm run dev
```

打开终端显示的本地地址，进入 `/#/explore`。

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

可运行 `git config core.hooksPath .githooks` 启用提交前的公开内容检查；CI 也执行同一检查。

## 分支与发布

`main` 是默认主分支，用于发布和自动部署；日常开发使用 `dev`。`dev` 提交只运行检查，准备发布时通过 Pull Request 合并到 `main`，检查通过后部署。

`main` 要求 Pull Request 和 CI 检查通过，并禁止强制推送及删除。提交前检查暂存文件，推送前及 CI 检查当前提交的完整历史，避免先提交私有文件、再删除后仍把内容公开。

仓库保持公开，所有分支及其提交历史均可被查看。分支不提供隐私隔离，私有资料必须放在 Git 跟踪范围之外。

## 目录

- `src/`：页面、玩法、存储和音频服务。
- `content/`：内容清单、素材来源及发布审核状态。
- `public/media/`：图片、模型与音频资源。
- `scripts/`：校验、素材处理和通用发布工具。
- `tests/`：单元、发布工具和浏览器测试。

车型扩充按 `docs/CATALOG_WORKFLOW.md` 执行：先核对真实量产车型及系列别名，再核对独立 GLB 的作者、许可和实际外观。当前 101 款立体车使用登记来源的独立模型；GPT Image 负责车辆插画，不直接输出这些 GLB。

新增目录插画的图集、提示词、图帧及哈希记录在 `content/catalog-illustrations.json`。`node scripts/prepare-catalog-illustrations.mjs <本机图集索引.json>` 将经过检查的 GPT 图集裁成透明 WebP。玩法继续使用从同车型模型渲染的侧视、俯视图及登记轮位，避免插画换图后点击位置失准。

历史 30 款 GPT 六角度图与玩具侧视/俯视图的生成记录分别保留在 `content/car-turnarounds-production.json`、`content/play-cars-production.json`。来源索引中的本机绝对路径不进入公开记录。

素材来源与署名保留在 `content/photo-sources.json`、`content/photo-view-sources.json` 等清单中。素材的许可范围需分别核对；声音听审与分发依据仍待确认。

玩法规则位于 `src/game/TouchBoard.ts`，部件命中、固定形状道路旋转与分阶段路线位于 `src/domain/play-guidance.ts`。动作失败提供局部回弹和重复示范；拖动和点选放置共用接受规则。开放活动的记录为 `participated`，不能当作自动评估儿童表达或概念掌握的结果。

构建产物位于 `dist/`。可选公开素材路径见 `.env.example`；`VITE_` 变量会进入网页，不能放凭据。

实际部署配置、云资源标识、连接说明和运维回执只保存在私有环境中。自动部署从 GitHub 的 `production` Environment Secrets 读取配置；本地部署可通过 `CARPLAYGROUND_DEPLOYMENT_DIR` 指向仓库外的私有配置目录。公开代码不包含真实目标配置。

统一绘制图形位于 `src/visual/play-symbols.ts`，React与Canvas共用，不依赖平台Emoji字体。`src/domain/play-journey.ts` 提供覆盖26项活动的可选下一站邀请；故事上下文仍走原故事下一幕，完成记录与儿童掌握程度分开。

## 模型交付

保留来源 GLB 及其署名哈希。发布打包将超过 512 KiB 的模型拆成最大 256 KiB 的有序分块，在公开内容清单中附带 `delivery` 引用。浏览器核对每一块与重组后的完整 GLB，再解析模型；请求失败或取消仍可返回同车型图片并重试。本地开发直接读取原文件。

发布前还会检查实际上传请求的大小：较大的文本使用标准 gzip 内容编码，其他资源不得超过 512 KiB。源站与 CDN 校验解码后的原始字节，浏览器自动处理内容编码。
