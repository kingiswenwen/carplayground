# 玩法功能验收

先运行 `npm ci` 和 `npx playwright install --with-deps chromium`。测试会自动启动开发服务；已有服务时复用它。

## 逐项玩完

```sh
npx playwright test tests/e2e/world-all-modes.spec.ts --project=chromium --workers=1
```

覆盖全部 26 个玩法，每项均验证实际操作、完成判定、100% 进度和页面无横向溢出：

| 分组 | 尺寸 | 输入 |
| --- | --- | --- |
| 桌面 | 1000 × 760 | 鼠标点击、拖动、推动 |
| 平板 | 768 × 1024 | 触摸点击、拖动、推动 |
| 手机 | 390 × 844 | 触摸点击、拖动、推动 |

每种组合保留开始和完成截图，位置为 `.private/playability-audit/<浏览器>/<分组>/<玩法编号>-start.png` 和 `-done.png`。浏览器分别存放，避免互相覆盖。这些本机验收材料不进入公开仓库。

触摸拖动通过 Chromium 输入协议发送；结果属于浏览器模拟验证，不能替代 Android、iPhone 或 iPad 真机测试。

## 交互与横屏回归

```sh
npx playwright test tests/e2e/playability.spec.ts tests/e2e/playability-layout.spec.ts tests/e2e/world-recovery-audit.spec.ts tests/e2e/scene-rendering.spec.ts --project=chromium --workers=1
```

检查点选后放置、三维插槽、颜色目标更新、步骤提示、短桥板拒绝、镜头模式、取消拖动、重玩、WebGL 不可用时继续游戏，以及 667 × 375 和 844 × 390 横屏下的场景尺寸与下一站入口。

完成邀请的进场动画会暂停在开始、中间和结束位置，逐帧检查 320、360、390 像素手机宽度的页面与按钮边界，覆盖动画过程中的短暂横向溢出。

静止画面测试在完成反馈结束、横竖屏切换后检查场景中央的实际像素，防止只凭 `data-ready` 或完成标记认定三维画面正常。

## 逐车型回归

```sh
npx playwright test tests/e2e/catalog-models.spec.ts tests/e2e/child-journey.spec.ts --project=chromium --workers=1
```

独立模型逐辆检查部件点击；平面装配与部件探索按当前车型清单逐辆生成独立用例。新增车型会自动进入验收，不依赖标题中的固定数量，也不会让整组车型共用一个超时预算。

浏览器失败时保留截图和 trace。先确认是功能断言、资源失败还是执行超时，再针对原因处理；不要跳过失败项后宣称通过。
