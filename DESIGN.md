---
name: 汽车小镇
description: 教学对象清楚、可以直接动手玩的微缩汽车小镇
colors:
  town-green: "#3d6b52"
  town-paper: "#faf5e9"
  town-ink: "#294d42"
  town-muted: "#5d7063"
  town-line: "#dedecb"
  town-sage: "#dae6cd"
  town-yellow: "#f6d180"
  town-coral: "#d4876e"
typography:
  headline:
    fontFamily: 'Town Sans, "Noto Sans CJK SC", "PingFang SC", sans-serif'
    fontSize: "clamp(26px, 2.7vw, 38px)"
    fontWeight: 800
    lineHeight: 1.4
    letterSpacing: ".02em"
  body:
    fontFamily: 'Town Sans, "Noto Sans CJK SC", "PingFang SC", sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  activity-title:
    fontSize: "18px"
    fontWeight: 800
    lineHeight: 1.5
rounded:
  town: "28px"
  map: "38px"
  card: "25px"
  action: "18px"
spacing:
  tight: "8px"
  group: "16px"
  section: "28px"
components:
  primary-link:
    backgroundColor: "{colors.town-green}"
    textColor: "#fffdf2"
    rounded: "17px"
    padding: "9px 20px"
    height: "48px"
  activity-caption:
    backgroundColor: "#fffbed"
    textColor: "{colors.town-ink}"
    padding: "16px 38px 17px 19px"
---

# Design System: 汽车小镇

## Overview

**Creative North Star: "可以亲手探索的汽车小镇"**

圆润的微缩建筑、道路和道具构成孩子可辨认的世界。奶油色页面衬托绿色文字、暖黄门厅、珊瑚屋顶和浅青洗车屋。场景图采用一致的左上方日光、接触阴影与木材/哑光玩具体积。

实际教学区域优先保证物体、目标轮廓、手势和现象可见。保留真实登记车型的比例和识别特征。小镇插画、故事事件图与实时教学模型承担不同职责；装饰图不参与命中或数量判断。

**Key Characteristics:**

- 建筑入口、物件图标和直接操作先于文字说明。
- 明确轮廓、柔和阴影、足够大的常用控件。
- 页面、地点、故事与玩法共用暖色底和低干扰工具。

## Colors

主操作和重点文字使用小镇绿与深绿；奶油色提供连续背景。鼠尾草绿、暖黄和珊瑚色用于环境与地点识别，浅色边线区分面层。

**The Teaching Colour Rule.** 认颜色、规律和分类所用的红、蓝、白来自原教学内容。环境色板、模型灯光或展厅七色不能替代任务目标色；需要时使用已有准确颜色的平面降级。

## Typography

自托管的 Town Sans 是 Noto Sans CJK SC 的正体与粗体子集，许可见 `docs/licenses/town-font-OFL.txt`。普通正文与粗体标题分别使用实际 WOFF 文件；回退到设备中文字体。

页面标题在桌面使用前述流动字号，手机为27px；活动页标题桌面19px、手机17px。活动入口的标题桌面18px、手机15px，辅助动作说明12px/11px。家长正文14px、手机13px，行高1.9；故事正文16px、手机14px，行高1.85/1.9。

**The Object First Rule.** 标题和短句帮助陪玩者理解，孩子无需读懂文字才能选择建筑、抓取物体或进入故事活动。

## Layout

主内容最大宽度1280px，桌面内边距36px。页首导航88px高，三个主要目的地居中，声音与家长入口独立放置。700px及以下使用78px导航和18px页面内边距；360px以下页面边距12px。

桌面首页是一张3:2连通小镇，六个建筑的可点击范围与路牌对应。手机使用纵向街区，大图与图标路牌成组。地点活动网格桌面三列，中等宽度与手机两列；故事书架桌面三列、手机单列。

玩法保留专用横屏布局。手机停车车/车位扩大，桥板只增加厚度；河宽与桥板长度保持不变。镜头拟合实际操作对象和目标，不用空地挤小学习主体。横竖屏切换保留已放置位置与活动阶段。

## Elevation & Depth

页面容器使用带偏移的柔和阴影。通用小镇阴影为 `0 8px 24px #42583913`；图标工具为 `0 3px 10px #354e3810`。建筑图的阴影在素材中，实时玩法延续轻量渲染，软件GPU不新增实时阴影贴图或持续装饰动画。

按下工具向下移动2px并收起阴影。入口悬停轻微上移；减少动画偏好取消装饰动效。焦点使用3px暖棕轮廓与5px偏移。

## Shapes

场景、故事和作品使用圆润轮廓。桌面小镇外框38px；活动卡25px；玩法画面30px，手机23px；普通动作工具18px，手机15px。边线保持浅色1px。

车轮、桥板、固定形状道路和车位由实际教学模型定义，不能为了圆角一致而改变形状或长度关系。

## Components

### Navigation

物件图标与短名称组合。活动目的地用淡绿面层与细边框标记，手机保留图标及名称。声音和家长按钮至少44px，家长门禁保留。

### Destination Signs

图标、地点名、动作词与方向箭头构成路牌。桌面路牌压在对应建筑旁；手机路牌位于地点图下方。风景加载失败仍保留可操作的地点链接和重试。

### Activity Invitations

26个封面来自真实规则引擎的渲染，不用生成图推测操作几何。C03、A01、A02捕获实际摆放和推车画轮印后的状态，动作来源可追溯。封面与短动作句共同表达玩法。

### Play Tools

返回、视图、示范、重听、重玩共用圆角工具。示范可以关闭，不能自动完成。失败保留局部回弹和重试；普通完成邀请不替换原故事下一幕。

### Parent Information

目标按地点分组，逐项展开。内容阶段、操作辅助、参与次数和备份保持各自用途；开放活动明确记参与，不显示掌握评估。

## Do's and Don'ts

- **Do** 保持教学目标、操作对象、命中范围、示范和反馈共同校对。
- **Do** 复用登记车型与来源记录，保留同车图片回退和保存重试。
- **Do** 分别记录浏览器模拟、真机体验、声音听审和教学效果证据。
- **Don't** 用装饰图片的车位或道路替代实际规则引擎中的对象。
- **Don't** 给开放表达与创作自动标注能力、得分或知识掌握。
- **Don't** 让换视图、镜头调整或切屏重置孩子进行中的活动。
