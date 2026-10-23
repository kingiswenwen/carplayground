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
- `public/media/`：图片与音频资源。
- `scripts/`：校验、素材处理和通用发布工具。
- `tests/`：单元、发布工具和浏览器测试。

当前游戏车辆使用重新生成的侧视、俯视图；生产提示词、来源和轮位记录见 `content/play-cars-production.json`。旧照片与按钮交互的浏览器脚本保留于 `tests/legacy-ui-v5/` 供历史回溯，当前回归位于 `tests/e2e/`。

素材来源与署名保留在 `content/photo-sources.json`、`content/photo-view-sources.json` 等清单中。素材的许可范围需分别核对；声音听审与分发依据仍待确认。

构建产物位于 `dist/`。可选公开素材路径见 `.env.example`；`VITE_` 变量会进入网页，不能放凭据。

实际部署配置、云资源标识、连接说明和运维回执只保存在私有环境中。自动部署从 GitHub 的 `production` Environment Secrets 读取配置；本地部署可通过 `CARPLAYGROUND_DEPLOYMENT_DIR` 指向仓库外的私有配置目录。公开代码不包含真实目标配置。
