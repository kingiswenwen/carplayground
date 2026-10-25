import type {ActivityId} from './content';

export type PlayFeedback={text:string;sounds:string[];symbol:string;preferClips?:boolean};
type Recipe={symbol:string;texts:string[];sounds:string[][]};
const recipe=(symbol:string,texts:string[],sounds:string[][]):Recipe=>({symbol,texts,sounds});
/** Describe the child's action or invite a new experiment; never infer mastery. */
export const playFeedback:Record<ActivityId,Recipe>={
 E01:recipe('red',['三种颜色都找到朋友了。','红、蓝、白，小车各自回家啦。','换个顺序，还能找到颜色朋友吗？'],[['color-success'],['red','blue','white'],['color-success','phrase-red']]),
 E02:recipe('wheel',['车轮、车灯、车门，都被你发现了。','小车身上藏着这么多有趣的部件。','再挑一个部件，和家人说说它做什么。'],[['wheel','light','door'],['zh-wheel','zh-light','zh-door'],['phrase-wheel','phrase-open']]),
 E03:recipe('stop',['绿灯出发，红灯停住了。','小车看着信号灯安全出发啦。','再试一次，看看什么时候该停下来。'],[['phrase-stop'],['go','stop'],['phrase-go','phrase-stop']]),
 M01:recipe('garage',['两辆小车都有自己的停车位了。','小车停稳啦，车库整整齐齐。','换个空车位，小车也能停进去。'],[['parking-success'],['one','two','phrase-park'],['phrase-park']]),
 M02:recipe('garage',['补上车位，大家都能停下了。','一辆车配一个位置，刚刚好。','再数数，车和车位一样多吗？'],[['parking-success'],['one','two','three'],['phrase-park']]),
 M03:recipe('garage',['小车都停好了，还留着一个空位。','看看哪一个车位还在等朋友。','车位比小车多，空位可以留给新朋友。'],[['parking-success'],['one','two','three'],['parking-task']]),
 M04:recipe('blue',['红、蓝、红、蓝，队伍接起来了。','小车跟着颜色的顺序排好了。','指着队伍，和家人读一读颜色吧。'],[['red','blue','red','blue'],['hint-M04'],['activity-M04']]),
 C01:recipe('car',['这辆车有了你自己的介绍。','你挑的细节，就是今天的小发现。','换一个地方，给小车想个新故事吧。'],[['phrase-look'],['hint-C01'],['car','phrase-look']]),
 C02:recipe('bag',['背包、安全带、出发，准备齐啦。','先准备，再检查，小车可以出发了。','和家人再说一遍出发前的顺序吧。'],[['sequence-go'],['sequence-pack','sequence-belt','sequence-go'],['phrase-go']]),
 C03:recipe('book',['你的小车故事已经开始了。','换个朋友来，故事还会怎样呢？','把接下来的故事说给家人听吧。'],[['hint-C03'],['tree','car'],['activity-C03']]),
 S01:recipe('ball',['同样推一下，它们停在了不同的地方。','小球和方块，滚动的样子不一样。','换个推力，再看看谁移动得更远。'],[['hint-S01'],['fast','slow'],['activity-S01']]),
 S02:recipe('lamp',['灯换了位置，影子也跟着变啦。','影子跑到了灯光的另一边。','把灯再移一移，看看影子怎样变化。'],[['light'],['hint-S02'],['activity-S02']]),
 S03:recipe('umbrella',['雨伞和雨衣都放进背包啦。','下雨的准备做好了。','看看这些物品，哪一个能帮你挡雨？'],[['rain','hint-S03'],['hint-S03'],['rain','water']]),
 T01:recipe('wheel',['三个部件各有自己的用处。','能滚动、能照亮、能打开，各不相同。','和家人再找一个有趣的小部件吧。'],[['zh-wheel','zh-light','zh-door'],['wheel','light','door'],['phrase-wheel']]),
 T02:recipe('bridge',['桥板搭到两岸，小车开过去啦。','够长的桥板把两边连起来了。','再比一比，短桥板为什么够不到呢？'],[['phrase-go'],['hint-T02'],['activity-T02']]),
 T03:recipe('road',['路口都接上了，小车到了公园。','直路和弯路连成了一条路。','换一段路，再看看开口怎样对齐。'],[['phrase-go','tree'],['hint-T03'],['activity-T03']]),
 H01:recipe('tree',['小车到了你选的地方。','新地方里，还有什么想看看？','换个目的地，又会遇见什么呢？'],[['phrase-look'],['car','tree'],['hint-H01']]),
 H02:recipe('tool',['你为小车找到了能帮忙的朋友。','朋友的工具，正好能帮上忙。','下次遇到困难，也可以请朋友帮忙。'],[['help-please'],['hint-H02'],['help-look']]),
 H03:recipe('bubbles',['两辆小车都洗干净啦。','先洗一辆，再请下一辆，大家都轮到了。','干净的小车，可以再去玩啦。'],[['water'],['hint-H03'],['water','phrase-go']]),
 A01:recipe('palette',['小车和你挑的图案在一起啦。','今天的海报，留下了你自己的选择。','换一种颜色，还会是什么样子？'],[['hint-A01'],['leaf','sun'],['activity-A01']]),
 A02:recipe('pencil',['轮印画出了一条属于你的小路。','小车走过的地方，留下了花纹。','换个颜色，再接着画一段吧。'],[['hint-A02'],['car','phrase-look'],['activity-A02']]),
 L01:recipe('bag',['物品带好了，安全带也检查好啦。','出发前的准备，一件件做好了。','和家人一起出发吧。'],[['sequence-go'],['sequence-belt','sequence-go'],['phrase-go']]),
 L02:recipe('friend',['你把需要告诉朋友了。','不会的时候，可以请人做给你看。','想休息一下，也可以告诉家人。'],[['help-please'],['help-look'],['help-rest']]),
 L03:recipe('garage',['同颜色的小车找到自己的家了。','小车们都回到了颜色一样的车库。','再指一指，每辆小车是什么颜色？'],[['parking-success'],['red','blue','white'],['phrase-park']]),
 P01:recipe('arrow',['同样推一下，两条路上的小车停得不一样远。','看看粗糙路面上的车在哪里停下了。','再换个推力，两辆小车又会怎样呢？'],[['physics-why-surface'],['physics-invite-surface'],['physics-invite-push']]),
 T04:recipe('wheel',['车身和两个车轮都装好，小车开起来啦。','零件找到了自己的轮廓。','你拼的小车，可以去下一站啦。'],[['phrase-go'],['assembly-body','wheel'],['car','phrase-go']]),
};
const visits=new Map<ActivityId,number>();
export function completionFeedback(id:ActivityId,visit:number):PlayFeedback{
 const r=playFeedback[id],index=Math.abs(visit)%r.texts.length;
 return {text:r.texts[index],sounds:r.sounds[index%r.sounds.length].slice(),symbol:r.symbol};
}
export function nextCompletionFeedback(id:ActivityId){const visit=visits.get(id)||0;visits.set(id,visit+1);return completionFeedback(id,visit);}
