# 汽车小镇素材与教学依赖

正式文件、尺寸和SHA-256由`content/r3.json`登记；此表用于审阅用途和教学边界。生成图完整提示词、源图哈希及裁切坐标在`content/town-art-production.json`；实际玩法截图及操作记录在`content/town-cover-renders.json`。

|素材组|文件/数量|视角与用途|教学依赖与边界|
|---|---|---|---|
|完整小镇|`media/town/town.webp`，1536×1024|固定斜俯视、左上日光；桌面建筑入口|六地点可点击范围与建筑对应，不作为操作坐标或计数对象。|
|六地点|`showroom/parking/workshop/wash/park/studio.webp`，各720×440|同一源图裁切，手机街区和地点横幅|场景插画不参与拖放、桥长、数量或颜色判断。|
|活动动作封面|26张`activity-<ID>.webp`，各720×490|取自默认 2D 插画的实玩画面；M01、T02、T04、C03、A01、A02 含真实指针操作|保留实际车/空位、桥板、路块和工具；布景、海报、轮印彼此可辨。|
|展厅和车库|`display-room、garage-home、creation-desk、guide-notebook、vehicle-bay.webp`|生成的木质展台、车库入口、创作桌、陪玩手册与车位底图|真实车型仍由登记模型或其渲染图展示；底图只作布景。|
|故事封面|3张`story-ST0<1..3>.webp`，各768×512|各故事首幕事件构图|保留3故事，封面不是完成记录。|
|12幕故事|`story-ST0<1..3>-<0..3>.webp`，各768×512|独立事件构图，4幕/故事|保留全部活动关联；雨天第二幕明确转为天晴。图中道具不代替实际活动目标。|
|导航、工具、状态和道具|89 张`media/play-icons/*.webp`|透明纸艺和木质图标，登记在`content/play-icons-production.json`|页面、Canvas 和立体图标贴片共用素材，结果记录和教学目标由规则判断。|
|立体场景表面|9 张`media/town-materials/*.webp`|纸面、木纹、水纹、草坪、道路、砂面、薄荷绿涂层、石面和珊瑚色涂层|材质覆盖现有网格。静态表面、可拖桥板和试验路面的交互由原规则处理。|
|登记车型|原106款模型、车型预览和轮位信息|原登记来源和身份表不变|模型/预览/部件命中共同保留；准确颜色平面降级继续使用。|
|中文字体|`town-sans-regular.woff`、`town-sans-bold.woff`|Noto Sans CJK SC子集，自托管；OFL许可见`docs/licenses/town-font-OFL.txt`|与其他媒体共用版本前缀和哈希，失败回退设备字体。|

## 26张封面

|活动|文件|来源|
|---|---|---|
|E01|`media/town/activity-E01.webp`|实际 2D 插画场景初始状态|
|E02|`media/town/activity-E02.webp`|实际 2D 插画场景初始状态|
|E03|`media/town/activity-E03.webp`|实际 2D 插画场景初始状态|
|M01|`media/town/activity-M01.webp`|真实指针操作后的 2D 插画画面|
|M02|`media/town/activity-M02.webp`|实际 2D 插画场景初始状态|
|M03|`media/town/activity-M03.webp`|实际 2D 插画场景初始状态|
|M04|`media/town/activity-M04.webp`|实际 2D 插画场景初始状态|
|C01|`media/town/activity-C01.webp`|实际 2D 插画场景初始状态|
|C02|`media/town/activity-C02.webp`|实际 2D 插画场景初始状态|
|C03|`media/town/activity-C03.webp`|真实指针操作后的 2D 插画画面|
|S01|`media/town/activity-S01.webp`|实际 2D 插画场景初始状态|
|S02|`media/town/activity-S02.webp`|实际 2D 插画场景初始状态|
|S03|`media/town/activity-S03.webp`|实际 2D 插画场景初始状态|
|T01|`media/town/activity-T01.webp`|实际 2D 插画场景初始状态|
|T02|`media/town/activity-T02.webp`|真实指针操作后的 2D 插画画面|
|T03|`media/town/activity-T03.webp`|实际 2D 插画场景初始状态|
|H01|`media/town/activity-H01.webp`|实际 2D 插画场景初始状态|
|H02|`media/town/activity-H02.webp`|实际 2D 插画场景初始状态|
|H03|`media/town/activity-H03.webp`|实际 2D 插画场景初始状态|
|A01|`media/town/activity-A01.webp`|真实指针操作后的 2D 插画画面|
|A02|`media/town/activity-A02.webp`|真实指针操作后的 2D 插画画面|
|L01|`media/town/activity-L01.webp`|实际 2D 插画场景初始状态|
|L02|`media/town/activity-L02.webp`|实际 2D 插画场景初始状态|
|L03|`media/town/activity-L03.webp`|实际 2D 插画场景初始状态|
|P01|`media/town/activity-P01.webp`|实际 2D 插画场景初始状态|
|T04|`media/town/activity-T04.webp`|真实指针操作后的 2D 插画画面|

所有新增图片均是场景/邀请图。教学规则仍由同一套原规则引擎判断，家长记录不自动推断知识掌握。
