import { assetUrl, getCar, type ActivityId } from '../domain/content';
import { clamp, coast, distance, flickVelocity, inside, type Point, type Rect } from '../domain/direct-play';
import { roadConnected, roadShapes } from '../domain/learning';

type Item = Rect & { id: string; kind: 'car'|'body'|'wheel'|'prop'|'plank'|'road'|'bay'|'shape'; glyph?: string; color?: string; carId?: string; home: Point; placed?: boolean; target?: string; turn?: number; dock?: string };
type Target = Rect & { id: string; glyph?: string; color?: string; accepts?: string[]; occupied?: boolean; enabled?: boolean };
type Grab = { id: number; item?: Item; start: Point; offset: Point; samples: (Point & {t:number})[]; origin?: Point; washing?: boolean; dock?:string; wasPlaced?:boolean };
export type BoardSnapshot = { ready: boolean; progress: number; completed: boolean; moving: boolean; items: {id:string;x:number;y:number;placed:boolean}[]; targets: Target[] };
export type BoardOptions = { id: ActivityId; carId: string; portrait: boolean; finish: (summary:string)=>void; feedback:(message:string)=>void; changed:(state:BoardSnapshot)=>void; paint?:(points:Point[])=>void };
const SKY='#d9f1f6', GRASS='#d9e9bc', ASPHALT='#718388', CREAM='#fff9e9';
const carForColor = { red:'CAR02',blue:'CAR11',white:'CAR15' };

export class TouchBoard {
  readonly width = 1000;
  height: number;
  items: Item[] = [];
  targets: Target[] = [];
  private ctx: CanvasRenderingContext2D;
  private images = new Map<string, HTMLImageElement>();
  private grab: Grab | null = null;
  private mask: HTMLCanvasElement | null = null;
  private dirtyOriginal = 0;
  private alpha: Uint8ClampedArray | null = null;
  private velocity = 0;
  private rolling = 0;
  private touched = false;
  private complete = false;
  private progress = 0;
  private ready = false;
  private destroyed = false;
  private notifyAt = 0;
  private time = 0;
  private rough = false;
  private seen = new Set<string>();
  private road = ['RD','UD','UD','UD','UD','UD','UD','UD','LU'];
  private wheelPoints: {x:number;y:number;r:number}[] = [];
  private body: HTMLCanvasElement | null = null;
  private mode: string;
  private paintPoints: Point[]=[];
  private washedTool = 'water';
  private movingItem = 'runner';
  private roadJourney: Point[]=[];
  private roadStep=0;
  private assemblyTravel=0;
  private lastDirtCheck=0;
  tilt = 0;
  constructor(private canvas: HTMLCanvasElement, private options: BoardOptions) {
    this.height=options.portrait?1200:680;
    canvas.width=this.width; canvas.height=this.height;
    this.ctx=canvas.getContext('2d')!;
    const modes:Record<string,string>={H03:'wash',P01:'motion',E03:'motion',T04:'assembly',M01:'parking',M02:'spaces',M03:'spaces',E01:'color',E02:'parts',T01:'parts',M04:'pattern',C02:'sequence',S01:'rolling',S02:'shadow',S03:'packing',L01:'packing',T02:'bridge',T03:'road',H01:'visit',H02:'helpers',L03:'sorting',C01:'story',C03:'story',L02:'story',A01:'paint',A02:'paint'};
    this.mode=modes[options.id]; this.setup();
  }
  async load() {
    const ids=[...new Set([this.options.carId,'CAR02','CAR11','CAR15'])];
    await Promise.all(ids.flatMap(id=>['side','top'].map(async view=>{
      const car=getCar(id); const imageId=car?.game?.[view as 'side'|'top'];
      if(!imageId) throw Error(`缺少游戏车图 ${id}/${view}`);
      const image=new Image(); image.src=assetUrl(imageId); await image.decode();
      if(!this.destroyed)this.images.set(`${id}/${view}`,image);
    })));
    if(this.destroyed)return;
    this.ready=true;
    if(this.mode==='wash')this.createDirt();
    if(this.mode==='assembly')this.createBody();
    this.notify(); this.draw(0);
  }
  dispose(){this.destroyed=true;this.cancel();this.images.clear();}
  resize(portrait:boolean){
    const next=portrait?1200:680;if(next===this.height)return;
    const ratio=next/this.height;
    this.cancel();
    for(const item of this.items){item.y*=ratio;item.home.y*=ratio;}
    for(const target of this.targets)target.y*=ratio;
    this.height=next;this.canvas.height=next;this.notify();
  }
  private item(id:string,kind:Item['kind'],x:number,y:number,w:number,h:number,extra:Partial<Item>={}) {
    const item:Item={id,kind,x,y,w,h,home:{x,y},...extra}; this.items.push(item); return item;
  }
  private target(id:string,x:number,y:number,w:number,h:number,extra:Partial<Target>={}){
    const target:Target={id,x,y,w,h,...extra};this.targets.push(target);return target;
  }
  private setup(){
    const H=this.height, carId=this.options.carId;
    if(['motion','rolling'].includes(this.mode)){
      this.item('runner',this.mode==='rolling'?'shape':'car',220,H*.5,280,126,{carId,glyph:'●',color:'#eb8256'});
      this.item('surface','prop',840,H*.83,120,100,{glyph:'🪵'});
      if(this.mode==='rolling')this.item('cube','shape',760,H*.5,110,110,{glyph:'■',color:'#5d94bb'});
    }else if(this.mode==='wash'){
      this.item('water','prop',350,H*.84,125,110,{glyph:'🚿'});
      this.item('sponge','prop',650,H*.84,125,110,{glyph:'🧽'});
    }else if(this.mode==='assembly'){
      const game=getCar(carId)?.game;
      this.wheelPoints=game?.wheels||[{x:.23,y:.63,r:.095},{x:.78,y:.63,r:.095}];
      const body=this.carRect();this.target('body',body.x,body.y,body.w,body.h);
      this.item('body','body',500,H*.7,480,216,{target:'body'});
      this.wheelPoints.forEach((wheel,i)=>{
        const rect=this.carRect();this.target(`wheel-${i}`,rect.x-rect.w/2+wheel.x*rect.w,rect.y-rect.h/2+wheel.y*rect.h,wheel.r*rect.w*2,wheel.r*rect.w*2);
        this.item(`wheel-${i}`,'wheel',310+i*380,H*.83,155,155,{target:`wheel-${i}`});
      });
    }else if(['parking','spaces','sorting'].includes(this.mode)){
      const count=this.mode==='parking'?2:3;
      for(let i=0;i<count;i++){
        const x=count===2?280+i*440:180+i*320;
        this.item(`car-${i}`,'car',x,H*.22,count===2?280:250,115,{carId:i===0?carId:i===1?'CAR11':'CAR15',color:['#d65b44','#4e9cce','#faf8e9'][i]});
        this.target(`bay-${i}`,x,H*.65,count===2?310:270,150,{color:this.mode==='sorting'?['#d65b44','#4e9cce','#faf8e9'][i]:undefined,accepts:this.mode==='sorting'?[`car-${i}`]:undefined});
      }
      if(this.mode==='spaces'){
        this.targets[2].enabled=false;
        this.item('extra-bay','bay',820,H*.88,190,95,{target:'bay-2'});
      }
    }else if(this.mode==='color'){
      this.target('color-home',500,H*.35,350,230,{color:'#cf5648',accepts:['red']});
      (['red','blue','white']as const).forEach((color,i)=>this.item(color,'car',190+i*310,H*.77,270,130,{carId:carForColor[color],color}));
    }else if(this.mode==='pattern'){
      for(let i=0;i<6;i++){
        const x=180+(i%3)*320,y=H*(i<3?.27:.52);
        if(i<4)this.item(`pattern-${i}`,'car',x,y,240,110,{carId:i%2?'CAR11':'CAR02',placed:true});
        else this.target(`pattern-${i}`,x,y,250,130,{accepts:[i%2?'blue':'red']});
      }
      this.item('red','car',300,H*.83,260,120,{carId:'CAR02'});this.item('blue','car',700,H*.83,260,120,{carId:'CAR11'});
    }else if(this.mode==='sequence'){
      ['🎒','🛡️','🏁'].forEach((glyph,i)=>{
        this.target(`step-${i}`,180+i*320,H*.33,230,200,{accepts:[`step-${i}`],glyph:String(i+1)});
        this.item(`step-${i}`,'prop',180+((i+2)%3)*320,H*.76,200,180,{glyph});
      });
    }else if(this.mode==='shadow'){
      this.item('lamp','prop',230,H*.22,150,130,{glyph:'🔦'});this.item('shadow-car','car',500,H*.65,450,200,{carId,placed:true});
    }else if(this.mode==='packing'){
      this.target('bag',500,H*.4,450,300,{glyph:'🎒'});
      ['☂️','🧥','🧢','🥤'].forEach((glyph,i)=>this.item(`pack-${i}`,'prop',160+i*225,H*.82,150,150,{glyph,target:'bag'}));
    }else if(this.mode==='bridge'){
      this.item('traveller','car',160,H*.44,250,110,{carId,placed:true});
      this.target('bridge',500,H*.44,390,100);
      this.item('short','plank',270,H*.81,230,100,{target:'bridge'});this.item('long','plank',710,H*.81,460,100,{target:'bridge'});
    }else if(this.mode==='road'){
      this.item('road-car','car',160,H*.14,200,90,{carId,placed:true});
      for(let i=0;i<9;i++)this.item(`road-${i}`,'road',250+(i%3)*250,H*.28+Math.floor(i/3)*(H*.19),210,H*.16,{turn:i});
    }else if(this.mode==='visit'){
      ['🌳','🏠','🎪'].forEach((glyph,i)=>this.target(`place-${i}`,180+i*320,H*.26,230,180,{glyph}));
      this.item('visitor','car',500,H*.79,300,140,{carId});
    }else if(this.mode==='helpers'){
      ['🛞','💦','📦'].forEach((glyph,i)=>this.target(`help-${i}`,180+i*320,H*.32,230,190,{glyph,accepts:[`tool-${i}`]}));
      ['🔧','🧽','🛒'].forEach((glyph,i)=>this.item(`tool-${i}`,'prop',180+((i+1)%3)*320,H*.78,180,180,{glyph}));
    }else if(['story','paint'].includes(this.mode)){
      this.item('my-car','car',500,H*.54,600,270,{carId});
      ['🌳','☀️','⭐'].forEach((glyph,i)=>this.item(`stamp-${i}`,'prop',200+i*300,H*.85,135,135,{glyph}));
      if(this.options.id==='L02')this.items.filter(i=>i.kind==='prop').forEach((item,i)=>item.glyph=['🤝','💛','🫂'][i]);
    }else if(this.mode==='parts')this.item('parts-car','car',500,H*.49,900,405,{carId,placed:true});
  }
  private carRect():Rect{return{x:500,y:this.height*.4,w:900,h:405};}
  private createDirt(){
    const image=this.images.get(`${this.options.carId}/side`)!;
    const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=450;
    const c=canvas.getContext('2d',{willReadFrequently:true})!;c.drawImage(image,0,0,1000,450);
    this.alpha=c.getImageData(0,0,1000,450).data.slice();
    c.clearRect(0,0,1000,450);c.globalAlpha=.88;
    for(let i=0;i<110;i++){c.fillStyle=i%2?'#a98a59':'#725b42';c.beginPath();c.ellipse((i*137)%1000,(i*79)%450,17+i%26,10+i%17,.3,0,Math.PI*2);c.fill();}
    c.globalAlpha=1;c.globalCompositeOperation='destination-in';c.drawImage(image,0,0,1000,450);c.globalCompositeOperation='source-over';
    this.mask=canvas;this.dirtyOriginal=this.countDirt();
  }
  private countDirt(){
    if(!this.mask)return 0;const data=this.mask.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,1000,450).data;
    let count=0;for(let i=3;i<data.length;i+=64)if(data[i]>50)count++;return count;
  }
  private createBody(){
    const image=this.images.get(`${this.options.carId}/side`)!;
    const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=450;
    const c=canvas.getContext('2d')!;c.drawImage(image,0,0,1000,450);c.globalCompositeOperation='destination-out';
    this.wheelPoints.forEach(p=>{c.beginPath();c.arc(p.x*1000,p.y*450,p.r*1000,0,Math.PI*2);c.fill();});this.body=canvas;
  }
  private notify(){
    this.options.changed({ready:this.ready,progress:this.progress,completed:this.complete,moving:Math.abs(this.velocity)>1,items:this.items.map(i=>({id:i.id,x:i.x,y:i.y,placed:!!i.placed})),targets:this.targets.map(t=>({...t}))});
  }
  private finish(summary:string){if(this.complete)return;this.complete=true;this.progress=1;this.options.finish(summary);this.notify();}
  private scrub(from:Point,to:Point){
    if(!this.mask||!this.alpha)return;
    const r=this.carRect(), c=this.mask.getContext('2d')!;
    c.globalCompositeOperation='destination-out';c.lineWidth=this.washedTool==='water'?100:130;c.lineCap='round';
    const transform=(p:Point)=>({x:(p.x-r.x+r.w/2)/r.w*1000,y:(p.y-r.y+r.h/2)/r.h*450});
    const a=transform(from),b=transform(to);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();
    if(performance.now()-this.lastDirtCheck>100)this.updateDirt();
  }
  private updateDirt(){this.lastDirtCheck=performance.now();this.progress=1-this.countDirt()/Math.max(1,this.dirtyOriginal);if(this.progress>.91)this.finish('直接触控擦洗车身，清除超过九成可见污渍');this.notify();}
  down(id:number,p:Point,now:number){
    if(!this.ready||this.grab)return;
    this.touched=true;
    const item=[...this.items].reverse().find(i=>(!i.placed||['story','paint','motion','shadow','assembly','rolling','parking','spaces','sorting'].includes(this.mode))&&inside(p,i,15));
    if(this.mode==='wash'&&inside(p,this.carRect())){this.grab={id,start:p,offset:{x:0,y:0},samples:[],washing:true};this.scrub(p,p);return;}
    if(this.mode==='parts'){
      const r=this.items[0];if(!inside(p,r))return;const local={x:(p.x-r.x+r.w/2)/r.w,y:(p.y-r.y+r.h/2)/r.h};
      const part=local.x<.35||local.x>.7?'wheel':local.y<.5?'light':'door';
      this.seen.add(part);this.progress=this.seen.size/3;this.rolling=part==='wheel'?3:0;
      this.options.feedback({wheel:'wheel · 车轮转起来了',light:'light · 车灯亮起来了',door:'door · 看看车门的位置'}[part]);
      if(this.seen.size===3)this.finish('直接触摸车轮、车灯和车门，观察部件反馈');this.notify();return;
    }
    if(item?.kind==='road'){
      const index=item.turn!;
      if(index!==0&&index!==8)this.road[index]=roadShapes[(roadShapes.indexOf(this.road[index]as typeof roadShapes[number])+1)%roadShapes.length];
      if(roadConnected(this.road)){
        const queue:number[][]=[[0]],seen=new Set<number>();
        while(queue.length){const path=queue.shift()!,last=path.at(-1)!;if(last===8){this.roadJourney=path.map(index=>({x:250+index%3*250,y:this.height*.28+Math.floor(index/3)*this.height*.19}));this.roadStep=0;const car=this.items[0];car.x=this.roadJourney[0].x;car.y=this.roadJourney[0].y;break;}if(seen.has(last))continue;seen.add(last);for(const [letter,opposite,dx,dy]of [['U','D',0,-1],['R','L',1,0],['D','U',0,1],['L','R',-1,0]]as const){const x=last%3+dx,y=Math.floor(last/3)+dy,next=y*3+x;if(x>=0&&x<3&&y>=0&&y<3&&this.road[last].includes(letter)&&this.road[next].includes(opposite))queue.push([...path,next]);}}
      }return;
    }
    if(item?.id==='surface'){this.rough=!this.rough;this.notify();return;}
    if(this.mode==='wash'&&item){this.washedTool=item.id;return;}
    if(!item)return;
    const wasPlaced=!!item.placed,dock=item.dock;
    if(wasPlaced&&['assembly','parking','spaces','sorting'].includes(this.mode)){item.placed=false;const target=this.targets.find(t=>t.id===dock);if(target)target.occupied=false;}
    this.grab={id,item,start:p,offset:{x:p.x-item.x,y:p.y-item.y},origin:{x:item.x,y:item.y},samples:[{x:item.x,y:item.y,t:now}],wasPlaced,dock};
    if(['motion','rolling'].includes(this.mode))this.velocity=0;
  }
  move(id:number,p:Point,now:number){
    const grab=this.grab;if(!grab||grab.id!==id)return;
    if(grab.washing){this.scrub(grab.start,p);grab.start=p;return;}
    const item=grab.item;if(!item)return;
    item.x=clamp(p.x-grab.offset.x,item.w/2,1000-item.w/2);item.y=clamp(p.y-grab.offset.y,item.h/2,this.height-item.h/2);
    if(this.mode==='motion')item.y=this.height*.5;
    grab.samples.push({x:item.x,y:item.y,t:now});grab.samples=grab.samples.filter(s=>now-s.t<180);
    if(this.mode==='shadow'){this.seen.add(item.x<400?'left':item.x>600?'right':'middle');if(this.seen.has('left')&&this.seen.has('right'))this.finish('直接移动光源，观察两侧的影子变化');}
    if(this.mode==='paint'&&this.options.id==='A02'){
      const last=this.paintPoints.at(-1);if(!last||distance(last,item)>15){this.paintPoints.push({x:item.x/1000,y:item.y/this.height});if(this.paintPoints.length>95)this.paintPoints.shift();this.options.paint?.(this.paintPoints);}
    }
    this.notify();
  }
  up(id:number,_p:Point,now:number){
    const grab=this.grab;if(!grab||grab.id!==id)return;
    this.grab=null; if(grab.washing){this.updateDirt();return;}
    const item=grab.item;if(!item)return;
    if(['motion','rolling'].includes(this.mode)){
      const v=flickVelocity(grab.samples,now);this.movingItem=item.id;this.velocity=item.id==='cube'?v.x*.28:v.x;this.seen.add('pushed');this.options.feedback('手指推得越快，小车出发越快；按住车可以停下。');this.notify();return;
    }
    if(['shadow','story','paint'].includes(this.mode)){
      if(item.kind==='prop'&&['story','paint'].includes(this.mode)&&item.y<this.height*.73){this.seen.add(item.id);this.progress=this.seen.size/3;if(this.mode==='paint')this.options.paint?.(this.items.filter(i=>i.kind==='prop'&&i.y<this.height*.73).map(i=>({x:i.x/1000,y:i.y/this.height})));if(this.seen.size>=2)this.finish('直接摆放场景物件与爱车，自由创作和讲述');}
      if(this.mode==='paint'&&this.options.id==='A02'&&this.paintPoints.length>3)this.finish('推着小车画出轮印，作品自动保存在本机');
      return;
    }
    const target=this.targets.find(t=>!t.occupied&&(t.enabled!==false||item.kind==='bay')&&inside(item,t,20)&&(!t.accepts||t.accepts.includes(item.id))&&(!item.target||item.target===t.id));
    if(this.mode==='bridge'){
      if(target&&item.w>=target.w){item.x=target.x;item.y=target.y;item.placed=true;target.occupied=true;this.movingItem='traveller';this.velocity=540;this.seen.add('bridge');}
      else{item.x=item.home.x;item.y=item.home.y;this.options.feedback('桥板两头要搭在岸上，再换一块试试。');}return;
    }
    if(target){
      if(item.kind==='bay'){target.enabled=true;item.placed=true;item.x=target.x;item.y=target.y;this.notify();return;}
      item.x=target.x;item.y=target.y;target.occupied=true;item.dock=target.id;
      if(item.kind==='body'){item.w=target.w;item.h=target.h;}
      if(this.mode==='packing'){item.x=target.x-100+(this.seen.size%3)*100;item.y=target.y+30;target.occupied=false;this.seen.add(item.id);}
      item.placed=true;this.progress=this.items.filter(i=>i.placed&&i.kind!=='bay').length/Math.max(1,this.targets.length);
      if(this.mode==='pattern'){
        const index=target.id.slice(-1);this.item(`filled-${index}`,'car',target.x,target.y,240,110,{carId:item.carId,placed:true});item.x=item.home.x;item.y=item.home.y;item.placed=false;
      }
      const all=this.mode==='visit'?true:this.mode==='packing'?this.seen.has('pack-0')&&this.seen.has('pack-1'):['parking','spaces','sorting'].includes(this.mode)?this.items.filter(i=>i.kind==='car').every(i=>i.placed):this.targets.every(t=>t.occupied);
      if(all)this.finish(`直接操作完成 ${this.options.id}：物体实际到达目标位置`);
    }else{item.x=grab.origin?.x||item.home.x;item.y=grab.origin?.y||item.home.y;if(grab.wasPlaced&&grab.dock){item.placed=true;const previous=this.targets.find(t=>t.id===grab.dock);if(previous)previous.occupied=true;}}
    this.notify();
  }
  cancel(pointerId?:number){
    const grab=this.grab;
    if(!grab||(pointerId!==undefined&&pointerId!==grab.id))return;
    if(grab.item&&grab.origin){grab.item.x=grab.origin.x;grab.item.y=grab.origin.y;if(grab.wasPlaced&&grab.dock){grab.item.placed=true;const target=this.targets.find(t=>t.id===grab.dock);if(target)target.occupied=true;}}
    this.grab=null;this.velocity=0;this.notify();
  }
  keyboard(key:string){
    const item=this.items.find(i=>!i.placed&&i.kind!=='prop')||this.items.find(i=>!i.placed);
    if(!item)return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)){
      if(!this.grab)this.down(-1,{x:item.x,y:item.y},performance.now());
      this.move(-1,{x:item.x+(key==='ArrowLeft'?-35:key==='ArrowRight'?35:0),y:item.y+(key==='ArrowUp'?-35:key==='ArrowDown'?35:0)},performance.now());
    }else if(key==='Enter'||key===' '){
      if(this.grab)this.up(-1,{x:item.x,y:item.y},performance.now());
      else if(this.mode==='motion'){this.velocity=350;this.seen.add('pushed');}
      else this.down(-1,{x:item.x,y:item.y},performance.now());
    }else if(key==='Escape')this.cancel();
  }
  private round(r:Rect,radius=20){this.ctx.beginPath();this.ctx.roundRect(r.x-r.w/2,r.y-r.h/2,r.w,r.h,radius);}
  private glyph(glyph:string,x:number,y:number,size=85){this.ctx.font=`${size}px system-ui,sans-serif`;this.ctx.textAlign='center';this.ctx.textBaseline='middle';this.ctx.fillText(glyph,x,y);}
  private sprite(carId:string,r:Rect,top=false,opacity=1){
    const image=this.images.get(`${carId}/${top?'top':'side'}`);if(!image)return;
    this.ctx.save();this.ctx.globalAlpha=opacity;this.ctx.drawImage(image,r.x-r.w/2,r.y-r.h/2,r.w,r.h);this.ctx.restore();
  }
  private background(){
    const c=this.ctx,H=this.height;
    c.fillStyle=SKY;c.fillRect(0,0,1000,H);c.fillStyle=GRASS;c.fillRect(0,H*.32,1000,H*.68);
    if(['parking','spaces','sorting','motion','visit','rolling','road'].includes(this.mode)){
      c.fillStyle=ASPHALT;this.round({x:500,y:H*.52,w:980,h:H*.73},40);c.fill();
      c.strokeStyle='#efe9c8';c.lineWidth=5;c.setLineDash([35,25]);c.beginPath();c.moveTo(25,H*.43);c.lineTo(975,H*.43);c.stroke();c.setLineDash([]);
      if(this.rough){c.fillStyle='#b99e79';c.fillRect(0,H*.47,1000,H*.16);c.fillStyle='#84765f';for(let i=0;i<150;i++){c.beginPath();c.ellipse(i*73%1000,H*.48+(i*31%(H*.14)),5,3,0,0,Math.PI*2);c.fill();}}
    }else if(['assembly','helpers','sequence','paint','story'].includes(this.mode)){
      c.fillStyle='#eed4a4';this.round({x:500,y:H*.6,w:970,h:H*.68},35);c.fill();
    }else if(this.mode==='wash'){
      c.fillStyle='#bce4ea';c.fillRect(0,H*.16,1000,H*.56);c.fillStyle='#a5ccd2';for(let x=0;x<1000;x+=100)c.fillRect(x,H*.67,4,30);
      this.glyph('🫧',150,100,60);this.glyph('🫧',850,115,75);
    }else if(this.mode==='bridge'){
      c.fillStyle='#71b9d6';c.fillRect(305,H*.15,390,H*.48);
      c.strokeStyle='#a6def3';c.lineWidth=4;for(let y=H*.18;y<H*.6;y+=48){c.beginPath();c.moveTo(320,y);c.lineTo(675,y+15);c.stroke();}
    }
    if(this.mode==='packing')this.glyph('🌧️',820,100,110);
  }
  draw(seconds:number){
    if(this.destroyed)return;
    this.time+=seconds;const c=this.ctx,H=this.height;c.clearRect(0,0,1000,H);this.background();
    if(!this.ready){this.glyph('🛞',500,H*.45,100);return;}
    if(this.mode==='assembly'&&this.complete&&!this.grab&&this.assemblyTravel<35){const step=Math.min(35-this.assemblyTravel,seconds*45);this.assemblyTravel+=step;this.rolling+=step/65;for(const item of this.items)if(item.placed)item.x+=step;}
    if(this.velocity&&!this.grab){
      const runner=this.items.find(i=>i.id===this.movingItem);
      if(runner){const next=coast(runner.x,this.velocity,seconds,this.rough?430:160,runner.w/2,1000-runner.w/2);runner.x=next.x;this.velocity=next.velocity;this.rolling+=seconds*this.velocity*.02;
        if(Math.abs(this.velocity)<1&&this.seen.has('pushed')&&!this.complete)this.finish('直接推动车身并松手，观察滑行和逐渐停下');
        if(Math.abs(this.velocity)<1&&this.seen.has('bridge')&&!this.complete)this.finish('直接摆放桥板连接两岸，小车实际开过桥');}
    }
    if(this.roadJourney.length&&!this.grab){const runner=this.items[0],next=this.roadJourney[this.roadStep];const d=distance(runner,next),step=seconds*180;if(d<=step){runner.x=next.x;runner.y=next.y;this.roadStep++;if(this.roadStep>=this.roadJourney.length){this.roadJourney=[];this.finish('直接转动道路块接通，小车实际沿道路到达终点');}}else{runner.x+=(next.x-runner.x)/d*step;runner.y+=(next.y-runner.y)/d*step;}}
    if(this.tilt&&!this.grab&&this.mode==='motion'){
      const runner=this.items[0];runner.x=clamp(runner.x+this.tilt*seconds*9,140,860);this.seen.add('tilted');
      if(Math.abs(runner.x-runner.home.x)>180)this.finish('通过设备倾斜控制小车移动');
    }
    if(this.mode==='shadow'){
      const lamp=this.items[0];c.fillStyle='#354c3b66';c.save();c.translate(500+(500-lamp.x)*.45,H*.69);c.rotate((500-lamp.x)/1600);c.scale(1.3,.2);c.beginPath();c.ellipse(0,0,230,90,0,0,Math.PI*2);c.fill();c.restore();
      c.fillStyle='#ffe57e55';c.beginPath();c.moveTo(lamp.x,lamp.y);c.lineTo(730,H*.65);c.lineTo(280,H*.65);c.fill();
    }
    for(const target of this.targets){
      if(target.enabled===false)continue;
      if(this.mode==='assembly'&&target.id==='body')continue;
      c.save();c.strokeStyle=target.color||'#fff9e9';c.fillStyle=target.color?target.color+'55':'#fff8df28';c.lineWidth=7;c.setLineDash(target.occupied?[]:[18,10]);
      if(this.mode==='assembly'){c.beginPath();c.arc(target.x,target.y,target.w/2,0,Math.PI*2);c.stroke();}
      else{this.round(target,20);c.fill();c.stroke();}
      c.setLineDash([]);if(target.glyph)this.glyph(target.glyph,target.x,target.y,Math.min(100,target.h*.55));c.restore();
    }
    if(['wash','assembly'].includes(this.mode)){
      const r=this.carRect();
      if(this.mode==='assembly'&&this.body){c.save();c.globalAlpha=.13;c.drawImage(this.body,r.x-r.w/2,r.y-r.h/2,r.w,r.h);c.restore();}
      else this.sprite(this.options.carId,r);
      if(this.mode==='wash'&&this.mask)c.drawImage(this.mask,r.x-r.w/2,r.y-r.h/2,r.w,r.h);
      if(this.mode==='wash'&&this.grab?.washing){for(let i=0;i<9;i++){c.fillStyle='#eefaffbb';c.beginPath();c.arc(this.grab.start.x+Math.sin(this.time*2+i)*40,this.grab.start.y+Math.cos(this.time*2+i)*25,8+i%4*3,0,Math.PI*2);c.fill();}}
    }
    if(this.options.id==='A02'){
      for(const point of this.paintPoints){c.fillStyle='#c96b4f';c.fillRect(point.x*1000-7,point.y*H-25,14,14);c.fillRect(point.x*1000-7,point.y*H+16,14,14);}
    }
    const renderItems=['road','bridge'].includes(this.mode)?[...this.items.filter(i=>i.kind!=='car'),...this.items.filter(i=>i.kind==='car')]:this.items;
    for(const item of renderItems){
      c.save();
      if(item.kind==='car')this.sprite(item.carId||this.options.carId,item,['parking','spaces','sorting','road','visit'].includes(this.mode));
      else if(item.kind==='body'&&this.body)c.drawImage(this.body,item.x-item.w/2,item.y-item.h/2,item.w,item.h);
      else if(item.kind==='wheel'){
        const index=Number(item.id.split('-')[1]),p=this.wheelPoints[index],image=this.images.get(`${this.options.carId}/side`);
        if(image){c.beginPath();c.arc(item.x,item.y,item.w/2,0,Math.PI*2);c.clip();if(item.placed&&this.complete){c.translate(item.x,item.y);c.rotate(this.rolling);c.translate(-item.x,-item.y);}const sourceSize=p.r*2000;c.drawImage(image,p.x*image.width-p.r*image.width,p.y*image.height-p.r*image.width,sourceSize/1000*image.width,sourceSize/1000*image.width,item.x-item.w/2,item.y-item.h/2,item.w,item.h);}
      }else if(item.kind==='plank'){c.fillStyle='#c28b4d';this.round(item,8);c.fill();c.strokeStyle='#8c5d35';c.lineWidth=4;for(let y=item.y-item.h/2+20;y<item.y+item.h/2;y+=25){c.beginPath();c.moveTo(item.x-item.w/2+12,y);c.lineTo(item.x+item.w/2-12,y);c.stroke();}}
      else if(item.kind==='road'){
        const shape=this.road[item.turn!],halfW=item.w/2,halfH=item.h/2;c.fillStyle='#adc58e';this.round(item,13);c.fill();c.strokeStyle='#6a7c81';c.lineWidth=Math.min(item.w,item.h)*.52;c.lineCap='butt';
        for(const direction of shape){c.beginPath();c.moveTo(item.x,item.y);c.lineTo(item.x+(direction==='R'?halfW:direction==='L'?-halfW:0),item.y+(direction==='D'?halfH:direction==='U'?-halfH:0));c.stroke();}
      }else if(item.kind==='bay'){
        c.strokeStyle=CREAM;c.lineWidth=8;this.round(item,12);c.stroke();this.glyph('🅿️',item.x,item.y,65);
      }else if(item.kind==='shape'){
        c.fillStyle=item.color||'#e5b34e';if(item.glyph==='●'){c.beginPath();c.arc(item.x,item.y,55,0,Math.PI*2);c.fill();}else{this.round(item,8);c.fill();}
      }else this.glyph(item.glyph||'⭐',item.x,item.y,Math.min(item.w,item.h)*.72);
      if(item.placed&&item.kind!=='car')this.glyph('✨',item.x+item.w*.36,item.y-item.h*.35,32);
      c.restore();
    }
    if(this.mode==='parts'){
      const car=this.items[0];
      if(this.seen.has('light')){c.fillStyle='#fff4a477';c.beginPath();c.moveTo(car.x+car.w*.35,car.y);c.lineTo(1000,car.y-80);c.lineTo(1000,car.y+80);c.fill();}
      if(this.seen.has('wheel')){c.strokeStyle=CREAM;c.lineWidth=4;for(const x of [car.x-car.w*.27,car.x+car.w*.28]){c.save();c.translate(x,car.y+65);c.rotate(this.time*2);c.beginPath();c.moveTo(-20,0);c.lineTo(20,0);c.moveTo(0,-20);c.lineTo(0,20);c.stroke();c.restore();}}
      if(this.seen.has('door')){c.strokeStyle='#fbda71';c.lineWidth=5;c.beginPath();c.moveTo(car.x-110,car.y-45);c.lineTo(car.x+110,car.y-40);c.lineTo(car.x+70,car.y+55);c.stroke();}
    }
    if(!this.touched){
      const first=this.items.find(i=>!i.placed),destination=this.targets.find(t=>t.enabled!==false&&(!t.accepts||!!first&&t.accepts.includes(first.id)));
      const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches,phase=reduced?0:Math.min(1,(this.time%3)/1.8);
      const cue=this.mode==='wash'?{x:420+(reduced?0:Math.sin(this.time*2)*140),y:H*.4}:first&&destination?{x:first.home.x+(destination.x-first.home.x)*phase,y:first.home.y+(destination.y-first.home.y)*phase}:first||{x:500,y:H*.5};
      this.glyph('👆',cue.x+35,cue.y+45,70);
    }
    if(this.complete){this.glyph('✨',80,70,55);this.glyph('✨',920,80,55);}
    if(this.time-this.notifyAt>.2){this.notifyAt=this.time;this.notify();}
  }
}
