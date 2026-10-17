import fs from 'node:fs';
if((fs.existsSync('content/r3.json')||fs.existsSync('content/r2.json'))&&!process.argv.includes('--reset-initial'))throw Error('r2.json 已存在，不覆盖已编辑的内容。');
const release=JSON.parse(fs.readFileSync('content/r0.json','utf8'));
release.id='r2-local-20261017.1';release.schemaVersion=2;release.appVersion='0.2.0';
const rows=[
['E01','发现颜色','英语','showroom','closed','找找红色的车。','看看车身的颜色，也可以再听一遍。','观察颜色，理解 red / blue / white','把今天见过的颜色找给家人看。'],
['E02','汽车的身体','英语','showroom','closed','找找车轮在哪里。','看看圆圆的、能滚动的地方。','把真实部件和英语声音对应','给玩具车的车轮、车门和车灯取名字。'],
['E03','出发和停止','英语','parking','closed','绿灯出发，红灯停一停。','先看看信号灯，再选择出发或停止。','理解 go 和 stop 的动作','和家人玩一轮出发、停止的动作游戏。'],
['M01','小车回家','数学','parking','closed','给它们各找一个停车位吧。','先点一辆车，再点一个空车位。','一辆车对应一个位置','用两辆玩具车和两张纸再玩一次。'],
['M02','还缺几个车位','数学','parking','closed','小车都有位置吗？还需要几个？','先把有位置的小车配好，再数数剩下的。','观察数量与分合','拿积木当车位，试试添一个、少一个。'],
['M03','车位够不够','数学','parking','closed','看看这些车位，是多了、少了，还是刚刚好？','一辆车和一个车位配在一起看看。','比较数量，区分足够、不够和有余','把杯子和家人数配一配，看看够不够。'],
['M04','红蓝车队','数学','parking','closed','红、蓝、红、蓝，下一辆是谁？','跟着前面的颜色，一辆一辆读一读。','发现并延续重复规律','用两种颜色的积木排出自己的队伍。'],
['C01','我喜欢这辆车','中文表达','showroom','open','这辆车哪里最吸引你？说给家人听。','可以说颜色、形状，也可以说你想和它去哪里。','用自己的话描述观察与喜好','家长可以回应：你注意到了什么细节？'],
['C02','先做什么','中文表达','travel','closed','去公园前，先做什么，再做什么？','先准备好物品，再请大人确认安全带，最后出发。','理解顺序并尝试讲述过程','讲讲今天出门前，你先做了什么。'],
['C03','接着讲下去','中文表达','travel','open','小车来到一棵大树旁，接下来会发生什么？','可以想想遇见了谁、发现了什么、心情怎么样。','展开想象并连贯表达','轮流接一句，把小故事讲给家人听。'],
['S01','什么会滚','科学','workshop','open','先猜一猜：小球和方块，谁更容易滚起来？','看看它们的表面，再试一次观察结果。','先预测，再观察和比较','找一个球和一个盒子，在安全平面试一试。'],
['S02','车灯和影子','科学','workshop','open','移动小灯，看看影子跑到哪里。','把灯移到左边，再移到右边，比较影子。','改变光源位置，观察影子方向','和大人在墙上玩手影，别用强光照眼睛。'],
['S03','雨天出发','科学','travel','closed','外面下雨了，带什么能帮你挡雨？','看看能遮住雨滴、保护身体的物品。','观察天气并选择合适物品','看看窗外的天气，说说地面和天空。'],
['T01','零件帮什么忙','动手思考','workshop','closed','哪个部件能帮助小车滚动？','看看车轮、车门和车灯各在做什么。','把部件与功能建立联系','观察玩具车，试着说说每个部件帮什么忙。'],
['T02','给小车搭桥','动手思考','workshop','closed','选一块桥板，让小车安全到对岸。','桥板要能搭在两边，先比较它和河的宽度。','比较长度、尝试并调整方案','和大人用积木搭桥，只让玩具车通过。'],
['T03','把路连起来','动手思考','parking','closed','转转道路，让小车从出发点到公园。','每一段路的开口都要对上，别让路断开。','规划路径并检查连接','用纸条在桌上连一条路。'],
['H01','去看看','社会与人文','travel','open','选一个地方，带小车去看看。','公园、图书馆、博物馆，各有什么发现？','认识场所和不同的公共体验','下一次出门，观察一个你感兴趣的地方。'],
['H02','谁能帮忙','社会与人文','workshop','closed','小车的轮胎需要检查，可以请谁帮忙？','看看每个人的工具和工作。','认识职业与合作','和家人说说，今天是谁帮助了我们。'],
['H03','大家轮流','社会与人文','parking','closed','洗车的位置只有一个，大家轮流来。','一辆车进去，另一辆先等一等，洗好再交换。','理解轮流、等待和公平使用','和家人轮流用一个玩具，试着说轮到你啦。'],
['A01','车展海报','艺术创作','showroom','open','给喜欢的小车做一张海报吧。','选背景、放贴纸，再把作品放进车库。','自由构图、配色与表达','向家人介绍你设计的海报。'],
['A02','轮印花纹','艺术创作','showroom','open','选一个轮印，在画纸上留下你的花纹。','换换颜色，也可以试着重复同一种图案。','探索图案、重复与视觉表达','用可清洗材料和玩具车，在大人陪伴下印一印。'],
['L01','出发准备','生活习惯','travel','closed','要出门去公园啦，一起来准备。','看看天气，带好物品，再请大人检查安全带。','根据情境做准备并关注乘车安全','出门前和家人一起检查自己的小背包。'],
['L02','请你帮帮我','生活习惯','parking','open','遇到一点困难，怎么把需要告诉别人？','可以说请帮帮我，也可以说我想休息一下。','识别感受，尝试表达需要与求助','告诉家人你希望得到怎样的帮助。'],
['L03','整理车库','生活习惯','parking','closed','白色的小车回白色车库，蓝色的小车回蓝色车库。','先点一辆小车，再点同颜色的车库。','按同一特征分类并整理物品','选一种方法，把玩具车整理回家。'],
];
const old=new Map(release.activities.map(a=>[a.id,a]));
release.activities=rows.map(([id,title,domain,scene,mode,instruction,hint,goal,extension])=>({id,title,version:2,domain,scene,mode,subtitle:`${domain} · ${goal}`,instruction,hint,goal,extension,instructionAudio:old.get(id)?.instructionAudio||`activity-${id}`,hintAudio:old.get(id)?.hintAudio||`hint-${id}`,completeAudio:old.get(id)?.completeAudio||'discovery-done',carIds:['C01','C03','H01','A01'].includes(id)?['CAR01','CAR02','CAR03','CAR04','CAR05','CAR06','CAR07','CAR08']:['CAR01']}));
release.scenes=[{id:'showroom',name:'汽车展厅',subtitle:'看细节，说想法，画出喜欢的小车',icon:'car',color:'sage'},{id:'parking',name:'停车小镇',subtitle:'数一数，排排队，把路连起来',icon:'parking',color:'peach'},{id:'workshop',name:'发现工坊',subtitle:'试一试，搭座桥，看看为什么',icon:'tools',color:'lilac'},{id:'travel',name:'小小旅行',subtitle:'讲故事，看看天气，一起准备出发',icon:'sun',color:'sky'}];
const cars=[['CAR01','兰博基尼','Lamborghini','Revuelto','标准硬顶版','白色','https://www.lamborghini.com/en-en/models/revuelto-models/revuelto'],['CAR02','法拉利','Ferrari','296 GTB','标准 GTB 硬顶版','红色','https://www.ferrari.com/en-EN/auto/296-gtb'],['CAR03','保时捷','Porsche','911 GT3 RS','992 I 代 GT3 RS','实拍配色','https://newsroom.porsche.com/en_US/model-range/911/911-GT3-RS.html'],['CAR04','迈凯伦','McLaren','750S','标准 Coupé 硬顶版','实拍配色','https://www.mclaren.com/cars/gl_en/750s-cars'],['CAR05','布加迪','Bugatti','Chiron','标准 Chiron','实拍配色','https://newsroom.bugatti.com/en/models/chiron'],['CAR06','帕加尼','Pagani','Huayra','标准 Coupé 硬顶版','实拍配色','https://www.pagani.com/huayra/'],['CAR07','科尼赛克','Koenigsegg','Jesko Attack','Attack 尾翼版本','实拍配色','https://www.koenigsegg.com/model/jesko-attack'],['CAR08','阿斯顿·马丁','Aston Martin','Vantage','2024 更新款标准硬顶版','绿色','https://www.astonmartin.com/en-gb/our-world/news/2024/2/12/introducing-new-vantage-engineered-for-real-drivers']];
release.cars=cars.map(([id,zhBrand,brand,model,edition,color,reference])=>({id,name:`${zhBrand} ${model}`,zhBrand,brand,model,edition,color,reference,status:'reviewed',image:id==='CAR01'?'img-white':`photo-${id}`,audio:`name-${id}`,observation:id==='CAR01'?'仔细看看车灯和进气口的线条。':'看看车身的轮廓，说说你最先注意到了哪里。'}));
const stories=[['ST01','第一次车展','showroom',[['展厅开门啦','小车第一次来到展厅，明亮的车灯和圆圆的车轮都想和你打招呼。','E02'],['给朋友留个位置','朋友们也来了。每一辆车都想找到自己的位置，一起来帮帮它们。','M01'],['我最喜欢的地方','你发现了车身上的哪个小细节？用自己的话介绍一下吧。','C01'],['把发现画下来','我们把喜欢的小车放进海报里，让今天的小发现留下来。','A01']]],['ST02','雨天去公园','travel',[['窗外下起雨','原本想去公园，窗外却下起了雨。看看天气，想想带什么能挡雨。','S03'],['一起做准备','小车并不着急。带好要用的物品，再请大人检查安全带，就可以安心出发。','L01'],['选择一条好走的路','路口有几段路还没接上。我们一起转一转，让去公园的路连起来。','T03'],['雨后的新故事','雨停了，小车停在一棵树旁。树叶上挂着小水珠。接下来会发生什么呢？','C03']]],['ST03','整理小车库','parking',[['车位够不够','小车们玩了一天，要回车库休息。先看看车位够不够，别让朋友没有位置。','M03'],['大家慢慢来','洗车的位置只有一个。小车们决定轮流用，洗好了再请下一位。','H03'],['把需要说出来','有一辆小车遇到了困难。它可以说请帮帮我，也可以先休息一会儿。','L02'],['每辆车都回家','最后按车身颜色把小车整理好。大家都有自己的家，下次再一起出发。','L03']]]];
release.stories=stories.map(([id,title,scene,frames])=>({id,title,version:1,scene,frames:frames.map(([title,text,activityId],index)=>({title,text,activityId,audio:`story-${id}-${index}`}))}));
function speech(id,text,locale='zh-CN'){release.speech[id]={text,locale};}
speech('discovery-done','又有一个小发现！想再试试，还是去别处看看？');speech('expression-done','谢谢你分享。每个人的想法都可以不一样。');speech('try-again','再观察一下，也可以点需要帮忙。');
for(const a of release.activities){if(!old.has(a.id)){speech(a.instructionAudio,a.instruction);speech(a.hintAudio,a.hint);}}
for(const c of release.cars)speech(c.audio,c.name);
for(const story of release.stories)for(const frame of story.frames)speech(frame.audio,frame.text);
for(const [id,text]of Object.entries({car:'Car',window:'Window',mirror:'Mirror',roof:'Roof',yellow:'Yellow',green:'Green',black:'Black',four:'Four',five:'Five',stop:'Stop',go:'Go',open:'Open',close:'Close',big:'Big',small:'Small',fast:'Fast',slow:'Slow',sun:'Sun',rain:'Rain',tree:'Tree',water:'Water',leaf:'Leaf'}))speech(id,text,'en-US');
for(const [id,text]of Object.entries({'help-please':'请你帮帮我。','help-look':'我想先看看你怎么做。','help-rest':'我想休息一下。','parts-function-light':'哪个部件可以照亮前方？','parts-function-door':'哪个部件可以打开，让人上下车？'}))speech(id,text);
release.vocabulary=[['car','汽车','C01'],['wheel','车轮','E02'],['door','车门','E02'],['light','车灯','E02'],['window','车窗','C01'],['mirror','后视镜','C01'],['roof','车顶','C01'],['red','红色','E01'],['blue','蓝色','E01'],['white','白色','E01'],['yellow','黄色','A02'],['green','绿色','A02'],['black','黑色','A02'],['one','一','M01'],['two','二','M01'],['three','三','M02'],['four','四','M02'],['five','五','M02'],['go','出发','E03'],['stop','停止','E03'],['open','打开','T01'],['close','关闭','T01'],['big','大的','M03'],['small','小的','M03'],['fast','快','S01'],['slow','慢','S01'],['sun','太阳','S03'],['rain','雨','S03'],['tree','树','H01'],['water','水','L01'],['leaf','树叶','H01']].map(([id,zh,activityId])=>({id,zh,audio:id,activityId}));
fs.writeFileSync('content/r2.json',JSON.stringify(release,null,2)+'\n');
console.log('8 cars / 4 scenes / 24 activities / 3 stories; speech:',Object.keys(release.speech).length);
