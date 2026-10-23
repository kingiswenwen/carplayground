import { assetUrl, getCar, type ActivityId } from '../domain/content';
import { clamp, coast, distance, flickVelocity, inside, type Point, type Rect } from '../domain/direct-play';
import {roadConnected,type RoadShape} from '../domain/learning';
import {paintMark} from '../services/artwork';
import type {Mark} from '../services/storage';
import {hitPart,partRegions,rotateRoad,roadLessons} from '../domain/play-guidance';

type Item = Rect & { id: string; kind: 'car'|'body'|'wheel'|'prop'|'plank'|'road'|'bay'|'shape'; glyph?: string; color?: string; carId?: string; home: Point; placed?: boolean; target?: string; turn?: number; dock?: string };
type Target = Rect & { id: string; glyph?: string; color?: string; accepts?: string[]; occupied?: boolean; enabled?: boolean };
type Grab = { id: number; item?: Item; start: Point; offset: Point; samples: (Point & {t:number})[]; origin?: Point; washing?: boolean; dock?:string; wasPlaced?:boolean };
export type BoardSnapshot = { ready: boolean; progress: number; completed: boolean; moving: boolean; hint:boolean;recovering:boolean;selected:string|null;signalGreen:boolean;road:{level:number;shapes:RoadShape[];locked:number[];won:boolean};comparison:{smooth:number;rough:number}[];wash:{clean:number;waiting:boolean};parts:string[]; items: {id:string;x:number;y:number;placed:boolean;carId?:string}[]; targets: Target[] };
export type BoardOptions = { id: ActivityId; carId: string; portrait: boolean; finish: (summary:string)=>void; feedback:(message:string)=>void; changed:(state:BoardSnapshot)=>void; speak?:(id:string)=>void; paint?:(points:Mark[],background?:string)=>void };
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
  private road:RoadShape[]=[];
  private roadLevel=0;
  private roadWon=false;
  private roadTurns=new Map<number,{from:RoadShape;at:number}>();
  private selected:Item|null=null;
  private lastAction=0;
  private correction:{item:Item;from:Point;to:Point;target?:Target;at:number}|null=null;
  private signalGreen=false;
  private velocities=new Map<string,number>();
  private motionResults:{smooth:number;rough:number}[]=[];
  private washIndex=0;
  private cleanCars=0;
  private washReady=false;
  private wheelPoints: {x:number;y:number;r:number}[] = [];
  private body: HTMLCanvasElement | null = null;
  private mode: string;
  private paintPoints: Mark[]=[];
  private ink='#c96b4f';
  private paper='#eef1d6';
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
    const modes:Record<string,string>={H03:'wash',P01:'motion',E03:'traffic',T04:'assembly',M01:'parking',M02:'spaces',M03:'spaces',E01:'color',E02:'parts',T01:'parts',M04:'pattern',C02:'sequence',S01:'rolling',S02:'shadow',S03:'packing',L01:'trip',T02:'bridge',T03:'road',H01:'visit',H02:'helpers',L03:'sorting',C01:'story',C03:'story',L02:'help',A01:'paint',A02:'paint'};
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
    const previousHeight=this.height,ratio=next/previousHeight;
    this.cancel();this.correction=null;this.selected=null;
    for(const item of this.items){item.y*=ratio;item.home.y*=ratio;}
    for(const target of this.targets)target.y*=ratio;
    for(const point of this.roadJourney)point.y*=ratio;
    this.height=next;this.canvas.height=next;
    if(this.mode==='assembly'){
      const body=this.carRect();Object.assign(this.targets[0],body);
      this.wheelPoints.forEach((p,i)=>Object.assign(this.targets[i+1],{x:body.x-body.w/2+p.x*body.w,y:body.y-body.h/2+p.y*body.h}));
      for(const item of this.items)if(item.placed&&item.dock){const target=this.targets.find(t=>t.id===item.dock)!;item.x=target.x;item.y=target.y;}
    }
    if(this.mode==='road'){
      const lesson=roadLessons[this.roadLevel],oldCell=Math.min(lesson.width===2?260:240,previousHeight*.21),cell=Math.min(lesson.width===2?260:240,next*.21),scale=cell/oldCell;
      const adapt=(p:Point)=>{p.x=500+(p.x-500)*scale;p.y=next*.5+(p.y/ratio-previousHeight*.5)*scale;};
      for(const item of this.items){if(item.id==='next-road')continue;adapt(item);if(item.kind==='road')item.w=item.h=cell;}
      for(const point of this.roadJourney)adapt(point);
    }
    this.notify();
  }
  private item(id:string,kind:Item['kind'],x:number,y:number,w:number,h:number,extra:Partial<Item>={}) {
    const item:Item={id,kind,x,y,w,h,home:{x,y},...extra}; this.items.push(item); return item;
  }
  private target(id:string,x:number,y:number,w:number,h:number,extra:Partial<Target>={}){
    const target:Target={id,x,y,w,h,...extra};this.targets.push(target);return target;
  }
  private setup(){
    const H=this.height, carId=this.options.carId;
    if(this.mode==='motion'){
      this.item('runner','car',180,H*.34,230,104,{carId});
      this.item('comparison','car',180,H*.65,230,104,{carId});
    }else if(this.mode==='traffic'){
      this.item('runner','car',220,H*.54,280,126,{carId});
      this.item('signal','prop',720,H*.2,150,230,{glyph:'signal'});
    }else if(this.mode==='rolling'){
      this.item('runner','shape',180,H*.34,145,145,{glyph:'●',color:'#eb8256'});
      this.item('cube','shape',180,H*.65,145,145,{glyph:'■',color:'#5d94bb'});
    }else if(this.mode==='wash'){
      this.item('water','prop',350,H*.84,125,110,{glyph:'🚿'});
      this.item('sponge','prop',600,H*.84,125,110,{glyph:'🧽'});
      this.item('next-car','car',850,H*.84,220,99,{carId:'CAR11',placed:true});
    }else if(this.mode==='assembly'){
      const game=getCar(carId)?.game;
      this.wheelPoints=game?.wheels||[{x:.23,y:.63,r:.095},{x:.78,y:.63,r:.095}];
      const body=this.carRect();this.target('body',body.x,body.y,body.w,body.h);
      this.item('body','body',500,H*.7,480,216,{target:'body'});
      this.wheelPoints.forEach((wheel,i)=>{
        const rect=this.carRect();this.target(`wheel-${i}`,rect.x-rect.w/2+wheel.x*rect.w,rect.y-rect.h/2+wheel.y*rect.h,wheel.r*rect.w*2,wheel.r*rect.w*2);
        this.item(`wheel-${i}`,'wheel',310+i*380,H*.83,155,155,{});
      });
    }else if(['parking','spaces','sorting'].includes(this.mode)){
      const count=this.mode==='parking'?2:3;
      for(let i=0;i<count;i++){
        const x=count===2?280+i*440:180+i*320;
        this.item(`car-${i}`,'car',x,H*.22,count===2?280:250,115,{carId:this.mode==='sorting'?['CAR02','CAR11','CAR15'][i]:i===0?carId:i===1?'CAR11':'CAR15',color:['#d65b44','#4e9cce','#faf8e9'][i]});
        this.target(`bay-${i}`,x,H*.65,count===2?310:270,150,{color:this.mode==='sorting'?['#d65b44','#4e9cce','#faf8e9'][i]:undefined,accepts:this.mode==='sorting'?[`car-${i}`]:undefined});
      }
      if(this.mode==='spaces'&&this.options.id==='M03'){
        this.target('bay-3',820,H*.88,270,150);
      }
      if(this.mode==='spaces'&&this.options.id==='M02'){
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
      ['🎒','belt','🏁'].forEach((glyph,i)=>{
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
      this.setupRoad();
    }else if(this.mode==='visit'){
      ['🌳','📚','🦕'].forEach((glyph,i)=>this.target(`place-${i}`,180+i*320,H*.26,230,180,{glyph}));
      this.item('visitor','car',500,H*.79,300,140,{carId});
    }else if(this.mode==='helpers'){
      ['🛞','💦','📦'].forEach((glyph,i)=>this.target(`help-${i}`,180+i*320,H*.32,230,190,{glyph,accepts:[`tool-${i}`]}));
      ['🔧','🧽','🛒'].forEach((glyph,i)=>this.item(`tool-${i}`,'prop',180+((i+1)%3)*320,H*.78,180,180,{glyph}));
    }else if(this.mode==='trip'){
      this.target('bag',300,H*.35,320,220,{glyph:'🎒',accepts:['water','hat']});
      this.target('seat',740,H*.4,300,260,{glyph:'🪑',accepts:['belt'],enabled:false});
      this.item('water','prop',200,H*.8,155,155,{glyph:'🥤',target:'bag'});
      this.item('hat','prop',500,H*.8,155,155,{glyph:'🧢',target:'bag'});
      this.item('belt','prop',800,H*.8,155,155,{glyph:'belt',target:'seat'});
    }else if(this.mode==='help'){
      this.item('help-car','car',680,H*.4,460,207,{carId,placed:true});
      this.target('friend',230,H*.3,220,230,{glyph:'🧑‍🔧',accepts:['request']});
      this.item('request','prop',650,H*.75,170,170,{glyph:'👋',target:'friend'});
    }else if(['story','paint'].includes(this.mode)){
      this.item('my-car','car',500,H*.54,600,270,{carId,placed:this.mode==='paint'&&this.options.id==='A01'});
      if(this.mode==='paint'){['#c96b4f','#477da8','#6e9154'].forEach((color,i)=>this.item(`ink-${i}`,'prop',200+i*220,H*.13,140,140,{color,glyph:'ink'}));this.item('paper','prop',850,H*.13,140,140,{glyph:'paper'});}
      ['🌳','☀️','⭐'].forEach((glyph,i)=>this.item(`stamp-${i}`,'prop',200+i*300,H*.85,135,135,{glyph}));
      if(this.options.id==='L02')this.items.filter(i=>i.kind==='prop').forEach((item,i)=>item.glyph=['🤝','💛','🫂'][i]);
    }else if(this.mode==='parts')this.item('parts-car','car',500,H*.49,900,405,{carId,placed:true});
  }
  private setupRoad(){
    const lesson=roadLessons[this.roadLevel];this.road=lesson.shapes.slice();this.items=[];this.targets=[];this.roadWon=false;this.roadJourney=[];
    const rows=Math.ceil(lesson.shapes.length/lesson.width),cell=Math.min(lesson.width===2?260:240,this.height*.21),cy=this.height*.5;
    this.item('road-car','car',500-(lesson.width-1)*cell/2,cy-(rows-1)*cell/2,160,72,{carId:this.options.carId,placed:true});
    for(let i=0;i<lesson.shapes.length;i++)this.item(`road-${i}`,'road',500-(lesson.width-1)*cell/2+(i%lesson.width)*cell,cy-(rows-1)*cell/2+Math.floor(i/lesson.width)*cell,cell,cell,{turn:i});
  }
  private startRoad(){
    const lesson=roadLessons[this.roadLevel],queue:number[][]=[[0]],seen=new Set<number>();
    while(queue.length){const path=queue.shift()!,i=path.at(-1)!;if(i===lesson.end){this.roadJourney=path.map(n=>{const item=this.items.find(i=>i.id===`road-${n}`)!;return{x:item.x,y:item.y};});this.roadStep=0;this.options.feedback('');break;}if(seen.has(i))continue;seen.add(i);
      for(const [letter,opposite,dx,dy]of [['U','D',0,-1],['R','L',1,0],['D','U',0,1],['L','R',-1,0]]as const){const x=i%lesson.width+dx,y=Math.floor(i/lesson.width)+dy,n=y*lesson.width+x;if(x>=0&&x<lesson.width&&y>=0&&n<this.road.length&&this.road[i].includes(letter)&&this.road[n].includes(opposite))queue.push([...path,n]);}}
  }
  private compatible(item:Item,target:Target){
    if(target.occupied||target.enabled===false&&item.kind!=='bay')return false;
    if(target.accepts&&!target.accepts.includes(item.id)||item.target&&item.target!==target.id)return false;
    if(this.mode==='assembly')return item.kind==='body'?target.id==='body':item.kind==='wheel'&&target.id.startsWith('wheel-')&&!!this.targets[0].occupied;
    if(this.mode==='sequence'){const next=this.targets.find(t=>!t.occupied);return next===target;}
    return true;
  }
  private pickupPadding(item:Item){const scale=1000/Math.max(1,this.canvas.getBoundingClientRect().width);return Math.max(15,(48*scale-Math.min(item.w,item.h))/2);}
  showHint(){this.touched=false;this.lastAction=this.time;this.notify();}
  private reject(item:Item,grab:Grab,target?:Target){
    this.selected=null;this.touched=false;
    this.correction={item,from:{x:item.x,y:item.y},to:grab.origin||item.home,target:target||this.targets.find(t=>this.compatible(item,t)),at:this.time};
    if(grab.wasPlaced&&grab.dock){item.placed=true;this.targets.find(t=>t.id===grab.dock)!.occupied=true;}
    this.options.feedback('再看看发亮的轮廓，也可以点选物件后点轮廓放下。');this.notify();
  }
  private saveArt(){const marks=this.options.id==='A02'?this.paintPoints:this.items.filter(i=>i.id.startsWith('stamp-')&&i.y<this.height*.73).map(i=>({x:i.x/1000,y:i.y/this.height,color:i.color||this.ink,shape:({'stamp-0':'leaf','stamp-1':'sun','stamp-2':'star'}as const)[i.id as 'stamp-0'|'stamp-1'|'stamp-2']}));this.options.paint?.(marks,this.paper);}
  private carRect():Rect{return{x:500,y:this.height*.4,w:900,h:405};}
  private createDirt(){
    const image=this.images.get(`${this.washIndex===1&&this.mode==='wash'?'CAR11':this.options.carId}/side`)!;
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
    const image=this.images.get(`${this.washIndex===1&&this.mode==='wash'?'CAR11':this.options.carId}/side`)!;
    const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=450;
    const c=canvas.getContext('2d')!;c.drawImage(image,0,0,1000,450);c.globalCompositeOperation='destination-out';
    this.wheelPoints.forEach(p=>{c.beginPath();c.arc(p.x*1000,p.y*450,p.r*1000,0,Math.PI*2);c.fill();});this.body=canvas;
  }
  private notify(){
    this.options.changed({ready:this.ready,progress:this.progress,completed:this.complete,moving:Math.abs(this.velocity)>1||[...this.velocities.values()].some(v=>Math.abs(v)>1),hint:!this.touched||this.time-this.lastAction>4||!!this.correction,recovering:!!this.correction,selected:this.selected?.id||null,signalGreen:this.signalGreen,road:{level:this.roadLevel,shapes:this.road.slice(),locked:roadLessons[this.roadLevel].locked,won:this.roadWon},comparison:this.motionResults.slice(),wash:{clean:this.cleanCars,waiting:this.washReady},parts:[...this.seen].filter(p=>['wheel','light','door'].includes(p)),items:this.items.map(i=>({id:i.id,x:i.x,y:i.y,placed:!!i.placed,carId:i.carId})),targets:this.targets.map(t=>({...t}))});
  }
  private finish(summary:string){if(this.complete)return;this.complete=true;this.progress=1;this.options.feedback('');this.selected=null;this.options.finish(summary);this.notify();}
  private scrub(from:Point,to:Point){
    if(!this.mask||!this.alpha)return;
    const r=this.carRect(), c=this.mask.getContext('2d')!;
    c.globalCompositeOperation='destination-out';c.lineWidth=this.washedTool==='water'?100:130;c.lineCap='round';
    const transform=(p:Point)=>({x:(p.x-r.x+r.w/2)/r.w*1000,y:(p.y-r.y+r.h/2)/r.h*450});
    const a=transform(from),b=transform(to);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();
    if(performance.now()-this.lastDirtCheck>100)this.updateDirt();
  }
  private updateDirt(){
    this.lastDirtCheck=performance.now();if(this.washReady||this.complete)return;
    const washed=1-this.countDirt()/Math.max(1,this.dirtyOriginal);this.progress=(this.cleanCars+washed)/2;
    if(washed>.91){this.mask?.getContext('2d')!.clearRect(0,0,1000,450);this.cleanCars++;this.progress=this.cleanCars/2;this.washReady=true;this.touched=false;
      if(this.cleanCars===2)this.finish('轮流为两辆车擦净车身，第一辆离开后下一辆才进入');
      else this.items.find(i=>i.id==='next-car')!.placed=false;
    }this.notify();
  }
  down(id:number,p:Point,now:number){
    if(!this.ready||this.grab)return;
    if(this.correction){const r=this.correction;if(!inside(p,r.item,this.pickupPadding(r.item))){r.item.x=r.to.x;r.item.y=r.to.y;}this.correction=null;}
    const selected=this.selected;
    if(id!==-1&&selected&&this.targets.some(t=>inside(p,t,25))){this.selected=null;this.grab={id,item:selected,start:{...selected},offset:{x:0,y:0},origin:{...selected},samples:[]};selected.x=p.x;selected.y=p.y;this.up(id,p,now);return;}
    const item=[...this.items].reverse().find(i=>(!i.placed||['story','paint','motion','shadow','assembly','rolling','parking','spaces','sorting'].includes(this.mode))&&!(i.id==='my-car'&&this.options.id==='A01')&&inside(p,i,this.pickupPadding(i)));
    if(this.mode==='wash'&&!this.washReady&&!this.complete&&inside(p,this.carRect())){this.touched=true;this.lastAction=this.time;this.grab={id,start:p,offset:{x:0,y:0},samples:[],washing:true};this.scrub(p,p);return;}
    if(this.mode==='parts'){
      const part=hitPart(getCar(this.options.carId)!,this.items[0],p);
      if(!part){this.showHint();return;}
      this.touched=true;this.lastAction=this.time;this.seen.add(part);this.options.speak?.(part);this.progress=this.seen.size/3;this.rolling=part==='wheel'?3:0;
      this.options.feedback({wheel:'wheel · 车轮转起来了',light:'light · 车灯亮起来了',door:'door · 看看车门的位置'}[part]);
      if(this.seen.size===3)this.finish('触摸对应实物部件，观察车轮、车灯和车门反馈');this.notify();return;
    }
    if(item?.id.startsWith('ink-')){this.ink=item.color!;this.lastAction=this.time;this.notify();return;}
    if(item?.id==='paper'){const colors=['#eef1d6','#f4ddcc','#d9eaf2'];this.paper=colors[(colors.indexOf(this.paper)+1)%colors.length];this.saveArt();this.notify();return;}
    if(item?.kind==='road'){
      const index=item.turn!,lesson=roadLessons[this.roadLevel];
      if(lesson.locked.includes(index)||this.roadJourney.length){this.showHint();return;}
      this.roadTurns.set(index,{from:this.road[index],at:this.time});this.road[index]=rotateRoad(this.road[index]);this.touched=true;this.lastAction=this.time;
      if(roadConnected(this.road,lesson.width,0,lesson.end))this.startRoad();this.notify();return;
    }
    if(item?.id==='next-road'){this.roadLevel++;this.setupRoad();this.touched=false;this.notify();return;}
    if(item?.id==='next-car'){this.items=this.items.filter(i=>i.id!=='next-car');this.washIndex=1;this.washReady=false;this.createDirt();this.touched=false;this.options.feedback('');this.notify();return;}
    if(item?.id==='signal'){
      this.signalGreen=!this.signalGreen;this.lastAction=this.time;this.touched=true;
      if(!this.signalGreen&&this.seen.has('go')){this.velocity=0;this.seen.add('stop');this.finish('绿灯推动小车出发，红灯让小车停下');}
      this.notify();return;
    }
    if(this.mode==='wash'&&item){this.washedTool=item.id;this.lastAction=this.time;this.showHint();return;}
    if(!item){this.selected=null;this.notify();return;}
    this.lastAction=this.time;
    const wasPlaced=!!item.placed,dock=item.dock;
    if(wasPlaced&&['assembly','parking','spaces','sorting'].includes(this.mode)){item.placed=false;const target=this.targets.find(t=>t.id===dock);if(target)target.occupied=false;}
    this.grab={id,item,start:p,offset:{x:p.x-item.x,y:p.y-item.y},origin:{x:item.x,y:item.y},samples:[{x:item.x,y:item.y,t:now}],wasPlaced,dock};
    if(['motion','rolling','traffic'].includes(this.mode)){this.velocity=0;this.velocities.clear();}
  }
  move(id:number,p:Point,now:number){
    const grab=this.grab;if(!grab||grab.id!==id)return;
    if(grab.washing){this.scrub(grab.start,p);grab.start=p;return;}
    const item=grab.item;if(!item)return;
    item.x=clamp(p.x-grab.offset.x,item.w/2,1000-item.w/2);item.y=clamp(p.y-grab.offset.y,item.h/2,this.height-item.h/2);
    if(['motion','rolling','traffic'].includes(this.mode)){item.y=item.home.y;if(['motion','rolling'].includes(this.mode))for(const other of this.items.filter(i=>i!==item))other.x=item.x;}
    if(this.mode==='traffic'&&!this.signalGreen)item.x=Math.min(item.x,440);
    if(distance(grab.start,p)>12){this.touched=true;this.lastAction=this.time;this.selected=null;}
    grab.samples.push({x:item.x,y:item.y,t:now});grab.samples=grab.samples.filter(s=>now-s.t<180);
    if(this.mode==='shadow'){this.seen.add(item.x<400?'left':item.x>600?'right':'middle');if(this.seen.has('left')&&this.seen.has('right'))this.finish('直接移动光源，观察两侧的影子变化');}
    if(this.mode==='paint'&&this.options.id==='A02'&&item.kind==='car'){
      const last=this.paintPoints.at(-1);if(!last||distance(last,item)>15){this.paintPoints.push({x:item.x/1000,y:item.y/this.height,color:this.ink,shape:'stripe'});if(this.paintPoints.length>95)this.paintPoints.shift();this.saveArt();}
    }
    this.notify();
  }
  up(id:number,p:Point,now:number){
    const grab=this.grab;if(!grab||grab.id!==id)return;
    this.grab=null; if(grab.washing){this.updateDirt();return;}
    const item=grab.item;if(!item)return;
    if(distance(grab.start,p)<12&&this.targets.length&&item.kind!=='plank'){
      if(grab.wasPlaced&&grab.dock){item.placed=true;const t=this.targets.find(t=>t.id===grab.dock);if(t)t.occupied=true;}
      this.selected=this.selected===item?null:item;this.lastAction=this.time;this.notify();return;
    }
    if(['motion','rolling','traffic'].includes(this.mode)){
      const v=flickVelocity(grab.samples,now);this.movingItem=item.id;
      if(this.mode==='traffic'){
        if(!this.signalGreen){item.x=Math.min(item.x,440);this.velocity=0;this.showHint();this.notify();return;}
        if(grab.origin&&Math.abs(item.x-grab.origin.x)>45){this.seen.add('go');this.touched=true;this.lastAction=this.time;}this.velocity=v.x;
      }else if(this.mode==='motion'||this.mode==='rolling'){
        if(grab.origin&&Math.abs(item.x-grab.origin.x)>35){
          const speed=Math.sign(v.x||item.x-grab.origin.x)*clamp(Math.abs(v.x)||260,200,430);
          // Both lanes receive exactly the same launch position and velocity.
          const launch=clamp(item.x,180,520);for(const car of this.items){car.x=launch;this.velocities.set(car.id,speed);}
          this.seen.add('pushed');this.touched=true;this.lastAction=this.time;
        }
      }else{this.velocity=item.id==='cube'?v.x*.28:v.x;this.seen.add(item.id);this.touched=true;}
      this.options.feedback('');this.notify();return;
    }
    if(['shadow','story','paint'].includes(this.mode)){
      if(this.mode==='paint'&&item.id.startsWith('stamp-'))item.color=this.ink;
      if(item.kind==='prop'&&['story','paint'].includes(this.mode)&&item.y<this.height*.73){this.seen.add(item.id);this.progress=this.seen.size/3;if(this.mode==='paint')this.saveArt();if(this.seen.size>=2)this.finish('自主摆放场景物件与爱车，记录参与；未自动评估表达能力');}
      if(this.mode==='paint'&&this.options.id==='A02'&&this.paintPoints.length>3)this.finish('推着小车画出轮印，作品自动保存在本机');
      return;
    }
    const target=this.targets.find(t=>this.compatible(item,t)&&inside(item,t,30));
    if(this.mode==='bridge'){
      if(target&&item.w>=target.w){item.x=target.x;item.y=target.y;item.placed=true;target.occupied=true;this.movingItem='traveller';this.velocity=540;this.seen.add('bridge');}
      else{this.reject(item,grab,this.targets[0]);}return;
    }
    if(target){
      if(item.kind==='bay'){target.enabled=true;item.placed=true;item.x=target.x;item.y=target.y;this.notify();return;}
      item.x=target.x;item.y=target.y;target.occupied=true;item.dock=target.id;
      if(item.kind==='body'||item.kind==='wheel'){item.w=target.w;item.h=target.h;}
      if(this.mode==='packing'||this.mode==='trip'&&target.id==='bag'){item.x=target.x-100+(this.seen.size%3)*100;item.y=target.y+30;target.occupied=false;this.seen.add(item.id);}
      item.placed=true;this.progress=this.items.filter(i=>i.placed&&i.kind!=='bay').length/Math.max(1,this.targets.length);
      this.touched=true;this.lastAction=this.time;this.selected=null;this.options.feedback('');
      if(this.mode==='color'){
        this.seen.add(item.id);this.progress=this.seen.size/3;item.x=180+(this.seen.size-1)*320;item.y=this.height*.12;item.w=200;item.h=90;const next=['red','blue','white'][this.seen.size];
        if(next){target.occupied=false;target.accepts=[next];target.color=({red:'#cf5648',blue:'#4e9cce',white:'#faf8e9'}as Record<string,string>)[next];this.touched=false;this.options.speak?.('color-'+next);}else this.finish('依次按红、蓝、白的可见颜色配对游戏跑车');this.notify();return;
      }
      if(this.mode==='sequence')this.options.speak?.(['sequence-pack','sequence-belt','sequence-go'][this.targets.indexOf(target)]);
      if(this.mode==='visit')this.options.speak?.(['place-park','place-library','place-museum'][this.targets.indexOf(target)]);
      if(this.mode==='trip'&&this.seen.has('water')&&this.seen.has('hat'))this.targets.find(t=>t.id==='seat')!.enabled=true;
      if(this.mode==='packing'||this.mode==='trip')this.progress=(this.mode==='packing'?Number(this.seen.has('pack-0'))+Number(this.seen.has('pack-1')):this.items.filter(i=>i.placed).length)/(this.mode==='packing'?2:3);
      else if(this.mode==='pattern')this.progress=this.targets.filter(t=>t.occupied).length/this.targets.length;
      if(this.mode==='pattern'){
        const index=target.id.slice(-1);this.item(`filled-${index}`,'car',target.x,target.y,240,110,{carId:item.carId,placed:true});item.x=item.home.x;item.y=item.home.y;item.placed=false;
      }
      const all=this.mode==='trip'?this.items.every(i=>i.placed):this.mode==='visit'?true:this.mode==='packing'?this.seen.has('pack-0')&&this.seen.has('pack-1'):['parking','spaces','sorting'].includes(this.mode)?this.items.filter(i=>i.kind==='car').every(i=>i.placed):this.targets.every(t=>t.occupied);
      if(all)this.finish(`直接操作完成 ${this.options.id}：物体实际到达目标位置`);
    }else{this.reject(item,grab);}
    this.notify();
  }
  cancel(pointerId?:number){
    const grab=this.grab;
    if(!grab||(pointerId!==undefined&&pointerId!==grab.id))return;
    if(grab.item&&grab.origin){grab.item.x=grab.origin.x;grab.item.y=grab.origin.y;if(grab.wasPlaced&&grab.dock){grab.item.placed=true;const target=this.targets.find(t=>t.id===grab.dock);if(target)target.occupied=true;}}
    this.grab=null;this.velocity=0;this.notify();
  }
  keyboard(key:string){
    const item=this.items.find(i=>!i.placed&&i.kind!=='prop')||this.items.find(i=>!i.placed&&!i.id.startsWith('ink-')&&i.id!=='paper');
    if(!item)return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)){
      if(!this.grab)this.down(-1,{x:item.x,y:item.y},performance.now());
      this.move(-1,{x:item.x+(key==='ArrowLeft'?-35:key==='ArrowRight'?35:0),y:item.y+(key==='ArrowUp'?-35:key==='ArrowDown'?35:0)},performance.now());
    }else if(key==='Enter'||key===' '){
      if(this.grab)this.up(-1,{x:item.x,y:item.y},performance.now());
      else if(this.mode==='motion'||this.mode==='rolling'){const now=performance.now(),to={x:item.x+100,y:item.y};this.down(-1,{...item},now);this.move(-1,to,now+100);this.up(-1,to,now+100);}
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
    if(['parking','spaces','sorting','motion','traffic','visit','rolling','road'].includes(this.mode)){
      c.fillStyle=ASPHALT;this.round({x:500,y:H*.52,w:980,h:H*.73},40);c.fill();
      c.strokeStyle='#efe9c8';c.lineWidth=5;c.setLineDash([35,25]);c.beginPath();c.moveTo(25,H*.43);c.lineTo(975,H*.43);c.stroke();c.setLineDash([]);
      if(this.rough){c.fillStyle='#b99e79';c.fillRect(0,H*.47,1000,H*.16);c.fillStyle='#84765f';for(let i=0;i<150;i++){c.beginPath();c.ellipse(i*73%1000,H*.48+(i*31%(H*.14)),5,3,0,0,Math.PI*2);c.fill();}}
    }else if(['assembly','helpers','sequence','paint','story','trip','help'].includes(this.mode)){
      c.fillStyle=this.mode==='paint'?this.paper:'#eed4a4';this.round({x:500,y:H*.6,w:970,h:H*.68},35);c.fill();
    }else if(this.mode==='wash'){
      c.fillStyle='#bce4ea';c.fillRect(0,H*.16,1000,H*.56);c.fillStyle='#a5ccd2';for(let x=0;x<1000;x+=100)c.fillRect(x,H*.67,4,30);
      this.glyph('🫧',150,100,60);this.glyph('🫧',850,115,75);
    }else if(this.mode==='bridge'){
      c.fillStyle='#71b9d6';c.fillRect(305,H*.15,390,H*.48);
      c.strokeStyle='#a6def3';c.lineWidth=4;for(let y=H*.18;y<H*.6;y+=48){c.beginPath();c.moveTo(320,y);c.lineTo(675,y+15);c.stroke();}
    }
    if(this.mode==='motion'||this.mode==='rolling'){
      for(const [index,y]of [H*.34,H*.65].entries()){c.fillStyle=index&&this.mode==='motion'?'#c9ac83':'#a0b5bc';this.round({x:500,y,w:980,h:150},35);c.fill();
        if(index&&this.mode==='motion'){c.fillStyle='#907455';for(let i=0;i<140;i++){c.beginPath();c.arc(20+i*73%960,y-60+(i*37%120),4,0,Math.PI*2);c.fill();}}
        c.strokeStyle='#fffcdf';c.lineWidth=5;c.beginPath();c.moveTo(180,y-70);c.lineTo(180,y+70);c.stroke();
        const car=this.items[index];if(car){c.strokeStyle=index?'#9c673e':'#487583';c.lineWidth=8;c.beginPath();c.moveTo(180,y+65);c.lineTo(car.x,y+65);c.stroke();}}
    }
    if(this.mode==='traffic'){c.fillStyle='#fff4d8';c.fillRect(510,H*.4,12,H*.3);}
    if(this.mode==='packing'){this.glyph('🌧️',820,100,110);if(this.seen.has('pack-0'))this.glyph('☂️',720,H*.48,150);if(this.seen.has('pack-1'))this.glyph('🧥',720,H*.63,120);}
    if(this.mode==='trip'){this.glyph('☀️',150,80,90);this.glyph('🌳',850,80,90);}
    if(this.mode==='sequence'){c.strokeStyle='#92724c';c.lineWidth=5;for(let i=0;i<2;i++){c.beginPath();c.moveTo(310+i*320,H*.33);c.lineTo(365+i*320,H*.33);c.lineTo(350+i*320,H*.33-12);c.stroke();}}

  }
  draw(seconds:number){
    if(this.destroyed)return;
    this.time+=seconds;const c=this.ctx,H=this.height;c.clearRect(0,0,1000,H);this.background();
    if(!this.ready){this.glyph('🛞',500,H*.45,100);return;}
    if(this.correction){const r=this.correction,phase=clamp((this.time-r.at-.35)/.55,0,1),ease=1-(1-phase)**3;r.item.x=r.from.x+(r.to.x-r.from.x)*ease;r.item.y=r.from.y+(r.to.y-r.from.y)*ease;if(phase===1){this.correction=null;this.options.feedback('');}}
    if(['motion','rolling'].includes(this.mode)&&!this.grab&&this.velocities.size){
      for(const car of this.items){const v=this.velocities.get(car.id)||0,next=coast(car.x,v,seconds,car.id==='runner'?180:600,115,885);car.x=next.x;this.velocities.set(car.id,next.velocity);}
      if([...this.velocities.values()].every(v=>Math.abs(v)<1)){this.motionResults.push({smooth:this.items[0].x-180,rough:this.items[1].x-180});this.velocities.clear();this.finish(this.mode==='motion'?'同样的车在两种路面接受相同推动，实际比较滑行距离；记录探索不代表掌握概念':'球和方块接受相同推动，观察它们移动的差异；未自动评判预测表达');}
    }
    if(this.mode==='assembly'&&this.complete&&!this.grab&&this.assemblyTravel<100){const step=Math.min(100-this.assemblyTravel,seconds*45);this.assemblyTravel+=step;this.rolling+=step/65;for(const item of this.items)if(item.placed)item.x+=step;}
    if(this.velocity&&!this.grab){
      const runner=this.items.find(i=>i.id===this.movingItem);
      if(runner){const next=coast(runner.x,this.velocity,seconds,this.rough?430:160,runner.w/2,1000-runner.w/2);runner.x=next.x;this.velocity=next.velocity;this.rolling+=seconds*this.velocity*.02;
        if(this.mode==='rolling'&&Math.abs(this.velocity)<1&&this.seen.has('runner')&&this.seen.has('cube')&&!this.complete)this.finish('分别推动球与方块，观察运动差异；未评估预测表达');
        if(Math.abs(this.velocity)<1&&this.seen.has('bridge')&&!this.complete)this.finish('直接摆放桥板连接两岸，小车实际开过桥');}
    }
    if(this.roadJourney.length&&!this.grab){const runner=this.items[0],next=this.roadJourney[this.roadStep];const d=distance(runner,next),step=seconds*180;if(d<=step){runner.x=next.x;runner.y=next.y;this.roadStep++;if(this.roadStep>=this.roadJourney.length){this.roadJourney=[];this.roadWon=true;this.progress=(this.roadLevel+1)/3;if(this.roadLevel===2)this.finish('从三块直路到转弯和九宫格，转动同一形状的路块，让车到达公园');else this.item('next-road','prop',850,H*.88,150,150,{glyph:'➜'});}}else{runner.x+=(next.x-runner.x)/d*step;runner.y+=(next.y-runner.y)/d*step;}}
    if(this.tilt&&!this.grab&&this.mode==='motion'){
      for(const runner of this.items)runner.x=clamp(runner.x+this.tilt*seconds*9,140,860);this.seen.add('tilted');
    }
    if(this.mode==='shadow'){
      const lamp=this.items[0];c.fillStyle='#354c3b66';c.save();c.translate(500+(500-lamp.x)*.45,H*.69);c.rotate((500-lamp.x)/1600);c.scale(1.3,.2);c.beginPath();c.ellipse(0,0,230,90,0,0,Math.PI*2);c.fill();c.restore();
      c.fillStyle='#ffe57e55';c.beginPath();c.moveTo(lamp.x,lamp.y);c.lineTo(730,H*.65);c.lineTo(280,H*.65);c.fill();
    }
    for(const target of this.targets){
      if(target.enabled===false)continue;
      if(this.mode==='assembly'&&(target.id==='body'||!this.targets[0].occupied))continue;
      c.save();c.strokeStyle=target.color||'#fff9e9';c.fillStyle=target.color?target.color+'55':'#fff8df28';c.lineWidth=7;c.setLineDash(target.occupied?[]:[18,10]);
      if(this.mode==='assembly'){c.beginPath();c.arc(target.x,target.y,target.w/2,0,Math.PI*2);c.stroke();}
      else{this.round(target,20);c.fill();c.stroke();}
      c.setLineDash([]);if(target.glyph)this.glyph(target.glyph,target.x,target.y,Math.min(100,target.h*.55));c.restore();
    }
    if(['wash','assembly'].includes(this.mode)){
      const r=this.carRect();
      if(this.mode==='assembly'&&this.body){c.save();c.globalAlpha=.13;c.drawImage(this.body,r.x-r.w/2,r.y-r.h/2,r.w,r.h);c.restore();}
      else this.sprite(this.washIndex===1?'CAR11':this.options.carId,r);
      if(this.mode==='wash'&&this.mask)c.drawImage(this.mask,r.x-r.w/2,r.y-r.h/2,r.w,r.h);
      if(this.mode==='wash'&&this.grab?.washing){for(let i=0;i<9;i++){c.fillStyle='#eefaffbb';c.beginPath();c.arc(this.grab.start.x+Math.sin(this.time*2+i)*40,this.grab.start.y+Math.cos(this.time*2+i)*25,8+i%4*3,0,Math.PI*2);c.fill();}}
    }
    if(this.options.id==='A02')for(const mark of this.paintPoints)paintMark(c,mark,1000,H);
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
        const animation=this.roadTurns.get(item.turn!),phase=animation?clamp((this.time-animation.at)/.25,0,1):1,animate=animation&&phase<1&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches;const shape=animate?animation.from:this.road[item.turn!],halfW=item.w/2,halfH=item.h/2;c.fillStyle='#adc58e';this.round(item,13);c.fill();c.strokeStyle='#6a7c81';c.lineWidth=Math.min(item.w,item.h)*.52;c.lineCap='butt';if(animate){c.translate(item.x,item.y);c.rotate(Math.PI/2*phase);c.translate(-item.x,-item.y);}
        for(const direction of shape){c.beginPath();c.moveTo(item.x,item.y);c.lineTo(item.x+(direction==='R'?halfW:direction==='L'?-halfW:0),item.y+(direction==='D'?halfH:direction==='U'?-halfH:0));c.stroke();}
      }else if(item.kind==='bay'){
        c.strokeStyle=CREAM;c.lineWidth=8;this.round(item,12);c.stroke();this.glyph('🅿️',item.x,item.y,65);
      }else if(item.kind==='shape'){
        c.fillStyle=item.color||'#e5b34e';if(item.glyph==='●'){c.beginPath();c.arc(item.x,item.y,item.w/2,0,Math.PI*2);c.fill();c.strokeStyle=CREAM;c.lineWidth=9;c.save();c.translate(item.x,item.y);c.rotate(item.x/55);c.beginPath();c.moveTo(-item.w*.35,0);c.lineTo(item.w*.35,0);c.stroke();c.restore();}else{this.round(item,8);c.fill();}
      }else if(item.glyph==='belt'){c.strokeStyle='#42616f';c.lineWidth=18;c.beginPath();c.moveTo(item.x-40,item.y-45);c.lineTo(item.x+40,item.y+45);c.moveTo(item.x-45,item.y+35);c.lineTo(item.x+45,item.y+35);c.stroke();c.fillStyle='#dca956';c.fillRect(item.x-20,item.y-5,40,35);}
      else if(item.id.startsWith('ink-')){c.fillStyle=item.color!;c.beginPath();c.arc(item.x,item.y,45,0,Math.PI*2);c.fill();if(this.ink===item.color){c.strokeStyle=CREAM;c.lineWidth=8;c.stroke();}}
      else if(item.id==='paper'){c.fillStyle=this.paper;c.strokeStyle='#587465';c.lineWidth=7;this.round(item,12);c.fill();c.stroke();}
      else if(this.mode==='paint'&&item.id.startsWith('stamp-')){paintMark(c,{x:item.x/1000,y:item.y/H,color:item.color||this.ink,shape:({'stamp-0':'leaf','stamp-1':'sun','stamp-2':'star'}as const)[item.id as 'stamp-0'|'stamp-1'|'stamp-2']},1000,H);}
      else if(item.id==='signal'){c.fillStyle='#354f53';this.round(item,25);c.fill();for(const [i,color]of ['#d86358','#71a96d'].entries()){c.fillStyle=(i===1)===this.signalGreen?color:'#617071';c.beginPath();c.arc(item.x,item.y-55+i*110,42,0,Math.PI*2);c.fill();}}
      else this.glyph(item.glyph||'⭐',item.x,item.y,Math.min(item.w,item.h)*.72);
      if(item.placed&&item.kind!=='car')this.glyph('✨',item.x+item.w*.36,item.y-item.h*.35,32);
      c.restore();
    }
    if(this.mode==='road'){
      const lesson=roadLessons[this.roadLevel],first=this.items.find(i=>i.id==='road-0')!,last=this.items.find(i=>i.id===`road-${lesson.end}`)!;
      this.glyph('🏠',first.x,first.y-first.h*.6,75);this.glyph('🌳',last.x,last.y+last.h*.6,85);
      for(const n of lesson.locked){const item=this.items.find(i=>i.id===`road-${n}`)!;c.strokeStyle='#506c47';c.lineWidth=9;this.round(item,12);c.stroke();}
    }
    if(this.mode==='helpers'){for(const [i,target]of this.targets.entries()){const y=target.y-target.h*.8;c.fillStyle=['#6387a4','#729b77','#c58a54'][i];this.round({x:target.x,y,w:85,h:85},18);c.fill();c.fillStyle='#efcba6';c.beginPath();c.arc(target.x,y-65,32,0,Math.PI*2);c.fill();}}
    if(this.mode==='help'){if(!this.complete){c.strokeStyle='#bd775b';c.lineWidth=8;c.beginPath();c.arc(530,H*.43,50,0,Math.PI*2);c.stroke();this.glyph('🔧',535,H*.52,60);}this.glyph(this.complete?'😊':'😟',680,H*.23,78);if(this.complete){this.glyph('🧑‍🔧',520,H*.45,100);this.glyph('✨',800,H*.4,100);}}
    if(this.mode==='visit'&&this.complete){const chosen=this.items[0].dock,images=chosen==='place-0'?['🦋','🌼']:chosen==='place-1'?['📖','🐻']:['🦴','🦕'];images.forEach((g,i)=>this.glyph(g,300+i*400,H*.68,120));}
    if(this.mode==='trip'&&this.targets.find(t=>t.id==='seat')?.occupied){c.strokeStyle='#3f7181';c.lineWidth=20;c.beginPath();c.moveTo(650,H*.27);c.lineTo(830,H*.51);c.stroke();this.glyph('✓',740,H*.4,90);}
    if(this.mode==='wash'){const waiting=this.items.find(i=>i.id==='next-car');if(waiting&&!this.washReady)this.glyph('⌛',waiting.x,waiting.y-80,45);if(this.cleanCars>0)this.sprite(this.options.carId,{x:170,y:100,w:220,h:99});if(this.cleanCars===2)this.sprite('CAR11',{x:830,y:100,w:220,h:99});}
    if(this.mode==='parts'){
      for(const part of partRegions(getCar(this.options.carId)!,this.items[0])){if(!this.seen.has(part.id))continue;
        c.strokeStyle=part.id==='light'?'#ffdd68':'#fffcdf';c.lineWidth=5;c.beginPath();c.ellipse(part.x,part.y,part.rx,part.ry,0,0,Math.PI*2);c.stroke();
        if(part.id==='wheel'){c.save();c.translate(part.x,part.y);c.rotate(this.time*2);c.beginPath();c.moveTo(-part.rx*.65,0);c.lineTo(part.rx*.65,0);c.moveTo(0,-part.ry*.65);c.lineTo(0,part.ry*.65);c.stroke();c.restore();}
        if(part.id==='light'){c.fillStyle='#fff4a466';c.beginPath();c.moveTo(part.x,part.y);c.lineTo(995,part.y-60);c.lineTo(995,part.y+50);c.fill();}
      }
    }
    if(this.selected){c.strokeStyle='#e69c3a';c.lineWidth=8;this.round({...this.selected,w:this.selected.w+25,h:this.selected.h+25},24);c.stroke();}
    const needsHint=!this.complete&&(!this.touched||this.time-this.lastAction>4);
    if(needsHint&&!this.grab){
      let first=this.selected||this.items.find(i=>!i.placed&&this.targets.some(t=>this.compatible(i,t)))||this.items.find(i=>!i.placed&&!i.id.startsWith('ink-')&&i.id!=='paper');
      let destination=first&&this.targets.find(t=>this.compatible(first!,t));
      if(this.mode==='road')first=this.roadWon?this.items.find(i=>i.id==='next-road'):this.items.find(i=>i.kind==='road'&&!roadLessons[this.roadLevel].locked.includes(i.turn!));
      if(this.mode==='traffic')first=this.items.find(i=>i.id===(this.signalGreen?'runner':'signal'));
      if(this.mode==='wash'&&this.washReady)first=this.items.find(i=>i.id==='next-car');
      const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches,phase=reduced?0:Math.min(1,(this.time%3)/1.8);
      let cue=this.mode==='wash'&&!this.washReady?{x:420+(reduced?0:Math.sin(this.time*2)*140),y:H*.4}:first&&destination?{x:first.x+(destination.x-first.x)*phase,y:first.y+(destination.y-first.y)*phase}:first||{x:500,y:H*.5};
      if(this.mode==='parts'){const regions=partRegions(getCar(this.options.carId)!,this.items[0]);cue=regions.find(p=>!this.seen.has(p.id))||regions[0];}
      if(destination){c.strokeStyle='#e5a34d';c.lineWidth=8;c.globalAlpha=.7;this.round({...destination,w:destination.w+15,h:destination.h+15},25);c.stroke();c.globalAlpha=1;}
      this.glyph('👆',cue.x+25,cue.y+35,70);
    }
    if(this.correction?.target){const target=this.correction.target;c.strokeStyle='#e6a14c';c.lineWidth=10;this.round({...target,w:target.w+20,h:target.h+20},24);c.stroke();}
    if(this.complete){this.glyph('✨',80,70,55);this.glyph('✨',920,80,55);}
    if(this.time-this.notifyAt>.2){this.notifyAt=this.time;this.notify();}
  }
}
