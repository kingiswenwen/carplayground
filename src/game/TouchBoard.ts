import { assetUrl, getCar, type ActivityId } from '../domain/content';
import { clamp, coast, distance, flickVelocity, inside, type Point, type Rect } from '../domain/direct-play';
import type {RoadShape} from '../domain/learning';
import {traceRoad} from '../domain/road-route';
import {paintMark} from '../visual/paint-mark';
import {drawPlaySymbol,loadPlaySymbols} from '../visual/play-symbols';
import type {Mark} from '../services/storage';
import {loadImage} from '../services/load-image';
import {partRegions,rotateRoad,roadLessons} from '../domain/play-guidance';
import {hitDifficultyPart,playDifficulty,type PlayDifficulty} from '../domain/play-difficulty';
import {playLevel,normalizeContentLevel,type ContentLevel} from '../domain/play-level';
import {bridgeBearing,bridgeReaches,spansRiver} from '../domain/bridge';
import {cleansWith,WashState,type WashKind,type WashTool,type WashSurfacePoint} from '../domain/wash-state';
import {visitPlaces} from '../domain/outings';
import {missingPrerequisite,sequenceScenes} from '../domain/sequence-scene';
import {addTreadMarks,treadShapes,type TreadShape} from '../domain/tread-path';
import {standScenes,standStamps,storyProps,type StoryAction} from '../domain/studio-scenes';
import {bridgeLaneY,bridgeRiverX,bridgeShutterRect} from '../visual/bridge-scene';
import {SceneArtwork,hasSceneArtwork,studioSticker} from '../visual/scene-artwork';

type Item = Rect & { id: string; kind: 'car'|'body'|'wheel'|'prop'|'plank'|'road'|'bay'|'shape'; glyph?: string; color?: string; carId?: string; home: Point; placed?: boolean; target?: string; turn?: number; dock?: string;posterShape?:Mark['shape'];available?:boolean;decorative?:boolean };
type Target = Rect & { id: string; glyph?: string; color?: string; accepts?: string[]; occupied?: boolean; enabled?: boolean; blocked?:boolean; construction?:boolean; long?:boolean;sizeTier?:number };
type Grab = { id: number; item?: Item; start: Point; offset: Point; samples: (Point & {t:number})[]; origin?: Point; washing?: boolean; dock?:string; wasPlaced?:boolean; companions?:{item:Item;origin:Point}[] };
type GuideCue={start:Point;end:Point;item?:Item;action:'drag'|'push'|'tap'|'turn'|'wipe';subject:string};
export type BridgePhase='choose'|'try'|'driving'|'blocked'|'crossed';
export type TrafficPhase='red'|'crossing'|'green'|'arrived';
type RollingGuess='ball'|'cube';
type RollingPhase='predict'|'release'|'rolling'|'compare'|'done';
export type ShadowExample={lampX:number;lampY:number;side:'left'|'right'};
type HelpMethod='wave'|'call'|'card';
type HelpPhase='stuck'|'request'|'helping'|'clear'|'done';
type TrackResult={smooth:number;rough:number;upper:number;lower:number};
type RainResult='wet'|'dry';
type RainTest={items:string[];result:RainResult};
export type BoardSnapshot = { stand?:{preview:boolean;selected:boolean;count:number;scene:number;canUndo:boolean}; story?:{act:0|1;count:number;replaying:boolean;discovery?:string;doorOpen:boolean}; colorStage?:{color:string;presenting:boolean}; showroom?:{wheel:number;door:boolean;light:boolean}; trackArt?:{tread:TreadShape;count:number;canUndo:boolean}; sequence?:{scene:number;index:number;phase:'arrange'|'play'|'blocked'|'passed';order:number[];effects:number[];blockedReason:string}; rain?:{testing:boolean;result:RainResult|null;samples:RainTest[]}; trip?:{phase:'preparing'|'blocked'|'driving'|'arrived';buckled:boolean;packed:boolean}; visit?:{location:number|null;visited:number[];revealed:boolean}; trackRound?:number; shadowViews?:ShadowExample[]; rollingTest?:{round:number;phase:RollingPhase;guess?:RollingGuess;stops:{ball:number;cube:number}[]};requestHelp?:{phase:HelpPhase;method?:HelpMethod};washing?:{tool:WashTool;stubborn:number;foam:number};workshop?:'wheel'|'door'|'light'|'done';helpers?:{done:number;active:number};assembly?:{body:boolean;wheels:number;phase:'build'|'blocked'|'testing'|'done'};parade?:{round:number;phase:'building'|'driving'|'next'|'done'};sorting?:'colors'|'next'|'lengths';parking?:{waiting:number;spaceNeeded:boolean;longArrived:boolean;longBlocked:boolean};poster?:{count:number;canUndo:boolean};traffic?:TrafficPhase;bridge?:{reach:number;phase:BridgePhase;shed?:'closed'|'open'}; ready: boolean; progress: number; completed: boolean; moving: boolean; hint:boolean;recovering:boolean;selected:string|null;signalGreen:boolean;road:{level:number;shapes:RoadShape[];locked:number[];won:boolean;testing?:boolean;stopped?:boolean;closed?:number[]};comparison:TrackResult[];wash:{clean:number;waiting:boolean};parts:string[]; items: {id:string;x:number;y:number;placed:boolean;carId?:string;available?:boolean}[]; targets: Target[] };
export type BoardOptions = { id: ActivityId; carId: string; portrait: boolean; difficulty?:PlayDifficulty; contentLevel?:ContentLevel; attempt?:number; finish: (summary:string,sounds?:string[])=>void; feedback:(message:string)=>void; changed:(state:BoardSnapshot)=>void; speak?:(...ids:string[])=>void; speakRequested?:(id:string)=>void; paint?:(points:Mark[],background?:string)=>void };
const SKY='#f5efdf', GRASS='#dce5c4', ASPHALT='#81938c', CREAM='#fff9e9';
const STOP_LINE=548, CROSSING_X=660, CROSSING_TIME=2, TRAFFIC_EXIT=840;
const posterStamps=[
  {glyph:'🌳',shape:'leaf'},{glyph:'☀️',shape:'sun'},{glyph:'⭐',shape:'star'},
] as const;
const colourParades=[
  ['red','blue','red','blue','red','blue'],
  ['blue','blue','red','blue','blue','red'],
] as const;
const carForColor = { red:'CAR140',blue:'CAR11',white:'CAR15' };
const destinationArtwork=['park','library','museum'] as const;

export class TouchBoard {
  readonly width = 1000;
  get difficulty(){return playDifficulty(this.options.difficulty);}
  get contentLevel(){return normalizeContentLevel(this.options.contentLevel);}
  get level(){return playLevel(this.contentLevel);}
  get workshopAction(){
    if(this.options.id!=='T01')return undefined;
    const tasks=this.contentLevel==='starter'?['wheel'] as const:['wheel','door','light'] as const;
    return tasks.find(part=>!this.seen.has(part))||'done';
  }
  workshopEffect(part:'wheel'|'door'|'light'){
    const at=this.partPulses.get(part);
    return at===undefined?0:clamp((this.time-at)/1.1,0,1);
  }
  private requiredParts(){
    const workshop=this.workshopAction;
    return partRegions(getCar(this.options.carId)!,this.items[0])
      .filter(p=>workshop?p.id===workshop:(this.level.parts as readonly string[]).includes(p.id));
  }
  height: number;
  items: Item[] = [];
  targets: Target[] = [];
  private ctx: CanvasRenderingContext2D;
  private images = new Map<string, HTMLImageElement>();
  private grab: Grab | null = null;
  private mask: HTMLCanvasElement | null = null;
  private washState:WashState|null=null;
  private artRevision=0;
  private velocity = 0;
  private rolling = 0;
  private complete = false;
  private progress = 0;
  private ready = false;
  private destroyed = false;
  private loading=new AbortController();
  private notifyAt = 0;
  private time = 0;
  private rough = false;
  private seen = new Set<string>();
  private road:RoadShape[]=[];
  private roadLevel=0;
  private roadWon=false;
  private roadTurns=new Map<number,{from:RoadShape;at:number}>();
  private selected:Item|null=null;
  private correction:{item:Item;from:Point;to:Point;target?:Target;at:number}|null=null;
  private trafficPhase:TrafficPhase='red';
  private crossingProgress=0;
  private get signalGreen(){return this.trafficPhase==='green'||this.trafficPhase==='arrived';}
  get trafficCrossing(){return {x:CROSSING_X,y:this.height*(.30+.44*this.crossingProgress)};}
  private velocities=new Map<string,number>();
  private rollingRound=0;
  private rollingPhase:RollingPhase='predict';
  private rollingGuess?:RollingGuess;
  private rollingStops:{ball:number;cube:number}[]=[];
  private shadowViews:ShadowExample[]=[];
  private motionResults:TrackResult[]=[];
  private motionLaunch?:{x:number;speed:number};
  get motionRound(){return this.trackOrder;}
  private trackOrder=0;
  isRoughLane(index:number){return index!==this.trackOrder;}
  get motionStops(){return this.motionResults as readonly TrackResult[];}
  private rainSamples:RainTest[]=[];
  private rainStarted:number|null=null;
  private rainResult:RainResult|null=null;
  get rainTime(){return this.rainStarted===null?null:clamp((this.time-this.rainStarted)/.9,0,1);}
  private tripPhase:'preparing'|'blocked'|'driving'|'arrived'='preparing';
  private visitLocation:number|null=null;
  private visitedPlaces=new Set<number>();
  private visitRevealed=false;
  private sequenceScene=0;
  private sequenceIndex=-1;
  private sequenceTime=0;
  private sequencePhase:'arrange'|'play'|'blocked'|'passed'='arrange';
  private sequenceEffects:number[]=[];
  private sequenceBlockedReason='';
  get sequenceEffectsShown(){return this.sequenceEffects as readonly number[];}
  private washIndex=0;
  private cleanCars=0;
  private washReady=false;
  private assemblyHomes=new Map<string,{w:number;h:number}>();
  private wheelPoints: {x:number;y:number;r:number}[] = [];
  private body: HTMLCanvasElement | null = null;
  private mode: string;
  private itemSizes=new Map<string,{w:number;h:number}>();
  private targetSizes=new Map<string,{w:number;h:number}>();
  private paintPoints: Mark[]=[];
  private tread:TreadShape='stripe';
  private trackDraft?:{length:number;last:Point};
  private trackHistory:Mark[][]=[];
  private ink='#c96b4f';
  private paper='#eef1d6';
  private posterHistory:{paper:string;marks:Mark[]}[]=[];
  private posterSequence=0;
  private standView=false;
  private storyAct:0|1=0;
  private storyActions:StoryAction[]=[];
  private storyReplay?:{index:number;next:number};
  private colorArrival?:{item:Item;at:number};
  private showroomWheelTurn=0;
  private showroomWheelX?:number;
  private showroomDoor=false;
  private showroomLights=false;
  get showroomEffects(){return {wheel:this.showroomWheelTurn,door:this.showroomDoor,light:this.showroomLights};}
  private washedTool:WashTool='water';
  private movingItem = 'runner';
  private roadJourney: Point[]=[];
  private roadStep=0;
  private roadWillReach=false;
  private roadStopped=false;
  private roadStop?:Point;
  get roadStopPoint(){return this.roadStopped?this.roadStop:undefined;}
  isClosedRoad(index:number){return roadLessons[this.roadLevel].closed?.includes(index)??false;}
  private assemblyTravel=0;
  private assemblyPhase:'build'|'blocked'|'testing'|'done'='build';
  private assemblyWobbleUntil=0;
  private helpPhase:HelpPhase='stuck';
  private helpMethod?:HelpMethod;
  private helpStarted=0;
  get helpEffect(){return this.helpPhase==='helping'?clamp((this.time-this.helpStarted)/1.4,0,1):this.helpPhase==='clear'||this.helpPhase==='done'?1:0;}
  private helperStarts=new Map<number,number>();
  get assemblyWobble(){
    const left=Math.max(0,this.assemblyWobbleUntil-this.time);
    return Math.sin(left*32)*left*.09;
  }
  private paradeRound=0;
  private paradePhase:'building'|'driving'|'next'|'done'='building';
  private paradeElapsed=0;
  private sortingPhase:'colors'|'next'|'lengths'='colors';
  private bridgeReach=0;
  private bridgePhase:BridgePhase='choose';
  private bridgeDestination=0;
  private sceneArtwork?:SceneArtwork;

  get bridgeGeometry(){
    const {width}=bridgeReaches[this.bridgeReach];
    return {left:500-width/2,right:500+width/2,blocked:this.bridgePhase==='blocked'};
  }
  get bridgeShedClosed(){
    return this.mode==='bridge'&&this.bridgeReach===1&&this.items.find(item=>item.id==='long')?.available===false;
  }

  private guideStep:number|null=null;
  private guideTime=0;
  private guideBase=document.createElement('canvas');
  private hintUntil=0;
  private completedAt=-10;
  private arrivals=new Map<string,{from:Point;at:number}>();
  private pulses:{x:number;y:number;at:number}[]=[];
  private partPulses=new Map<string,number>();
  tilt = 0;
  constructor(private canvas: HTMLCanvasElement, private options: BoardOptions) {
    this.height=options.portrait?1200:680;
    canvas.width=this.width; canvas.height=this.height;
    this.ctx=canvas.getContext('2d')!;
    const modes:Record<string,string>={H03:'wash',P01:'motion',E03:'traffic',T04:'assembly',M01:'parking',M02:'spaces',M03:'spaces',E01:'color',E02:'parts',T01:'parts',M04:'pattern',C02:'sequence',S01:'rolling',S02:'shadow',S03:'packing',L01:'trip',T02:'bridge',T03:'road',H01:'visit',H02:'helpers',L03:'sorting',C01:'stand',C03:'story',L02:'help',A01:'paint',A02:'paint'};
    this.mode=modes[options.id]; this.setup();this.sizePhoneObjects(options.portrait);
  }
  async load() {
    const ids=[...new Set([this.options.carId,...this.items.filter(i=>i.carId).map(i=>i.carId!)])];
    const id=this.options.id;
    const artwork=hasSceneArtwork(id)?SceneArtwork.load(id,this.loading.signal).catch(()=>undefined):Promise.resolve(undefined);
    await Promise.all([loadPlaySymbols(),...ids.flatMap(id=>['side','top'].map(async view=>{
      const car=getCar(id); const imageId=car?.game?.[view as 'side'|'top'];
      if(!imageId) throw Error(`缺少游戏车图 ${id}/${view}`);
      const image=await loadImage(assetUrl(imageId)+(this.options.attempt?`?retry=${this.options.attempt}`:''),this.loading.signal);
      if(!this.destroyed)this.images.set(`${id}/${view}`,image);
    }))]);
    this.sceneArtwork=await artwork;
    if(this.destroyed)return;
    if(this.sceneArtwork)this.canvas.dataset.sceneArt='illustrated';
    else delete this.canvas.dataset.sceneArt;
    this.ready=true;
    if(this.mode==='wash')this.createDirt();
    if(this.mode==='assembly')this.createBody();
    this.notify(); this.draw(0);
  }
  dispose(){this.destroyed=true;this.loading.abort();this.cancel();this.images.clear();}
  resize(portrait:boolean){
    const next=portrait?1200:680;if(next===this.height)return;
    const previousHeight=this.height,ratio=next/previousHeight;
    this.cancel();this.correction=null;this.selected=null;
    for(const item of this.items){item.y*=ratio;item.home.y*=ratio;}
    for(const target of this.targets)target.y*=ratio;
    for(const point of this.roadJourney)point.y*=ratio;
    if(this.roadStop)this.roadStop.y*=ratio;
    this.height=next;this.canvas.height=next;this.sizePhoneObjects(portrait);
    if(this.mode==='assembly'){
      const body=this.carRect();Object.assign(this.targets[0],body);
      this.wheelPoints.forEach((p,i)=>Object.assign(this.targets[i+1],{x:body.x-body.w/2+p.x*body.w,y:body.y-body.h/2+p.y*body.h}));
      for(const item of this.items)if(item.placed&&item.dock){const target=this.targets.find(t=>t.id===item.dock)!;item.x=target.x+this.assemblyTravel;item.y=target.y;}
    }
    if(this.mode==='road'){
      const lesson=roadLessons[this.roadLevel],oldCell=Math.min(lesson.width===2?260:240,previousHeight*.21),cell=Math.min(lesson.width===2?260:240,next*.21),scale=cell/oldCell;
      const adapt=(p:Point)=>{p.x=500+(p.x-500)*scale;p.y=next*.5+(p.y/ratio-previousHeight*.5)*scale;};
      for(const item of this.items){if(item.id==='next-road')continue;adapt(item);if(item.kind==='road')item.w=item.h=cell;}
      for(const point of this.roadJourney)adapt(point);
      if(this.roadStop)adapt(this.roadStop);
    }
    if(this.guideStep!==null){this.guideBase.width=this.width;this.guideBase.height=this.height;this.draw(0);}
    this.notify();
  }
  private sizePhoneObjects(portrait:boolean){
    if(!['parking','spaces','bridge'].includes(this.mode))return;
    for(const item of this.items){
      const size=this.itemSizes.get(item.id)||{w:item.w,h:item.h};this.itemSizes.set(item.id,size);
      item.w=portrait&&item.kind==='car'&&this.sortingPhase!=='lengths'&&!(this.options.id==='M03'&&item.id==='car-2')?Math.min(size.w*1.2,this.mode==='parking'?340:300):size.w;
      item.h=portrait?size.h*(item.kind==='car'?1.3:item.kind==='plank'?1.8:1):size.h;
    }
    for(const target of this.targets){
      const size=this.targetSizes.get(target.id)||{w:target.w,h:target.h};this.targetSizes.set(target.id,size);
      // Bridge lengths and river width are invariant; only board thickness grows.
      target.w=portrait&&this.mode!=='bridge'&&!target.long&&target.sizeTier===undefined?Math.min(size.w*1.2,this.mode==='parking'?380:300):size.w;
      target.h=portrait?size.h*(this.mode==='bridge'?1.8:1.3):size.h;
    }
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
      this.item('signal','prop',471,H*.22,125,190,{glyph:'signal'});
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
      for(const part of this.items)this.assemblyHomes.set(part.id,{w:part.w,h:part.h});
    }else if(['parking','spaces','sorting'].includes(this.mode)){
      this.setupParking();
    }else if(this.mode==='color'){
      this.target('color-home',500,H*.35,350,230,{color:'#cf5648',accepts:['red']});
      this.level.colors.forEach((color,i)=>this.item(color,'car',this.level.colors.length===2?300+i*400:190+i*310,H*.77,270,130,{carId:carForColor[color],color}));
    }else if(this.mode==='pattern'){
      this.setupParade();
    }else if(this.mode==='sequence'){
      this.setupSequence();
    }else if(this.mode==='shadow'){
      this.item('lamp','prop',230,H*.22,150,130,{glyph:'🔦'});this.item('shadow-car','car',500,H*.65,450,200,{carId,placed:true});
    }else if(this.mode==='packing'){
      this.target('bag',500,H*.49,550,H*.22,{accepts:['pack-0','pack-1','pack-2','pack-3']});
      this.item('rain-switch','prop',500,H*.19,220,150,{glyph:'rain'});
      ['☂️','🧥','🧢','🥤'].forEach((glyph,i)=>this.item(`pack-${i}`,'prop',155+i*230,H*.81,152,147,{glyph,target:'bag'}));
    }else if(this.mode==='bridge'){
      this.setupBridge();
    }else if(this.mode==='road'){
      this.setupRoad();
    }else if(this.mode==='visit'){
      this.item('visitor','car',500,H*.79,300,140,{carId});
      this.showVisitMap();
    }else if(this.mode==='helpers'){
      for(let i=0;i<3;i++)this.target('help-'+i,180+i*320,H*.46,252,200,{accepts:['tool-'+i]});
      this.item('care-car','car',500,H*.47,258,112,{carId,placed:true,decorative:true});
      ['🔧','🧽','🛒'].forEach((glyph,i)=>this.item('tool-'+i,'prop',180+((i+1)%3)*320,H*.8,177,171,{glyph}));
    }else if(this.mode==='trip'){
      this.target('bag',290,H*.34,305,212,{glyph:'🎒',accepts:['water','hat']});
      this.target('seat',735,H*.34,310,212,{glyph:'🪑',accepts:['belt']});
      this.item('water','prop',200,H*.57,145,135,{glyph:'🥤',target:'bag'});
      this.item('hat','prop',500,H*.57,145,135,{glyph:'🧢',target:'bag'});
      this.item('belt','prop',800,H*.57,145,135,{glyph:'belt',target:'seat'});
      this.item('trip-car','car',205,H*.8,296,138,{carId});
    }else if(this.mode==='help'){
      this.item('help-car','car',211,H*.51,320,145,{carId});
      this.item('help-partner','prop',275,H*.27,162,161,{glyph:'friend',decorative:true,placed:true});
      this.target('friend',275,H*.28,218,180,{enabled:false,accepts:['request']});
      this.item('request','prop',650,H*.81,170,170,{glyph:'👋',target:'friend',available:false});
    }else if(this.mode==='story'){
      this.setupStory(0);
    }else if(this.mode==='stand'){
      this.paper=standScenes[0];
      this.item('my-car','car',510,H*.55,510,227,{carId,placed:true,decorative:true});
      standStamps.forEach(({glyph},i)=>this.item(`stamp-${i}`,'prop',190+i*285,H*.83,150,144,{glyph}));
    }else if(this.mode==='paint'){
      const tracks=this.options.id==='A02';
      this.item('my-car','car',tracks?240:500,H*.54,tracks?340:600,tracks?153:270,{carId,placed:this.mode==='paint'&&this.options.id==='A01'});
      if(this.mode==='paint'){['#c96b4f','#477da8','#6e9154'].forEach((color,i)=>this.item(`ink-${i}`,'prop',200+i*220,H*.13,140,140,{color,glyph:'ink'}));this.item('paper','prop',850,H*.13,140,140,{glyph:'paper'});}
      const stampSize=this.options.id==='A01'?168:135;
      posterStamps.forEach(({glyph},i)=>this.item(`stamp-${i}`,'prop',200+i*300,H*.85,stampSize,stampSize,{glyph}));
    }else if(this.mode==='parts')this.item('parts-car','car',500,H*.49,900,405,{carId,placed:true});
  }
  predictRolling(guess:RollingGuess){
    if(this.mode!=='rolling'||!['predict','release'].includes(this.rollingPhase))return;
    this.rollingGuess=guess;this.rollingPhase='release';
    this.options.feedback('猜好了。放开挡板，看两个物件各走多远。');this.notify();
  }
  private get stencilTray(){return this.mode==='stand'?standStamps:posterStamps;}
  private get usesStencils(){return this.mode==='stand'||this.options.id==='A01';}
  private get displayedStoryActions(){return this.storyReplay?this.storyActions.slice(0,this.storyReplay.index):this.storyActions;}
  get storyDoorOpen(){return this.displayedStoryActions.some(action=>action.act===0&&action.id==='story-door');}
  get storyDiscovery(){
    if(this.storyDoorOpen)return 'butterfly';
    if(this.displayedStoryActions.some(action=>action.act===0&&action.id==='my-car'&&action.x>.63))return 'dinosaur';
    return undefined;
  }
  private setupStory(act:0|1){
    const H=this.height;
    this.storyAct=act;this.items=[];this.selected=null;
    this.item('my-car','car',act===0?246:294,H*.57,320,148,{carId:this.options.carId});
    storyProps[act].forEach((glyph,i)=>this.item(`stamp-${i}`,'prop',181+i*320,H*.84,135,136,{glyph}));
    if(act===0)this.item('story-door','prop',775,H*.42,205,185,{glyph:'garage'});
    if(act===1&&this.storyDiscovery)this.item('story-find','prop',795,H*.24,155,155,{glyph:this.storyDiscovery});
    for(const action of this.displayedStoryActions.filter(a=>a.act===act)){
      const item=this.items.find(i=>i.id===action.id);
      if(item&&item.id!=='story-door')Object.assign(item,{x:action.x*1000,y:action.y*H,placed:true});
    }
  }
  changeStory(act:0|1){
    if(this.mode!=='story'||this.grab||this.storyReplay)return;
    this.setupStory(act);this.notify();
  }
  undoStory(){
    if(this.mode!=='story'||this.grab||this.storyReplay||!this.storyActions.length)return;
    const last=this.storyActions.pop()!;
    if(!this.storyDiscovery)this.storyActions=this.storyActions.filter(a=>a.id!=='story-find');
    this.setupStory(last.act);this.notify();
  }
  playStory(){
    if(this.mode!=='story'||this.grab||this.storyReplay||!this.storyActions.length)return;
    this.storyReplay={index:0,next:this.time+.48};
    this.setupStory(this.storyActions[0].act);this.notify();
  }
  private advanceStory(){
    const replay=this.storyReplay;
    if(!replay||this.time<replay.next)return;
    const action=this.storyActions[replay.index];
    if(action){
      replay.index++;replay.next=this.time+.65;
      const previous=this.items.find(i=>i.id===action.id);
      this.setupStory(action.act);
      if(previous&&action.id!=='story-door')this.arrivals.set(action.id,{from:previous,at:this.time});
      this.pulses.push({x:action.x*1000,y:action.y*this.height,at:this.time});
    }else{
      this.storyReplay=undefined;
      this.finish('布置故事场景并复播自己编排的动作，记录表达参与');
    }
    this.notify();
  }
  private addStoryAction(item:Item){
    if(this.storyActions.length>=40)this.storyActions.shift();
    this.storyActions.push({act:this.storyAct,id:item.id,x:item.x/1000,y:item.y/this.height});
    this.selected=null;
    if(!this.complete)this.progress=Math.min(.8,this.storyActions.length*.18);
    this.notify();
  }
  hearStageCar(){
    if(this.mode!=='color'||this.colorArrival||this.complete)return;
    const current=this.targets[0].accepts?.[0];
    if(current)this.options.speakRequested?.('color-'+current);
  }
  private advanceColorStage(){
    const arrival=this.colorArrival;
    if(!arrival||this.time-arrival.at<.7)return;
    this.colorArrival=undefined;
    const target=this.targets[0],next=this.level.colors[this.seen.size],H=this.height;
    if(!next){
      const colors=this.contentLevel==='starter'?'红、蓝两色':'红、蓝、白三色';
      this.finish(`根据展台灯选择${colors}小车，观察车辆登台后灯亮起`,[arrival.item.id,'color-success']);return;
    }
    Object.assign(arrival.item,{x:135+(this.seen.size-1)*225,y:H*.575,w:192,h:86});
    const waiting=this.items.filter(item=>!item.placed);
    waiting.forEach((item,index)=>{item.x=waiting.length===1?500:660-index*320;item.home.x=item.x;});
    target.x=this.seen.size===1?675:325;
    target.occupied=false;target.accepts=[next];
    target.color=({red:'#cf5648',blue:'#4e9cce',white:'#faf8e9'}as const)[next];
    this.options.speak?.(arrival.item.id,'color-'+next);
    this.notify();
  }
  nextStandScene(){
    if(this.mode!=='stand'||this.grab||this.standView)return;
    this.storePosterEdit();
    this.paper=standScenes[(standScenes.indexOf(this.paper as typeof standScenes[number])+1)%standScenes.length];
    this.saveArt();this.notify();
  }
  setStandView(view:boolean){
    if(this.mode!=='stand'||this.grab)return;
    this.selected=null;this.standView=view;this.saveArt();this.notify();
  }
  removeStandProp(){
    if(this.mode!=='stand'||this.grab||!this.selected?.posterShape)return;
    this.storePosterEdit();
    this.items=this.items.filter(item=>item!==this.selected);
    this.selected=null;this.saveArt();this.notify();
  }
  private setupSequence(){
    const H=this.height;
    this.items=[];this.targets=[];this.selected=null;this.correction=null;
    this.sequencePhase='arrange';this.sequenceIndex=-1;this.sequenceEffects=[];this.sequenceBlockedReason='';
    const scene=sequenceScenes[this.sequenceScene];
    scene.steps.forEach(({glyph},i)=>{
      this.target(`step-${i}`,180+i*320,H*.51,225,H*.16,{glyph:String(i+1)});
      this.item(`step-${i}`,'prop',180+((i+2)%3)*320,H*.79,183,154,{glyph,turn:i});
    });
    this.item('sequence-car','car',230,H*.245,300,126,{carId:this.options.carId,placed:true,decorative:true});
  }
  changeSequence(){
    if(this.mode!=='sequence'||this.sequencePhase==='play'||this.grab)return;
    this.sequenceScene=1-this.sequenceScene;
    this.setupSequence();this.options.feedback('');this.notify();
  }
  private sequenceOrder(){
    return this.targets.map(target=>this.items.find(item=>item.placed&&item.dock===target.id)?.turn??-1);
  }
  playSequence(){
    if(this.mode!=='sequence'||this.sequencePhase==='play'||this.grab||this.sequenceOrder().includes(-1))return;
    this.sequenceTime=this.time;this.sequenceIndex=-1;this.sequencePhase='play';this.sequenceEffects=[];
    const car=this.items.find(i=>i.id==='sequence-car')!;
    car.x=car.home.x;this.options.feedback('');this.notify();
  }
  private advanceSequence(seconds:number){
    if(this.sequencePhase!=='play')return;
    const car=this.items.find(i=>i.id==='sequence-car')!,age=this.time-this.sequenceTime;
    if(this.sequenceScene===0&&this.sequenceEffects.includes(2))car.x=Math.min(810,car.x+seconds*730);
    if(age<.82)return;
    this.sequenceTime=this.time;this.sequenceIndex++;
    const order=this.sequenceOrder(),scene=sequenceScenes[this.sequenceScene];
    if(this.sequenceIndex===order.length){
      this.sequencePhase='passed';
      this.finish('按自己的顺序播放步骤，满足实际先后条件后完成情境');
      this.notify();return;
    }
    const step=order[this.sequenceIndex],missing=missingPrerequisite(order,this.sequenceIndex);
    if(missing>=0){
      if(step===2&&this.sequenceScene===0)car.x=365;
      this.sequencePhase='blocked';this.sequenceBlockedReason=scene.blocked[missing];this.options.feedback(this.sequenceBlockedReason);this.notify();return;
    }
    this.sequenceEffects.push(step);
    if(this.sequenceScene===1&&step===1)car.x=590;
    const clip=scene.steps[step].clip;
    if(clip)this.options.speak?.(clip);
    this.options.feedback(scene.steps[step].name);this.notify();
  }
  testRain(){
    if(this.mode!=='packing'||this.rainStarted!==null||this.rainResult!==null||this.grab)return;
    this.rainStarted=this.time;
    this.options.feedback('');
    this.notify();
  }
  resetRain(){
    if(this.mode!=='packing'||!this.rainResult)return;
    for(const item of this.items.filter(i=>i.id.startsWith('pack-')))Object.assign(item,item.home,{placed:false});
    this.rainResult=null;this.selected=null;
    this.options.feedback('');this.notify();
  }
  private advanceRain(){
    if(this.rainTime!==1)return;
    this.rainStarted=null;
    const gear=this.items.filter(item=>item.placed&&item.id.startsWith('pack-')).map(item=>item.id);
    this.rainResult=gear.includes('pack-0')||gear.includes('pack-1')?'dry':'wet';
    if(!this.rainSamples.some(sample=>sample.items.join()===gear.join()))this.rainSamples.push({items:gear,result:this.rainResult});
    if(!this.complete)this.progress=.5;
    this.options.feedback(this.rainResult==='dry'?'雨滴从雨具上滑下去了，纸卡还是干的。':'纸卡上出现了湿点。换件东西，再试同样的雨。');
    if(this.rainSamples.length>=2&&this.rainSamples.some(sample=>sample.result==='dry'))this.finish('在相同雨滴下比较了两种准备方式，观察纸卡的干湿');
    else this.notify();
  }
  departTrip(){
    if(this.mode!=='trip'||this.grab||this.tripPhase==='driving'||this.complete)return;
    if(!this.items.find(i=>i.id==='belt')?.placed||!this.items.find(i=>i.id==='water')?.placed){
      this.tripPhase='blocked';
      this.items.find(i=>i.id==='trip-car')!.x=490;
      this.options.feedback(this.items.find(i=>i.id==='belt')?.placed?'晴天要带水，给背包放一瓶。':'安全带还没扣，看看座位旁的扣子。');
    }else{
      this.tripPhase='driving';this.options.feedback('');
    }
    this.notify();
  }
  private advanceTrip(seconds:number){
    if(this.tripPhase!=='driving')return;
    const car=this.items.find(i=>i.id==='trip-car')!;
    car.x=Math.min(844,car.x+seconds*590);
    if(car.x<844)return;
    this.tripPhase='arrived';this.finish('为晴天公园出游带上水，扣好模拟安全带，并操作小车驶出门口');
  }
  showVisitMap(){
    if(this.mode!=='visit'||this.grab)return;
    this.visitLocation=null;this.visitRevealed=false;
    const car=this.items.find(i=>i.id==='visitor')!;
    this.items=[car];Object.assign(car,car.home,{placed:false});
    this.targets=[];
    visitPlaces.forEach(({glyph},i)=>this.target(`place-${i}`,180+i*320,this.height*.30,260,204,{glyph,accepts:['visitor']}));
    this.options.feedback('');this.notify();
  }
  goVisit(index:number){
    const place=visitPlaces[index];
    if(this.mode!=='visit'||this.visitLocation!==null||!place||this.grab)return;
    this.visitLocation=index;this.visitRevealed=false;this.selected=null;
    const car=this.items.find(i=>i.id==='visitor')!;
    this.targets=[];Object.assign(car,{x:230,y:this.height*.78,placed:true});
    this.item('exhibit','prop',500,this.height*.48,250,230,{glyph:place.prop});
    this.item('discovery','prop',690,this.height*.30,230,192,{glyph:place.discovery,decorative:true,available:false});
    this.options.speak?.(place.clip);this.notify();
  }
  discoverVisit(){
    if(this.mode!=='visit'||this.visitLocation===null||this.visitRevealed)return;
    const place=visitPlaces[this.visitLocation];
    this.visitRevealed=true;this.visitedPlaces.add(this.visitLocation);
    this.items.find(i=>i.id==='discovery')!.available=true;
    this.options.feedback(place.result);
    if(!this.complete)this.finish(`在${place.name}实际操作展品并发现物件，记录参与`,[place.clip]);
    else this.notify();
  }
  swapTracks(){
    if(this.mode!=='motion'||this.motionResults.length!==1||this.trackOrder!==0||this.grab)return;
    this.trackOrder=1;
    const launch=this.motionLaunch!;
    for(const car of this.items)car.x=launch.x;
    this.notify();
  }
  repeatPush(){
    if(this.mode!=='motion'||this.trackOrder!==1||this.motionResults.length!==1||this.velocities.size)return;
    this.startTrackRun(this.motionLaunch!);
  }
  private startTrackRun(launch:{x:number;speed:number}){
    this.motionLaunch=launch;
    for(const car of this.items){car.x=launch.x;this.velocities.set(car.id,launch.speed);}
    this.notify();
  }
  private advanceTrackRun(seconds:number){
    if(!this.velocities.size)return;
    for(const [i,car]of this.items.entries()){
      const next=coast(car.x,this.velocities.get(car.id)||0,seconds,this.isRoughLane(i)?600:180,115,885);
      car.x=next.x;this.velocities.set(car.id,next.velocity);
    }
    if([...this.velocities.values()].some(speed=>Math.abs(speed)>=1))return;
    const upper=this.items[0].x,lower=this.items[1].x;
    const first=Math.abs(upper-this.motionLaunch!.x),second=Math.abs(lower-this.motionLaunch!.x);
    this.motionResults.push({upper,lower,smooth:this.trackOrder?second:first,rough:this.trackOrder?first:second});
    this.velocities.clear();this.progress=this.motionResults.length/2;
    if(this.trackOrder)this.finish('相同起点、相同推力，交换路面后比较两次停点');
    else this.notify();
  }
  releaseRolling(){
    if(this.mode!=='rolling'||this.rollingPhase!=='release')return;
    this.rollingPhase='rolling';
    for(const piece of this.items)this.velocities.set(piece.id,460);
    this.options.feedback('');this.notify();
  }
  nextRolling(){
    if(this.mode!=='rolling'||this.rollingPhase!=='compare')return;
    this.rollingRound=1;this.rollingPhase='predict';this.rollingGuess=undefined;this.selected=null;
    for(const piece of this.items)Object.assign(piece,piece.home);
    this.options.feedback('这次坡道表面更粗糙。猜猜它们会停在哪。');this.notify();
  }
  private advanceRolling(seconds:number){
    if(this.rollingPhase!=='rolling')return;
    for(const object of this.items){
      const friction=object.id==='runner'?(this.rollingRound===0?210:355):(this.rollingRound===0?535:735);
      const next=coast(object.x,this.velocities.get(object.id)||0,seconds,friction,130,910);
      object.x=next.x;this.velocities.set(object.id,next.velocity);
    }
    if([...this.velocities.values()].some(v=>v>0))return;
    this.velocities.clear();
    this.rollingStops.push({ball:this.items[0].x,cube:this.items[1].x});
    if(this.rollingRound===0){
      this.rollingPhase='compare';this.progress=.5;
      this.options.feedback('看看两个停点，再换个坡道表面试一次。');
    }else{
      this.rollingPhase='done';
      this.finish('记录两次预测与共同放开的观察，比较球和方块在两种坡道表面上的停点；猜测不作为成绩');
    }
    this.notify();
  }
  get currentShadow(){
    const lamp=this.items[0];
    return {lampX:lamp.x,lampY:lamp.y/this.height};
  }
  get previousShadow(){
    const current=this.currentShadow;
    for(let i=this.shadowViews.length-1;i>=0;i--){
      const view=this.shadowViews[i];
      if(Math.abs(view.lampX-current.lampX)>20||Math.abs(view.lampY-current.lampY)>.035)return view;
    }
  }
  private captureShadow(){
    const lamp=this.currentShadow;
    if(Math.abs(lamp.lampX-500)<130){
      this.options.feedback('把灯移到车的一侧，看看影子往哪边跑。');return;
    }
    const side=lamp.lampX<500?'right':'left';
    this.shadowViews=[...this.shadowViews.filter(sample=>sample.side!==side),{...lamp,side}];
    if(!this.complete)this.progress=this.shadowViews.length/2;
    if(this.shadowViews.length===2)this.finish('把灯移到车的两侧并保留两次影子，对比方向以及长短');
    else this.options.feedback('留住了这道影子。把灯换一侧，再比较新的影子。');
    this.notify();
  }
  tryHelpCar(){
    if(this.mode!=='help'||!this.ready||this.grab)return;
    const car=this.items[0];
    if(this.helpPhase==='stuck'){
      car.x=457;this.helpPhase='request';this.progress=.25;
      this.targets[0].enabled=true;this.items.find(i=>i.id==='request')!.available=true;
      this.options.feedback('挡板挡住了小车。可以招手、喊伙伴，或把求助卡递过去。');
    }else if(this.helpPhase==='clear'){
      car.x=827;this.helpPhase='done';
      this.finish('尝试推车遇到挡板，'+({wave:'招手',call:'开口',card:'递图卡'}[this.helpMethod!])+'求助，伙伴移开挡板后把车开过去',['help-please']);
    }
    this.notify();
  }
  askForHelp(method:HelpMethod){
    if(this.mode!=='help'||this.helpPhase!=='request')return;
    this.helpMethod=method;this.helpPhase='helping';this.helpStarted=this.time;this.progress=.5;
    this.targets[0].enabled=false;
    const request=this.items.find(i=>i.id==='request')!;
    request.available=false;
    if(method==='call')this.options.speak?.('help-please');
    this.options.feedback('伙伴听见或看见了，正在过来帮忙。');this.notify();
  }
  private animateHelp(){
    if(this.helpPhase!=='helping')return;
    const t=this.helpEffect,partner=this.items.find(i=>i.id==='help-partner')!;
    partner.x=275+t*380;partner.y=this.height*(.27+t*.037);
    if(t<1)return;
    this.helpPhase='clear';this.progress=.75;
    this.options.feedback('挡板挪开了。再推推小车，看它能不能通过。');this.notify();
  }
  helperProgress(index:number){
    const start=this.helperStarts.get(index);
    return start===undefined?0:clamp((this.time-start)/1.1,0,1);
  }
  private animateHelpers(){
    if(!this.helperStarts.size||this.complete)return;
    let done=0;
    for(const index of this.helperStarts.keys()){
      const t=this.helperProgress(index),target=this.targets[index],tool=this.items.find(i=>i.id==='tool-'+index)!;
      if(index===0){tool.x=target.x+Math.sin(t*Math.PI*4)*41;tool.y=target.y+82-Math.sin(t*Math.PI)*68;}
      if(index===1){tool.x=target.x+Math.sin(t*Math.PI*6)*68;tool.y=target.y+60-Math.sin(t*Math.PI)*55;}
      if(index===2){tool.x=target.x-63*Math.sin(t*Math.PI);tool.y=target.y+65+t*this.height*.18;}
      if(t===1)done++;
    }
    this.progress=done/3;
    if(done===3)this.finish('选择三种适合的工具，观察伙伴检查轮胎、清洁车身和把箱子运到收纳处');
  }
  private assemblyStatus(){
    return {body:!!this.targets[0]?.occupied,wheels:this.targets.slice(1).filter(t=>t.occupied).length,phase:this.assemblyPhase};
  }
  private updateAssembly(){
    const {body,wheels}=this.assemblyStatus();
    this.assemblyPhase='build';this.assemblyWobbleUntil=0;
    this.progress=(Number(body)+wheels)/4;
    if(body&&wheels===2)this.options.feedback('装齐了。试试小车能不能平稳滚过试车线。');
    this.notify();
  }
  tryAssembly(){
    if(this.mode!=='assembly'||!this.ready||this.grab||this.assemblyPhase==='testing'||this.complete)return;
    const {body,wheels}=this.assemblyStatus();
    if(!body||wheels<2){
      this.assemblyPhase='blocked';this.assemblyWobbleUntil=body?this.time+.66:0;
      this.options.feedback(body?'还有车轮没装好，小车没能平稳滚起来。':'试车台上还没有车身，先把车身装好。');
    }else{
      this.assemblyPhase='testing';this.assemblyTravel=0;this.selected=null;
      this.options.feedback('车轮都在。看看小车能不能平稳滚过去。');
    }
    this.notify();
  }
  removeAssemblyWheel(){
    if(this.mode!=='assembly'||this.grab||this.assemblyPhase==='testing'||this.complete)return;
    const wheel=this.items.filter(i=>i.kind==='wheel'&&i.placed).at(-1);
    if(!wheel)return;
    this.vacate(wheel);this.returnAssemblyPart(wheel);this.updateAssembly();
    this.options.feedback('取下了一只轮子。可以换个位置装上，再试一次。');
  }
  private returnAssemblyPart(item:Item){
    const home=this.assemblyHomes.get(item.id)!;
    Object.assign(item,item.home,home,{placed:false,dock:undefined});
    this.selected=null;
  }
  private animateAssembly(seconds:number){
    if(this.assemblyPhase!=='testing')return;
    const distance=48,step=Math.min(distance-this.assemblyTravel,seconds*95);
    this.assemblyTravel+=step;this.rolling+=step/35;
    for(const item of this.items)if(item.placed)item.x+=step;
    if(this.assemblyTravel>=distance){
      this.assemblyPhase='done';
      this.finish('装好车身与两只车轮，试车后观察小车平稳滚过试车线',['go']);
    }
  }
  private setupParade(){
    const H=this.height,colours=colourParades[this.paradeRound];
    this.items=[];this.targets=[];this.arrivals.clear();this.selected=null;this.correction=null;
    this.paradePhase='building';this.paradeElapsed=0;
    for(const [i,color] of colours.entries()){
      const x=175+(i%3)*300,y=H*(i<3?.255:.52);
      if(i<4)this.item('pattern-'+i,'car',x,y,225,105,{carId:carForColor[color],placed:true});
      else this.target('pattern-'+i,x,y,248,135,{accepts:[color]});
    }
    for(const [i,color] of ['red','blue'].entries()){
      this.item(color,'car',i===0?280:720,H*.84,268,128,{carId:carForColor[color as 'red'|'blue']});
    }
  }
  nextParade(){
    if(this.mode!=='pattern'||this.paradePhase!=='next')return;
    this.paradeRound=1;this.setupParade();
    this.options.feedback('新车队的颜色顺序变了。先看看哪一组会重复。');
    this.notify();
  }
  private animateParade(seconds:number){
    if(this.paradePhase!=='driving')return;
    this.paradeElapsed=Math.min(1.1,this.paradeElapsed+seconds);
    for(const item of this.items.filter(i=>i.placed)){
      const index=Number(item.id.slice(-1)),moved=clamp((this.paradeElapsed-index*.055)/.67,0,1);
      item.x=item.home.x+134*moved;
    }
    if(this.paradeElapsed<1.1)return;
    this.paradePhase=this.paradeRound===0?'next':'done';
    if(this.paradeRound===0)this.options.feedback('这一队出发啦。下一队的顺序会不一样。');
    else this.finish('观察并接续两种颜色重复规律，分别让两支车队出发',['go']);
    this.notify();
  }
  nextSorting(){
    if(this.mode!=='sorting'||this.sortingPhase!=='next')return;
    this.sortingPhase='lengths';this.selected=null;this.correction=null;this.arrivals.clear();this.pulses=[];
    const tiers=[1,2,0];
    for(const [i,item]of this.items.entries()){
      const tier=tiers[i];
      Object.assign(item,item.home,{w:[156,237,306][tier],h:[90,105,130][tier],placed:false,dock:undefined});
      this.itemSizes.delete(item.id);
    }
    for(const [i,target]of this.targets.entries()){
      Object.assign(target,{w:[188,266,330][i],h:155,occupied:false,color:undefined,sizeTier:i,accepts:['car-'+tiers.indexOf(i)]});
      this.targetSizes.delete(target.id);
    }
    this.sizePhoneObjects(this.height===1200);
    this.options.feedback('挂牌换了。看车身和横尺的长短，把车停进对应车位。');this.notify();
  }
  private setupParking(){
    const H=this.height, id=this.options.id;
    const count=id==='M01'?this.level.parkingCars:3;
    for(let i=0;i<count;i++){
      const x=count===1?500:count===2?280+i*440:180+i*320;
      const color=['#d65b44','#4e9cce','#faf8e9'][i];
      const isLong=id==='M03'&&i===2;
      const carId=id==='L03'?['CAR140','CAR11','CAR15'][i]:isLong?'CAR172':i===0?this.options.carId:i===1?'CAR11':'CAR15';
      this.item('car-'+i,'car',x,H*.22,isLong?340:count<=2?280:250,115,{carId,color,available:!isLong});
      this.target('bay-'+i,x,H*.65,count<=2?310:270,150,
        {color:id==='L03'?color:undefined,accepts:id==='L03'?['car-'+i]:undefined});
    }
    if(id==='M01'){
      const x=count===1?820:500;
      this.target('blocked-bay',x,count===1?H*.65:H*.88,count===1?265:290,150,{blocked:true});
    }
    if(id==='M02'){
      Object.assign(this.targets[2],{enabled:false,construction:true});
      this.target('bay-extra',246,H*.875,270,150,{enabled:false,construction:true});
      this.item('extra-bay','bay',785,H*.875,190,95);
    }
    if(id==='M03')this.target('bay-3',720,H*.89,448,134,{long:true});
  }
  private updateParking(){
    const cars=this.items.filter(item=>item.kind==='car');
    if(this.options.id==='M03'&&cars.slice(0,2).every(item=>item.placed)&&cars[2].available===false){
      cars[2].available=true;
      this.options.feedback('长车到了。短车位装不下它，看看哪里能停。');
    }
    if(!this.complete)this.progress=cars.filter(item=>item.placed).length/cars.length;
    if(cars.every(item=>item.placed)){
      const summary=this.options.id==='M03'?'为后到的长车腾出足够长的车位，并让所有车辆各占一个车位'
        :this.options.id==='M02'?'观察等候车辆数量，增加所需车位后把车辆实际停好'
        :`避开挡板后，${cars.length===1?'一':'两'}辆小车各停进一个空位`;
      this.finish(summary);
    }
  }
  private vacate(item:Item){
    if(!item.placed||!['assembly','parking','spaces','sorting','sequence'].includes(this.mode))return;
    item.placed=false;
    const target=this.targets.find(t=>t.id===item.dock);if(target)target.occupied=false;
  }
  private setupBridge(){
    const H=this.height,reach=bridgeReaches[this.bridgeReach];
    this.items=[];this.targets=[];this.selected=null;this.correction=null;
    this.bridgePhase='choose';
    for(const id of ['short','long'])this.itemSizes.delete(id);
    this.targetSizes.delete('bridge');
    this.item('traveller','car',125,H*.44,205,100,{carId:this.options.carId,placed:true});
    this.target('bridge',500,H*.44,reach.width,104,{accepts:['short','long']});
    this.item('short','plank',217,H*.81,reach.boards[0],88,{target:'bridge'});
    const shutter=bridgeShutterRect(this.bridgeGeometry,H);
    this.item('long','plank',Math.min(shutter.x,990-reach.boards[1]/2),shutter.y,reach.boards[1],88,{target:'bridge',available:this.bridgeReach===0});
    if(this.bridgeReach===1)this.item('bridge-shed','prop',shutter.x,shutter.y,shutter.w,shutter.h,{glyph:'garage'});
    this.sizePhoneObjects(H===1200);
  }
  private advanceTraffic(seconds:number){
    if(this.trafficPhase!=='crossing')return;
    this.crossingProgress=Math.min(1,this.crossingProgress+seconds/CROSSING_TIME);
    if(this.crossingProgress<1)return;
    this.trafficPhase='green';this.progress=.5;
    this.options.feedback('行人走完了。绿灯亮了，可以过路口。');this.options.speak?.('go');this.notify();
  }
  private finishTraffic(){
    this.trafficPhase='arrived';this.velocity=0;
    this.finish('红灯在停止线前等行人通过，然后在绿灯下推车越过斑马线',['go','phrase-go']);
  }
  nextBridgeReach(){
    if(this.mode!=='bridge'||this.bridgeReach!==0||this.bridgePhase!=='crossed')return;
    this.bridgeReach=1;this.setupBridge();
    this.options.feedback('这段河更宽了。先试试原来的桥板，再看看岸边有什么可以用。');
    this.notify();
  }
  openBridgeShed(){
    if(!this.bridgeShedClosed||!this.ready||this.bridgePhase==='driving'||this.bridgePhase==='crossed')return;
    const shed=this.items.find(item=>item.id==='bridge-shed')!;
    shed.decorative=true;shed.glyph='bridge-shed-open';
    this.items.find(item=>item.id==='long')!.available=true;
    this.selected=null;
    this.options.feedback('木料棚里还有一块更长的板。把它搭到两块桥石上试试。');
    this.notify();
  }
  tryBridge(){
    if(this.mode!=='bridge'||!this.ready||this.bridgePhase!=='try')return;
    const car=this.items[0],plank=this.items.find(i=>i.kind==='plank'&&i.placed)!;
    const {left,right}=this.bridgeGeometry;
    this.bridgeDestination=spansRiver(plank.w,right-left)?875:left-car.w/2-12;
    this.bridgePhase='driving';this.options.feedback('');this.notify();
  }
  private advanceBridge(seconds:number){
    if(this.bridgePhase!=='driving')return;
    const car=this.items[0];
    car.x=Math.min(this.bridgeDestination,car.x+640*seconds);
    if(car.x<this.bridgeDestination)return;
    if(this.bridgeDestination<500){
      this.bridgePhase='blocked';
      this.options.feedback('小车停在岸边。看看亮起来的石头，桥板还够不到它。');
    }else{
      this.bridgePhase='crossed';
      if(this.bridgeReach===0){
        this.progress=.5;this.options.feedback('小车过河了！试试前面那段更宽的河。');
      }else this.finish('比较两段河道的跨度，分别选板搭住两岸，并推动小车实际到达对岸');
    }
    this.notify();
  }
  private setupRoad(){
    const lesson=roadLessons[this.roadLevel];this.road=lesson.shapes.slice();this.items=[];this.targets=[];this.roadWon=false;this.roadJourney=[];this.roadStopped=false;this.roadStop=undefined;this.correction=null;this.selected=null;
    const rows=Math.ceil(lesson.shapes.length/lesson.width),cell=Math.min(lesson.width===2?260:240,this.height*.21),cy=this.height*.5;
    this.item('road-car','car',500-(lesson.width-1)*cell/2,cy-(rows-1)*cell/2,160,72,{carId:this.options.carId,placed:true});
    for(let i=0;i<lesson.shapes.length;i++)this.item(`road-${i}`,'road',500-(lesson.width-1)*cell/2+(i%lesson.width)*cell,cy-(rows-1)*cell/2+Math.floor(i/lesson.width)*cell,cell,cell,{turn:i});
  }
  tryRoad(){
    if(this.mode!=='road'||!this.ready||this.roadJourney.length||this.roadWon&&this.roadLevel<roadLessons.length-1)return;
    const lesson=roadLessons[this.roadLevel],route=traceRoad(this.road,lesson.width,lesson.end,lesson.closed);
    const cell=(n:number)=>this.items.find(i=>i.id==='road-'+n)!;
    const car=this.items[0],start=cell(0);
    Object.assign(car,{x:start.x,y:start.y});
    this.roadStep=0;this.roadWillReach=route.reached;this.roadStopped=false;this.roadWon=false;
    this.roadJourney=route.path.map(n=>({x:cell(n).x,y:cell(n).y}));
    const last=this.roadJourney.at(-1)!;
    if(route.gap!==undefined){
      const next=cell(route.gap);
      this.roadStop={x:(last.x+next.x)/2,y:(last.y+next.y)/2};
      this.roadJourney.push({x:last.x+(next.x-last.x)*.26,y:last.y+(next.y-last.y)*.26});
    }else this.roadStop=route.reached?undefined:{...last};
    this.options.feedback('');this.notify();
  }
  private animateRoad(seconds:number){
    if(!this.roadJourney.length||this.grab)return;
    const car=this.items[0],next=this.roadJourney[this.roadStep],d=distance(car,next),step=seconds*320;
    if(d>step){car.x+=(next.x-car.x)/d*step;car.y+=(next.y-car.y)/d*step;return;}
    Object.assign(car,next);
    this.roadStep++;
    if(this.roadStep<this.roadJourney.length)return;
    this.roadJourney=[];
    if(!this.roadWillReach){
      this.roadStopped=true;this.options.feedback('小车停在断口了。转一转旁边的路块，看看开口能不能对上。');
    }else{
      this.roadWon=true;
      if(!this.complete)this.progress=(this.roadLevel+1)/roadLessons.length;
      if(this.roadLevel===roadLessons.length-1){
        if(this.complete)this.options.feedback('这条路也能到公园。还可以转一转，试另一侧。');
        this.finish('转动直路与弯路，试车发现断口，并绕过封闭路口到达公园');
      }else this.item('next-road','prop',850,this.height*.88,150,150,{glyph:'➜'});
    }
    this.notify();
  }
  nextRoad(){
    if(this.mode!=='road'||!this.roadWon||this.roadLevel>=roadLessons.length-1)return;
    this.roadLevel++;this.setupRoad();this.options.feedback('');this.notify();
  }
  private compatible(item:Item,target:Target){
    if(target.blocked||target.occupied&&this.mode!=='sequence')return false;
    if(item.kind==='bay')return !!target.construction&&target.enabled===false;
    if(target.enabled===false)return false;
    if(this.options.id==='M03'&&item.id==='car-2'&&!target.long)return false;
    if(target.accepts&&!target.accepts.includes(item.id)||item.target&&item.target!==target.id)return false;
    if(this.mode==='assembly')return item.kind==='body'?target.id==='body':item.kind==='wheel'&&target.id.startsWith('wheel-')&&!!this.targets[0].occupied;
    if(this.mode==='sequence')return item.id.startsWith('step-');
    return true;
  }
  private dropTarget(item:Item){
    return this.targets.filter(t=>this.compatible(item,t)&&inside(item,t,30*this.difficulty.placementScale)).sort((a,b)=>distance(item,a)-distance(item,b))[0];
  }
  canPlace(itemId:string,targetId:string){
    const item=this.items.find(i=>i.id===itemId),target=this.targets.find(t=>t.id===targetId);
    return !!item&&!!target&&this.compatible(item,target);
  }
  private pickupPadding(item:Item){const scale=1000/Math.max(1,this.canvas.getBoundingClientRect().width);return Math.max(15,(48*scale-Math.min(item.w,item.h))/2);}
  showHint(){this.hintUntil=this.time+3;this.notify();}
  setGuideStep(step:number|null){
    if(step!==null&&this.guideStep===null){this.cancel();this.guideBase.width=this.width;this.guideBase.height=this.height;this.guideBase.getContext('2d')!.drawImage(this.canvas,0,0);}
    this.guideStep=step;this.guideTime=0;this.notify();
  }
  private guideCue():GuideCue{
    const H=this.height;
    let item=this.selected||this.items.find(i=>!i.placed&&this.targets.some(t=>this.compatible(i,t)))||this.items.find(i=>!i.placed&&!i.id.startsWith('ink-')&&i.id!=='paper'&&!(i.id==='my-car'&&this.options.id==='A01'));
    if(this.options.id==='M03'&&this.items[2]?.available!==false){
      const long=this.targets.find(t=>t.long)!;
      item=long.occupied?this.items.find(i=>i.dock===long.id):this.items[2];
    }
    if(this.mode==='story'||this.usesStencils)item=this.items.find(i=>i.id.startsWith('stamp-'));
    let action:GuideCue['action']='drag';
    if(this.mode==='road'){item=this.roadWon?this.items.find(i=>i.id==='next-road'):this.items.find(i=>i.kind==='road'&&!roadLessons[this.roadLevel].locked.includes(i.turn!)&&this.road[i.turn!]!==roadLessons[this.roadLevel].solution[i.turn!]);action=this.roadWon?'tap':'turn';}
    if(this.mode==='traffic'){
      if(this.trafficPhase==='crossing'){
        const point=this.trafficCrossing;
        return {start:point,end:point,action:'tap',subject:'正在过街的行人'};
      }
      item=this.items[0];action='push';
    }
    if(this.mode==='rolling'){
      const point=this.rollingPhase==='predict'?this.items[0]:this.rollingPhase==='compare'
        ?{x:this.rollingStops[0].ball,y:H*.34}:{x:214,y:H*.34};
      return {start:point,end:point,action:'tap',subject:this.rollingPhase==='predict'?'小球或方块':'挡板'};
    }
    if(this.mode==='visit'&&this.visitLocation!==null&&this.items[1]){
      const point=this.items[1];
      return {start:point,end:point,action:'tap',subject:'眼前的展品'};
    }
    if(this.mode==='wash'){
      if(!this.washReady)return{start:{x:340,y:H*.4},end:{x:700,y:H*.4},action:'wipe',subject:'车身'};
      item=this.items.find(i=>i.id==='next-car');action='tap';
    }
    if(this.mode==='parts'){
      const regions=this.requiredParts(),part=regions.find(p=>!this.seen.has(p.id))||regions[0];
      if(!part)return {start:{x:500,y:H*.49},end:{x:500,y:H*.49},action:'tap',subject:'小车'};
      return{start:part,end:part,action:'tap',subject:({wheel:'车轮',light:'车灯',door:'车门'}as const)[part.id]};
    }
    const target=item&&this.targets.find(t=>this.compatible(item!,t)&&(this.options.id!=='M03'||t.id!==item!.dock));
    const start=item?{x:item.x,y:item.y}:{x:500,y:H*.5};
    let end:Point=target?{x:target.x,y:target.y}:{x:500,y:H*.43};
    if(this.mode==='motion'||this.options.id==='A02'||this.mode==='traffic'&&action==='push'){action='push';end={x:Math.min(860,start.x+260),y:start.y};}
    if(this.mode==='help'&&(this.helpPhase==='stuck'||this.helpPhase==='clear')){
      const car=this.items[0];
      return {start:car,end:{x:car.x+210,y:car.y},item:car,action:'push',subject:'小车'};
    }
    if(this.mode==='shadow')end={x:start.x<500?780:220,y:start.y};
    if(this.mode==='bridge'){
      if(this.bridgePhase==='try'){
        item=this.items[0];action='push';
        return {start:item,end:{x:item.x+220,y:item.y},item,action,subject:'小车'};
      }
      if(this.bridgeShedClosed){
        const shed=this.items.find(i=>i.id==='bridge-shed')!;
        return {start:shed,end:shed,item:shed,action:'tap',subject:'岸边木料棚'};
      }
      item=this.items.find(i=>i.kind==='plank'&&spansRiver(i.w,bridgeReaches[this.bridgeReach].width));
      if(item)return {start:item,end:this.targets[0],item,action:'drag',subject:'够长的桥板'};
    }
    if(action==='tap'||action==='turn')end=start;
    return{start,end,item,action,subject:item?.id==='signal'?'信号灯':item?.kind==='car'?getCar(item.carId||this.options.carId)!.name:item?.kind==='wheel'?'车轮':item?.kind==='body'?'车身':item?.kind==='road'?'路块':item?.kind==='plank'?'桥板':'物件'};
  }
  get demonstration(){return this.guideCue();}
  guideDescription(step:number){
    if(this.mode==='rolling')return ['猜小球或方块谁滚得更远','点一下挡板，让两件物体同时出发','看它们的停点，再换坡面'][step];
    if(this.mode==='packing')return ['把一件物品放到纸卡上方','点云朵，看看雨滴落到哪里','换件物品，再比一比纸卡上的水痕'][step];
    if(this.mode==='trip')return ['为晴天公园出游带上水','把安全带移到座位的扣子上','推小车出门，看看能不能通过'][step];
    if(this.mode==='visit')return ['开车选一个地方','点到达后出现的物件','看完可以回地图，去新的地方'][step];
    if(this.mode==='sequence')return ['把物件放进三个位置','点播放，看看小车怎样照着做','如果小车停下，交换两个位置再试'][step];
    if(this.mode==='stand')return ['挑一盏灯、站牌或背景树','放在爱车周围，摆出自己的展位','切到观众视角看看，再决定什么时候保存'][step];
    if(this.mode==='story')return ['移动小车或布置这一幕','去第二幕，看看哪些物件跟着故事出现了','点播放，看自己刚才做过的动作'][step];
    if(this.mode==='traffic'&&this.trafficPhase==='crossing'){
      return ['看看正在过街的行人','红灯时，把小车留在停止线前','等绿灯，再推小车'][step];
    }
    const cue=this.guideCue(),verbs={drag:'移到发亮的轮廓',push:'向前推一推',tap:'轻轻点一下',turn:'点一下，让路块转动',wipe:'在车身上来回擦'};
    return step===0?`找到${cue.subject}`:step===1?verbs[cue.action]:cue.action==='drag'?'放下，再自己试试':cue.action==='turn'?'看看开口有没有对齐':cue.action==='wipe'?'看看干净的地方，再自己擦一擦':'看看变化，再自己试试';
  }
  guidePreview(canvas:HTMLCanvasElement,step:number,phase=step===1?.6:1,large=false){
    const width=large?1000:240;canvas.width=width;canvas.height=Math.round(width*this.height/1000);
    const c=canvas.getContext('2d')!;c.scale(width/1000,width/1000);c.drawImage(this.guideBase,0,0);this.guideOverlay(c,step,phase);
  }
  private guideOverlay(c:CanvasRenderingContext2D,step:number,phase:number){
    const cue=this.guideCue(),p=step===0?cue.start:step===2?cue.end:{x:cue.start.x+(cue.end.x-cue.start.x)*phase,y:cue.start.y+(cue.end.y-cue.start.y)*phase};
    c.save();c.strokeStyle='#b87524';c.lineWidth=8;c.lineCap='round';
    if(cue.action==='drag'||cue.action==='push'||cue.action==='wipe'){
      if(step>0){c.setLineDash([10,16]);c.beginPath();c.moveTo(cue.start.x,cue.start.y);c.lineTo(cue.end.x,cue.end.y);c.stroke();c.setLineDash([]);}
      if(cue.item&&step>0){const item=cue.item;c.globalAlpha=.65;
        if(item.kind==='car')this.sprite(item.carId||this.options.carId,{...item,...p},['parking','spaces','sorting','road','visit','bridge'].includes(this.mode),1,c);
        else if(item.kind==='body'&&this.body)c.drawImage(this.body,p.x-item.w/2,p.y-item.h/2,item.w,item.h);
        else if(item.kind==='wheel'){const image=this.images.get(`${this.options.carId}/side`)!,w=this.wheelPoints[Number(item.id.split('-')[1])];c.save();c.beginPath();c.arc(p.x,p.y,item.w/2,0,Math.PI*2);c.clip();c.drawImage(image,w.x*image.width-w.r*image.width,w.y*image.height-w.r*image.width,w.r*2*image.width,w.r*2*image.width,p.x-item.w/2,p.y-item.h/2,item.w,item.h);c.restore();}
        else this.glyph(item.glyph||'hand',p.x,p.y,Math.min(item.w,item.h)*.7,c);
        c.globalAlpha=1;
      }
    }
    if(cue.action==='turn'&&step>0&&cue.item){const item=cue.item;c.save();c.translate(item.x,item.y);c.rotate(Math.PI/2*phase);c.drawImage(this.guideBase,item.x-item.w/2,item.y-item.h/2,item.w,item.h,-item.w/2,-item.h/2,item.w,item.h);c.restore();}
    const radius=cue.action==='wipe'?76:Math.min(150,Math.max(64,(cue.item?.w||100)*.48));
    c.beginPath();c.ellipse(p.x,p.y,radius,radius*.72,0,0,Math.PI*2);c.stroke();
    this.glyph('hand',p.x+34,p.y+54,110,c);
    if(step===2)this.glyph(cue.action==='turn'?'arrow':'sparkle',p.x+90,p.y-75,80,c);
    c.restore();
  }
  private reject(item:Item,grab:Grab,target?:Target,message?:string){
    this.selected=null;
    if(this.mode==='sorting'){
      this.hintUntil=this.time+3;
      message=this.sortingPhase==='lengths'?'这格长短不合适，再看看车位上方的横尺。':'看车库的颜色牌，找和车身一样的颜色。';
    }
    this.correction={item,from:{x:item.x,y:item.y},to:grab.origin||item.home,target:target||this.targets.find(t=>this.compatible(item,t)),at:this.time};
    if(grab.wasPlaced&&grab.dock){item.placed=true;this.targets.find(t=>t.id===grab.dock)!.occupied=true;}
    this.options.feedback(message||'再看看发亮的轮廓，也可以点选物件后点轮廓放下。');this.notify();
  }
  private posterMarks(){
    const art:Mark['art']=this.options.id==='A01'?'paper-sticker':this.mode==='stand'?'showroom-prop':undefined;
    return this.items.flatMap(item=>item.posterShape?[{x:item.x/1000,y:item.y/this.height,color:item.color!,shape:item.posterShape,art}]:[]);
  }
  private storePosterEdit(){
    this.posterHistory.push({paper:this.paper,marks:this.posterMarks()});
    if(this.posterHistory.length>40)this.posterHistory.shift();
  }
  private onPoster(p:Point){return p.x>40&&p.x<960&&p.y>this.height*.26&&p.y<this.height*.73;}
  drawPosterSticker(context:CanvasRenderingContext2D,rect:Rect,mark:Mark['shape'],color?:string){
    const shape=studioSticker(mark);
    if(this.options.id!=='A01'||!shape||!this.sceneArtwork)return false;
    this.sceneArtwork.drawSticker(context,shape,rect,color);
    return true;
  }
  placeSelectedPosterStamp(point:Point){
    if(!this.usesStencils||this.standView||!this.selected?.id.startsWith('stamp-')||!this.onPoster(point))return false;
    this.placePosterStamp(this.selected,point);return true;
  }
  private addPosterMark(mark:Mark){
    this.item('poster-mark-'+this.posterSequence++,'prop',mark.x*1000,mark.y*this.height,122,122,
      {posterShape:mark.shape,color:mark.color,glyph:this.stencilTray.find(s=>s.shape===mark.shape)?.glyph});
  }
  private placePosterStamp(stamp:Item,position:Point,origin?:Point){
    const source=this.stencilTray[Number(stamp.id.slice(-1))];
    if(!this.onPoster(position)){
      if(origin)Object.assign(stamp,origin);
      return;
    }
    if(stamp.posterShape&&origin){
      Object.assign(stamp,origin);this.storePosterEdit();Object.assign(stamp,position);
    }else if(source&&this.posterMarks().length<24){
      this.storePosterEdit();
      this.addPosterMark({x:position.x/1000,y:position.y/this.height,color:'color'in source?source.color:this.ink,shape:source.shape});
      Object.assign(stamp,stamp.home);
    }else if(origin)Object.assign(stamp,origin);
    this.selected=null;this.saveArt();this.notify();
  }
  undoPoster(){
    if(!this.usesStencils||this.grab||this.standView)return;
    const previous=this.posterHistory.pop();
    if(!previous)return;
    this.paper=previous.paper;this.selected=null;
    this.items=this.items.filter(i=>!i.posterShape);
    for(const mark of previous.marks)this.addPosterMark(mark);
    this.saveArt();this.notify();
  }
  confirmPosterSaved(){
    if(this.options.id==='A01')this.finish('在海报上自由摆放贴纸并亲自保存作品，记录创作参与');
    if(this.mode==='stand')this.finish('自由布置爱车展位并保存自己的布置，记录表达参与');
  }
  private saveArt(){
    this.options.paint?.(this.options.id==='A02'?this.paintPoints:this.posterMarks(),this.paper);
  }
  private carRect():Rect{return{x:500,y:this.height*.4,w:900,h:405};}
  private createDirt(){
    const image=this.images.get(`${this.washIndex===1&&this.mode==='wash'?'CAR11':this.options.carId}/side`)!;
    const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=450;
    const c=canvas.getContext('2d',{willReadFrequently:true})!;c.drawImage(image,0,0,1000,450);
    const alpha=c.getImageData(0,0,1000,450).data;
    const points=Array.from({length:110},(_,id)=>({id,x:(id*137)%1000,y:(id*79)%450,rx:17+id%26,ry:10+id%17})).filter(p=>alpha[(Math.floor(p.y)*1000+Math.floor(p.x))*4+3]>50);
    // A new car owns a fresh population; view changes never call this method.
    this.washState=new WashState(points.map(point=>({
      ...point,kind:(this.washIndex===1&&point.id%3===0?'stubborn':'loose') as WashKind,
    })));
    this.washedTool='water';this.mask=canvas;this.drawDirt();
  }
  private drawDirt(){
    if(!this.mask||!this.washState)return;
    const c=this.mask.getContext('2d')!;c.clearRect(0,0,1000,450);c.globalAlpha=.88;
    for(const p of this.washState.patches)if(!p.clean){
      c.fillStyle=p.kind==='foam'?'#e1eff1':p.kind==='stubborn'?'#664735':'#b59768';
      c.beginPath();c.ellipse(p.x,p.y,p.rx,p.ry,.3,0,Math.PI*2);c.fill();
      if(p.kind==='foam'){
        c.strokeStyle='#98bcbc';c.lineWidth=2;
        for(const offset of [-.45,.33]){c.beginPath();c.arc(p.x+p.rx*offset,p.y-p.ry*.13,p.ry*.55,0,Math.PI*2);c.stroke();}
      }
    }
    c.globalAlpha=1;c.globalCompositeOperation='destination-in';c.drawImage(this.images.get(`${this.washIndex===1?'CAR11':this.options.carId}/side`)!,0,0,1000,450);c.globalCompositeOperation='source-over';
  }
  get washTool(){return this.washedTool;}
  selectWashTool(tool:WashTool){
    if(this.mode!=='wash'||this.washReady||this.complete||this.grab)return;
    this.washedTool=tool;
    this.options.feedback(tool==='water'?'水可以冲掉浮尘和泡沫。':'用海绵擦深色泥点，之后再冲泡沫。');
    this.notify();
  }
  keyboardWashPatch(){
    const patch=this.washPatches.find(p=>cleansWith(p,this.washTool));
    if(patch)return patch;
    const next=this.washPatches.find(p=>!p.clean);
    if(next)this.selectWashTool(next.kind==='stubborn'?'sponge':'water');
    return next;
  }
  get washPatches(){return this.washState?.patches||[];}
  get washLayout(){return this.washState?.layout;}
  setWashLayout(points:WashSurfacePoint[]){this.washState?.setLayout(points);}
  get washRevision(){return this.washState?.revision||0;}
  private createBody(){
    const image=this.images.get(`${this.washIndex===1&&this.mode==='wash'?'CAR11':this.options.carId}/side`)!;
    const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=450;
    const c=canvas.getContext('2d')!;c.drawImage(image,0,0,1000,450);c.globalCompositeOperation='destination-out';
    this.wheelPoints.forEach(p=>{c.beginPath();c.arc(p.x*1000,p.y*450,p.r*1000,0,Math.PI*2);c.fill();});this.body=canvas;
  }
  private notify(){
    const cars=this.items.filter(item=>item.kind==='car');
    const waiting=cars.filter(item=>item.available!==false&&!item.placed).length;
    const parking=['M01','M02','M03'].includes(this.options.id)?{
      waiting,spaceNeeded:waiting>this.targets.filter(t=>!t.blocked&&t.enabled!==false&&!t.occupied).length,
      longArrived:this.options.id==='M03'&&cars[2]?.available!==false,
      longBlocked:this.options.id==='M03'&&!!cars[2]?.available&&!cars[2].placed&&!!this.targets.find(t=>t.long)?.occupied,
    }:undefined;
    const washing=this.washState?{tool:this.washTool,stubborn:this.washPatches.filter(p=>!p.clean&&p.kind==='stubborn').length,
      foam:this.washPatches.filter(p=>!p.clean&&p.kind==='foam').length}:undefined;
    this.options.changed({washing,trackRound:this.mode==='motion'?this.trackOrder:undefined,shadowViews:this.mode==='shadow'?this.shadowViews.slice():undefined,
      stand:this.mode==='stand'?{preview:this.standView,selected:!!this.selected?.posterShape,count:this.posterMarks().length,scene:standScenes.indexOf(this.paper as typeof standScenes[number]),canUndo:this.posterHistory.length>0}:undefined,
      story:this.mode==='story'?{act:this.storyAct,count:this.storyActions.length,replaying:!!this.storyReplay,discovery:this.storyDiscovery,doorOpen:this.storyDoorOpen}:undefined,
      colorStage:this.mode==='color'?{color:this.targets[0].accepts?.[0]||'red',presenting:!!this.colorArrival}:undefined,
      showroom:this.options.id==='E02'?this.showroomEffects:undefined,
      trackArt:this.options.id==='A02'?{tread:this.tread,count:this.paintPoints.length,canUndo:this.trackHistory.length>0}:undefined,
      sequence:this.mode==='sequence'?{scene:this.sequenceScene,index:this.sequenceIndex,phase:this.sequencePhase,order:this.sequenceOrder(),effects:this.sequenceEffects.slice(),blockedReason:this.sequenceBlockedReason}:undefined,
      rain:this.mode==='packing'?{testing:this.rainStarted!==null,result:this.rainResult,samples:this.rainSamples.slice()}:undefined,
      trip:this.mode==='trip'?{phase:this.tripPhase,buckled:!!this.items.find(i=>i.id==='belt')?.placed,packed:!!this.items.find(i=>i.id==='water')?.placed}:undefined,
      visit:this.mode==='visit'?{location:this.visitLocation,visited:[...this.visitedPlaces],revealed:this.visitRevealed}:undefined,
      rollingTest:this.mode==='rolling'?{round:this.rollingRound,phase:this.rollingPhase,guess:this.rollingGuess,stops:this.rollingStops.slice()}:undefined,requestHelp:this.mode==='help'?{phase:this.helpPhase,method:this.helpMethod}:undefined,workshop:this.workshopAction,helpers:this.mode==='helpers'?{done:Math.round(this.progress*3),active:this.helperStarts.size-Math.round(this.progress*3)}:undefined,assembly:this.mode==='assembly'?this.assemblyStatus():undefined,parking,sorting:this.mode==='sorting'?this.sortingPhase:undefined,
      parade:this.mode==='pattern'?{round:this.paradeRound,phase:this.paradePhase}:undefined,poster:this.options.id==='A01'?{count:this.posterMarks().length,canUndo:this.posterHistory.length>0}:undefined,traffic:this.mode==='traffic'?this.trafficPhase:undefined,bridge:this.mode==='bridge'?{reach:this.bridgeReach,phase:this.bridgePhase,shed:this.bridgeReach===1?(this.bridgeShedClosed?'closed':'open'):undefined}:undefined,ready:this.ready,progress:this.progress,completed:this.complete,moving:this.roadJourney.length>0||this.assemblyPhase==='testing'||this.bridgePhase==='driving'||Math.abs(this.velocity)>1||[...this.velocities.values()].some(v=>Math.abs(v)>1),hint:this.guideStep!==null||this.time<this.hintUntil||!!this.correction,recovering:!!this.correction,selected:this.selected?.id||null,signalGreen:this.signalGreen,road:{level:this.roadLevel,shapes:this.road.slice(),locked:roadLessons[this.roadLevel].locked,closed:roadLessons[this.roadLevel].closed,won:this.roadWon,testing:this.roadJourney.length>0,stopped:this.roadStopped},comparison:this.motionResults.slice(),wash:{clean:this.cleanCars,waiting:this.washReady},parts:[...this.seen].filter(p=>['wheel','light','door'].includes(p)),items:this.items.map(i=>({id:i.id,x:i.x,y:i.y,placed:!!i.placed,carId:i.carId,available:i.available})),targets:this.targets.map(t=>({...t}))});
  }
  private finish(summary:string,sounds?:string[]){if(this.complete)return;this.complete=true;this.completedAt=this.time;this.progress=1;this.selected=null;this.options.finish(summary,sounds);this.notify();}
  private scrub(from:Point,to:Point){
    if(!this.washState||this.washReady||this.complete)return;
    const r=this.carRect(),radius=(this.washedTool==='water'?50:65)*this.difficulty.washScale;
    const transform=(p:Point)=>({x:(p.x-r.x+r.w/2)/r.w*1000,y:(p.y-r.y+r.h/2)/r.h*450});
    if(this.washState.wipe(transform(from),transform(to),radius,this.washTool)){
      this.drawDirt();this.updateDirt();
    }
  }
  private updateDirt(){
    if(this.washReady||this.complete)return;
    const washed=this.washState?.coverage||0;this.progress=(this.cleanCars+washed)/2;
    if(washed>.91&&!this.washPatches.some(p=>!p.clean&&p.kind!=='loose')){this.mask?.getContext('2d')!.clearRect(0,0,1000,450);this.cleanCars++;this.progress=this.cleanCars/2;this.washReady=true;
      if(this.cleanCars===2)this.finish('依次为两辆车清洁，比较用水冲掉浮尘、用海绵擦泥及冲走泡沫的效果');
      else this.items.find(i=>i.id==='next-car')!.placed=false;
    }this.notify();
  }
  // Renderer submits stable patch identities, never its own coverage denominator.
  washSurface(ids:readonly number[],carIndex:number){
    if(this.mode!=='wash'||!this.ready||this.washReady||this.complete||carIndex!==this.washIndex)return;
    if(this.washState?.apply(ids,this.washTool)){this.drawDirt();this.updateDirt();}
  }
  touchPart(part:'wheel'|'door'|'light',wheelRotates=true){
    if(this.mode!=='parts'||!this.ready||this.complete&&this.options.id!=='E02')return false;
    const task=this.workshopAction;
    if(task&&task!==part){
      this.options.feedback(task==='wheel'?'小车要开起来，找找负责滚动的部件。'
        :task==='door'?'有乘客要上车，找找从哪里进去。':'出口暗了，找能把路照亮的部件。');
      this.showHint();return false;
    }
    if(!(this.level.parts as readonly string[]).includes(part)){this.options.feedback('先找找车轮在哪里。');this.showHint();return;}
    this.partPulses.set(part,this.time);this.options.speak?.(part);
    if(this.options.id==='E02'){
      if(part==='wheel')this.turnShowroomWheel(Math.PI*.8);
      else if(part==='door')this.showroomDoor=!this.showroomDoor;
      else this.showroomLights=!this.showroomLights;
    }
    this.seen.add(part);this.progress=this.seen.size/this.level.parts.length;
    const partResult=task
      ?{wheel:'找到车轮，小车能往前滚了。',door:'找到车门，乘客可以上车了。',light:'找到车灯，暗的出口变亮了。'}[part]
      :{wheel:wheelRotates?'wheel · 用手转动车轮':'wheel · 看看示范车轮怎样转',light:this.showroomLights?'light · 灯光照到了展厅地面':'light · 车灯关了',door:this.showroomDoor?'door · 门打开了，可以看到座位':'door · 门关上了'}[part];
    this.options.feedback(partResult);
    if(this.level.parts.every(p=>this.seen.has(p))){
      const summary=task
        ?this.contentLevel==='starter'?'根据让车滚动的任务找到真实车轮':'依次选用能让车移动、让乘客上车和给出口照明的部件'
        :this.contentLevel==='starter'?'触碰真实车轮，观察车轮的位置与反馈':'直接触碰车轮、车灯与车门，观察对应部件反馈';
      this.finish(summary,[part,'discovery-done']);
    }
    this.notify();return true;
  }
  turnShowroomWheel(radians:number){
    if(this.options.id!=='E02')return;
    this.showroomWheelTurn=(this.showroomWheelTurn+radians)%(Math.PI*2);
    this.notify();
  }
  get artwork(){return this.paintPoints;}
  get artworkRevision(){return this.artRevision;}
  get artworkBackground(){return this.paper;}
  get trackSheet():Rect{return {x:500,y:this.height*.50,w:920,h:this.height*.48};}
  changeTread(tread:TreadShape){
    if(this.options.id!=='A02'||this.grab)return;
    this.tread=tread;this.notify();
  }
  undoTrack(){
    if(this.options.id!=='A02'||this.grab)return;
    const before=this.trackHistory.pop();
    if(!before)return;
    this.paintPoints=before;this.artRevision++;this.saveArt();this.notify();
  }
  get selectedItem(){return this.grab?.item?.id||this.selected?.id||null;}
  down(id:number,p:Point,now:number){
    if(!this.ready||this.grab)return;
    if(this.mode==='motion'&&(this.velocities.size||this.motionResults.length))return;
    if(this.mode==='color'&&(this.colorArrival||this.complete))return;
    if(this.mode==='sequence'&&this.sequencePhase==='play')return;
    if(this.mode==='story'&&this.storyReplay||this.standView)return;
    if(this.mode==='packing'&&this.rainStarted!==null||this.mode==='trip'&&(this.tripPhase==='driving'||this.complete))return;
    if(this.mode==='assembly'&&(this.assemblyPhase==='testing'||this.complete))return;
    if(this.mode==='pattern'&&this.paradePhase!=='building'||this.mode==='sorting'&&this.sortingPhase==='next')return;
    if(this.mode==='bridge'&&(this.bridgePhase==='driving'||this.bridgePhase==='crossed'))return;
    if(this.correction){const r=this.correction;if(!inside(p,r.item,this.pickupPadding(r.item))){r.item.x=r.to.x;r.item.y=r.to.y;}this.correction=null;}
    const selected=this.selected;
    if(id!==-1&&this.placeSelectedPosterStamp(p))return;
    if(id!==-1&&selected&&this.targets.some(t=>inside(p,t,25))){
      this.selected=null;
      this.grab={id,item:selected,start:{...selected},offset:{x:0,y:0},origin:{...selected},samples:[],wasPlaced:!!selected.placed,dock:selected.dock};
      this.vacate(selected);
      selected.x=p.x;selected.y=p.y;this.up(id,p,now);return;
    }
    const item=[...this.items].reverse().find(i=>!i.decorative&&i.available!==false&&!(i.kind==='bay'&&i.placed)&&(!i.placed||this.mode==='bridge'&&i.id==='traveller'||['story','paint','motion','shadow','assembly','rolling','parking','spaces','sorting','sequence'].includes(this.mode))&&!(i.id==='my-car'&&this.options.id==='A01')&&inside(p,i,this.pickupPadding(i)));
    if(item?.id==='story-door'){
      if(!this.storyDoorOpen){this.addStoryAction(item);this.options.feedback('门开了。去下一幕看看。');}
      return;
    }
    if(id!==-1&&this.mode==='story'&&this.selected&&!item&&this.onPoster(p)){
      Object.assign(this.selected,p,{placed:true});this.addStoryAction(this.selected);return;
    }
    if(item?.id==='rain-switch'){if(this.rainResult)this.resetRain();else this.testRain();return;}
    if(item?.id==='exhibit'){this.discoverVisit();return;}
    if(this.mode==='packing'&&this.rainResult)return;
    if(this.mode==='wash'&&!this.washReady&&!this.complete&&inside(p,this.carRect())){this.grab={id,start:p,offset:{x:0,y:0},samples:[],washing:true};this.scrub(p,p);return;}
    if(this.mode==='parts'){
      const part=hitDifficultyPart(getCar(this.options.carId)!,this.items[0],p,this.options.difficulty);
      if(!part){this.showHint();return;}
      this.rolling=part==='wheel'?3:0;
      if(this.touchPart(part)&&this.options.id==='E02'&&part==='wheel'&&id!==-1){
        this.grab={id,start:p,offset:{x:0,y:0},samples:[]};this.showroomWheelX=p.x;
      }
      return;
    }
    if(this.mode==='help'&&item?.id==='help-car'&&!['stuck','clear'].includes(this.helpPhase))return;
    if(this.mode==='shadow'&&item?.id!=='lamp')return;
    if(this.mode==='rolling'){
      const atGate=Math.abs(p.x-214)<82&&[.34,.65].some(row=>Math.abs(p.y-this.height*row)<95);
      if(this.rollingPhase==='release'&&atGate)this.releaseRolling();
      else if((item?.id==='runner'||item?.id==='cube')&&this.rollingPhase==='predict')this.predictRolling(item.id==='runner'?'ball':'cube');
      return;
    }
    if(item?.id==='bridge-shed'){this.openBridgeShed();return;}
    if(this.mode==='bridge'&&item?.id==='traveller'){
      this.grab={id,item,start:p,offset:{x:0,y:0},samples:[]};
      return;
    }
    if(item?.id.startsWith('ink-')){this.ink=item.color!;this.notify();return;}
    if(this.options.id==='A02'&&item?.id.startsWith('stamp-')){
      this.changeTread(treadShapes[Number(item.id.slice(-1))]);
      return;
    }
    if(item?.id==='paper'){if(this.options.id==='A01')this.storePosterEdit();const colors=['#eef1d6','#f4ddcc','#d9eaf2'];this.paper=colors[(colors.indexOf(this.paper)+1)%colors.length];this.artRevision++;this.saveArt();this.notify();return;}
    if(item?.kind==='road'){
      const index=item.turn!,lesson=roadLessons[this.roadLevel];
      if(lesson.locked.includes(index)||this.roadJourney.length||this.roadWon&&this.roadLevel<roadLessons.length-1){this.showHint();return;}
      this.roadTurns.set(index,{from:this.road[index],at:this.time});this.road[index]=rotateRoad(this.road[index]);
      this.roadStopped=false;this.roadStop=undefined;this.options.feedback('');this.notify();return;
    }
    if(item?.id==='next-road'){this.nextRoad();return;}
    if(item?.id==='next-car'){this.items=this.items.filter(i=>i.id!=='next-car');this.washIndex=1;this.washReady=false;this.createDirt();this.options.feedback('');this.notify();return;}
    if(item?.id==='signal'){
      this.options.speak?.(this.signalGreen?'go':'stop');this.showHint();return;
    }
    if(this.mode==='traffic'&&this.complete)return;
    if(this.mode==='wash'&&(item?.id==='water'||item?.id==='sponge')){this.selectWashTool(item.id);return;}
    if(!item){this.selected=null;this.notify();return;}
    if(this.options.id==='A02'&&item.id==='my-car')this.trackDraft={length:this.paintPoints.length,last:{x:item.x,y:item.y}};
    if(this.mode==='color'&&['red','blue','white'].includes(item.id))this.options.speak?.(item.id);

    if(this.mode==='assembly'&&item.kind==='body'&&item.placed&&this.assemblyStatus().wheels){
      this.options.feedback('先取下装好的车轮，再取车身。');return;
    }
    const wasPlaced=!!item.placed,dock=item.dock;
    this.vacate(item);
    this.grab={id,item,start:{x:p.x,y:p.y},offset:{x:p.x-item.x,y:p.y-item.y},origin:{x:item.x,y:item.y},samples:[{x:item.x,y:item.y,t:now}],wasPlaced,dock};
    if(['motion','rolling'].includes(this.mode))this.grab.companions=this.items.filter(i=>i!==item).map(i=>({item:i,origin:{x:i.x,y:i.y}}));
    if(['motion','rolling','traffic'].includes(this.mode)){this.velocity=0;this.velocities.clear();}
  }
  move(id:number,p:Point,now:number){
    const grab=this.grab;if(!grab||grab.id!==id)return;
    if(grab.washing){this.scrub(grab.start,p);grab.start=p;return;}
    if(this.showroomWheelX!==undefined){
      this.turnShowroomWheel((p.x-this.showroomWheelX)/28);this.showroomWheelX=p.x;return;
    }
    const item=grab.item;if(!item||this.mode==='bridge'&&item.id==='traveller')return;
    item.x=clamp(p.x-grab.offset.x,item.w/2,1000-item.w/2);item.y=clamp(p.y-grab.offset.y,item.h/2,this.height-item.h/2);
    if(['motion','rolling','traffic'].includes(this.mode)){item.y=item.home.y;if(['motion','rolling'].includes(this.mode))for(const other of this.items.filter(i=>i!==item))other.x=item.x;}
    if(this.mode==='traffic'){
      const stop=STOP_LINE-item.w/2-10;
      if(!this.signalGreen&&item.x>=stop){
        item.x=stop;
        if(this.trafficPhase==='red'){
          this.trafficPhase='crossing';this.progress=.25;
          this.options.feedback('红灯。小车停在线前，等行人走过。');this.options.speak?.('stop');
        }
      }else if(this.signalGreen&&item.x>=TRAFFIC_EXIT)item.x=TRAFFIC_EXIT;
    }
    if(this.mode==='help'&&item.id==='help-car'){
      item.y=item.home.y;
      if(this.helpPhase==='stuck')item.x=Math.min(item.x,457);
    }
    if(this.mode==='trip'&&item.id==='trip-car'){item.y=item.home.y;item.x=Math.min(item.x,490);}
    if(this.options.id==='M01'&&item.kind==='car'){
      const barrier=this.targets.find(t=>t.blocked)!;
      if(Math.abs(item.x-barrier.x)<(item.w+barrier.w)*.39&&
        item.y>barrier.y-(item.h+barrier.h)/2&&item.y<barrier.y+(item.h+barrier.h)/2){
        item.y=barrier.y-(item.h+barrier.h)/2;
      }
    }
    if(distance(grab.start,p)>12){this.selected=null;}
    grab.samples.push({x:item.x,y:item.y,t:now});grab.samples=grab.samples.filter(s=>now-s.t<180);
    if(this.trackDraft&&item.id==='my-car'){
      const count=this.paintPoints.length;
      this.trackDraft.last=addTreadMarks(this.paintPoints,this.trackDraft.last,item,this.trackSheet,this.height,this.tread,this.ink);
      if(this.paintPoints.length!==count)this.artRevision++;
    }
    this.notify();
  }
  up(id:number,p:Point,now:number){
    const grab=this.grab;if(!grab||grab.id!==id)return;
    this.grab=null;this.showroomWheelX=undefined; if(grab.washing){this.updateDirt();return;}
    const item=grab.item;if(!item)return;
    if(this.trackDraft&&item.id==='my-car'){
      const {length}=this.trackDraft;this.trackDraft=undefined;
      if(this.paintPoints.length>length){
        this.trackHistory.push(this.paintPoints.slice(0,length));
        if(this.trackHistory.length>24)this.trackHistory.shift();
        this.paintPoints=this.paintPoints.slice(-100);
        this.artRevision++;this.saveArt();
        if(this.paintPoints.length>3)this.finish('用小车沿画纸留下轮纹，记录自由创作参与');
      }
      this.notify();return;
    }
    if(this.mode==='help'&&item.id==='help-car'){
      if(this.helpPhase==='stuck'&&item.x>=450||this.helpPhase==='clear'&&item.x>=810)this.tryHelpCar();
      else this.notify();
      return;
    }
    if(item.id==='trip-car'){
      if(item.x>=480||distance(grab.start,p)<12)this.departTrip();
      else this.notify();
      return;
    }
    if(this.mode==='bridge'&&item.id==='traveller'){
      if(this.bridgePhase==='choose')this.options.feedback('先把桥板放到两个石头支点上。');
      else if(distance(grab.start,p)<12||p.x>grab.start.x+18)this.tryBridge();
      return;
    }
    if(this.usesStencils&&(item.posterShape||item.id.startsWith('stamp-'))){
      if(distance(grab.start,p)<12){
        if(grab.origin)Object.assign(item,grab.origin);
        this.selected=this.selected===item?null:item;this.notify();
      }else this.placePosterStamp(item,{x:item.x,y:item.y},grab.origin);
      return;
    }
    if(distance(grab.start,p)<12&&this.targets.length){
      if(grab.wasPlaced&&grab.dock){item.placed=true;const t=this.targets.find(t=>t.id===grab.dock);if(t)t.occupied=true;}
      this.selected=this.selected===item?null:item;this.notify();return;
    }
    if(['motion','traffic'].includes(this.mode)){
      const v=flickVelocity(grab.samples,now);this.movingItem=item.id;
      if(this.mode==='traffic'){
        if(!this.signalGreen){this.notify();return;}
        if(item.x>=TRAFFIC_EXIT){this.finishTraffic();return;}
        this.velocity=clamp(v.x,0,520);
      }else{
        if(grab.origin&&Math.abs(item.x-grab.origin.x)>35){
          // Release where the finger left the car. A held, stationary car stays still.
          const room=v.x>0?885-item.x:item.x-115;
          const speed=Math.sign(v.x)*Math.min(Math.abs(v.x),650,Math.sqrt(room*780));
          if(Math.abs(speed)>1)this.startTrackRun({x:item.x,speed});
        }
      }
      this.options.feedback('');this.notify();return;
    }
    if(this.mode==='shadow'){if(distance(grab.start,p)>18)this.captureShadow();return;}
    if(this.mode==='story'){
      if(distance(grab.start,p)<12){this.selected=this.selected===item?null:item;this.notify();}
      else if(this.onPoster(item)){item.placed=true;this.addStoryAction(item);}
      else if(grab.origin){Object.assign(item,grab.origin);this.notify();}
      return;
    }
    if(this.mode==='paint'||this.mode==='stand'){
      if(grab.origin)Object.assign(item,grab.origin);
      return;
    }
    const target=this.dropTarget(item);
    if(this.mode==='sequence'){
      if(!target){this.reject(item,grab);return;}
      const other=this.items.find(i=>i!==item&&i.placed&&i.dock===target.id);
      const origin=grab.wasPlaced?this.targets.find(t=>t.id===grab.dock):undefined;
      if(other){
        if(origin){Object.assign(other,{x:origin.x,y:origin.y,dock:origin.id});origin.occupied=true;}
        else Object.assign(other,other.home,{placed:false,dock:undefined});
      }
      Object.assign(item,{x:target.x,y:target.y,placed:true,dock:target.id});
      target.occupied=true;this.selected=null;this.sequencePhase='arrange';
      if(!this.complete)this.progress=this.sequenceOrder().filter(step=>step>=0).length/6;
      this.options.feedback('');this.notify();return;
    }
    if(this.mode==='packing'||this.mode==='trip'||this.mode==='visit'){
      if(!target){this.reject(item,grab);return;}
      this.selected=null;
      if(this.mode==='visit'){this.goVisit(this.targets.indexOf(target));return;}
      item.placed=true;
      const siblings=this.items.filter(i=>i.placed&&i.target===target.id);
      if(this.mode==='packing'){
        for(const [i,gear]of siblings.entries()){gear.x=target.x+(i-(siblings.length-1)/2)*116;gear.y=target.y-this.height*.095;}
      }else if(target.id==='seat'){
        item.x=target.x+30;item.y=target.y+17;target.occupied=true;
        this.options.feedback('咔嗒，安全带扣好了。');
      }else{
        item.x=target.x+(item.id==='water'?-59:65);item.y=target.y+52;
        this.options.feedback('放进背包了。');
      }
      if(this.mode==='trip')this.progress=(Number(this.items.find(i=>i.id==='water')?.placed)+Number(this.items.find(i=>i.id==='belt')?.placed))/3;
      this.pulses.push({x:target.x,y:target.y,at:this.time});
      this.notify();return;
    }
    if(this.mode==='help'){
      if(target)this.askForHelp('card');else this.reject(item,grab);
      return;
    }
    if(this.mode==='helpers'){
      if(!target){
        this.reject(item,grab,undefined,'试试把工具交给需要它的伙伴。看看他们旁边的轮胎、泥点和箱子。');
        return;
      }
      const index=this.targets.indexOf(target);
      Object.assign(item,{x:target.x,y:target.y,placed:true});target.occupied=true;
      this.selected=null;this.helperStarts.set(index,this.time);
      this.options.feedback(['伙伴用扳手检查松动的轮胎。','伙伴用海绵把泥点擦下来了。','伙伴用推车把箱子搬去收纳。'][index]);
      this.notify();return;
    }
    if(this.mode==='assembly'){
      if(target){
        Object.assign(item,{x:target.x,y:target.y,w:target.w,h:target.h,placed:true,dock:target.id});
        target.occupied=true;this.selected=null;
        this.options.feedback('');this.updateAssembly();
      }else if(grab.wasPlaced&&p.y>this.height*.67){
        this.returnAssemblyPart(item);this.updateAssembly();
      }else this.reject(item,grab);
      return;
    }
    if(['M01','M02','M03'].includes(this.options.id)){
      if(!target){
        const where=this.targets.find(t=>inside(p,t,30));
        const message=where?.blocked?'挡板挡住了这个车位，看看旁边的空位。'
          :where?.enabled===false&&item.kind==='car'?'这里还没有车位，拖一块车位板来。'
          :where?.occupied?'这个车位已经有车了，可以找一个空位。'
          :where&&this.options.id==='M03'&&item.id==='car-2'?'长车装不进这格，试试长车位。':undefined;
        this.reject(item,grab,where,message);return;
      }
      Object.assign(item,{x:target.x,y:target.y,placed:true,dock:target.id});
      this.selected=null;this.options.feedback('');
      if(item.kind==='bay'){
        target.enabled=true;
        this.options.feedback('多了一个车位。还有小车在等，开进来试试。');
      }else target.occupied=true;
      this.pulses.push({x:target.x,y:target.y,at:this.time});
      this.updateParking();this.notify();return;
    }
    if(this.mode==='bridge'){
      if(!target){this.reject(item,grab);return;}
      for(const plank of this.items.filter(i=>i.kind==='plank'&&i!==item)){
        Object.assign(plank,plank.home);plank.placed=false;
      }
      item.x=this.bridgeGeometry.left-bridgeBearing+item.w/2;item.y=target.y;item.placed=true;
      this.items[0].x=this.items[0].home.x;
      this.bridgePhase='try';this.options.feedback('桥板放好了。推推小车，看它能不能过去。');this.notify();return;
    }
    if(target){
      const landingFrom={x:item.x,y:item.y};
      if(item.kind==='bay'){target.enabled=true;item.placed=true;item.x=target.x;item.y=target.y;this.notify();return;}
      item.x=target.x;item.y=target.y;target.occupied=true;item.dock=target.id;
      item.placed=true;this.progress=this.items.filter(i=>i.placed&&i.kind!=='bay').length/Math.max(1,this.targets.length);
      this.selected=null;this.options.feedback('');
      if(this.mode==='color'){
        this.seen.add(item.id);this.progress=this.seen.size/this.level.colors.length;
        this.colorArrival={item,at:this.time};
        this.arrivals.set(item.id,{from:landingFrom,at:this.time});this.pulses.push({x:target.x,y:target.y,at:this.time});
        this.notify();return;
      }
      if(this.mode==='pattern'){
        const index=target.id.slice(-1);
        this.item('filled-'+index,'car',target.x,target.y,225,105,{carId:item.carId,placed:true});
        Object.assign(item,item.home,{placed:false,dock:undefined});
        const filled=this.targets.filter(t=>t.occupied).length;
        this.progress=(this.paradeRound+filled/this.targets.length)*.5;
        this.pulses.push({x:target.x,y:target.y,at:this.time});
        if(filled===this.targets.length){this.paradePhase='driving';this.options.feedback('排好了，看看你的车队出发。');}
        this.notify();return;
      }
      if(this.mode==='sorting'){
        const filled=this.items.filter(i=>i.placed).length;
        if(!this.complete)this.progress=(Number(this.sortingPhase==='lengths')+filled/3)*.5;
        this.arrivals.set(item.id,{from:landingFrom,at:this.time});
        this.pulses.push({x:target.x,y:target.y,at:this.time});
        if(filled===3&&this.sortingPhase==='colors'){
          this.sortingPhase='next';this.options.feedback('颜色分好了。换一张挂牌，再整理一次。');
        }else if(filled===3)this.finish('对同一组车辆先按颜色、再按可见的车身长短分类');
        this.notify();return;
      }
      const all=['parking','spaces','sorting'].includes(this.mode)?this.items.filter(i=>i.kind==='car').every(i=>i.placed):this.targets.every(t=>t.occupied);
      this.arrivals.set(item.id,{from:landingFrom,at:this.time});this.pulses.push({x:target.x,y:target.y,at:this.time});
      if(all)this.finish(this.mode==='parking'?`直接操作完成 M01：${this.level.parkingCars===1?'一':'两'}辆小车实际停进车位`:`直接操作完成 ${this.options.id}：物体实际到达目标位置`);
    }else{this.reject(item,grab);}
    this.notify();
  }
  cancel(pointerId?:number){
    const grab=this.grab;
    if(!grab||(pointerId!==undefined&&pointerId!==grab.id))return;
    if(grab.item&&grab.origin){grab.item.x=grab.origin.x;grab.item.y=grab.origin.y;if(grab.wasPlaced&&grab.dock){grab.item.placed=true;const target=this.targets.find(t=>t.id===grab.dock);if(target)target.occupied=true;}}
    for(const companion of grab.companions||[])Object.assign(companion.item,companion.origin);
    if(this.trackDraft){this.paintPoints.length=this.trackDraft.length;this.trackDraft=undefined;this.artRevision++;}
    this.grab=null;this.showroomWheelX=undefined;this.velocity=0;this.notify();
  }
  keyboard(key:string){
    if(!this.ready||this.destroyed||this.guideStep!==null||this.standView||this.storyReplay)return;
    if(this.mode==='rolling'){
      if(key==='ArrowUp')this.predictRolling('ball');
      if(key==='ArrowDown')this.predictRolling('cube');
      if(key==='Enter'||key===' '){
        if(this.rollingPhase==='release')this.releaseRolling();
        else if(this.rollingPhase==='compare')this.nextRolling();
      }
      return;
    }
    if(['Enter',' '].includes(key)&&this.mode==='parts'){
      if(this.complete&&this.options.id!=='E02'||this.grab)return;
      const car=getCar(this.options.carId)!;
      const point=this.requiredParts().find(p=>!this.seen.has(p.id)&&hitDifficultyPart(car,this.items[0],p,this.options.difficulty)===p.id);
      // Use the same authored hit region and pointer action as a direct tap.
      if(point)this.down(-1,point,performance.now());
      else if(this.options.id==='E02')this.touchPart('wheel');
      return;
    }
    if(['Enter',' '].includes(key)&&this.mode==='wash'){
      if(this.complete||this.grab)return;
      const now=performance.now();
      if(this.washReady){
        // Handover is a separate key press, just as tapping the waiting car.
        const next=this.items.find(i=>i.id==='next-car');
        if(next)this.down(-1,next,now);
        return;
      }
      const dirty=this.keyboardWashPatch();if(!dirty)return;
      const {x,y}=dirty,rect=this.carRect();
      const point=(pixelX:number)=>({x:rect.x-rect.w/2+pixelX/1000*rect.w,y:rect.y-rect.h/2+y/450*rect.h});
      const from=point(Math.max(0,x-45)),to=point(Math.min(999,x+45));
      // One genuine dirt-mask stroke per activation. Existing coverage and
      // two-car completion rules decide progress; no synthetic completion.
      this.down(-1,from,now);this.move(-1,to,now+100);this.up(-1,to,now+100);
      return;
    }
    if((key==='Enter'||key===' ')&&!this.grab){
      if(this.mode==='motion'&&this.motionResults.length){if(this.trackOrder)this.repeatPush();else this.swapTracks();return;}
      if(this.mode==='help'&&!this.selected){this.tryHelpCar();return;}
      if(this.mode==='road'&&!this.selected){if(this.roadWon&&this.roadLevel<roadLessons.length-1)this.nextRoad();else this.tryRoad();return;}
      if(this.mode==='assembly'&&!this.selected){this.tryAssembly();return;}
      if(this.mode==='pattern'&&this.paradePhase==='next'){this.nextParade();return;}
      if(this.mode==='sorting'&&this.sortingPhase==='next'){this.nextSorting();return;}
      if(this.mode==='packing'&&!this.selected){if(this.rainResult)this.resetRain();else this.testRain();return;}
      if(this.mode==='trip'&&!this.selected){this.departTrip();return;}
      if(this.mode==='visit'&&this.visitLocation!==null){if(this.visitRevealed)this.showVisitMap();else this.discoverVisit();return;}
      if(this.mode==='sequence'&&!this.selected){this.playSequence();return;}
      if(this.mode==='sequence'&&this.selected){
        const item=this.selected,target=this.targets.find(t=>!t.occupied)||this.targets[(this.targets.findIndex(t=>t.id===item.dock)+1)%this.targets.length];
        if(target){const now=performance.now();this.down(-1,item,now);this.move(-1,target,now+100);this.up(-1,target,now+100);}
        return;
      }
      if(this.mode==='color'){
        if(!this.selected){this.hearStageCar();return;}
        const item=this.selected,target=this.targets[0],now=performance.now();
        if(target){this.down(-1,item,now);this.move(-1,target,now+100);this.up(-1,target,now+100);}
        return;
      }
      if(this.selected&&['packing','trip','visit'].includes(this.mode)){
        const selected=this.selected,target=this.targets.find(t=>this.compatible(selected,t));
        if(target){const now=performance.now();this.down(-1,selected,now);this.move(-1,target,now+100);this.up(-1,target,now+100);return;}
      }
    }
    if(this.usesStencils&&(key==='Enter'||key===' ')&&!this.grab&&this.selected?.id.startsWith('stamp-')){
      const count=this.posterMarks().length;
      this.placePosterStamp(this.selected,{x:160+(count%4)*225,y:this.height*(.34+Math.floor(count%12/4)*.16)});
      return;
    }
    if(this.mode==='story'&&(key==='Enter'||key===' ')&&!this.grab&&this.selected&&!this.storyReplay){
      if(this.selected.id==='story-door'){if(!this.storyDoorOpen)this.addStoryAction(this.selected);}
      else {const item=this.selected;Object.assign(item,{x:280+(this.storyActions.length%3)*220,y:this.height*.48,placed:true});this.addStoryAction(item);}
      return;
    }
    if(this.mode==='bridge'&&(key==='Enter'||key===' ')&&!this.grab){
      if(this.bridgePhase==='crossed'){this.nextBridgeReach();return;}
      const plank=this.selected;
      if(plank?.id==='bridge-shed')this.openBridgeShed();
      else if(plank?.kind==='plank'){
        const target=this.targets[0],now=performance.now();
        this.down(-1,plank,now);this.move(-1,target,now+50);this.up(-1,target,now+50);
      }else this.tryBridge();
      return;
    }
    if(this.mode==='traffic'&&(key==='Enter'||key===' ')&&!this.grab){
      if(this.trafficPhase==='crossing'||this.complete)return;
      const car=this.items[0],now=performance.now(),to={x:this.signalGreen?TRAFFIC_EXIT:STOP_LINE,y:car.y};
      this.down(-1,car,now);this.move(-1,to,now+50);this.up(-1,to,now+50);return;
    }
    const candidates=this.items.filter(i=>!i.decorative&&i.available!==false&&(!i.placed||['sequence','story'].includes(this.mode)||this.options.id==='M03'&&i.kind==='car'));
    if(key==='['||key===']'){
      this.cancel();const index=this.selected?candidates.indexOf(this.selected):-1;
      this.selected=candidates.length?candidates[(index+(key===']'?1:index<0?0:-1)+candidates.length)%candidates.length]:null;
      this.notify();return;
    }
    if(key==='Escape'){this.cancel();this.selected=null;this.notify();return;}
    const item=this.grab?.item||(this.selected&&candidates.includes(this.selected)?this.selected:null)||candidates.find(i=>i.kind!=='prop')||candidates[0];
    if(!item)return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)){
      if(!this.grab)this.down(-1,{x:item.x,y:item.y},performance.now());
      this.move(-1,{x:item.x+(key==='ArrowLeft'?-35:key==='ArrowRight'?35:0),y:item.y+(key==='ArrowUp'?-35:key==='ArrowDown'?35:0)},performance.now());
    }else if(key==='Enter'||key===' '){
      if(this.grab)this.up(-1,{x:item.x,y:item.y},performance.now());
      else if(this.mode==='motion'||this.mode==='rolling'||this.options.id==='A02'&&item.id==='my-car'){
        const now=performance.now(),to={x:item.x+(this.options.id==='A02'?(item.x>690?-170:170):100),y:item.y},from={x:item.x,y:item.y};
        this.down(-1,from,now);this.move(-1,to,now+100);this.up(-1,to,now+100);
      }
      else this.down(-1,{x:item.x,y:item.y},performance.now());
    }
  }
  private round(r:Rect,radius=20){this.ctx.beginPath();this.ctx.roundRect(r.x-r.w/2,r.y-r.h/2,r.w,r.h,radius);}
  private glyph(glyph:string,x:number,y:number,size=85,c=this.ctx){if(drawPlaySymbol(c,glyph,x,y,size))return;c.font=`${size}px system-ui,sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText(glyph,x,y);}
  private sprite(carId:string,r:Rect,top=false,opacity=1,c=this.ctx){
    const image=this.images.get(`${carId}/${top?'top':'side'}`);if(!image)return;
    c.save();c.globalAlpha=opacity;c.drawImage(image,r.x-r.w/2,r.y-r.h/2,r.w,r.h);c.restore();
  }
  private parkingTargetArt(target:Target,held:Item|null){
    const c=this.ctx;
    if(target.construction&&target.enabled===false){
      c.fillStyle='#d5ae7574';c.strokeStyle='#e8c6969c';c.lineWidth=5;
      this.round(target,18);c.fill();c.stroke();
    }else{
      this.sceneArtwork!.drawLayer(c,'bay',target);
      if(target.occupied){
        c.fillStyle='#82b588';c.beginPath();c.arc(target.x+target.w*.35,target.y-target.h*.36,10,0,Math.PI*2);c.fill();
      }
    }
    if(target.blocked){
      this.sceneArtwork!.drawLayer(c,'barrier',{...target,w:target.w*.91,h:target.h*.54});
    }
    if(target.color){
      const sign={x:target.x,y:target.y-target.h*.56,w:76,h:38};
      c.fillStyle=target.color;c.strokeStyle='#f5eace';c.lineWidth=5;this.round(sign,9);c.fill();c.stroke();
    }
    if(target.long||target.sizeTier!==undefined){
      const bar=target.long?target.w*.7:92+target.sizeTier!*51,y=target.y-target.h*.59;
      c.strokeStyle='#ffedba';c.lineWidth=7;c.beginPath();c.moveTo(target.x-bar/2,y);c.lineTo(target.x+bar/2,y);
      for(const side of [-1,1]){const x=target.x+side*bar/2;c.moveTo(x,y-10);c.lineTo(x,y+10);}
      c.stroke();
    }
    if(held&&this.compatible(held,target)){
      c.strokeStyle='#fff0ae';c.lineWidth=7;
      this.round({...target,w:target.w+9,h:target.h+9},22);c.stroke();
    }
  }
  private drawRainCard(){
    const c=this.ctx,H=this.height,paper={x:500,y:H*.525,w:275,h:79};
    c.fillStyle=this.rainResult==='wet'?'#9bb9bf':'#f8edd0';this.round(paper,13);c.fill();
    c.strokeStyle='#a38f6c';c.lineWidth=4;this.round(paper,13);c.stroke();
    const time=this.rainTime;
    if(time===null&&this.rainResult!=='wet')return;
    const covered=this.items.some(item=>item.placed&&['pack-0','pack-1'].includes(item.id));
    c.strokeStyle='#5596af';c.lineWidth=7;
    for(let i=0;i<14;i++){
      const x=400+i*16,y=time===null?paper.y-17+(i*29%28):H*.26+((time+i*.09)%1)*H*(covered?.13:.26);
      c.beginPath();c.moveTo(x,y);c.lineTo(x-6,y+13);c.stroke();
    }
  }
  private background(){
    const c=this.ctx,H=this.height;
    if(this.sceneArtwork){
      if(this.mode==='visit'){
        this.sceneArtwork.drawBackdrop(c,H,[],[],[431,1020],[H*.30,H*.79]);
        if(this.visitLocation!==null){
          c.fillStyle='#574e3981';c.fillRect(0,0,1000,H);
          this.sceneArtwork.drawLayer(c,destinationArtwork[this.visitLocation],{x:500,y:H*.405,w:845,h:H*.584});
        }
        return;
      }
      if(this.mode==='trip'){
        this.sceneArtwork.drawBackdrop(c,H,[810],[650],[454,729,1090],[H*.34,H*.57,H*.80]);
        const open=this.tripPhase==='driving'||this.tripPhase==='arrived';
        c.save();c.translate(650,H*.8);c.rotate(open?-.26:Math.PI/2);
        this.sceneArtwork.drawLayer(c,'gate',{x:0,y:0,w:H*.146,h:22});c.restore();
        return;
      }
      if(this.mode==='sequence'){
        this.sceneArtwork.drawBackdrop(c,H,[],[],[448,706,1131],[H*.245,H*.51,H*.79]);
        if(this.sequenceScene===1){
          c.fillStyle='#5295aa68';c.fillRect(69,H*.196,860,H*.099);
        }
        if(this.sequenceIndex>=0&&this.sequenceIndex<3){
          const target=this.targets[this.sequenceIndex];
          c.strokeStyle=this.sequencePhase==='blocked'?'#eb916e':'#fff0ac';c.lineWidth=8;
          this.round({...target,w:target.w+12,h:target.h+13},16);c.stroke();
        }
        for(const step of this.sequenceEffects){
          this.glyph('sparkle',200+step*290,H*.135,52);
          if(this.sequenceScene===1&&step===2){
            c.strokeStyle='#81c1db';c.lineWidth=6;
            for(let i=0;i<13;i++){
              const x=564+i*31,y=H*(.18+(i*9%19)/100);
              c.beginPath();c.moveTo(x,y);c.lineTo(x-9,y+18);c.stroke();
            }
          }
        }
        return;
      }
      if(this.mode==='story'){
        this.sceneArtwork.drawBackdrop(c,H,[],[],[1110],[H*.84],this.storyAct===1?'garden':undefined);
        if(this.storyAct===0&&this.storyDoorOpen){
          c.fillStyle='#ffdc8b65';c.beginPath();c.moveTo(773,H*.42);
          c.lineTo(884,H*.52);c.lineTo(659,H*.65);c.closePath();c.fill();
        }
        return;
      }
      if(this.mode==='road'){
        this.sceneArtwork.drawBackdrop(c,H,[],[],[642],[H*.5]);return;
      }
      if(this.options.id==='E02'||this.mode==='stand'){
        this.sceneArtwork.drawBackdrop(c,H,[],[],[688,1174],[H*.51,H*.83]);return;
      }
      if(this.mode==='help'||this.mode==='helpers'){
        this.sceneArtwork.drawBackdrop(c,H,[],[],[652,1127],[H*.51,H*.80]);return;
      }
      if(this.mode==='packing'){
        this.sceneArtwork.drawBackdrop(c,H,[],[],[726,1125],[H*.525,H*.81]);
        this.drawRainCard();return;
      }
      if(['parking','spaces','sorting'].includes(this.mode)){
        this.sceneArtwork.drawBackdrop(c,H,[],[],[620],[H*.445]);
        return;
      }
      if(this.mode==='pattern'){
        this.sceneArtwork.drawBackdrop(c,H,[],[],[425,807,1126],[H*.255,H*.52,H*.84]);
        this.sceneArtwork.drawLayer(c,'gate',{x:934,y:H*.445,w:105,h:H*.18});
        if(this.paradePhase!=='building'){
          c.fillStyle='#c8e887';c.beginPath();c.arc(936,H*.36,14,0,Math.PI*2);c.fill();
        }
        return;
      }
      if(this.mode==='assembly'){
        const railY=Math.min(H*.765,H*.4+212);
        this.sceneArtwork.drawBackdrop(c,H,[],[],[563,877],[H*.4,railY]);
        this.sceneArtwork.drawLayer(c,'flag',{x:841,y:railY-H*.04,w:69,h:H*.091});
        return;
      }
      if(this.options.id==='T01'){
        this.sceneArtwork.drawBackdrop(c,H,[],[],[],[]);
        return;
      }
      if(this.mode==='rolling'){
        this.sceneArtwork.drawBackdrop(c,H,[32,1092],[25,975],[569,908],[H*.34,H*.65]);
        for(const y of [H*.34,H*.65]){
          if(this.rollingRound===1){
            c.fillStyle='#b38b6277';this.round({x:500,y,w:927,h:H*.132},19);c.fill();
            c.fillStyle='#80664699';
            for(let i=0;i<48;i++){c.beginPath();c.arc(55+i*19,y-H*.047+(i*19%64)*H/6800,2.8,0,Math.PI*2);c.fill();}
          }
          if(this.rollingPhase==='predict'||this.rollingPhase==='release'){
            this.sceneArtwork.drawLayer(c,'gate',{x:255,y,w:45,h:H*.163});
          }
        }
        for(const [index,stop]of this.rollingStops.entries()){
          c.strokeStyle=index===0?'#fff2b9':'#d47e58';c.lineWidth=8;
          for(const [x,y]of [[stop.ball,H*.34],[stop.cube,H*.65]]){
            c.beginPath();c.moveTo(x,y-H*.065);c.lineTo(x,y+H*.065);c.stroke();
          }
        }
        return;
      }
      if(this.options.id==='A02'){
        this.sceneArtwork.drawBackdrop(c,H,[48,1070],[40,960],[390,991],[H*.26,H*.74]);
        return;
      }
      if(this.mode==='wash'){
        this.sceneArtwork.drawBackdrop(c,H,[340,645],[350,600],[670,1160],[H*.4,H*.84]);
        return;
      }
      if(this.mode==='color'){
        this.sceneArtwork.drawBackdrop(c,H,[],[],[626],[H*.46]);
        const stage=this.targets[0],color=stage.color||CREAM;
        this.sceneArtwork.drawLayer(c,'stage',{x:stage.x,y:stage.y+H*.017,w:498,h:H*.23});
        const lampY=H*.169;
        c.fillStyle=color+(this.colorArrival?'a8':'5e');
        c.beginPath();c.moveTo(stage.x-14,lampY);c.lineTo(stage.x+14,lampY);
        c.lineTo(stage.x+211,stage.y+H*.069);c.lineTo(stage.x-211,stage.y+H*.069);c.closePath();c.fill();
        this.sceneArtwork.drawLayer(c,'spotlight',{x:stage.x,y:lampY,w:133,h:H*.17});
        c.fillStyle=color;c.beginPath();c.ellipse(stage.x,lampY-H*.017,31,H*.028,0,0,Math.PI*2);c.fill();
        if(this.colorArrival)this.glyph('sparkle',stage.x+197,stage.y-58,64);
        return;
      }
      if(this.mode==='motion'){
        this.sceneArtwork.drawBackdrop(c,H,[38,1080],[30,970],[523,885],[H*.34,H*.65]);
        for(const [lane,ratio]of [.34,.65].entries()){
          const y=H*ratio;
          this.sceneArtwork.drawLayer(c,this.isRoughLane(lane)?'rough':'smooth',{x:500,y,w:929,h:H*.152});
          c.strokeStyle='#fff2c7';c.lineWidth=5;
          c.beginPath();c.moveTo(180,y-H*.06);c.lineTo(180,y+H*.06);c.stroke();
          for(const [run,stop]of this.motionResults.entries()){
            const x=lane?stop.lower:stop.upper;
            c.fillStyle=run?'#f2a07a':'#f9efba';c.beginPath();c.roundRect(x-7,y+H*.047,14,H*.028,5);c.fill();
          }
        }
        return;
      }
      if(this.mode==='shadow'){
        this.sceneArtwork.drawBackdrop(c,H,[],[],[337,1052],[H*.22,H*.76]);
        return;
      }
      if(this.options.id==='A01'){
        this.sceneArtwork.drawBackdrop(c,H,[38,1084],[40,960],[344,990],[H*.26,H*.73]);
        return;
      }
      if(this.mode==='traffic'){
        this.sceneArtwork.drawBackdrop(c,H,[592,735],[STOP_LINE,CROSSING_X],[719],[H*.54]);
        const p=this.trafficCrossing;
        this.sceneArtwork.drawLayer(c,'pedestrian',{...p,w:103,h:150});
        return;
      }
      if(this.mode==='bridge'){
        const {left,right,blocked}=this.bridgeGeometry,y=H*.44;
        this.sceneArtwork.drawBackdrop(c,H,bridgeRiverX,[left,right],[bridgeLaneY],[y]);
        if(blocked){
          c.strokeStyle='#fff2a0';c.lineWidth=9;
          this.round({x:right+22,y,w:58,h:H*.19},12);c.stroke();
        }
        return;
      }
    }
    const sky=c.createLinearGradient(0,0,0,H);sky.addColorStop(0,SKY);sky.addColorStop(1,'#e9e5cf');c.fillStyle=sky;c.fillRect(0,0,1000,H);
    const ground=c.createLinearGradient(0,H*.32,0,H);ground.addColorStop(0,GRASS);ground.addColorStop(1,'#bfceac');c.fillStyle=ground;c.fillRect(0,H*.32,1000,H*.68);
    if(['parking','spaces','sorting','motion','traffic','visit','rolling','road'].includes(this.mode)){
      const road=c.createLinearGradient(0,H*.2,0,H*.9);road.addColorStop(0,ASPHALT);road.addColorStop(1,'#637d76');c.fillStyle=road;this.round({x:500,y:H*.52,w:980,h:H*.73},40);c.fill();c.strokeStyle='#a6b5a5';c.lineWidth=3;c.stroke();
      c.strokeStyle='#efe9c8';c.lineWidth=5;c.setLineDash([35,25]);c.beginPath();c.moveTo(25,H*.43);c.lineTo(975,H*.43);c.stroke();c.setLineDash([]);
      if(this.rough){c.fillStyle='#b99e79';c.fillRect(0,H*.47,1000,H*.16);c.fillStyle='#84765f';for(let i=0;i<150;i++){c.beginPath();c.ellipse(i*73%1000,H*.48+(i*31%(H*.14)),5,3,0,0,Math.PI*2);c.fill();}}
    }else if(['assembly','helpers','sequence','paint','story','trip','help'].includes(this.mode)){
      const wood=c.createLinearGradient(0,H*.3,0,H);wood.addColorStop(0,'#efd8ae');wood.addColorStop(1,'#d9b786');c.fillStyle=this.mode==='paint'?this.paper:wood;this.round({x:500,y:H*.6,w:970,h:H*.68},35);c.fill();
    }else if(this.mode==='wash'){
      c.fillStyle='#c3dfdc';c.fillRect(0,H*.16,1000,H*.56);c.fillStyle='#a1c3bd';for(let x=0;x<1000;x+=100)c.fillRect(x,H*.67,4,30);
      c.strokeStyle='#d9eff0';c.lineWidth=3;for(let y=H*.2;y<H*.65;y+=70){c.beginPath();c.moveTo(0,y);c.lineTo(1000,y);c.stroke();}
      c.strokeStyle='#80aaa1';c.lineWidth=22;c.beginPath();c.moveTo(28,H*.64);c.lineTo(28,H*.17);c.quadraticCurveTo(28,H*.11,95,H*.11);c.lineTo(905,H*.11);c.quadraticCurveTo(972,H*.11,972,H*.17);c.lineTo(972,H*.64);c.stroke();
      this.glyph('🫧',150,100,60);this.glyph('🫧',850,115,75);
    }else if(this.mode==='bridge'){
      const {left,right,blocked}=this.bridgeGeometry,y=H*.44;
      const water=c.createLinearGradient(left,0,right,0);water.addColorStop(0,'#90c8be');water.addColorStop(.5,'#6db0bc');water.addColorStop(1,'#93c8bf');
      c.fillStyle=water;c.beginPath();c.moveTo(left-55,0);c.quadraticCurveTo(left-120,H*.3,left,H*.44);c.quadraticCurveTo(left+65,H*.6,left+18,H*.69);
      c.lineTo(right+18,H*.69);c.quadraticCurveTo(right+65,H*.6,right,H*.44);c.quadraticCurveTo(right-120,H*.3,right-55,0);c.closePath();c.fill();
      c.strokeStyle='#d2eee1';c.lineWidth=5;for(let row=H*.06;row<H*.66;row+=H*.085){c.beginPath();c.moveTo(455,row);c.quadraticCurveTo(486,row+14,520,row);c.stroke();}
      c.fillStyle='#e2c79a';c.fillRect(0,y-H*.081,left,H*.162);c.fillRect(right,y-H*.081,1000-right,H*.162);
      for(const x of [left,right]){const stone={x,y,w:32,h:H*.185};c.fillStyle='#6c8275';this.round(stone,9);c.fill();
        if(blocked&&x===right){c.strokeStyle='#fff1a5';c.lineWidth=10;this.round({...stone,w:stone.w+18,h:stone.h+16},11);c.stroke();}}
      this.glyph('home',865,H*.22,115);
      this.glyph('tree',142,H*.25,112);
      this.glyph('tree',910,H*.64,96);
    }
    if(this.mode==='motion'||this.mode==='rolling'){
      for(const [index,y]of [H*.34,H*.65].entries()){const rough=this.mode==='motion'&&this.isRoughLane(index);c.fillStyle=rough?'#c9ac83':'#a0b5bc';this.round({x:500,y,w:980,h:150},35);c.fill();
        if(rough){c.fillStyle='#907455';for(let i=0;i<140;i++){c.beginPath();c.arc(20+i*73%960,y-60+(i*37%120),4,0,Math.PI*2);c.fill();}}
        c.strokeStyle='#fffcdf';c.lineWidth=5;c.beginPath();c.moveTo(180,y-70);c.lineTo(180,y+70);c.stroke();
        for(const [run,stop]of this.motionResults.entries()){
          const x=index?stop.lower:stop.upper;
          c.fillStyle=run?'#d98760':'#ffe6a0';c.beginPath();c.roundRect(x-7,y+45,14,35,6);c.fill();
        }
      }
    }
    c.save();c.strokeStyle='#f8f4df';c.lineWidth=8;this.round({x:500,y:H*.5,w:984,h:H-16},32);c.stroke();c.restore();
    if(this.mode==='help'){
      const path={x:500,y:H*.51,w:962,h:H*.215};c.fillStyle='#849a91';this.round(path,25);c.fill();
      c.strokeStyle='#eee5be';c.lineWidth=4;c.setLineDash([18,12]);c.beginPath();c.moveTo(37,path.y);c.lineTo(965,path.y);c.stroke();c.setLineDash([]);
      this.glyph('garage',863,H*.29,156);
    }
    if(this.mode==='packing'){
      const window={x:500,y:H*.32,w:690,h:H*.47};
      c.fillStyle='#eaf1e6';c.strokeStyle='#a6b6a8';c.lineWidth=15;this.round(window,35);c.fill();c.stroke();
      c.fillStyle='#c0d8d1';c.fillRect(180,H*.515,640,17);
      this.drawRainCard();
    }
    if(this.mode==='trip'){
      this.glyph('sun',125,H*.135,120);this.glyph('tree',865,H*.135,120);
      const y=H*.8;
      c.fillStyle='#90a49b';this.round({x:500,y,w:958,h:H*.21},28);c.fill();
      const open=this.tripPhase==='driving'||this.tripPhase==='arrived';
      c.strokeStyle=open?'#78a47a':'#995a4a';c.lineWidth=19;c.lineCap='round';
      c.beginPath();c.moveTo(650,y-H*.077);c.lineTo(open?755:650,open?y-H*.13:y+H*.075);c.stroke();
      this.glyph('flag',884,y-H*.115,84);
    }
    if(this.mode==='visit'&&this.visitLocation!==null){
      const place=visitPlaces[this.visitLocation];
      c.fillStyle=['#bbd0a4','#ddc59d','#b8c9c4'][this.visitLocation];
      this.round({x:500,y:H*.42,w:896,h:H*.63},34);c.fill();
      for(const x of [150,850])this.glyph(place.glyph,x,H*.19,118);
      if(this.visitRevealed)this.glyph('sparkle',800,H*.25,60);
    }
    if(this.mode==='sequence'){
      const y=H*.24,doorsShut=this.sequenceEffects.includes(0),beltOrPark=this.sequenceEffects.includes(1);
      c.fillStyle='#a6b9b0';this.round({x:500,y,w:922,h:H*.24},26);c.fill();
      this.glyph(doorsShut?'sparkle':'garage',170,H*.105,70);
      this.glyph(beltOrPark?'sparkle':this.sequenceScene===0?'belt':'flag',430,H*.105,66);
      this.glyph(this.sequenceScene===0?'tree':this.sequenceEffects.includes(2)?'shower':'rain',840,H*.13,130);
      if(this.sequenceIndex>=0&&this.sequenceIndex<3){
        const t=this.targets[this.sequenceIndex];c.strokeStyle=this.sequencePhase==='blocked'?'#c6715b':'#f2d587';c.lineWidth=13;
        this.round({...t,w:t.w+16,h:t.h+16},25);c.stroke();
      }
    }
    if(this.mode==='color'){
      const stage=this.targets[0],top=H*.13,y=H*.4,color=stage.color||'#f5ead1';
      c.fillStyle='#aec3b6';this.round({x:500,y,w:924,h:H*.46},32);c.fill();
      c.fillStyle='#728d89';this.round({x:stage.x,y:stage.y+56,w:stage.w+90,h:132},41);c.fill();
      c.fillStyle=color+(this.colorArrival?'a2':'4f');c.beginPath();c.moveTo(stage.x-40,top);
      c.lineTo(stage.x+40,top);c.lineTo(stage.x+218,stage.y+96);c.lineTo(stage.x-218,stage.y+96);c.closePath();c.fill();
      c.fillStyle=color;c.beginPath();c.roundRect(stage.x-54,top-13,108,38,12);c.fill();
      if(this.colorArrival)this.glyph('sparkle',stage.x+206,stage.y-68,70);
    }
    if(this.options.id==='E02'){
      c.fillStyle='#acc3b6';this.round({x:500,y:H*.50,w:940,h:H*.52},46);c.fill();
      c.fillStyle='#91aba3';this.round({x:500,y:H*.59,w:936,h:H*.24},43);c.fill();
      for(const x of [160,500,840])this.glyph('light',x,H*.19,64);
    }
    if(this.mode==='assembly'){
      const y=H*.4+212,x=811;
      c.strokeStyle='#9aab8c';c.lineWidth=11;c.beginPath();c.moveTo(95,y);c.lineTo(960,y);c.stroke();
      c.strokeStyle='#fff1d2';c.lineWidth=5;c.beginPath();c.moveTo(x,y-23);c.lineTo(x,y+17);c.stroke();
      this.glyph('flag',x+12,y+13,72);
    }
    if(this.mode==='pattern'){
      for(const row of [.255,.52]){
        const y=H*row;
        c.fillStyle='#a9b9a6';this.round({x:500,y,w:956,h:H*.205},27);c.fill();
        c.lineWidth=6;c.strokeStyle='#f4e3ac';c.setLineDash([17,13]);c.beginPath();c.moveTo(921,y-H*.085);c.lineTo(921,y+H*.085);c.stroke();c.setLineDash([]);
        for(const x of [45,940]){c.fillStyle=this.paradePhase==='building'?'#d3af79':'#ddeb94';c.beginPath();c.arc(x,y-H*.072,13,0,Math.PI*2);c.fill();}
      }
    }
    if(this.mode==='rolling'){
      for(const y of [H*.34,H*.65]){
        if(this.rollingPhase==='predict'||this.rollingPhase==='release'){
          c.fillStyle='#936b50';this.round({x:210,y,w:25,h:142},9);c.fill();
        }
        if(this.rollingRound===1){
          c.fillStyle='#9f7957';for(let n=0;n<47;n++)c.fillRect(255+n*15,y-58+(n*29%116),5,5);
        }
      }
      for(const [index,stop]of this.rollingStops.entries()){
        c.strokeStyle=index===0?'#f1e8c7':'#d38b64';c.lineWidth=7;
        for(const [x,y]of [[stop.ball,H*.34],[stop.cube,H*.65]]){
          c.beginPath();c.moveTo(x,y-76);c.lineTo(x,y+77);c.stroke();
        }
      }
    }
    if(this.options.id==='M02'){
      c.fillStyle='#90a49a';this.round({x:500,y:H*.22,w:941,h:H*.22},33);c.fill();
      for(const car of this.items.filter(i=>i.kind==='car'&&!i.placed&&i!==this.grab?.item))
        this.glyph('arrow',car.x,H*.385,53);
    }
    if(this.mode==='traffic'){
      c.fillStyle='#e0cc9e';c.fillRect(603,H*.24,114,H*.54);
      c.fillStyle='#708583';c.fillRect(603,H*.375,114,H*.3);
      c.fillStyle='#fff4d8';c.fillRect(STOP_LINE,H*.405,10,H*.27);
      for(let n=0;n<6;n++)c.fillRect(614,H*(.399+n*.046),92,H*.022);
      const p=this.trafficCrossing;
      this.glyph('friend',p.x,p.y,105);
    }
    if(this.mode==='packing'){this.glyph('🌧️',820,100,110);if(this.seen.has('pack-0'))this.glyph('☂️',720,H*.48,150);if(this.seen.has('pack-1'))this.glyph('🧥',720,H*.63,120);}
    if(this.mode==='trip'){this.glyph('☀️',150,80,90);this.glyph('🌳',850,80,90);}
    if(this.mode==='sequence'){c.strokeStyle='#92724c';c.lineWidth=5;for(let i=0;i<2;i++){c.beginPath();c.moveTo(310+i*320,H*.51);c.lineTo(365+i*320,H*.51);c.lineTo(350+i*320,H*.51-12);c.stroke();}}

  }
  draw(seconds:number){
    if(this.destroyed)return;
    this.guideTime+=seconds;if(this.guideStep!==null)seconds=0;
    this.time+=seconds;const c=this.ctx,H=this.height;c.clearRect(0,0,1000,H);this.background();
    if(!this.ready){this.glyph('🛞',500,H*.45,100);return;}
    if(this.guideStep===null){
    if(this.correction){const r=this.correction,phase=clamp((this.time-r.at-(this.mode==='bridge'?.9:.08))/.28,0,1),ease=1-(1-phase)**3;r.item.x=r.from.x+(r.to.x-r.from.x)*ease;r.item.y=r.from.y+(r.to.y-r.from.y)*ease;if(phase===1){this.correction=null;this.options.feedback('');}}
    if(this.mode==='rolling')this.advanceRolling(seconds);
    if(this.mode==='motion')this.advanceTrackRun(seconds);
    if(this.mode==='packing')this.advanceRain();
    if(this.mode==='trip')this.advanceTrip(seconds);
    if(this.mode==='sequence')this.advanceSequence(seconds);
    if(this.mode==='story')this.advanceStory();
    if(this.mode==='color')this.advanceColorStage();
    if(this.mode==='bridge')this.advanceBridge(seconds);
    if(this.mode==='pattern')this.animateParade(seconds);
    if(this.mode==='traffic')this.advanceTraffic(seconds);
    if(this.mode==='assembly')this.animateAssembly(seconds);
    if(this.mode==='helpers')this.animateHelpers();
    if(this.mode==='help')this.animateHelp();
    if(this.velocity&&!this.grab){
      const runner=this.items.find(i=>i.id===this.movingItem);
      if(runner){const next=coast(runner.x,this.velocity,seconds,this.rough?430:160,runner.w/2,1000-runner.w/2);runner.x=next.x;this.velocity=next.velocity;this.rolling+=seconds*this.velocity*.02;
        if(this.mode==='traffic'&&runner.x>=TRAFFIC_EXIT){runner.x=TRAFFIC_EXIT;this.finishTraffic();}
      }
    }
    if(this.mode==='road')this.animateRoad(seconds);
    if(this.tilt&&!this.grab&&this.mode==='motion'&&!this.velocities.size&&!this.motionResults.length){
      for(const runner of this.items)runner.x=clamp(runner.x+this.tilt*seconds*9,140,860);this.seen.add('tilted');
    }
    }
    if(this.mode==='shadow'){
      const {lampX,lampY}=this.currentShadow,previous=this.previousShadow;
      const drawShadow=(sample:{lampX:number;lampY:number},color:string)=>{
        c.fillStyle=color;c.save();c.translate(500+(500-sample.lampX)*.57,H*.69);
        c.rotate((500-sample.lampX)/1750);
        c.beginPath();c.ellipse(0,0,101+sample.lampY*201,22,0,0,Math.PI*2);c.fill();c.restore();
      };
      if(!this.sceneArtwork){
        this.glyph('tree',238,H*.78,123);
        c.strokeStyle='#f8e8b0';c.lineWidth=7;c.beginPath();c.moveTo(698,H*.76);c.lineTo(872,H*.76);c.stroke();
      }
      if(previous)drawShadow(previous,this.sceneArtwork?'#58668b62':'#65786938');
      drawShadow({lampX,lampY},this.sceneArtwork?'#29384a99':'#354c3b73');
      c.fillStyle='#ffe57e4b';c.beginPath();c.moveTo(lampX,lampY*H);c.lineTo(730,H*.65);c.lineTo(280,H*.65);c.fill();
    }
    const held=this.grab?.item||this.selected,near=held&&this.dropTarget(held);
    for(const target of this.targets){
      if(target.enabled===false&&!target.construction||this.mode==='bridge'&&this.bridgePhase!=='choose'&&!held)continue;
      if(this.mode==='assembly'&&(target.id==='body'||!this.targets[0].occupied))continue;
      if(this.mode==='visit'&&this.sceneArtwork){
        const index=Number(target.id.slice(-1));
        this.sceneArtwork.drawLayer(c,destinationArtwork[index],{...target,w:target.w*.91,h:target.h});
        if(this.visitedPlaces.has(index))this.glyph('sparkle',target.x+target.w*.34,target.y+target.h*.32,50);
        if(near===target){c.strokeStyle='#fff1b8';c.lineWidth=6;this.round(target,17);c.stroke();}
        continue;
      }
      if(this.sceneArtwork&&['trip','sequence'].includes(this.mode)){
        if(this.mode==='sequence'&&!target.occupied)this.glyph(target.glyph!,target.x,target.y,66);
        if(held&&this.compatible(held,target)){
          c.strokeStyle='#fff0ad';c.lineWidth=7;this.round(target,18);c.stroke();
        }
        continue;
      }
      if(this.sceneArtwork&&['parking','spaces','sorting'].includes(this.mode)){
        this.parkingTargetArt(target,held);continue;
      }
      if(this.sceneArtwork&&this.mode==='pattern'){
        if(!target.occupied){
          c.strokeStyle=held&&this.compatible(held,target)?'#fceaba':'#fff3d680';c.lineWidth=6;
          const edges=[target.x-target.w*.45,target.x+target.w*.45];
          c.beginPath();
          for(const x of edges){c.moveTo(x,target.y-target.h*.24);c.lineTo(x,target.y+target.h*.24);}
          c.stroke();
        }
        continue;
      }
      if(this.mode==='color'&&this.sceneArtwork){
        if(held&&this.compatible(held,target)){
          c.strokeStyle='#fff0ae';c.lineWidth=7;
          this.round({...target,y:target.y-H*.004,w:433,h:H*.142},36);c.stroke();
        }
        continue;
      }
      if(this.mode==='bridge'&&this.sceneArtwork){
        if(held?.kind==='plank'){
          const {left,right}=this.bridgeGeometry;
          c.strokeStyle=near===target?'#fff3b6':'#f6ca73';c.lineWidth=8;
          for(const x of [left-21,right+22]){this.round({x,y:target.y,w:51,h:H*.18},11);c.stroke();}
        }
        continue;
      }
      c.save();c.strokeStyle=target.color||'#6d8b7b';c.fillStyle=target.color?target.color+'55':'#fff8df55';c.lineWidth=7;c.setLineDash(target.occupied?[]:[18,10]);
      if(this.mode==='assembly'){c.beginPath();c.arc(target.x,target.y,target.w/2,0,Math.PI*2);c.stroke();}
      else{this.round(target,20);c.fill();c.stroke();}
      c.setLineDash([]);
      if(target.construction&&target.enabled===false){
        c.fillStyle='#dbbc8d';c.strokeStyle='#ead4a5';this.round(target,20);c.fill();c.stroke();
        this.glyph('tool',target.x,target.y,65);
      }
      if(target.blocked){
        c.strokeStyle='#774639';c.lineWidth=18;c.beginPath();c.moveTo(target.x-target.w*.4,target.y);c.lineTo(target.x+target.w*.4,target.y);c.stroke();
        for(const sign of [-1,1]){
          const x=target.x+sign*target.w*.34;
          c.fillStyle='#e09161';c.beginPath();c.moveTo(x-24,target.y+15);c.lineTo(x+24,target.y+15);c.lineTo(x,target.y-36);c.closePath();c.fill();
          c.fillStyle='#fff2d5';c.fillRect(x-13,target.y-6,26,8);
        }
      }
      if(target.sizeTier!==undefined){
        const bar=94+target.sizeTier*54,y=target.y-target.h*.68;
        c.fillStyle='#e8d2a2';this.round({x:target.x,y,w:bar+25,h:32},12);c.fill();
        c.strokeStyle='#47665d';c.lineWidth=6;c.beginPath();
        c.moveTo(target.x-bar/2,y);c.lineTo(target.x+bar/2,y);
        for(const side of [-1,1]){const x=target.x+side*bar/2;c.moveTo(x,y-8);c.lineTo(x,y+8);}
        c.stroke();
      }
      if(target.long&&!target.occupied)this.glyph('arrow',target.x,target.y,83);
      if(target.glyph)this.glyph(target.glyph,target.x,target.y,Math.min(100,target.h*.55));c.restore();
      if(held&&this.compatible(held,target)){
        c.save();c.strokeStyle=near===target?'#347858':'#e8bd59';c.lineWidth=near===target?12:6;
        if(this.mode==='assembly'){c.beginPath();c.arc(target.x,target.y,target.w/2+9,0,Math.PI*2);c.stroke();}
        else{this.round({...target,w:target.w+14,h:target.h+14},25);c.stroke();}
        if(near===target)this.glyph('sparkle',target.x+target.w*.42,target.y-target.h*.5,42);c.restore();
      }
    }
    if(['wash','assembly'].includes(this.mode)){
      const r=this.carRect();
      if(this.mode==='assembly'&&this.body){c.save();c.globalAlpha=.13;c.drawImage(this.body,r.x-r.w/2,r.y-r.h/2,r.w,r.h);c.restore();}
      else this.sprite(this.washIndex===1?'CAR11':this.options.carId,r);
      if(this.mode==='wash'&&this.mask)c.drawImage(this.mask,r.x-r.w/2,r.y-r.h/2,r.w,r.h);
      if(this.mode==='wash'&&this.grab?.washing){for(let i=0;i<9;i++){c.fillStyle='#eefaffbb';c.beginPath();c.arc(this.grab.start.x+Math.sin(this.time*2+i)*40,this.grab.start.y+Math.cos(this.time*2+i)*25,8+i%4*3,0,Math.PI*2);c.fill();}}
    }
    if(this.options.id==='A01'){
      if(this.sceneArtwork){
        if(this.paper!=='#eef1d6'){
          c.fillStyle=this.paper+'9c';c.fillRect(44,H*.264,912,H*.462);
        }
      }else{
        c.fillStyle=this.paper;c.strokeStyle='#e5d4ad';c.lineWidth=7;this.round({x:500,y:H*.49,w:922,h:H*.47},28);c.fill();c.stroke();
        c.fillStyle='#d9c19844';this.round({x:500,y:H*.85,w:805,h:140},33);c.fill();
      }
    }
    if(this.mode==='stand'){
      if(this.sceneArtwork){
        if(this.paper!==standScenes[0]||this.standView){
          c.fillStyle=this.paper+(this.standView?'51':'68');this.round({x:508,y:H*.51,w:886,h:H*.318},66);c.fill();
        }
      }else{
        c.fillStyle=this.paper;this.round({x:500,y:H*.50,w:926,h:H*.62},42);c.fill();
        c.fillStyle=this.standView?'#a59b89':'#b5a58e';this.round({x:506,y:H*.57,w:this.standView?890:696,h:H*.22},68);c.fill();
        c.strokeStyle='#f0dfb4';c.lineWidth=7;this.round({x:506,y:H*.57,w:this.standView?885:691,h:H*.215},66);c.stroke();
      }
    }
    if(this.mode==='story'&&!this.sceneArtwork){
      c.fillStyle=this.storyAct===0?'#b8cba3':'#c7bacf';this.round({x:500,y:H*.49,w:930,h:H*.49},26);c.fill();
      c.fillStyle=this.storyAct===0?'#bcad91':'#d6b8a1';this.round({x:500,y:H*.624,w:880,h:H*.14},28);c.fill();
      if(this.storyAct===0&&this.storyDoorOpen){
        c.fillStyle='#fff1b5';c.beginPath();c.moveTo(760,H*.43);c.lineTo(897,H*.53);c.lineTo(658,H*.60);c.lineTo(736,H*.45);c.closePath();c.fill();
      }
    }
    if(this.options.id==='A02'){
      if(this.sceneArtwork){
        if(this.paper!=='#eef1d6'){c.fillStyle=this.paper+'9c';c.fillRect(43,H*.264,914,H*.472);}
      }else{
        c.fillStyle=this.paper;this.round(this.trackSheet,22);c.fill();c.strokeStyle='#dac59e';c.lineWidth=5;c.stroke();
      }
      for(const mark of this.paintPoints)paintMark(c,mark,1000,H,.52);
    }
    const orderedItems=['road','bridge'].includes(this.mode)?[...this.items.filter(i=>i.kind!=='car').sort((a,b)=>Number(b.id==='bridge-shed')-Number(a.id==='bridge-shed')),...this.items.filter(i=>i.kind==='car')]:this.items;
    const renderItems=this.grab?.item?[...orderedItems.filter(i=>i!==this.grab!.item),this.grab.item]:orderedItems;
    for(const item of renderItems){
      if(item.available===false||item.kind==='bay'&&item.placed||this.standView&&item.id.startsWith('stamp-'))continue;
      c.save();c.shadowColor='#304d3926';c.shadowBlur=9;c.shadowOffsetY=6;
      if(item===this.grab?.item){
        c.save();c.fillStyle='#304f4933';c.beginPath();c.ellipse(item.x,item.y+item.h*.4,item.w*.44,item.h*.23,0,0,Math.PI*2);c.fill();c.restore();
        c.translate(item.x,item.y);if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)c.scale(1.03,1.03);c.translate(-item.x,-item.y);
      }
      const arrival=this.arrivals.get(item.id),reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if(arrival){const phase=clamp((this.time-arrival.at)/.24,0,1);if(phase===1)this.arrivals.delete(item.id);else if(!reduced){const rest=(1-phase)**3;c.translate((arrival.from.x-item.x)*rest,(arrival.from.y-item.y)*rest);}}
      if(item.kind==='car')this.sprite(item.carId||this.options.carId,item,['parking','spaces','sorting','road','visit','bridge'].includes(this.mode)||this.mode==='traffic'&&!!this.sceneArtwork);
      else if(item.kind==='body'&&this.body){
        if(item.placed&&this.assemblyWobble){
          c.translate(item.x,item.y);c.rotate(this.assemblyWobble);c.translate(-item.x,-item.y);
        }
        c.drawImage(this.body,item.x-item.w/2,item.y-item.h/2,item.w,item.h);
      }
      else if(item.kind==='wheel'){
        const index=Number(item.id.split('-')[1]),p=this.wheelPoints[index],image=this.images.get(`${this.options.carId}/side`);
        if(image){c.beginPath();c.arc(item.x,item.y,item.w/2,0,Math.PI*2);c.clip();if(item.placed&&['testing','done'].includes(this.assemblyPhase)){c.translate(item.x,item.y);c.rotate(this.rolling);c.translate(-item.x,-item.y);}const sourceSize=p.r*2000;c.drawImage(image,p.x*image.width-p.r*image.width,p.y*image.height-p.r*image.width,sourceSize/1000*image.width,sourceSize/1000*image.width,item.x-item.w/2,item.y-item.h/2,item.w,item.h);}
      }else if(item.id==='bridge-shed'){
        if(this.sceneArtwork){
          if(this.bridgeShedClosed)this.sceneArtwork.drawLayer(c,'shutter',item);
        }else{
          c.fillStyle=this.bridgeShedClosed?'#bb8661':'#5c4d41';this.round(item,20);c.fill();
          if(this.bridgeShedClosed){c.fillStyle='#efcf9a';this.round({x:item.x,y:item.y,w:90,h:24},10);c.fill();}
        }
      }else if(item.kind==='plank'){
        if(this.sceneArtwork)this.sceneArtwork.drawLayer(c,'plank',item);
        else{
          c.fillStyle='#c28b4d';this.round(item,8);c.fill();c.strokeStyle='#8c5d35';c.lineWidth=4;
          for(let y=item.y-item.h/2+20;y<item.y+item.h/2;y+=25){c.beginPath();c.moveTo(item.x-item.w/2+12,y);c.lineTo(item.x+item.w/2-12,y);c.stroke();}
        }
      }
      else if(item.kind==='road'){
        const animation=this.roadTurns.get(item.turn!),phase=animation?clamp((this.time-animation.at)/.25,0,1):1;
        const animate=animation&&phase<1&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const shape=animate?animation.from:this.road[item.turn!],halfW=item.w/2,halfH=item.h/2;
        if(this.sceneArtwork){
          const turns:Record<RoadShape,number>={LR:0,UD:1,LU:0,UR:1,RD:2,DL:3};
          const angle=(turns[shape]+(animate?phase:0))*Math.PI/2;
          c.translate(item.x,item.y);c.rotate(angle);c.translate(-item.x,-item.y);
          this.sceneArtwork.drawLayer(c,shape==='LR'||shape==='UD'?'straight':'bend',item);
        }else{
          c.fillStyle='#adc58e';this.round(item,13);c.fill();c.strokeStyle='#6a7c81';c.lineWidth=Math.min(item.w,item.h)*.52;c.lineCap='butt';
          if(animate){c.translate(item.x,item.y);c.rotate(Math.PI/2*phase);c.translate(-item.x,-item.y);}
          for(const direction of shape){c.beginPath();c.moveTo(item.x,item.y);c.lineTo(item.x+(direction==='R'?halfW:direction==='L'?-halfW:0),item.y+(direction==='D'?halfH:direction==='U'?-halfH:0));c.stroke();}
        }
      }else if(item.kind==='bay'){
        if(this.sceneArtwork)this.sceneArtwork.drawLayer(c,'spare',item);
        else{c.strokeStyle=CREAM;c.lineWidth=8;this.round(item,12);c.stroke();this.glyph('🅿️',item.x,item.y,65);}
      }else if(item.kind==='shape'){
        if(this.mode==='rolling'&&this.sceneArtwork){
          if(item.id==='runner'){
            c.translate(item.x,item.y);c.rotate((item.x-item.home.x)/(item.w/2));c.translate(-item.x,-item.y);
          }
          this.sceneArtwork.drawLayer(c,item.id==='runner'?'ball':'cube',item);
        }else{
          c.fillStyle=item.color||'#e5b34e';if(item.glyph==='●'){c.beginPath();c.arc(item.x,item.y,item.w/2,0,Math.PI*2);c.fill();c.strokeStyle=CREAM;c.lineWidth=9;c.save();c.translate(item.x,item.y);c.rotate(item.x/55);c.beginPath();c.moveTo(-item.w*.35,0);c.lineTo(item.w*.35,0);c.stroke();c.restore();}else{this.round(item,8);c.fill();}
        }
      }else if(item.glyph==='belt')this.glyph('belt',item.x,item.y,Math.min(item.w,item.h)*.72);
      else if(this.mode==='wash'&&(item.id==='water'||item.id==='sponge')){
        if(item.id===this.washTool&&!this.washReady){
          const plate={...item,w:142,h:97};c.fillStyle='#eff7de';c.strokeStyle='#719e89';c.lineWidth=6;
          this.round(plate,24);c.fill();c.stroke();
        }
        if(this.sceneArtwork){
          const shower=item.id==='water';
          this.sceneArtwork.drawLayer(c,shower?'shower':'sponge',{...item,w:shower?142:153,h:shower?136:108});
        }else this.glyph(item.glyph!,item.x,item.y,85);
      }
      else if(item.id==='lamp'&&this.mode==='shadow'&&this.sceneArtwork){
        const angle=Math.atan2(item.x-500,Math.max(100,H*.65-item.y));
        c.translate(item.x,item.y);c.rotate(angle);c.translate(-item.x,-item.y);
        this.sceneArtwork.drawLayer(c,'lamp',{...item,w:118,h:171});
      }
      else if(item.id.startsWith('ink-')){
        const illustrated=['A01','A02'].includes(this.options.id)&&this.sceneArtwork;
        c.fillStyle=item.color!;c.beginPath();c.arc(item.x,item.y,illustrated?66:45,0,Math.PI*2);
        if(!illustrated)c.fill();
        if(this.ink===item.color){c.strokeStyle=CREAM;c.lineWidth=8;c.stroke();}
      }
      else if(item.id==='paper'){
        if(!['A01','A02'].includes(this.options.id)||!this.sceneArtwork){c.fillStyle=this.paper;c.strokeStyle='#587465';c.lineWidth=7;this.round(item,12);c.fill();c.stroke();}
      }
      else if(item.posterShape){
        if(this.mode==='stand'){
          if(item.glyph==='lamp'){c.fillStyle='#fff1b66a';c.beginPath();c.moveTo(item.x,item.y);c.lineTo(item.x-143,item.y+180);c.lineTo(item.x+143,item.y+180);c.closePath();c.fill();}
          if(this.sceneArtwork)this.sceneArtwork.drawLayer(c,item.glyph!,item);
          else this.glyph(item.glyph!,item.x,item.y,126);
        }else if(!this.drawPosterSticker(c,item,item.posterShape,item.color)){
          paintMark(c,{x:item.x/1000,y:item.y/H,color:item.color!,shape:item.posterShape},1000,H,1.65);
        }
      }
      else if(this.mode==='stand'&&this.sceneArtwork&&item.id.startsWith('stamp-')){
        this.sceneArtwork.drawLayer(c,item.glyph!,{...item,w:146,h:167});
      }
      else if(this.mode==='help'&&item.id==='help-partner'&&this.sceneArtwork){
        this.sceneArtwork.drawLayer(c,'partner',{...item,w:101,h:158});
      }
      else if(this.mode==='helpers'&&item.id.startsWith('tool-')&&this.sceneArtwork){
        const index=Number(item.id.slice(-1));
        this.sceneArtwork.drawLayer(c,['wrench','sponge','cart'][index],{...item,w:[166,135,145][index],h:[73,92,136][index]});
      }
      else if(this.mode==='packing'&&this.sceneArtwork){
        if(item.id==='rain-switch')this.sceneArtwork.drawLayer(c,'cloud',{...item,w:244,h:139});
        else if(item.id.startsWith('pack-')){
          const index=Number(item.id.slice(-1));
          const scale=item.placed?.76:1;
          this.sceneArtwork.drawLayer(c,['umbrella','coat','cap','bottle'][index],{...item,w:[165,171,153,96][index]*scale,h:[173,185,149,174][index]*scale});
        }
      }
      else if(this.mode==='trip'&&item.kind==='prop'&&this.sceneArtwork){
        const variant=item.id==='water'?'bottle':item.id as 'hat'|'belt';
        const dimensions={bottle:[79,143],hat:[162,112],belt:[159,110]}[variant];
        this.sceneArtwork.drawLayer(c,variant,{...item,w:dimensions[0],h:dimensions[1]});
      }
      else if(this.mode==='sequence'&&item.id.startsWith('step-')&&this.sceneArtwork){
        const step=Number(item.id.slice(-1));
        const variant=(this.sequenceScene===0?['door','belt','flag']:['door','flag','shower'])[step];
        this.sceneArtwork.drawLayer(c,variant,{...item,w:151,h:139});
      }
      else if(this.mode==='story'&&this.sceneArtwork&&item.id==='story-door'){
        if(this.storyDoorOpen){
          c.translate(item.x,item.y);c.rotate(.24);c.translate(-item.x+25,-item.y);
        }
        this.sceneArtwork.drawLayer(c,'door',{...item,w:166,h:201});
      }
      else if(this.mode==='story'&&this.sceneArtwork&&['tree','friend','star','book'].includes(item.glyph||'')){
        this.sceneArtwork.drawLayer(c,item.glyph!,{...item,w:146,h:158});
      }
      else if(this.mode==='visit'&&item.id==='exhibit'&&item.glyph==='book'&&this.sceneArtwork){
        this.sceneArtwork.drawLayer(c,'book',{...item,w:189,h:134});
      }
      else if(this.mode==='paint'&&item.id.startsWith('stamp-')){
        if(this.options.id==='A02'&&this.sceneArtwork){
          const tread=treadShapes[Number(item.id.slice(-1))];
          if(this.tread===tread){
            c.strokeStyle='#fff0b7';c.lineWidth=8;this.round({...item,w:169,h:169},42);c.stroke();
          }
          this.sceneArtwork.drawLayer(c,tread,{...item,w:153,h:153});
          c.restore();continue;
        }
        const shape=posterStamps[Number(item.id.slice(-1))].shape;
        if(!this.drawPosterSticker(c,item,shape,item===this.grab?.item?this.ink:undefined)){
          paintMark(c,{x:item.x/1000,y:item.y/H,color:item.color||this.ink,shape},1000,H,this.options.id==='A01'?1.7:1);
        }
      }
      else if(item.id==='signal'){
        if(this.sceneArtwork){
          this.sceneArtwork.drawLayer(c,'signal',item);
          if(this.signalGreen){
            c.fillStyle='#352e25';c.beginPath();c.ellipse(item.x+2,item.y-item.h*.235,item.w*.229,item.h*.119,0,0,Math.PI*2);c.fill();
            const y=item.y+item.h*.059,r=item.w*.26,green=c.createRadialGradient(item.x-4,y-5,2,item.x,y,r);
            green.addColorStop(0,'#dcff99');green.addColorStop(.55,'#72c55d');green.addColorStop(1,'#297545');
            c.fillStyle=green;c.beginPath();c.ellipse(item.x+2,y,item.w*.224,item.h*.095,0,0,Math.PI*2);c.fill();
          }
        }else{
          c.fillStyle='#354f53';this.round(item,25);c.fill();
          for(const [i,color]of ['#d86358','#71a96d'].entries()){
            c.fillStyle=(i===1)===this.signalGreen?color:'#617071';c.beginPath();c.arc(item.x,item.y-55+i*110,42,0,Math.PI*2);c.fill();
          }
        }
      }
      else this.glyph(item.glyph||'⭐',item.x,item.y,Math.min(item.w,item.h)*.72);
      c.restore();
    }
    if(this.mode==='road'){
      const lesson=roadLessons[this.roadLevel],first=this.items.find(i=>i.id==='road-0')!,last=this.items.find(i=>i.id===`road-${lesson.end}`)!;
      this.glyph('🏠',first.x,first.y-first.h*.6,75);this.glyph('🌳',last.x,last.y+last.h*.6,85);
      if(this.roadStopPoint)this.glyph('stop',this.roadStopPoint.x,this.roadStopPoint.y,66);
      for(const n of lesson.locked){const item=this.items.find(i=>i.id===`road-${n}`)!;c.strokeStyle='#506c47';c.lineWidth=9;this.round(item,12);c.stroke();}
    }
    if(this.mode==='helpers'){
      for(const [index,target]of this.targets.entries()){
        const t=this.helperProgress(index),runner=this.items.find(i=>i.id==='tool-'+index)!;
        const x=target.x+(index===2?-38:0),y=H*(.23+Math.sin(t*Math.PI)*.06);
        if(this.sceneArtwork)this.sceneArtwork.drawLayer(c,'partner',{x,y,w:101,h:156});
        else this.glyph('friend',x,y,132);
        if(index===0){
          c.save();c.translate(target.x,target.y-15);c.rotate(Math.sin(t*Math.PI*4)*.27);
          this.glyph('wheel',0,0,108);c.restore();
          if(t===1)this.glyph('sparkle',target.x+74,target.y-45,47);
        }else if(index===1){
          for(const [i,x]of [-78,-22,45,86].entries())if(t<(i+1)/5){
            c.fillStyle='#765137';c.beginPath();c.ellipse(target.x+x,target.y+((i%2)*2-1)*12,23,15,i,0,Math.PI*2);c.fill();
          }
          if(t>0&&t<1)this.glyph('bubbles',runner.x,runner.y-52,64);
          if(t===1)this.glyph('sparkle',target.x+75,target.y-49,47);
        }else{
          this.glyph('box',t>0?runner.x:target.x,t>0?runner.y-48:target.y-15,88);
          if(t===1)this.glyph('sparkle',runner.x+68,runner.y-65,47);
        }
      }
    }
    if(this.mode==='help'){
      const x=640,y=H*(.51-this.helpEffect*.23);
      if(this.sceneArtwork)this.sceneArtwork.drawLayer(c,'barrier',{x,y,w:37,h:164});
      else{
        c.fillStyle='#b35f47';this.round({x,y,w:39,h:151},9);c.fill();
        for(const offset of [-45,0,45]){c.fillStyle='#fff0cf';c.fillRect(x-16,y+offset,32,10);}
      }
      if(this.helpPhase==='clear'||this.helpPhase==='done')this.glyph('sparkle',795,H*.39,70);
    }
    if(this.mode==='trip'&&!this.sceneArtwork&&this.targets.find(t=>t.id==='seat')?.occupied){c.strokeStyle='#3f7181';c.lineWidth=20;c.beginPath();c.moveTo(650,H*.27);c.lineTo(830,H*.51);c.stroke();this.glyph('✓',740,H*.4,90);}
    if(this.mode==='wash'){
      const waiting=this.items.find(i=>i.id==='next-car');
      if(waiting&&!this.washReady)this.glyph('⌛',waiting.x,waiting.y-80,45);
      if(this.sceneArtwork){
        if(this.washIndex===1)this.sprite(this.options.carId,{x:850,y:H*.84,w:198,h:94});
      }else{
        if(this.cleanCars>0)this.sprite(this.options.carId,{x:170,y:100,w:220,h:99});
        if(this.cleanCars===2)this.sprite('CAR11',{x:830,y:100,w:220,h:99});
      }
    }
    if(this.options.id==='T01'){
      const at=this.workshopAction,tire=this.workshopEffect('wheel'),door=this.workshopEffect('door');
      if(tire>0&&tire<1){
        c.strokeStyle='#8aa99a';c.lineWidth=5;c.setLineDash([35,22]);c.lineDashOffset=tire*100;
        c.beginPath();c.moveTo(110,H*.68);c.lineTo(910,H*.68);c.stroke();c.setLineDash([]);c.lineDashOffset=0;
      }
      if(at==='wheel'){
        if(this.sceneArtwork)this.sceneArtwork.drawLayer(c,'flag',{x:914,y:H*.27,w:112,h:138});
        else this.glyph('flag',900,H*.27,106);
      }
      if(at==='door'||door>0&&door<1){
        const x=165+door*230,y=H*(.24+door*.13);
        if(this.sceneArtwork)this.sceneArtwork.drawLayer(c,'passenger',{x,y,w:133,h:182});
        else this.glyph('friend',x,y,132);
      }
      if(at==='light'||at==='done'&&this.seen.has('light')){
        if(!this.sceneArtwork){
          c.fillStyle=this.seen.has('light')?'#d6b574':'#4c655e';
          c.beginPath();c.roundRect(861,H*.23,114,H*.52,28);c.fill();
        }
        if(this.seen.has('light')){
          c.fillStyle='#ffe5a880';c.beginPath();c.moveTo(845,H*.47);c.lineTo(970,H*.33);c.lineTo(970,H*.67);c.closePath();c.fill();
        }else if(!this.sceneArtwork)this.glyph('moon',916,H*.33,57);
      }
    }
    if(this.mode==='parts'){
      for(const part of partRegions(getCar(this.options.carId)!,this.items[0])){if(!this.seen.has(part.id))continue;
        c.strokeStyle=part.id==='light'?'#ffdd68':'#fffcdf';c.lineWidth=5;c.beginPath();c.ellipse(part.x,part.y,part.rx,part.ry,0,0,Math.PI*2);c.stroke();
        const age=this.time-(this.partPulses.get(part.id)??-10),motion=!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if(part.id==='wheel'&&age<1.3){c.save();c.translate(part.x,part.y);c.rotate(motion?Math.min(1,age/1.3)*Math.PI*3:0);c.beginPath();c.moveTo(-part.rx*.65,0);c.lineTo(part.rx*.65,0);c.moveTo(0,-part.ry*.65);c.lineTo(0,part.ry*.65);c.stroke();c.restore();}
        if(part.id==='light'&&age<1.2){c.fillStyle='#fff4a466';c.beginPath();c.moveTo(part.x,part.y);c.lineTo(995,part.y-60);c.lineTo(995,part.y+50);c.fill();}
        if(this.options.id==='E02'&&part.id==='wheel'){
          c.save();c.translate(part.x,part.y);c.rotate(this.showroomWheelTurn);
          c.strokeStyle='#fff3c5';c.lineWidth=5;c.beginPath();c.moveTo(-part.rx*.66,0);c.lineTo(part.rx*.66,0);
          c.moveTo(0,-part.ry*.66);c.lineTo(0,part.ry*.66);c.stroke();c.restore();
        }
        if(this.options.id==='E02'&&part.id==='door'&&this.showroomDoor){
          const door={x:part.x,y:part.y,w:part.rx*1.66,h:part.ry*1.65};
          c.fillStyle='#4e605d';this.round(door,12);c.fill();
          this.glyph('seat',door.x+8,door.y,Math.min(100,door.h));
          c.fillStyle='#7d9a98';c.beginPath();c.moveTo(door.x-door.w/2,door.y-door.h/2);c.lineTo(door.x-door.w*.84,door.y-door.h*.05);
          c.lineTo(door.x-door.w*.78,door.y+door.h*.62);c.lineTo(door.x-door.w/2,door.y+door.h/2);c.closePath();c.fill();
        }
        if(this.options.id==='E02'&&part.id==='light'&&this.showroomLights){
          c.fillStyle='#ffec9677';c.beginPath();c.moveTo(part.x,part.y);c.lineTo(995,part.y-48);
          c.lineTo(995,part.y+105);c.closePath();c.fill();
        }
      }
    }
    if(this.selected){c.strokeStyle='#e69c3a';c.lineWidth=8;this.round({...this.selected,w:this.selected.w+25,h:this.selected.h+25},24);c.stroke();}
    const needsHint=!this.complete&&this.guideStep===null&&this.time<this.hintUntil;
    if(needsHint&&!this.grab){
      let first=this.selected||this.items.find(i=>!i.placed&&this.targets.some(t=>this.compatible(i,t)))||this.items.find(i=>!i.placed&&!i.id.startsWith('ink-')&&i.id!=='paper');
      let destination=first&&this.targets.find(t=>this.compatible(first!,t));
      if(this.mode==='road')first=this.roadWon?this.items.find(i=>i.id==='next-road'):this.items.find(i=>i.kind==='road'&&!roadLessons[this.roadLevel].locked.includes(i.turn!)&&this.road[i.turn!]!==roadLessons[this.roadLevel].solution[i.turn!]);
      if(this.mode==='traffic')first=this.items.find(i=>i.id===(this.trafficPhase==='crossing'?'signal':'runner'));
      if(this.mode==='wash'&&this.washReady)first=this.items.find(i=>i.id==='next-car');
      const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches,phase=reduced?0:Math.min(1,(this.time%3)/1.8);
      let cue=this.mode==='wash'&&!this.washReady?{x:420+(reduced?0:Math.sin(this.time*2)*140),y:H*.4}:first&&destination?{x:first.x+(destination.x-first.x)*phase,y:first.y+(destination.y-first.y)*phase}:first||{x:500,y:H*.5};
      if(first&&(['motion','rolling'].includes(this.mode)||this.mode==='traffic'&&this.trafficPhase!=='crossing'))cue={x:first.x+(reduced?0:phase*140),y:first.y};
      if(this.mode==='parts'){const regions=this.requiredParts();cue=regions.find(p=>!this.seen.has(p.id))||regions[0];}
      if(destination){c.strokeStyle='#e5a34d';c.lineWidth=8;c.globalAlpha=.7;this.round({...destination,w:destination.w+15,h:destination.h+15},25);c.stroke();c.globalAlpha=1;}
      this.glyph('👆',cue.x+25,cue.y+35,70);
    }
    if(this.correction?.target){const target=this.correction.target;c.strokeStyle='#e6a14c';c.lineWidth=10;this.round({...target,w:target.w+20,h:target.h+20},24);c.stroke();
    }
    if(this.complete&&['parking','spaces','sorting'].includes(this.mode)){for(const t of this.targets.filter(t=>t.occupied))this.glyph('home',t.x,t.y-t.h*.82,65);}
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.pulses=this.pulses.filter(p=>this.time-p.at<.7);
    for(const p of this.pulses){const phase=(this.time-p.at)/.7;c.save();c.globalAlpha=1-phase;c.strokeStyle='#e8bc5a';c.lineWidth=7;c.beginPath();c.arc(p.x,p.y,reduced?55:45+phase*60,0,Math.PI*2);c.stroke();this.glyph('sparkle',p.x+65,p.y-55,45,c);c.restore();}
    if(this.complete){const age=this.time-this.completedAt;if(age<1.4){for(const side of [-1,1]){const phase=Math.min(1,age/1.4);c.save();c.globalAlpha=1-phase;this.glyph('sparkle',500+side*(reduced?180:100+phase*260),H*.3-(reduced?0:phase*90),55+phase*20,c);c.restore();}}}
    if(this.guideStep!==null){this.guideBase.getContext('2d')!.clearRect(0,0,1000,H);this.guideBase.getContext('2d')!.drawImage(this.canvas,0,0);this.guideOverlay(c,this.guideStep,reduced?1:Math.min(1,this.guideTime/1.4));}
    if(this.time-this.notifyAt>.2){this.notifyAt=this.time;this.notify();}
  }
}
