import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {paintMark} from '../visual/paint-mark';
import {drawPlaySymbol,symbolName} from '../visual/play-symbols';
import {makePlayProp,toyBox,toyMaterial} from './play-props';
import type {TouchBoard,BoardSnapshot} from '../game/TouchBoard';
import {assetUrl} from '../domain/content';
import {loadImage} from '../services/load-image';
import {vehicleModel} from '../domain/vehicle-models';
import {loadPlayVehicle,type PlayVehicle} from './play-model';
import {disposeModel} from './model';
import {isVehicleLampName} from './part-names';
import {StaticBackdrop} from './static-backdrop';
import {withinPartRange} from '../domain/play-difficulty';

type Item=TouchBoard['items'][number];
type Actor={group:T.Group;model?:T.Group;sourceCar?:string;wheels:T.Group[];x:number;z:number;yaw:number;scale:number;bounds?:T.Box3;light?:(T.MeshStandardMaterial|T.MeshPhongMaterial)[]};
type Surface='paper'|'wood'|'water'|'turf'|'road'|'sand'|'mint'|'stone'|'coral';
type SurfaceMesh=T.Mesh<T.BufferGeometry,T.MeshPhongMaterial>;
const UNIT=.02;
const colors={ink:'#365653',cream:'#fff5da',green:'#8eb987',road:'#7c9899',water:'#8dccdf',wood:'#c99562'};
const material=toyMaterial;
const block=toyBox;
function ball(r:number,color:string){const m=new T.Mesh(new T.SphereGeometry(r,16,10),material(color));m.castShadow=true;return m;}
function add(parent:T.Object3D,object:T.Object3D,x=0,y=0,z=0){object.position.set(x,y,z);parent.add(object);return object;}

/** The gameplay surface contains real meshes; its ray plane represents the floor,
 * never a textured vehicle billboard. TouchBoard remains the shared rule engine. */
export class TouchWorldRenderer{
 readonly renderer:T.WebGLRenderer;
 readonly camera=new T.PerspectiveCamera(37,1,.1,180);
 readonly scene=new T.Scene();
 private actors=new Map<string,Actor>();
 private templates=new Map<string,PlayVehicle>();
 private targets=new Map<string,T.Group>();
 private retired=new T.Group();
 private scenery=new T.Group();
 private backdrop?:StaticBackdrop;
 private bridgeScenery=new T.Group();
 private bridgeSceneryKey='';
 private bridgeStone?:T.Mesh;
 private trafficPerson?:T.Group;
 private crossingScenery=new T.Group();
 private crossingHeight=0;
 private posterSheet?:T.Mesh;
 private posterHeight=0;
 private roadStopMarker?:T.Group;
 private helpBarrier?:T.Group;
 private helperActors?:{partner:T.Group;cargo:T.Group;mark:T.Group}[];
 private helperStations=new T.Group();
 private repairTasks?:{goal:T.Group;passenger:T.Group;exit:T.Group;beam:T.Mesh};
 private dirt=new T.Group();
 private tracks=new T.Group();
 private treadCanvas?:HTMLCanvasElement;
 private treadTexture?:T.CanvasTexture;
 private treadHeight=0;
 private selection=new T.Mesh(new T.RingGeometry(.85,1,40),new T.MeshBasicMaterial({color:'#efb44e',transparent:true,opacity:.85,depthWrite:false,side:T.DoubleSide}));
 private markRevision=-1;
 private surfaceCarIndex=0;
 private shadow?:T.Group;
 private shadowPrevious?:T.Group;
 private rollingMarkers=new T.Group();
 private rollingMarkerKey='';
 private outingScene=new T.Group();
 private outingKey='';
 private studioScene=new T.Group();
 private studioKey='';
 private standPreview=false;
 private rainDrops:T.Mesh[]=[];
 private dirtPoints:T.Mesh[]=[];
 private partPulse?:{mesh:T.Mesh;part:string;life:number};
 private particles:{mesh:T.Mesh;velocity:T.Vector3;life:number}[]=[];
 private abort=new AbortController();
 private ray=new T.Raycaster();
 private floorPlane=new T.Plane(new T.Vector3(0,1,0),0);
 private controls:OrbitControls;
 private observer:ResizeObserver;
 private frame=0;
 private disposed=false;
 private ready=false;
 private simpleMaterials=false;
 private software=false;
 private environment?:T.WebGLRenderTarget;
 private materialImages=new Map<Surface,Promise<HTMLImageElement|undefined>>();
 private paperBackdrop?:T.Texture;
 private contactTexture?:T.CanvasTexture;
 private orbit=false;
 private pointer:{id:number;item?:string;start:T.Vector3;boardStart:{x:number;y:number};wash?:boolean;turnWheel?:number}|null=null;
 private last=performance.now();
 private rendered=0;
 private revision='';
 private needsRender=true;
 private complete=false;
 private washKey='';
 private washGantry?:T.Group;
 private assemblyWidth=0;
 private phoneFocusKey='';
 private state:BoardSnapshot;
 private motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
 private get reduced(){return this.motionPreference.matches;}
 paused=false;
 constructor(private host:HTMLDivElement,private board:TouchBoard,private carId:string,private activity:string,state:BoardSnapshot,private changed:(ready:boolean)=>void,private failed:()=>void){
  this.state=state;
  const options={alpha:false,powerPreference:'low-power'} as const;
  let canvas=document.createElement('canvas');
  let context=canvas.getContext('webgl2',{...options,antialias:true});
  if(!context)throw Error('WebGL 2 is unavailable');
  const debug=context.getExtension('WEBGL_debug_renderer_info');
  const identity=debug?String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL)):'';
  const software=/swiftshader|llvmpipe|software/i.test(identity)||!/apple|adreno|mali|powervr|nvidia|geforce|radeon|intel|iris|qualcomm|vivante|nouveau/i.test(identity);
  if(software&&context.getContextAttributes()?.antialias){
   // Request an unmultisampled buffer before Three.js initializes the scene.
   const simpler=document.createElement('canvas');
   const next=simpler.getContext('webgl2',{...options,antialias:false});
   if(next){context.getExtension('WEBGL_lose_context')?.loseContext();canvas=simpler;context=next;}
  }
  this.renderer=new T.WebGLRenderer({...options,canvas,context});
  this.software=software;this.simpleMaterials=software;this.renderer.domElement.dataset.quality=software?'simple':'balanced';this.renderer.setClearColor('#f5efdf');
  this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1;
  this.renderer.shadowMap.enabled=!software&&activity!=='S02';this.renderer.shadowMap.type=T.PCFSoftShadowMap;
  if(!software){let room:RoomEnvironment|undefined,pmrem:T.PMREMGenerator|undefined;try{room=new RoomEnvironment();pmrem=new T.PMREMGenerator(this.renderer);this.environment=pmrem.fromScene(room,.06,.1,100,{size:64});this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.7;}catch{this.environment?.dispose();this.environment=undefined;this.scene.environment=null;this.software=this.simpleMaterials=true;this.renderer.shadowMap.enabled=false;this.renderer.domElement.dataset.quality='simple';}finally{room?.dispose();pmrem?.dispose();}}
  canvas.className='touch-world-canvas';canvas.tabIndex=0;canvas.setAttribute('role','application');canvas.setAttribute('aria-label',activity==='H03'?'立体洗车场景，直接擦洗车身；回车擦洗下一处，第一辆洗净后回车换车':'立体汽车互动场景，直接拖动车辆和物件；方向键移动，回车放下，方括号选择物体');canvas.dataset.ready='false';canvas.dataset.activity=activity;host.append(canvas);
  this.scene.add(new T.HemisphereLight('#f2f8fa','#b8c5ab',1.6));
  const sun=new T.DirectionalLight('#fff1dc',2.5);sun.position.set(-8,18,10);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-15;sun.shadow.camera.right=15;sun.shadow.camera.top=20;sun.shadow.camera.bottom=-20;sun.shadow.camera.far=60;sun.shadow.normalBias=.035;sun.shadow.bias=-.0003;this.scene.add(sun);
  const fill=new T.DirectionalLight('#dbeaf4',.65);fill.position.set(8,7,-10);this.scene.add(fill);
  this.scene.add(this.retired,this.scenery,this.dirt,this.tracks,this.selection);this.retired.visible=false;this.selection.rotation.x=-Math.PI/2;this.selection.visible=false;

  this.controls=new OrbitControls(this.camera,canvas);this.controls.enablePan=false;this.controls.enableDamping=!this.software&&!this.reduced;this.controls.minPolarAngle=.25;this.controls.maxPolarAngle=1.35;this.controls.minDistance=8;this.controls.maxDistance=65;this.controls.enabled=false;
  this.controls.addEventListener('change',this.invalidate);
  this.motionPreference.addEventListener('change',this.setMotionPreference);
  document.addEventListener('visibilitychange',this.schedule);
  this.buildScenery();
  if(this.software&&context.getExtension('EXT_color_buffer_float')){
   const staticObjects=this.scenery.children.filter(object=>object!==this.bridgeScenery&&object!==this.crossingScenery&&object!==this.washGantry);
   this.backdrop=new StaticBackdrop(this.scene,staticObjects);
  }
  this.resetCamera();
  void this.materialImage('paper').then(image=>{
   if(!image||this.disposed)return;
   this.paperBackdrop=this.makeTexture(image);this.scene.background=this.paperBackdrop;this.backdrop?.invalidate();this.invalidate();
  });
  canvas.addEventListener('pointerdown',this.down);canvas.addEventListener('pointermove',this.move);canvas.addEventListener('pointerup',this.up);canvas.addEventListener('pointercancel',this.cancel);canvas.addEventListener('lostpointercapture',this.cancel);canvas.addEventListener('keydown',this.key);canvas.addEventListener('webglcontextlost',this.lost);
  this.observer=new ResizeObserver(this.resize);this.observer.observe(host);this.resize();
  void this.load().catch(error=>this.reportFailure('model loading',error));
  this.schedule();
 }
 update(state:BoardSnapshot){this.state=state;this.schedule();}
 setOrbit(enabled:boolean){this.orbit=enabled;this.controls.enabled=enabled&&!this.paused;this.cancel();this.invalidate();}
 setPaused(value:boolean){this.paused=value;this.controls.enabled=this.orbit&&!value;if(value)this.cancel();this.schedule();}
 private schedule=()=>{
  if(!this.disposed&&!document.hidden&&!this.frame)this.frame=requestAnimationFrame(this.draw);
 };
 private invalidate=()=>{
  this.needsRender=true;
  this.schedule();
 };
 private setMotionPreference=()=>{
  const next=!this.software&&!this.reduced;
  if(this.controls.enableDamping&&!next){
   const position=this.camera.position.clone(),target=this.controls.target.clone();
   this.controls.enableDamping=false;
   this.controls.update();
   this.camera.position.copy(position);this.controls.target.copy(target);
  }
  this.controls.enableDamping=next;
  this.invalidate();
 };
 resetCamera(){const length=this.board.height*UNIT,portrait=this.host.clientWidth<this.host.clientHeight;this.camera.position.set(portrait?0:10,Math.max(19,length*1.2),Math.max(18,length*1.15));this.camera.lookAt(0,0,0);this.controls.target.set(0,0,0);this.controls.update();this.resize();}
 private resize=()=>{
  if(this.disposed)return;
  const width=Math.max(1,this.host.clientWidth),height=Math.max(1,this.host.clientHeight);
  // Keep a one-pixel backing buffer on narrow software displays and cap the
  // raster cost when the same stage is enlarged on wider displays.
  const maxSoftwareEdge=this.backdrop?576:720;
  const limit=this.software?Math.min(1,maxSoftwareEdge/Math.max(width,height)):2;
  const ratio=Math.min(devicePixelRatio,limit);
  if(this.renderer.getPixelRatio()!==ratio)this.renderer.setPixelRatio(ratio);
  this.renderer.setSize(width,height,false);
  this.camera.aspect=width/height;
  const depth=this.board.height*UNIT;
  const distance=Math.max(depth*1.9,22/this.camera.aspect/Math.tan(37*Math.PI/360)/2)*1.12;
  const direction=this.camera.position.clone().sub(this.controls.target).normalize();
  this.camera.position.copy(this.controls.target).addScaledVector(direction,distance);
  this.camera.updateProjectionMatrix();
  if((['T04','E02','T01','H03'].includes(this.activity)||this.phoneFocus())&&this.actors.size)this.fitContentCamera();
  this.invalidate();
 };
 private phoneFocus(){return this.host.clientWidth<this.host.clientHeight&&['M01','M02','M03','T02','L01','S03','H02','L02','C02'].includes(this.activity);}
 private fitContentCamera(){
  const depth=this.board.height*UNIT,bounds=this.activity==='H03'||this.phoneFocus()?new T.Box3():new T.Box3(new T.Vector3(-11,-.5,-depth/2-1),new T.Vector3(11,0,depth/2+1));
  for(const actor of this.actors.values())if(actor.group.visible)bounds.expandByObject(actor.group,true);
  if(this.washGantry)bounds.expandByObject(this.washGantry,true);
  if(this.phoneFocus()){for(const target of this.board.targets)if(target.enabled!==false)for(const x of [-.5,.5])for(const y of [-.5,.5])bounds.expandByPoint(this.world(target.x+target.w*x,target.y+target.h*y));bounds.expandByScalar(.2);}
  const direction=this.camera.position.clone().sub(this.controls.target).normalize(),center=bounds.getCenter(new T.Vector3());
  this.controls.target.copy(center);
  const fits=(distance:number)=>{
   this.camera.position.copy(center).addScaledVector(direction,distance);this.camera.lookAt(center);this.camera.updateMatrixWorld(true);
   const projected=this.screenBounds(bounds);return projected.min.x>=.07&&projected.min.y>=.07&&projected.max.x<=.93&&projected.max.y<=.93;
  };
  // Fit in both directions. Starting at the previous distance only moved the
  // camera farther away, leaving a tiny car after portrait layout or resizing.
  let near=Math.max(8,bounds.getSize(new T.Vector3()).length()/2+this.camera.near),far=Math.max(near,65);
  for(let attempt=0;attempt<20&&!fits(far);attempt++)far*=1.2;
  for(let attempt=0;attempt<16;attempt++){const middle=(near+far)/2;if(fits(middle))far=middle;else near=middle;}
  this.controls.maxDistance=Math.max(65,far*2);fits(far);
  this.controls.update();this.invalidate();
 }
 private actorBounds(actor:Actor){actor.group.updateWorldMatrix(true,false);return actor.bounds!.clone().applyMatrix4(actor.group.matrixWorld);}
 private screenBounds(bounds:T.Box3){const min=new T.Vector2(Infinity,Infinity),max=new T.Vector2(-Infinity,-Infinity);for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=this.project(new T.Vector3(x,y,z));min.min(new T.Vector2(p.x,p.y));max.max(new T.Vector2(p.x,p.y));}return{min:{x:min.x,y:min.y},max:{x:max.x,y:max.y}};}
 private async load(){
  const ids=new Set([this.carId,...this.board.items.filter(i=>i.kind==='car'&&i.carId&&vehicleModel(i.carId)).map(i=>i.carId!)]);
  const timer=setTimeout(()=>{this.abort.abort();this.reportFailure('model timeout');},30000);
  try{await Promise.all([...ids].map(async id=>{const model=await loadPlayVehicle(id,this.abort.signal);if(this.disposed){disposeModel(model.root);return;}this.templates.set(id,model);}));
   if(this.disposed)return;this.sync();if(['E02','T01'].includes(this.activity))this.fitContentCamera();this.renderScene();this.publishViewState();this.ready=true;this.renderer.domElement.dataset.ready='true';this.renderer.domElement.dataset.modelCount=String(this.templates.size);this.changed(true);this.schedule();
  }finally{clearTimeout(timer);}
 }
 private world(x:number,y:number){return new T.Vector3((x-500)*UNIT,0,(y-this.board.height/2)*UNIT);}
 private point(event:PointerEvent){const rect=this.renderer.domElement.getBoundingClientRect();this.ray.setFromCamera(new T.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),this.camera);return this.ray.ray.intersectPlane(this.floorPlane,new T.Vector3());}
 private boardPoint(point:T.Vector3){return{x:point.x/UNIT+500,y:point.z/UNIT+this.board.height/2};}
 private pick(){this.scene.updateMatrixWorld(true);const roots=[...this.actors].filter(([id])=>id!=='care-car'&&id!=='help-partner').map(([,a])=>a.group);return this.ray.intersectObjects(roots,true).find(hit=>hit.object.visible&&this.visibleParents(hit.object));}
 private visibleParents(object:T.Object3D):boolean{if(!object.visible)return false;return object.parent?this.visibleParents(object.parent):true;}
 private actorId(object:T.Object3D){let p:T.Object3D|null=object;while(p){if(p.userData.item)return p.userData.item as string;p=p.parent;}return undefined;}
 private washPoint(hit:T.Intersection|undefined){
  const dirt=this.ray.intersectObjects(this.dirtPoints.filter(point=>point.visible),false)[0];
  // A visible dirt patch can extend past the body's silhouette. Hit the patch
  // itself, while keeping dirt hidden behind the car or tools out of reach.
  if(dirt&&(!hit||dirt.distance<=hit.distance+.2))return dirt.object.getWorldPosition(new T.Vector3());
  return hit&&this.actorId(hit.object)==='wash-car'?hit.point:undefined;
 }
 private nearbyItem(event:PointerEvent){
  const rect=this.renderer.domElement.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
  const candidates=[...this.actors].filter(([id,a])=>a.group.visible&&this.board.items.some(i=>i.id===id&&!i.placed)).map(([id,a])=>{
   const box=this.screenBounds(this.actorBounds(a)),left=box.min.x*rect.width,right=box.max.x*rect.width,top=box.min.y*rect.height,bottom=box.max.y*rect.height;
   const padX=Math.max(0,(44-(right-left))/2),padY=Math.max(0,(44-(bottom-top))/2);
   return{id,inside:x>=left-padX&&x<=right+padX&&y>=top-padY&&y<=bottom+padY,distance:Math.hypot(x-(left+right)/2,y-(top+bottom)/2)};
  });
  return candidates.filter(c=>c.inside).sort((a,b)=>a.distance-b.distance)[0]?.id;
 }
 private targetAt(floor:T.Vector3){
  const available=this.board.targets.filter(t=>
   (t.enabled!==false||t.construction)&&(!t.occupied||this.activity==='C02')&&this.targets.get(t.id)?.visible);
  const hits=this.ray.intersectObjects(available.map(t=>this.targets.get(t.id)!),true);
  for(const hit of hits){let node:T.Object3D|null=hit.object;while(node){const target=available.find(t=>t.id===node!.userData.target);if(target)return target;node=node.parent;}}
  const point=this.boardPoint(floor);
  return available.find(t=>{
   // Wheel sockets sit on the model, above and beside the rule engine's floor.
   // Their visible ring is the input target in both tap and drag interactions.
   if(this.activity==='T04'&&t.id.startsWith('wheel-'))return false;
   const padding=18*this.board.difficulty.placementScale;
    return Math.abs(point.x-t.x)<t.w/2+padding&&Math.abs(point.y-t.y)<t.h/2+padding;
  });
 }
 private partAt(actor:Actor,hit:T.Intersection){
  const p=actor.group.worldToLocal(hit.point.clone()),name=(hit.object.name+' '+(Array.isArray((hit.object as T.Mesh).material)?((hit.object as T.Mesh).material as T.Material[])[hit.face?.materialIndex||0]?.name:((hit.object as T.Mesh).material as T.Material)?.name)).toLowerCase();
  const bounds=this.templates.get(actor.sourceCar!)!.bounds,size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()),x=(p.x-center.x)/size.x,y=(p.y-bounds.min.y)/size.y,z=Math.abs(p.z-center.z)/size.z;
  const wheel=actor.wheels.some(w=>{let node:T.Object3D|null=hit.object;while(node){if(node===w)return true;node=node.parent;}return false;});
  if(wheel)return 'wheel' as const;
  if(isVehicleLampName(name))return 'light' as const;
  const scale=this.board.difficulty.partScale,range=(v:number,min:number,max:number)=>withinPartRange(v,min,max,scale);
  if(range(Math.abs(x),.22,.43)&&range(y,.02,.4)&&z>.27)return 'wheel' as const;
  if(x>.36&&range(y,.12,.58))return 'light' as const;
  if(Math.abs(x)<.25*scale&&range(y,.18,.64)&&z>.32)return 'door' as const;
  return undefined;
 }
 private partScreens(){
  const actor=this.actors.get('parts-car');if(!actor)return undefined;actor.group.updateWorldMatrix(true,true);const cameraKey=[...this.camera.matrixWorld.elements,...this.camera.projectionMatrix.elements,...actor.group.matrixWorld.elements].map(n=>n.toFixed(4)).join(',');if(actor.group.userData.partCamera===cameraKey&&actor.group.userData.partScreens)return actor.group.userData.partScreens;
  actor.group.updateWorldMatrix(true,true);const bounds=new T.Box3().setFromObject(actor.model!,true),screen=this.screenBounds(bounds),points:Record<string,{x:number;y:number}>={},scores:Record<string,number>={};
  const ray=new T.Raycaster(),shape=this.templates.get(actor.sourceCar!)!.bounds,size=shape.getSize(new T.Vector3()),center=shape.getCenter(new T.Vector3());
  const consider=(p:{x:number;y:number})=>{
   if(p.x<0||p.x>1||p.y<0||p.y>1)return;
   ray.setFromCamera(new T.Vector2(p.x*2-1,1-p.y*2),this.camera);
   const hit=ray.intersectObject(actor.model!,true).find(h=>this.visibleParents(h.object));if(!hit)return;
   const part=this.partAt(actor,hit),key=part||'other',local=actor.group.worldToLocal(hit.point.clone());
   const normalized=new T.Vector3((local.x-center.x)/size.x,(local.y-shape.min.y)/size.y,Math.abs(local.z-center.z)/size.z);
   const ideal=part==='wheel'?new T.Vector3(.3,.23,.43):part==='light'?new T.Vector3(.44,.32,.35):part==='door'?new T.Vector3(0,.4,.45):new T.Vector3(0,.85,.15),score=normalized.distanceToSquared(ideal);
   if(scores[key]===undefined||score<scores[key]){scores[key]=score;points[key]=p;}
  };
  const surface=(x:number,y:number,z:number)=>consider(this.project(actor.group.localToWorld(new T.Vector3(center.x+x*size.x,shape.min.y+y*size.y,center.z+z*size.z))));
  // Verify projected surface candidates against the real mesh. Most vehicles need
  // a few dozen rays; scanning every triangle hundreds of times can stall a phone.
  surface(0,.9,0);
  for(const z of [-.48,.48]){
   for(const x of [-.32,.32])for(const y of [.15,.25,.35])surface(x,y,z);
   for(const x of [-.1,0,.1])for(const y of [.36,.5])surface(x,y,z);
   for(const x of [-.44,.44])for(const y of [.23,.4])surface(x,y,z*.7);
  }
  if(!points.wheel||!points.light||!points.door){
   scan:for(let y=0;y<12;y++)for(let x=0;x<20;x++){
    consider({x:screen.min.x+(screen.max.x-screen.min.x)*(x+.5)/20,y:screen.min.y+(screen.max.y-screen.min.y)*(y+.5)/12});
    if(points.wheel&&points.light&&points.door&&points.other)break scan;
   }
  }
  actor.group.userData.partCamera=cameraKey;actor.group.userData.partScreens=points;return points;
 }
 private activatePart(actor:Actor,part:'wheel'|'door'|'light',point:T.Vector3){
  const accepted=this.board.touchPart(part,actor.wheels.length>0);
  if(!accepted)return;
  if(this.partPulse){this.partPulse.mesh.removeFromParent();disposeModel(this.partPulse.mesh);}const ring=new T.Mesh(new T.RingGeometry(.22,.3,24),new T.MeshBasicMaterial({color:'#ffe49a',depthTest:false,transparent:true,opacity:1}));ring.position.copy(point);ring.quaternion.copy(this.camera.quaternion);ring.renderOrder=10;this.scene.add(ring);this.partPulse={mesh:ring,part,life:1.2};this.needsRender=true;
  if(part==='light'&&this.activity!=='E02')actor.light?.forEach(m=>{m.emissive.set('#fff0a0');m.emissiveIntensity=2;});
  if(part==='wheel'&&this.activity!=='E02'){for(const wheel of actor.wheels)wheel.rotateOnAxis(wheel.userData.axis,Math.PI*.8);delete actor.group.userData.partCamera;}
  this.burst(point,part==='light'?'#fff4b2':'#a5d6d3');
 }
 private down=(event:PointerEvent)=>{
  if(!this.ready||this.paused||this.orbit||this.pointer)return;this.schedule();const floor=this.point(event);if(!floor)return;
  if(['A01','C01'].includes(this.activity)&&this.board.placeSelectedPosterStamp(this.boardPoint(floor))){this.needsRender=true;return;}
  const hit=this.pick(),surface=['E02','T01','H03'].includes(this.activity),id=(hit&&this.actorId(hit.object))||(!surface?this.nearbyItem(event):undefined);const item=this.board.items.find(i=>i.id===id);
  if(this.activity==='H03'&&(item?.id==='water'||item?.id==='sponge')){
   this.board.selectWashTool(item.id);this.needsRender=true;return;
  }
  if(this.activity==='H03'&&!this.state.wash.waiting&&!this.state.completed){const point=this.washPoint(hit);if(point){this.pointer={id:event.pointerId,start:floor,boardStart:this.boardPoint(floor),wash:true};this.renderer.domElement.setPointerCapture(event.pointerId);this.scrub(point);return;}}
  if(['E02','T01'].includes(this.activity)&&hit&&id==='parts-car'){
   const actor=this.actors.get(id)!,part=this.partAt(actor,hit);if(!part){this.board.showHint();return;}this.activatePart(actor,part,hit.point);
   if(this.activity==='E02'&&part==='wheel'){
    this.pointer={id:event.pointerId,start:floor,boardStart:this.boardPoint(floor),turnWheel:event.clientX};
    this.renderer.domElement.setPointerCapture(event.pointerId);
   }
   return;
  }
  // Surface-specific games only accept the visible mesh hit, never hidden flat hit areas.
  if(['E02','T01'].includes(this.activity)||this.activity==='H03'&&!this.state.wash.waiting&&!this.state.completed){this.board.showHint();return;}
  const destination=this.state.selected&&this.targetAt(floor);
  if(destination){this.board.down(event.pointerId,{x:destination.x,y:destination.y},event.timeStamp);this.needsRender=true;return;}
  if(!item){const point=this.boardPoint(floor);this.pointer={id:event.pointerId,start:floor.clone(),boardStart:point};this.board.down(event.pointerId,point,event.timeStamp);this.renderer.domElement.setPointerCapture(event.pointerId);return;}
  this.pointer={id:event.pointerId,item:item.id,start:floor.clone(),boardStart:{x:item.x,y:item.y}};
  this.board.down(event.pointerId,{x:item.x,y:item.y},event.timeStamp);this.renderer.domElement.setPointerCapture(event.pointerId);
 };
 private move=(event:PointerEvent)=>{const pointer=this.pointer;if(!pointer||pointer.id!==event.pointerId||this.paused)return;this.schedule();const p=this.point(event);if(!p)return;
  if(pointer.wash){const point=this.washPoint(this.pick());if(point)this.scrub(point);return;}
  if(pointer.turnWheel!==undefined){this.board.turnShowroomWheel((event.clientX-pointer.turnWheel)*.075);pointer.turnWheel=event.clientX;return;}
  this.board.move(pointer.id,this.dragPoint(pointer,p),event.timeStamp);
 };
 private dragPoint(pointer:NonNullable<TouchWorldRenderer['pointer']>,point:T.Vector3){
  return ['A01','C01','C03'].includes(this.activity)&&pointer.item?.match(/^(stamp-|poster-mark-)/)
   ?this.boardPoint(point)
   :{x:pointer.boardStart.x+(point.x-pointer.start.x)/UNIT,y:pointer.boardStart.y+(point.z-pointer.start.z)/UNIT};
 }
 private up=(event:PointerEvent)=>{const pointer=this.pointer;if(!pointer||pointer.id!==event.pointerId)return;this.schedule();const p=this.point(event);this.pointer=null;
  if(!pointer.wash&&pointer.turnWheel===undefined&&p){
   const moved=p.distanceTo(pointer.start)>.2,posterPiece=['A01','C01','C03'].includes(this.activity)&&!!pointer.item?.match(/^(stamp-|poster-mark-)/);
   const target=this.targetAt(p);
   let drop=posterPiece&&!moved?pointer.boardStart:this.dragPoint(pointer,p);
   if(moved&&target)drop={x:target.x,y:target.y};
   if(moved&&(target||posterPiece))this.board.move(pointer.id,drop,event.timeStamp);
   this.board.up(pointer.id,drop,event.timeStamp);
  }
  if(this.renderer.domElement.hasPointerCapture(event.pointerId))this.renderer.domElement.releasePointerCapture(event.pointerId);
 };
 private cancel=(event?:PointerEvent)=>{if(event&&this.pointer?.id!==event.pointerId)return;this.board.cancel(this.pointer?.id);this.pointer=null;this.schedule();};
 private key=(event:KeyboardEvent)=>{
  if(this.paused||!this.ready||this.orbit)return;
  this.schedule();
  if(['E02','T01'].includes(this.activity)&&['Enter',' '].includes(event.key)){event.preventDefault();const actor=this.actors.get('parts-car');if(actor){const part=this.board.workshopAction??(['wheel','door','light'] as const).find(p=>!this.state.parts.includes(p))??'wheel';if(part==='done')return;const point=this.partScreens()?.[part];let hit:T.Intersection|undefined;if(point){this.ray.setFromCamera(new T.Vector2(point.x*2-1,1-point.y*2),this.camera);hit=this.ray.intersectObject(actor.model!,true).find(h=>this.visibleParents(h.object));}this.activatePart(actor,part,hit?.point||this.actorBounds(actor).getCenter(new T.Vector3()));}return;}
  if(this.activity==='H03'&&['Enter',' '].includes(event.key)){event.preventDefault();
   if(this.state.wash.waiting){const next=this.board.items.find(i=>i.id==='next-car');if(next)this.board.down(-1,{x:next.x,y:next.y},performance.now());}
   else{const next=this.board.keyboardWashPatch();const dirt=this.dirtPoints.find(d=>d.userData.patchId===next?.id);if(dirt)this.scrub(dirt.position);}
   return;
  }
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' ','Escape','[',']'].includes(event.key)){event.preventDefault();this.board.keyboard(event.key);}
 };
 private lost=(event:Event)=>{event.preventDefault();this.reportFailure('WebGL context lost');};
 private copyMaterial(source:T.Material){
  if(!this.simpleMaterials||!(source instanceof T.MeshStandardMaterial))return source.clone();
  const material=new T.MeshPhongMaterial({color:source.color,map:source.map,alphaMap:source.alphaMap,normalMap:source.normalMap,emissive:source.emissive,emissiveMap:source.emissiveMap,emissiveIntensity:source.emissiveIntensity,opacity:source.opacity,transparent:source.transparent,alphaTest:source.alphaTest,side:source.side,vertexColors:source.vertexColors,specular:'#46534d',shininess:Math.max(10,(1-source.roughness)*35),depthWrite:source.depthWrite,depthTest:source.depthTest,premultipliedAlpha:source.premultipliedAlpha});material.name=source.name;material.normalScale.copy(source.normalScale);if(/window|windscreen|windshield|glazing/i.test(source.name)){material.color.lerp(new T.Color('#203b47'),.25);material.specular.set('#9aafb5');material.shininess=65;}return material;
 }
 private contactShadow(width:number,depth:number,opacity=.2){
  if(!this.contactTexture){const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d')!,gradient=ctx.createRadialGradient(32,32,5,32,32,32);gradient.addColorStop(0,'#203b2dee');gradient.addColorStop(.5,'#203b2d80');gradient.addColorStop(1,'#203b2d00');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);this.contactTexture=new T.CanvasTexture(canvas);}
  const mesh=new T.Mesh(new T.PlaneGeometry(width,depth),new T.MeshBasicMaterial({map:this.contactTexture,transparent:true,opacity,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.y=.018;mesh.userData.contactShadow=true;mesh.raycast=()=>{};return mesh;
 }
 private vehicle(item:Item|{id:string;carId:string;w:number}):Actor{
  const sourceCar='carId'in item&&item.carId&&this.templates.has(item.carId)?item.carId:this.carId;
  const template=this.templates.get(sourceCar)!;
  const model=template.root.clone(true),group=new T.Group();group.add(model);group.userData.item=item.id;
  const dimensions=template.bounds.getSize(new T.Vector3());group.add(this.contactShadow(dimensions.x*1.15,dimensions.z*1.5,.34));
  const paint=new Map<T.Material,T.Material>(),light:(T.MeshStandardMaterial|T.MeshPhongMaterial)[]=[],wheels:T.Group[]=[];
  model.traverse(object=>{if(!(object instanceof T.Mesh))return;const old=Array.isArray(object.material)?object.material:[object.material];const next=old.map(m=>{if(!paint.has(m))paint.set(m,this.copyMaterial(m));return paint.get(m)!;});object.material=Array.isArray(object.material)?next:next[0];
   for(const m of next)if(m instanceof T.MeshStandardMaterial||m instanceof T.MeshPhongMaterial){if(template.paint.some(p=>p.name===m.name)&&'carId'in item&&['E01','M04','L03'].includes(this.activity)){m.color.set(item.id.includes('blue')||item.carId==='CAR11'?'#2e8ed4':item.id.includes('white')||item.carId==='CAR15'?'#f7f5e9':'#dc4940');m.map=null;}
    if(template.lights.some(l=>l.name===m.name))light.push(m);
   }
  });
  model.updateMatrixWorld(true);
  const wheelMeshes:T.Object3D[]=[];model.traverse(object=>{if(object instanceof T.Mesh&&template.wheels.some(w=>w.name===object.name))wheelMeshes.push(object);});
  for(const mesh of wheelMeshes){const center=new T.Box3().setFromObject(mesh,true).getCenter(new T.Vector3()),pivot=new T.Group();pivot.position.copy(model.worldToLocal(center));model.add(pivot);pivot.attach(mesh);pivot.userData.axis=new T.Vector3(0,0,1).applyQuaternion(model.quaternion.clone().invert());wheels.push(pivot);}
  const scale=item.w*UNIT/4.65;group.scale.setScalar(scale);this.scene.add(group);return{group,model,sourceCar,wheels,x:0,z:0,yaw:0,scale,light,bounds:template.bounds.clone()};
 }
 private prop(item:Item):Actor{
  const group=new T.Group();group.userData.item=item.id;const w=item.w*UNIT,h=item.h*UNIT;
  let toy:T.Group|undefined;
  if(item.posterShape&&this.activity!=='C01'){
   const art=document.createElement('canvas');art.width=art.height=128;
   const context=art.getContext('2d')!;
   if(!this.board.drawPosterSticker(context,{x:64,y:64,w:120,h:120},item.posterShape,item.color)){
    paintMark(context,{x:.5,y:.5,shape:item.posterShape,color:item.color!},128,128,1.7);
   }
   const map=new T.CanvasTexture(art);map.colorSpace=T.SRGBColorSpace;
   const stamp=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map,transparent:true,depthWrite:false,side:T.DoubleSide}));
   stamp.rotation.x=-Math.PI/2;add(group,stamp,0,.12);
  }else if(item.kind==='wheel'){
   const template=this.templates.get(this.carId),front=item.id==='wheel-0';const originals=template?.wheels.filter(object=>{const p=new T.Box3().setFromObject(object,true).getCenter(new T.Vector3());return(front?p.x<-.4:p.x>.4)&&p.z>.1;})||[];
   if(originals.length){const parts=new T.Group();for(const original of originals){const copy=original.clone(true);copy.traverse(node=>{if(node instanceof T.Mesh)node.material=Array.isArray(node.material)?node.material.map(m=>this.copyMaterial(m)):this.copyMaterial(node.material);});original.updateWorldMatrix(true,false);original.matrixWorld.decompose(copy.position,copy.quaternion,copy.scale);parts.add(copy);}const b=new T.Box3().setFromObject(parts,true),size=b.getSize(new T.Vector3()),center=b.getCenter(new T.Vector3());parts.position.sub(center);const holder=new T.Group();holder.add(parts);holder.scale.setScalar(w*.8/Math.max(size.x,size.y));group.add(holder);}
   else{const tire=new T.Mesh(new T.TorusGeometry(w*.34,w*.15,10,24),material('#37474b'));tire.castShadow=true;group.add(tire);const hub=new T.Mesh(new T.CylinderGeometry(w*.25,w*.25,.18,12),material('#c8d8d8',.3));hub.rotation.x=Math.PI/2;group.add(hub);add(group,ball(w*.09,'#edc96f'),0,0,.18);}
  }else if(item.id==='bridge-shed'){
   add(group,block(w,.16,h,'#625344'),0,.02);
   const closed=item.glyph==='garage';
   for(const sign of [-1,1])add(group,block(.24,1.0,h,'#a48767'),sign*(w/2-.2),.49);
   if(closed){
    add(group,block(w-.32,.44,h,'#b98258'),0,.76);
    add(group,block(.77,.14,.30,'#ffdb93'),0,1.03,h*.31);
   }
  }else if(item.kind==='plank'){add(group,this.finishSurface(block(w,.28,h,colors.wood),'wood'),0,.14);}
  else if(item.kind==='road'){
   const closed=this.board.isClosedRoad(item.turn!);
   add(group,block(w,.12,h,closed?'#cfb58d':'#afc59a'),0,.02);
   if(closed){
    add(group,block(w*.7,.26,.18,'#ae6952'),0,.28,0);
    for(const x of [-w*.29,w*.29])add(group,block(.26,.62,.21,colors.cream),x,.3,0);
   }
   const shape=closed?'':this.state.road.shapes[item.turn!]||'LR';
   for(const direction of shape){const along=direction==='L'||direction==='R';add(group,block(along?w*.5:w*.48,.08,along?h*.48:h*.5,colors.road),direction==='L'?-w*.25:direction==='R'?w*.25:0,.12,direction==='U'?-h*.25:direction==='D'?h*.25:0);}
  }else if(item.kind==='bay'){this.outline(group,w,h,colors.cream);}
  else if(item.kind==='shape'){
   if(item.glyph==='●'){
    const radius=w*.5,roller=new T.Group();
    roller.add(ball(radius,item.color||'#e49b64'));
    for(const angle of [0,Math.PI/2]){
     const stripe=new T.Mesh(new T.TorusGeometry(radius*.994,.037,5,30),material('#f8e3bc'));
     stripe.rotation.y=angle;roller.add(stripe);
    }
    add(group,roller,0,radius);group.userData.roller=roller;
   }else add(group,block(w,w,w,item.color||'#73a2bc'),0,w*.5);
  }
  else if(item.id==='signal'){add(group,block(.22,2,.22,colors.ink),0,1);add(group,block(1.1,2,.5,colors.ink),0,2.3);add(group,ball(.32,'#d96554'),0,2.75,.3);add(group,ball(.32,'#6bba7e'),0,1.9,.3);}
  else if(item.id.startsWith('ink-')){add(group,new T.Mesh(new T.CylinderGeometry(.65,.7,.35,24),material(item.color||'#e0a060')),0,.2);}
  else if((toy=makePlayProp(symbolName(item.glyph||'')))){
   const bounds=new T.Box3().setFromObject(toy,true),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
   const scale=Math.min(w*.92/Math.max(.01,size.x),h*.92/Math.max(.01,size.y,size.z));
   toy.scale.setScalar(scale);toy.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);group.add(toy);
  }
  else{
   const art=document.createElement('canvas');art.width=art.height=192;
   const context=art.getContext('2d')!;
   if(!drawPlaySymbol(context,item.glyph||'star',96,96,192))drawPlaySymbol(context,'star',96,96,192);
   const map=new T.CanvasTexture(art);map.colorSpace=T.SRGBColorSpace;
   const size=Math.min(w,h)*.92;
   const sticker=new T.Mesh(new T.PlaneGeometry(size,size),new T.MeshBasicMaterial({map,transparent:true,alphaTest:.18,side:T.DoubleSide}));
   add(group,sticker,0,size/2);
  }
  const bounds=new T.Box3().setFromObject(group,true),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());if(!['road','bay','plank'].includes(item.kind)){const shadow=this.contactShadow(Math.max(.5,size.x*1.25),Math.max(.5,size.z*1.4),.24);shadow.position.x=center.x;shadow.position.z=center.z;group.add(shadow);}const hit=new T.Mesh(new T.BoxGeometry(Math.max(.6,size.x),Math.max(.5,size.y),Math.max(.6,size.z)),new T.MeshBasicMaterial({transparent:true,opacity:0,colorWrite:false,depthWrite:false}));hit.position.copy(center);hit.userData.pickProxy=true;group.add(hit);this.scene.add(group);return{group,wheels:[],x:0,z:0,yaw:0,scale:1,bounds:bounds.clone()};
 }
 private targetPoint(target:{id:string;x:number;y:number}){
  if(this.activity==='T04'&&target.id.startsWith('wheel-')){const template=this.templates.get(this.carId),body=this.board.targets.find(t=>t.id==='body');if(template&&body){const front=target.id==='wheel-0',centers=template.wheels.map(w=>new T.Box3().setFromObject(w,true).getCenter(new T.Vector3())).filter(p=>(front?p.x<-.4:p.x>.4)&&p.z>.1);if(centers.length){const center=centers.reduce((a,p)=>a.add(p),new T.Vector3()).multiplyScalar(1/centers.length);return this.world(body.x,body.y).addScaledVector(center,body.w*UNIT/4.65);}}}
  if(this.activity==='T04'&&target.id.startsWith('wheel-')){const body=this.board.targets.find(t=>t.id==='body'),bounds=this.templates.get(this.carId)?.bounds;if(body&&bounds){const size=bounds.getSize(new T.Vector3()),scale=body.w*UNIT/4.65;return this.world(body.x,body.y).add(new T.Vector3(target.id==='wheel-0'?-1.35:1.35,.4,size.z*.43).multiplyScalar(scale));}}
  return this.world(target.x,target.y);
 }
 private outline(parent:T.Object3D,w:number,d:number,color:string){for(const [x,z,a,b]of [[0,-d/2,w,.09],[0,d/2,w,.09],[-w/2,0,.09,d],[w/2,0,.09,d]])add(parent,block(a,.06,b,color),x,.045,z);}
 private materialImage(surface:Surface){
  let pending=this.materialImages.get(surface);
  if(!pending){
   pending=loadImage(assetUrl('town-material-'+surface),this.abort.signal,6000,true).catch(()=>undefined);
   this.materialImages.set(surface,pending);
  }
  return pending;
 }
 private makeTexture(image:HTMLImageElement){
  const texture=new T.Texture(image);
  texture.colorSpace=T.SRGBColorSpace;texture.needsUpdate=true;
  return texture;
 }
 private finishSurface(mesh:SurfaceMesh,surface:Surface,repeat=1){
  void this.materialImage(surface).then(image=>{
   if(!image||this.disposed||!mesh.parent)return;
   // Each mesh owns its texture so rebuilding a dynamic prop cannot dispose
   // a texture that is still used by another object.
   const texture=this.makeTexture(image);
   if(repeat>1){texture.wrapS=texture.wrapT=T.MirroredRepeatWrapping;texture.repeat.set(repeat,repeat);}
   mesh.material.map=texture;mesh.material.color.set('#ffffff');mesh.material.needsUpdate=true;
   this.backdrop?.invalidate();
   this.invalidate();
  });
  return mesh;
 }
 private buildScenery(){
  const depth=this.board.height*UNIT;const road=['M01','M02','M03','L03','M04','P01','S01','E03','T03','H01','L02'].includes(this.activity);
  const rounded=(w:number,h:number,d:number,color:string)=>{const mesh=new T.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(.16,w/4,h/4,d/4)),material(color));mesh.receiveShadow=true;return mesh;};
  const floorKind=road||this.activity==='T02'?'turf':['E01','E02','A01','A02','C01','C02','C03','T01','T04'].includes(this.activity)?'wood':'paper';
  const floor=this.finishSurface(rounded(22,.5,depth+2,road?'#c4d2a5':'#e7d8b4'),floorKind,2);floor.position.y=-.35;this.scenery.add(floor);
  if(road){const surface=this.finishSurface(rounded(19.5,.06,depth*.85,'#83938b'),this.activity.startsWith('M')||this.activity==='L03'?'stone':'road',2);surface.position.y=-.06;this.scenery.add(surface);for(let x=-9;x<10;x+=1.3)add(this.scenery,block(.65,.025,.09,'#f9edc7'),x,.015,0);}
  if(this.activity==='H03'){this.washGantry=new T.Group();this.scenery.add(this.washGantry);for(const x of [-9,9])add(this.washGantry,rounded(.65,6,.65,'#84b5aa'),x,3,-depth*.25);add(this.washGantry,rounded(18.6,.65,.65,'#84b5aa'),0,6,-depth*.25);for(let x=-8;x<=8;x+=2)add(this.washGantry,block(.15,.6,.15,'#c4ecf4'),x,5.5,-depth*.25);}
  if(this.activity==='H03'&&this.washGantry){
   add(this.washGantry,this.finishSurface(rounded(16,.22,.12,'#d7e5d6'),'mint'),0,6.02,-depth*.25+.36);
   for(const x of [-9,9]){add(this.washGantry,rounded(.95,.18,1.1,'#608f89'),x,.05,-depth*.25);add(this.washGantry,rounded(.15,3.8,.1,'#d5e5d9'),x,2.8,-depth*.25+.37);}
  }
  if(this.activity==='S02'){
   const tree=makePlayProp('tree')!;tree.scale.setScalar(.85);
   add(this.scenery,tree,-5.25,.03,depth*.30);
   add(this.scenery,block(3.5,.05,.14,colors.cream),5.7,.018,depth*.26);
  }
  if(this.activity==='T04'){
   add(this.scenery,block(17.2,.06,.86,'#a9b693'),0,.015,depth*.29);
   add(this.scenery,block(.18,.09,1.35,'#fcf0c9'),6.5,.02,depth*.29);
  }
  if(this.activity==='T02')this.scenery.add(this.bridgeScenery);
  if(this.activity==='E03')this.scenery.add(this.crossingScenery);
  if(this.activity==='M04'){
   for(const row of [-.245,.02]){
    for(const x of [-9.5,8.4])add(this.scenery,block(.21,.13,depth*.23,'#ddd1a4'),x,.04,depth*row);
    for(const side of [-1,1])add(this.scenery,ball(.29,'#edc780'),8.4,.51,depth*(row+side*.095));
   }
  }
  for(const x of [-10.3,10.3]){add(this.scenery,rounded(.22,.35,depth+1,'#9baa86'),x,0);}
  // Scenery stays outside the manipulation plane; it never changes task geometry.
  // No added dynamic lights, shadow maps or continuous decoration on software GPUs.
  for(const x of [-9.3,9.3]){
   const tree=new T.Group();add(tree,rounded(.28,1.2,.28,'#ad8864'),0,.6);
   add(tree,ball(.83,'#96b47d'),0,1.5);add(tree,ball(.58,'#afc18c'),.4,1.9);
   add(this.scenery,tree,x,0,-depth*.48);
   add(this.scenery,rounded(1.9,.16,1.3,'#dce0b8'),x,-.08,-depth*.48);
  }
  if(['T04','T01','H02','A01','A02','C01','C03','L02','C02'].includes(this.activity)){
   add(this.scenery,rounded(17,.2,.45,'#c69e70'),0,.1,-depth*.48);
  }
  const back=-depth*.53;
  if(['E01','E02','E03','C01'].includes(this.activity)){
   // A low glazed showroom facade; the learning objects stay in front of it.
   add(this.scenery,this.finishSurface(rounded(15,1.8,.35,'#b9cfc2'),'mint'),0,.75,back);
   add(this.scenery,rounded(13.8,1.25,.1,'#dbe7d4'),0,.8,back+.22);
   for(const x of [-6,-3,0,3,6])add(this.scenery,rounded(.12,1.4,.14,'#8aa99d'),x,.85,back+.3);
   add(this.scenery,rounded(15.5,.28,.8,'#edca7c'),0,1.8,back);
  }else if(['T01','T02','T03','T04','H02','L02'].includes(this.activity)){
   add(this.scenery,this.finishSurface(rounded(10,1.6,.25,'#dfbe89'),'wood'),0,.75,back);
   for(let n=0;n<8;n++)add(this.scenery,ball(.05,'#ae8c5d'),-4+n*1.15,1.1,back+.16);
   add(this.scenery,this.finishSurface(rounded(11,.25,.75,'#d69474'),'coral'),0,1.6,back);
   for(const [name,x]of [['tool',-3],['wheel',-1.5]]as const){const prop=makePlayProp(name)!;prop.scale.setScalar(.5);prop.position.set(x,.2,back+.3);this.scenery.add(prop);}
  }else if(['A01','A02','C02','C03'].includes(this.activity)){
   for(const [n,color]of ['#c96b4f','#477da8','#6e9154'].entries()){
    add(this.scenery,rounded(.5,.5,.5,color),-2+n*2,.3,back);
    add(this.scenery,rounded(.09,.8,.09,'#b99062'),-2+n*2,.9,back);
   }
  }else if(['P01','S01','S03','L01','H01'].includes(this.activity)){
   add(this.scenery,rounded(5,.2,.7,'#c9a777'),0,.6,back);
   for(const x of [-1.8,1.8])add(this.scenery,rounded(.2,.65,.4,'#a5aa83'),x,.25,back);
  }

 }
 private updateRollingMarkers(){
  const rolling=this.state.rollingTest;
  if(!rolling)return;
  const key=JSON.stringify([rolling.phase,rolling.round,rolling.stops,this.board.height]);
  if(this.rollingMarkerKey===key)return;
  this.rollingMarkerKey=key;
  if(!this.rollingMarkers.parent)this.scenery.add(this.rollingMarkers);
  for(const child of [...this.rollingMarkers.children]){child.removeFromParent();disposeModel(child);}
  for(const lane of [.34,.65]){
   const z=this.world(0,this.board.height*lane).z;
   add(this.rollingMarkers,block(17.85,.06,1.9,rolling.round===0?'#a0b7b7':'#bb9772'),0,-.02,z);
   if(rolling.round===1)for(let n=0;n<28;n++)add(this.rollingMarkers,block(.07,.08,.1,'#8d7259'),-7.9+n*.57,.01,z+Math.sin(n)*.69);
   if(rolling.phase==='predict'||rolling.phase==='release')add(this.rollingMarkers,block(.17,.35,2.25,'#976d50'),-5.8,.2,z);
  }
  for(const [n,stop]of rolling.stops.entries()){
   for(const [x,y]of [[stop.ball,.34],[stop.cube,.65]]){
    const at=this.world(x,this.board.height*y);
    add(this.rollingMarkers,block(.11,.13,2.17,n===0?'#f3e1a9':'#d38d69'),at.x,.05,at.z);
   }
  }
 }
 private updateMotionTracks(){
  const H=this.board.height,stops=this.board.motionStops;
  const key=JSON.stringify([this.board.motionRound,stops,H]);
  if(this.rollingMarkerKey===key)return;
  this.rollingMarkerKey=key;
  if(!this.rollingMarkers.parent)this.scenery.add(this.rollingMarkers);
  for(const child of [...this.rollingMarkers.children]){child.removeFromParent();disposeModel(child);}
  for(const [lane,row]of [.34,.65].entries()){
   const z=this.world(0,H*row).z,rough=this.board.isRoughLane(lane);
   add(this.rollingMarkers,this.finishSurface(block(19.1,.05,3,rough?'#c9ac83':'#a0b5bc'),rough?'sand':'road'),0,-.015,z);
   if(rough)for(let i=0;i<38;i++)add(this.rollingMarkers,ball(.09,'#907455'),-9+i*.48,.02,z+Math.sin(i*2.6)*1.24);
   for(const [run,stop]of stops.entries()){
    const x=this.world(lane?stop.lower:stop.upper,0).x;
    add(this.rollingMarkers,block(.14,.12,3.2,run?'#d98760':'#fff2b9'),x,.05,z);
   }
  }
 }
 private updateOutingScene(){
  const {rain,trip,visit}=this.state,H=this.board.height;
  const key=JSON.stringify([H,rain?.result,trip?.phase,trip?.buckled,visit?.location,visit?.visited,visit?.revealed]);
  if(key!==this.outingKey){
   this.outingKey=key;
   if(!this.outingScene.parent)this.scenery.add(this.outingScene);
   for(const child of [...this.outingScene.children]){child.removeFromParent();disposeModel(child);}
   const place=(x:number,y:number)=>this.world(x,H*y);
   if(rain){
    const z=place(500,.525).z;
    add(this.outingScene,block(11.8,.14,7.3,'#a8c6c1'),0,.012,z-1.35);
    add(this.outingScene,block(5.5,.14,1.55,rain.result==='wet'?'#8baab9':'#f4e3b7'),0,.12,z);
    this.rainDrops=Array.from({length:14},(_,n)=>{
     const drop=ball(n%3===0?.13:.085,'#6db0cb');
     add(this.outingScene,drop,-2.25+n*.35,.18,z);
     return drop;
    });
   }
   if(trip){
    const z=place(650,.8).z;
    add(this.outingScene,block(18.6,.06,H*UNIT*.20,'#9cae9f'),0,-.025,z);
    const x=place(650,.8).x,open=trip.phase==='driving'||trip.phase==='arrived';
    for(const offset of [-1,1])add(this.outingScene,block(.27,1,.26,'#a67d60'),x,.5,z+offset*1.58);
    add(this.outingScene,block(.18,.30,open?1.34:3.1,open?'#7da278':'#b56b57'),x,.65,z+(open?-2:0));
    add(this.outingScene,makePlayProp('tree')!,place(875,.15).x,.05,place(875,.15).z);
    add(this.outingScene,makePlayProp('sun')!,place(135,.15).x,1,place(135,.15).z);
    if(trip.buckled)add(this.outingScene,ball(.19,'#7aaa7d'),place(801,.34).x,.3,place(801,.34).z);
   }
   if(visit){
    if(visit.location!==null){
     const z=place(500,.42).z,color=['#b9d29f','#dac299','#bccfc9'][visit.location];
     add(this.outingScene,block(17.4,.08,H*UNIT*.58,color),0,-.035,z);
     const glyph=['tree','book','dinosaur'][visit.location];
     for(const x of [-6.4,6.4]){
      const prop=makePlayProp(glyph);
      if(prop)add(this.outingScene,prop,x,.08,place(0,.19).z);
     }
     if(visit.revealed)add(this.outingScene,ball(.19,'#f4d075'),6.2,.52,place(0,.26).z);
    }else for(const i of visit.visited){
     const at=place(180+i*320,.405);
     add(this.outingScene,ball(.24,'#83bc79'),at.x,.28,at.z);
    }
   }
  }
  if(rain){
   const time=this.board.rainTime,covered=this.board.items.some(i=>i.placed&&['pack-0','pack-1'].includes(i.id));
   for(const [i,drop]of this.rainDrops.entries()){
    drop.visible=time!==null||rain.result==='wet';
    drop.position.y=time===null?.22:(covered?1.25:.2)+(1-(time+i*.11)%1)*2.2;
    drop.position.z=this.world(500,H*.525).z+Math.sin(i*3.1)*.63;
   }
  }
 }
 private updateStudioScenery(){
  const {stand,story,sequence,colorStage,showroom}=this.state,H=this.board.height;
  const stage=colorStage?this.board.targets[0]:undefined;
  const key=JSON.stringify([H,stand,story?.act,story?.doorOpen,sequence?.scene,sequence?.effects,sequence?.index,sequence?.phase,stage?.x,colorStage,showroom?.door,showroom?.light]);
  if(key===this.studioKey)return;
  this.studioKey=key;
  if(!this.studioScene.parent)this.scenery.add(this.studioScene);
  for(const child of [...this.studioScene.children]){child.removeFromParent();disposeModel(child);}
  if(stage&&colorStage){
   const at=this.world(stage.x,stage.y),color=stage.color||colors.cream;
   add(this.studioScene,block(8,.18,5.1,'#9cafaa'),at.x,-.01,at.z);
   const outline=new T.Group();this.outline(outline,8,5.1,color);add(this.studioScene,outline,at.x,.02,at.z);
   const shade=block(1.8,.34,.88,color);
   add(this.studioScene,shade,at.x,3.1,at.z-2.8);
   add(this.studioScene,block(.11,2.88,.12,'#748f88'),at.x,1.6,at.z-2.8);
   if(colorStage.presenting||this.state.completed){
    const glow=new T.Mesh(new T.PlaneGeometry(8,4.8),new T.MeshBasicMaterial({color,transparent:true,opacity:.36,depthWrite:false}));
    glow.rotation.x=-Math.PI/2;
    add(this.studioScene,glow,at.x,.10,at.z);
    for(const side of [-1,1])add(this.studioScene,ball(.19,color),at.x+side*3.8,.25,at.z+1.9);
   }
  }
  if(showroom){
   const at=this.world(500,H*.49);
   add(this.studioScene,block(18,.12,H*UNIT*.4,'#a5bfb3'),at.x,-.03,at.z);
   if(showroom.door){
    const cutaway=new T.Group();
    const seat=makePlayProp('seat')!;seat.scale.setScalar(1.08);
    add(cutaway,block(4.65,.13,2.65,'#425b58'),0,.06,0);
    add(cutaway,seat,.38,.08,-.18);
    const door=block(1.49,1.08,.16,'#719c99');door.rotation.y=-.8;
    add(cutaway,door,-1.64,.61,.71);
    add(this.studioScene,cutaway,-1,.02,this.world(0,H*.78).z);
   }
   if(showroom.light){
    const beam=new T.Mesh(new T.CircleGeometry(1.8,22),new T.MeshBasicMaterial({color:'#ffdf86',transparent:true,opacity:.56}));
    beam.scale.x=1.65;beam.rotation.x=-Math.PI/2;
    add(this.studioScene,beam,7,.07,at.z);
   }
  }
  if(stand){
   const at=this.world(510,H*.55);
   add(this.studioScene,block(18.5,.10,H*UNIT*.63,this.board.artworkBackground),at.x,-.054,at.z-.35);
   const stage=new T.Mesh(new T.CylinderGeometry(5.55,5.8,.28,40),material('#bbaa93'));
   add(this.studioScene,stage,at.x,-.095,at.z);
   if(this.standPreview!==stand.preview){
    this.standPreview=stand.preview;
    this.resetCamera();
    if(stand.preview){
     this.camera.position.x-=7;this.camera.position.y*=.82;
     this.camera.lookAt(this.controls.target);this.controls.update();this.camera.updateMatrixWorld();
    }
   }
  }
  if(story){
   const at=this.world(500,H*.49);
   add(this.studioScene,block(18.2,.1,H*UNIT*.48,story.act===0?'#b8cba3':'#c7bacf'),0,-.047,at.z);
   add(this.studioScene,block(17.6,.055,H*UNIT*.13,'#c6ab94'),0,-.02,this.world(0,H*.624).z);
   if(story.act===0&&story.doorOpen){
    const door=this.world(775,H*.42);
    add(this.studioScene,block(2.9,.07,2.8,'#fae5a4'),door.x,.045,door.z+1.05);
   }
  }
  if(sequence){
   const at=this.world(500,H*.245);
   add(this.studioScene,block(18.15,.1,H*UNIT*.22,sequence.scene===0?'#9bb4aa':'#9fb9bd'),0,-.042,at.z);
   if(sequence.index>=0&&sequence.index<3){
    const target=this.board.targets[sequence.index],at=this.world(target.x,target.y);
    add(this.studioScene,block(.82,.07,.14,sequence.phase==='blocked'?'#c97056':'#f2d289'),at.x,.09,at.z+.88);
   }
   for(const [step,glyph]of (sequence.scene===0?['garage','belt','tree']:['garage','flag','shower']).entries()){
    const prop=makePlayProp(glyph)!;
    add(this.studioScene,prop,-6+step*5.9,.045,this.world(0,H*.095).z);
    if(sequence.effects.includes(step)){
     add(this.studioScene,ball(.22,'#f6d170'),-5.2+step*5.9,1.35,this.world(0,H*.096).z);
     if(sequence.scene===1&&step===2)for(let i=0;i<7;i++)add(this.studioScene,ball(.10,'#7bbbcf'),2.2+i*.35,.64+i%3*.3,at.z-.34);
    }
   }
  }
 }
 private updateRepairTasks(){
  if(!this.repairTasks){
   const goal=makePlayProp('flag')!,passenger=makePlayProp('friend')!,exit=new T.Group();
   add(exit,block(1.5,2.45,.30,'#4b6054'),0,1.1);
   add(exit,block(1.25,2.06,.35,'#303e37'),0,.95,.07);
   add(exit,block(1.62,.27,.56,'#ba9770'),0,2.33,.16);
   const beam=new T.Mesh(new T.CircleGeometry(2.5,3),new T.MeshBasicMaterial({color:'#e8c66b',transparent:true,opacity:.54,side:T.DoubleSide}));
   beam.rotation.set(-Math.PI/2,0,Math.PI);beam.scale.set(1,.43,1);
   this.scenery.add(goal,passenger,exit,beam);this.repairTasks={goal,passenger,exit,beam};
  }
  const {goal,passenger,exit,beam}=this.repairTasks,H=this.board.height,task=this.board.workshopAction,ingress=this.board.workshopEffect('door');
  goal.visible=task==='wheel';goal.position.copy(this.world(875,H*.22));
  passenger.visible=task==='door'||ingress>0&&ingress<1;
  passenger.position.copy(this.world(180+ingress*250,H*(.23+ingress*.17)));
  exit.visible=task==='light'||task==='done'&&this.state.parts.includes('light');
  exit.position.copy(this.world(918,H*.52));
  beam.visible=exit.visible&&this.state.parts.includes('light');beam.position.copy(this.world(775,H*.53));beam.position.y=.06;
 }
 private updateHelperStations(){
  if(!this.helperActors){
   this.helperActors=['wheel','bubbles','box'].map((name,i)=>{
    const partner=makePlayProp('friend')!,cargo=i===1?new T.Group():makePlayProp(name)!,mark=new T.Group();
    add(mark,block(.18,.1,.48,'#efd379'),-.15,.09,0).rotation.y=-.56;
    add(mark,block(.18,.10,.86,'#efd379'),.19,.09,-.15).rotation.y=.72;
    if(i===1){
     for(let n=0;n<4;n++)add(cargo,block(.51,.06,.36,'#77533c'),(n-1.5)*.7,.61,Math.sin(n)*.45);
    }
    this.helperStations.add(partner,cargo,mark);return {partner,cargo,mark};
   });
   this.scenery.add(this.helperStations);
  }
  for(const [index,station]of this.helperActors.entries()){
   const t=this.board.helperProgress(index),target=this.board.targets[index],tool=this.board.items.find(i=>i.id==='tool-'+index)!;
   station.partner.position.copy(this.world(target.x+(index===2?-38:0),this.board.height*(.19+Math.sin(t*Math.PI)*.08)));
   station.partner.position.y=.09;
   station.cargo.position.copy(index===2&&t>0?this.world(tool.x,tool.y):this.world(target.x,target.y));
   station.cargo.position.y=index===2&&t>0?.58:.07;
   if(index===0)station.cargo.rotation.y=Math.sin(t*Math.PI*4)*.45;
   if(index===1){
    for(const [n,spot]of station.cargo.children.entries())spot.visible=t<(n+1)/5;
   }
   station.mark.visible=t===1;
   station.mark.position.copy(this.world(target.x+83,target.y-63));
  }
 }
 private updatePosterSheet(){
  const H=this.board.height;
  if(this.posterHeight!==H){
   this.posterHeight=H;
   if(this.posterSheet){this.posterSheet.removeFromParent();disposeModel(this.posterSheet);}
   this.posterSheet=block(18.4,.06,H*UNIT*.47,this.board.artworkBackground);
   add(this.scenery,this.posterSheet,0,.01,this.world(500,H*.49).z);
  }
  (this.posterSheet!.material as T.MeshStandardMaterial).color.set(this.board.artworkBackground);
 }
 private updateCrossing(){
  const H=this.board.height, point=this.board.trafficCrossing;
  if(this.crossingHeight!==H){
   this.crossingHeight=H;
   for(const child of [...this.crossingScenery.children]){child.removeFromParent();disposeModel(child);}
   const lane=this.world(point.x,H*.54);
   for(const ratio of [.30,.73])add(this.crossingScenery,block(2.4,.12,H*UNIT*.10,'#d6c7a0'),lane.x,.04,this.world(0,H*ratio).z);
   for(let n=0;n<6;n++)add(this.crossingScenery,block(1.84,.035,H*UNIT*.022,colors.cream),lane.x,.045,this.world(0,H*(.41+n*.046)).z);
   const stop=this.world(548,H*.54);
   add(this.crossingScenery,block(.18,.035,H*UNIT*.27,colors.cream),stop.x,.05,stop.z);
   this.trafficPerson=makePlayProp('friend')!;
   this.crossingScenery.add(this.trafficPerson);
  }
  this.trafficPerson!.position.copy(this.world(point.x,point.y));
  this.trafficPerson!.position.y=.08;
 }
 private updateBridgeScenery(){
  const {left,right,blocked}=this.board.bridgeGeometry, key=right+'/'+this.board.height;
  if(this.bridgeSceneryKey!==key){
   this.bridgeSceneryKey=key;
   for(const child of [...this.bridgeScenery.children]){child.removeFromParent();disposeModel(child);}
   const height=this.board.height, y=height*.44;
   const center=this.world(500,y), bankLength=(right-left)*UNIT;
   add(this.bridgeScenery,this.finishSurface(block(bankLength,.13,height*UNIT*.65,'#79b8c4'),'water',2),0,-.105,center.z-height*UNIT*.1);
   for(const x of [left,right]){
    const at=this.world(x,y);
    add(this.bridgeScenery,this.finishSurface(block(left*UNIT,.10,height*UNIT*.16,'#c9bb91'),'sand'),at.x+(x===left?-1:1)*left*UNIT/2,-.03,center.z);
    const stone=block(.46,.28,height*UNIT*.18,'#91a597');
    add(this.bridgeScenery,stone,at.x,.04,center.z);
    if(x===right)this.bridgeStone=stone;
   }
  }
  (this.bridgeStone!.material as T.MeshStandardMaterial).color.set(blocked?'#ffdf83':'#91a597');
 }
 private roadShapeKey(item:Item){return `${item.w}/${this.board.isClosedRoad(item.turn!)?'closed':this.state.road.shapes[item.turn!]}`;}
 private sync(){
  if(this.activity==='T02')this.updateBridgeScenery();
  if(this.activity==='E03')this.updateCrossing();
  if(this.activity==='L02'){
   if(!this.helpBarrier){
    this.helpBarrier=new T.Group();
    add(this.helpBarrier,block(.22,.37,3.35,'#b35f47'),0,.45,0);
    for(const z of [-1.15,0,1.15])add(this.helpBarrier,block(.25,.025,.42,colors.cream),0,.65,z);
    this.scenery.add(this.helpBarrier);
   }
   this.helpBarrier.position.copy(this.world(640,this.board.height*(.51-this.board.helpEffect*.23)));
  }
  if(this.activity==='A01')this.updatePosterSheet();
  if(this.activity==='H02')this.updateHelperStations();
  if(this.activity==='T01')this.updateRepairTasks();
  if(this.activity==='S01')this.updateRollingMarkers();
  if(this.activity==='P01')this.updateMotionTracks();
  if(['S03','L01','H01'].includes(this.activity))this.updateOutingScene();
  if(['C01','C02','C03','E01','E02'].includes(this.activity))this.updateStudioScenery();
  if(this.activity==='T03'){
   const spot=this.board.roadStopPoint;
   if(spot&&!this.roadStopMarker){
    this.roadStopMarker=new T.Group();
    add(this.roadStopMarker,block(.14,.6,.14,colors.ink),0,.32,0);
    add(this.roadStopMarker,block(.68,.43,.16,'#be7257'),0,.79,0);
    add(this.roadStopMarker,block(.48,.08,.19,colors.cream),0,.8,0);
    this.scenery.add(this.roadStopMarker);
   }
   if(this.roadStopMarker){this.roadStopMarker.visible=!!spot;if(spot)this.roadStopMarker.position.copy(this.world(spot.x,spot.y));}
  }
  const seen=new Set<string>();
  for(const item of this.board.items){seen.add(item.id);let actor=this.actors.get(item.id);
   if(actor&&item.kind==='prop'&&actor.group.userData.glyph!==item.glyph){actor.group.removeFromParent();disposeModel(actor.group);this.actors.delete(item.id);actor=undefined;}
   if(actor&&item.kind==='road'&&actor.group.userData.road!==this.roadShapeKey(item)){this.retired.add(actor.group);this.actors.delete(item.id);actor=undefined;}
   if(actor&&item.kind==='plank'&&actor.group.userData.sizeKey!==`${item.w}/${item.h}`){this.retired.add(actor.group);this.actors.delete(item.id);actor=undefined;}
   if(!actor){actor=item.kind==='car'||item.kind==='body'?this.vehicle({...item,carId:item.carId||this.carId}):this.prop(item);this.actors.set(item.id,actor);actor.group.userData.glyph=item.glyph;if(item.kind==='road')actor.group.userData.road=this.roadShapeKey(item);if(item.kind==='plank')actor.group.userData.sizeKey=`${item.w}/${item.h}`;}
   if(item.id==='paper')actor.group.traverse(node=>{if(node instanceof T.Mesh&&node.material instanceof T.MeshPhongMaterial&&node.material.name==='paper-sheet')node.material.color.set(this.board.artworkBackground);});
   if(['M01','M02','M03','T02'].includes(this.activity)&&actor.model){actor.scale=item.w*UNIT/4.65;actor.group.scale.setScalar(actor.scale);}
   const position=this.world(item.x,item.y),dx=position.x-actor.x,dz=position.z-actor.z,dist=Math.hypot(dx,dz),held=this.board.selectedItem===item.id;
   if(actor.model&&dist>.002&&dist<3){const target=Math.atan2(-dz,dx);if(this.activity!=='T04'&&!item.placed)actor.yaw+=Math.atan2(Math.sin(target-actor.yaw),Math.cos(target-actor.yaw))*.2;for(const wheel of actor.wheels)wheel.rotateOnAxis(wheel.userData.axis,dist/.3/Math.max(.1,actor.scale));}
   if(actor.model){actor.scale=item.w*UNIT/4.65;actor.group.scale.setScalar(actor.scale);}
   actor.group.position.set(position.x,held&&this.pointer?.item===item.id ? .55 : .03,position.z);if(item.placed&&this.activity!=='T03')actor.yaw*=.7;actor.group.rotation.y=actor.yaw;
   if(item.kind==='shape'&&actor.group.userData.roller)actor.group.userData.roller.rotation.z=(item.home.x-item.x)/Math.max(60,item.w/2);
   if(actor.model&&this.activity==='P01'){
    const rough=this.board.isRoughLane(item.id==='runner'?0:1);
    if(rough)actor.group.position.y+=Math.sin(position.x*18)*Math.min(.04,dist*.4);
    actor.group.rotation.z=rough?Math.sin(position.x*10)*Math.min(.025,dist*.2):0;
   }
   if(this.activity==='T02'&&item.id==='traveller'){
    const {left,right}=this.board.bridgeGeometry;
    actor.group.position.y=item.x>left&&item.x<right?.31:.03;
   }
   actor.group.visible=item.available!==false&&!(this.state.stand?.preview&&item.id.startsWith('stamp-'));
   if(item.id==='parts-car'&&this.state.showroom){
    const {wheel,light}=this.state.showroom,previous=Number(actor.group.userData.showroomRotation||0);
    if(wheel!==previous){
     for(const mesh of actor.wheels)mesh.rotateOnAxis(mesh.userData.axis,wheel-previous);
     actor.group.userData.showroomRotation=wheel;
    }
    actor.light?.forEach(m=>{m.emissive.set(light?'#fff0a0':'#000000');m.emissiveIntensity=light?2:0;});
   }
   if(item.kind==='wheel'){actor.group.visible=!item.placed;actor.group.position.y=1;actor.group.rotation.z=position.x*1.4;}
   if(item.kind==='bay'&&item.placed)actor.group.visible=false;
   if(item.id==='signal'){const red=actor.group.children[2] as T.Mesh,green=actor.group.children[3]as T.Mesh;(red.material as T.MeshStandardMaterial).emissive.set(this.state.signalGreen?'#000000':'#d95440');(green.material as T.MeshStandardMaterial).emissive.set(this.state.signalGreen?'#75df8d':'#000000');}
   if(item.id==='body'){
    actor.group.rotation.z=item.placed?this.board.assemblyWobble:0;
    for(const wheel of actor.wheels){const center=new T.Box3().setFromObject(wheel,true).getCenter(new T.Vector3());const relative=center.clone().sub(actor.group.position);if(relative.z>0)wheel.visible=!!this.board.items.some(i=>i.kind==='wheel'&&i.dock===(relative.x<0?'wheel-0':'wheel-1')&&i.placed);}
    // An inseparable author mesh is a translucent assembly preview, rather
    // than an already finished vehicle above unrelated loose parts.
    if(!actor.wheels.length)actor.model?.traverse(object=>{if(!(object instanceof T.Mesh))return;for(const m of Array.isArray(object.material)?object.material:[object.material]){m.userData.baseOpacity??=m.opacity;const preview=!this.board.items.filter(i=>i.kind==='wheel').every(i=>i.placed);m.opacity=m.userData.baseOpacity*(preview?.24:1);m.transparent=preview||m.opacity<1;m.depthWrite=!preview;}});
   }
   actor.x=position.x;actor.z=position.z;
  }
  if(this.activity==='T04'){const width=this.board.items.find(i=>i.id==='body')?.w||0;if(width!==this.assemblyWidth){this.assemblyWidth=width;this.fitContentCamera();}}
  if(this.activity==='H03'){
   const key=`${this.state.wash.clean}-${this.state.wash.waiting}`;
   if(key!==this.washKey){this.washKey=key;const previous=this.actors.get('wash-car');if(previous)this.retired.add(previous.group);const id=this.state.wash.clean===1&&!this.state.wash.waiting?'CAR11':this.carId;const actor=this.vehicle({id:'wash-car',carId:id,w:820});actor.group.position.copy(this.world(500,this.board.height*.4));this.actors.set('wash-car',actor);if(this.washGantry)this.washGantry.scale.y=Math.max(1,(new T.Box3().setFromObject(actor.model!,true).max.y+1)/6);this.fitContentCamera();this.createDirt(actor);}
   seen.add('wash-car');
  }
  for(const[id,actor]of this.actors)if(!seen.has(id)){
   if(id.startsWith('poster-mark-')){actor.group.removeFromParent();disposeModel(actor.group);}
   else this.retired.add(actor.group);
   this.actors.delete(id);
  }
  const targetIds=new Set(this.board.targets.map(t=>t.id));
  for(const[id,group]of this.targets)if(!targetIds.has(id)){this.retired.add(group);this.targets.delete(id);}
  for(const target of this.board.targets){let group=this.targets.get(target.id);const sizeKey=`${target.w}/${target.h}/${target.sizeTier??''}`;if(group&&group.userData.sizeKey!==sizeKey){this.retired.add(group);this.targets.delete(target.id);group=undefined;}if(!group){group=new T.Group();group.userData.target=target.id;group.userData.sizeKey=sizeKey;
    if(this.activity==='T04'&&target.id.startsWith('wheel-')){const radius=target.w*UNIT*.43;const ring=new T.Mesh(new T.TorusGeometry(radius,.065,6,32),new T.MeshBasicMaterial({color:'#fff2be'}));group.add(ring);const hit=new T.Mesh(new T.BoxGeometry(radius*2.3,radius*2.3,.5),new T.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false}));group.add(hit);}
    else{this.outline(group,target.w*UNIT,target.h*UNIT,target.color||'#698779');const fill=new T.Mesh(new T.PlaneGeometry(target.w*UNIT,target.h*UNIT),new T.MeshBasicMaterial({color:target.color||colors.cream,transparent:true,opacity:.24,depthWrite:false,side:T.DoubleSide}));fill.rotation.x=-Math.PI/2;fill.position.y=.025;fill.userData.destinationFill=true;group.add(fill);}
    group.userData.feedbackMeshes=group.children.filter(o=>o instanceof T.Mesh);
    if(target.blocked){
     add(group,block(target.w*UNIT*.77,.20,.18,'#a64b3b'),0,.56,0);
     for(const side of [-1,1]){
      const pole=new T.Mesh(new T.ConeGeometry(.28,.85,16),material('#d78250'));
      add(group,pole,side*target.w*UNIT*.36,.42,0);
      add(group,block(.53,.12,.45,colors.cream),side*target.w*UNIT*.36,.12,0);
     }
    }
    if(target.sizeTier!==undefined){
     const width=(94+target.sizeTier*54)*UNIT,z=-target.h*UNIT*.69;
     add(group,block(width+.25,.13,.38,'#dfc78f'),0,.07,z);
     add(group,block(width,.03,.10,colors.ink),0,.15,z);
     for(const side of [-1,1])add(group,block(.10,.03,.26,colors.ink),side*width/2,.15,z);
    }
    if(target.long){
     for(const side of [-1,1]){
      const marker=block(.22,.08,target.h*UNIT*.4,'#e8c186');
      add(group,marker,side*target.w*UNIT*.43,.075,0);
     }
    }
    if(target.glyph&&!/^\d$/.test(target.glyph)){const prop=this.prop({id:'target-'+target.id,kind:'prop',glyph:target.glyph,w:Math.min(target.w,150),h:Math.min(target.h,150),x:0,y:0,home:{x:0,y:0}});group.add(prop.group);prop.group.traverse(o=>delete o.userData.item);}
    if(target.glyph&&/^\d$/.test(target.glyph)){for(let i=0;i<Number(target.glyph);i++)add(group,ball(.16,colors.cream),-.35*(Number(target.glyph)-1)+i*.7,.2,-target.h*UNIT*.32);}
    this.scene.add(group);this.targets.set(target.id,group);}group.position.copy(this.targetPoint(target));group.visible=(target.enabled!==false||target.construction===true)&&(!target.occupied||!!target.glyph)&&!(this.activity==='T04'&&target.id.startsWith('wheel-')&&!this.board.targets[0]?.occupied);
    const selected=this.board.selectedItem,matches=!!selected&&this.board.canPlace(selected,target.id);
    for(const mesh of group.userData.feedbackMeshes as T.Mesh[]){const m=mesh.material as T.MeshBasicMaterial;m.color.set(matches?'#f1bd58':target.construction&&target.enabled===false?'#d4aa72':target.color||(mesh.userData.destinationFill?colors.cream:'#698779'));if(mesh.userData.destinationFill)m.opacity=matches?.35:target.construction&&target.enabled===false?.65:this.state.hint?.3:.24;}
    group.userData.color='#'+((group.userData.feedbackMeshes[0] as T.Mesh).material as T.MeshBasicMaterial).color.getHexString();
  }
  const chosen=this.actors.get(this.board.selectedItem||(this.activity==='H03'&&!this.state.wash.waiting?this.board.washTool:''));this.selection.visible=!!chosen&&!this.state.completed;
  if(chosen){const bounds=this.actorBounds(chosen),size=bounds.getSize(new T.Vector3());this.selection.position.copy(bounds.getCenter(new T.Vector3()));this.selection.position.y=.07;this.selection.scale.set(Math.max(.7,size.x*.62),Math.max(.6,size.z*.7),1);}
  const phoneFocusKey=`${this.phoneFocus()}/${this.board.height}/${this.board.items[0]?.w}/${this.state.visit?.location}`;
  if(phoneFocusKey!==this.phoneFocusKey){this.phoneFocusKey=phoneFocusKey;if(this.phoneFocus())this.fitContentCamera();}
  if(this.activity==='S02'){
   const car=this.actors.get('shadow-car');
   if(car){
    if(!this.shadow){
     const create=(opacity:number)=>{
      const group=car.group.clone(true);
      group.traverse(o=>{delete o.userData.item;if(o.userData.contactShadow)o.visible=false;
       if(o instanceof T.Mesh)o.material=new T.MeshBasicMaterial({color:'#445b5f',transparent:true,opacity,depthWrite:false});});
      this.scene.add(group);return group;
     };
     this.shadow=create(.38);this.shadowPrevious=create(.17);
    }
    const display=(group:T.Group,lamp:{lampX:number;lampY:number})=>{
     const point=this.world(500+(500-lamp.lampX)*.57,this.board.height*.69);
     group.position.copy(point);group.position.y=.055;
     group.scale.set(car.scale*(.65+lamp.lampY*1.75),.006,car.scale);group.rotation.y=car.yaw;
    };
    display(this.shadow,this.board.currentShadow);
    const previous=this.board.previousShadow;
    this.shadowPrevious!.visible=!!previous;
    if(previous)display(this.shadowPrevious!,previous);
   }
  }
  this.syncDirt();
  if(this.activity==='A02')this.updateTreadCanvas();

  if(this.state.completed&&!this.complete){this.burst(new T.Vector3(0,2,0),'#f1ca6c',32);}this.complete=this.state.completed;
 }
 private publishViewState(){
  const marks=this.activity==='A02'?this.board.artwork:[];
  const trackPosition=(mark:typeof marks[number]|undefined)=>mark?this.world(mark.x*1000,mark.y*this.board.height).toArray():undefined;
  this.renderer.domElement.dataset.state=JSON.stringify({...this.state,orbit:this.orbit,washPatchIds:this.dirtPoints.filter(p=>p.visible).map(p=>p.userData.patchId),tracks:{revision:this.markRevision,count:marks.length,first:trackPosition(marks[0]),last:trackPosition(marks.at(-1))},partScreens:this.partScreens(),partEffect:this.partPulse?{part:this.partPulse.part,screen:this.project(this.partPulse.mesh.position)}:undefined,boardHeight:this.board.height,floorProjection:new T.Matrix4().multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse).toArray(),items:this.board.items.map(i=>({id:i.id,x:i.x,y:i.y,placed:!!i.placed,available:i.available})),actors:[...this.actors].map(([id,a])=>({id,sourceCar:a.sourceCar,position:a.group.position.toArray(),screen:this.project(this.actorBounds(a).getCenter(new T.Vector3())),screenBounds:this.screenBounds(this.actorBounds(a)),yaw:a.group.rotation.y,mesh:!!a.model,wheelCount:a.wheels.length,wheelRotation:a.wheels[0]?.quaternion.toArray()})),targetScreens:this.board.targets.map(t=>({id:t.id,screen:this.project(this.targetPoint(t)),color:this.targets.get(t.id)?.userData.color})),dirt:this.dirtPoints.filter(p=>p.visible).map(p=>this.project(p.position)),washDirt:this.dirtPoints.filter(mesh=>mesh.visible).map(mesh=>({kind:mesh.userData.kind,point:this.project(mesh.position)})),camera:this.camera.position.toArray(),triangles:this.renderer.info.render.triangles});
 }
 private updateTreadCanvas(){
  const H=this.board.height;
  if(this.treadHeight!==H){
   for(const child of [...this.tracks.children]){child.removeFromParent();disposeModel(child);}
   const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=H;
   const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
   const plane=new T.Mesh(new T.PlaneGeometry(20,H*UNIT),new T.MeshBasicMaterial({map,transparent:true,depthWrite:false}));
   plane.rotation.x=-Math.PI/2;add(this.tracks,plane,0,.07,0);this.treadCanvas=canvas;this.treadTexture=map;
   this.treadHeight=H;this.markRevision=-1;
  }
  if(this.markRevision===this.board.artworkRevision)return;
  const c=this.treadCanvas!.getContext('2d')!;
  c.clearRect(0,0,1000,H);
  const paper=this.board.trackSheet;c.fillStyle=this.board.artworkBackground;
  c.beginPath();c.roundRect(paper.x-paper.w/2,paper.y-paper.h/2,paper.w,paper.h,22);c.fill();
  for(const mark of this.board.artwork)paintMark(c,mark,1000,H,.52);
  this.treadTexture!.needsUpdate=true;this.markRevision=this.board.artworkRevision;
 }
 private project(point:T.Vector3){const p=point.clone().project(this.camera);return{x:(p.x+1)/2,y:(1-p.y)/2};}
 private createDirt(actor:Actor){
  for(const child of [...this.dirt.children])this.retired.add(child);this.dirtPoints=[];
  if(this.state.wash.waiting||this.state.completed)return;
  this.scene.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(actor.model!,true),size=box.getSize(new T.Vector3());
  this.surfaceCarIndex=this.state.wash.clean;
  if(!this.board.washLayout){
  const blockers=[...this.actors.values()].map(actor=>actor.group).concat(this.scenery);
  const deposit=(hit:T.Intersection,index:number)=>{
   const toward=hit.point.clone().sub(this.camera.position).normalize();
   const visible=new T.Raycaster(this.camera.position,toward).intersectObjects(blockers,true).find(hit=>this.visibleParents(hit.object));
   if(!visible||visible.point.distanceTo(hit.point)>.18)return;
   const normal=(hit.face?.normal.clone()||new T.Vector3(0,1,0)).applyNormalMatrix(new T.Matrix3().getNormalMatrix(hit.object.matrixWorld));
   if(normal.dot(this.camera.position.clone().sub(hit.point))<0)normal.negate();
   const dirt=ball(.22+(.065*(index%3)),index%2?'#89684b':'#b08a5b');dirt.scale.y=.35;dirt.position.copy(hit.point).addScaledVector(normal,.035);this.dirt.add(dirt);this.dirtPoints.push(dirt);
  };
  for(let i=0;i<48;i++){
   const x=box.min.x+size.x*(.06+(i%12)/13),z=box.min.z+size.z*(.1+Math.floor(i/12)/4.5);
   const hit=new T.Raycaster(new T.Vector3(x,box.max.y+1,z),new T.Vector3(0,-1,0)).intersectObject(actor.model!,true)[0];
   if(hit)deposit(hit,i);
  }
  // A very narrow or open body can miss the overhead grid. Seed an actual
  // visible surface instead of leaving an unfinishable, apparently clean car.
  if(!this.dirtPoints.length){
   const screen=this.screenBounds(box),ray=new T.Raycaster();
   for(let y=0;y<5&&!this.dirtPoints.length;y++)for(let x=0;x<5&&!this.dirtPoints.length;x++){
    ray.setFromCamera(new T.Vector2((screen.min.x+(screen.max.x-screen.min.x)*(x+.5)/5)*2-1,1-(screen.min.y+(screen.max.y-screen.min.y)*(y+.5)/5)*2),this.camera);
    const hit=ray.intersectObject(actor.model!,true)[0];if(hit)deposit(hit,0);
   }
  }

   const seeds=this.dirtPoints.map(p=>p.position.clone().sub(box.min).divide(size));
   if(seeds.length){
    this.board.setWashLayout(this.board.washPatches.map(p=>{
     const desired=new T.Vector3(p.x/1000,.8,p.y/450);
     const nearest=seeds.reduce((best,next)=>next.distanceToSquared(desired)<best.distanceToSquared(desired)?next:best);
     return{x:nearest.x,y:nearest.y,z:nearest.z};
    }));
   }
   for(const mesh of this.dirtPoints){mesh.removeFromParent();disposeModel(mesh);}this.dirtPoints=[];
  }
  this.board.washLayout?.forEach((p,index)=>{
   const patch=this.board.washPatches[index],mesh=ball(.22+(.065*(patch.id%3)),patch.id%2?'#89684b':'#b08a5b');mesh.scale.y=.35;
   mesh.position.set(p.x,p.y,p.z).multiply(size).add(box.min);mesh.userData.patchId=patch.id;mesh.visible=!patch.clean;
   this.dirt.add(mesh);this.dirtPoints.push(mesh);
  });
 }
 private syncDirt(){
  const patches=new Map(this.board.washPatches.map(p=>[p.id,p]));
  for(const mesh of this.dirtPoints){
   const patch=patches.get(mesh.userData.patchId);mesh.visible=!!patch&&!patch.clean;
   if(!patch)continue;
   mesh.userData.kind=patch.kind;
   (mesh.material as T.MeshStandardMaterial).color.set(patch.kind==='foam'?'#dfedf1':patch.kind==='stubborn'?'#654734':'#b59768');
   mesh.scale.y=patch.kind==='foam'?.72:.35;
  }
 }
 private scrub(point:T.Vector3){
  this.needsRender=true;
  if(!this.dirtPoints.length)return;
  const ids=this.dirtPoints.filter(d=>d.visible&&d.position.distanceTo(point)<(this.board.washTool==='sponge'?1.88:1.65)*this.board.difficulty.washScale).map(d=>d.userData.patchId as number);
  this.board.washSurface(ids,this.surfaceCarIndex);
  this.syncDirt();
  if(!this.reduced&&!this.software&&this.particles.length<12){const mesh=ball(.1,'#d5f5f6');mesh.material.opacity=.65;mesh.material.transparent=true;mesh.position.copy(point);this.scene.add(mesh);this.particles.push({mesh,velocity:new T.Vector3((Math.random()-.5)*1.5,1.2,(Math.random()-.5)*1.5),life:1});}
 }
 private burst(at:T.Vector3,color:string,count=7){if(this.reduced||this.software)return;if(this.simpleMaterials)count=Math.min(count,8);for(let i=0;i<count;i++){const mesh=new T.Mesh(new T.IcosahedronGeometry(.08,0),material(i%2?color:'#b8dccc'));mesh.position.copy(at);this.scene.add(mesh);this.particles.push({mesh,velocity:new T.Vector3((Math.random()-.5)*5,2+Math.random()*4,(Math.random()-.5)*5),life:1.1});}}
 private renderScene(){
  if(this.backdrop)this.backdrop.render(this.renderer,this.scene,this.camera);
  else this.renderer.render(this.scene,this.camera);
 }
 private draw=(now:number)=>{
  this.frame=0;
  if(this.disposed||document.hidden)return;
  const interacting=!this.paused&&(!!this.pointer||this.state.moving||this.state.recovering);
  const effects=!this.paused&&(this.particles.length>0||!!this.partPulse);
  const immediateDrag=!!this.backdrop&&!!this.pointer;
  if(!immediateDrag&&(this.software||!(interacting||this.orbit||effects))&&now-this.rendered<33){this.schedule();return;}
  this.rendered=now;
  const dt=Math.min(.05,(now-this.last)/1000);
  this.last=now;
  if(!this.paused){
   const revision=JSON.stringify([this.state,this.board.artworkBackground,this.board.items.map(i=>[i.x,i.y,i.w,i.h,i.placed,i.turn]),this.board.selectedItem,this.board.assemblyWobble,this.activity==='T01'?this.board.workshopEffect('door'):0,this.board.rainTime]);
   if(revision!==this.revision){this.revision=revision;this.needsRender=true;}
   for(const p of this.particles){
    p.life-=dt;p.velocity.y-=dt*4;p.mesh.position.addScaledVector(p.velocity,dt);
    p.mesh.scale.setScalar(Math.max(.01,p.life));
    if(p.life<=0){p.mesh.removeFromParent();disposeModel(p.mesh);this.needsRender=true;}
   }
   this.particles=this.particles.filter(p=>p.life>0);
   if(this.partPulse){
    const pulse=this.partPulse;
    pulse.life-=dt;
    if(!this.reduced)pulse.mesh.scale.setScalar(1+(1.2-pulse.life)*.45);
    if(pulse.life<=0){pulse.mesh.removeFromParent();disposeModel(pulse.mesh);this.partPulse=undefined;this.needsRender=true;}
   }
  }
  const changed=this.controls.update();
  const draw=this.needsRender||changed||(!this.paused&&(this.particles.length>0||!!this.partPulse&&!this.reduced));
  if(draw){
   try{
    if(this.ready)this.sync();
    this.renderScene();
    if(this.ready)this.publishViewState();
    this.needsRender=false;
   }catch(error){this.reportFailure('render',error);return;}
  }
  if(interacting||effects||draw)this.schedule();
 };
 guidePreview(canvas:HTMLCanvasElement,step:number,phase:number,large=false){
  if(!this.ready)return;const cue=this.board.demonstration,actor=this.actors.get(cue.item?.id||'wash-car');
  const original=actor&&{position:actor.group.position.clone(),quaternion:actor.group.quaternion.clone()};
  const point=step===0?cue.start:step===2?cue.end:{x:cue.start.x+(cue.end.x-cue.start.x)*phase,y:cue.start.y+(cue.end.y-cue.start.y)*phase};
  if(actor&&step>0){if(['drag','push'].includes(cue.action)){const target=this.board.targets.find(t=>t.x===cue.end.x&&t.y===cue.end.y),t=step===2?1:phase,end=target?this.targetPoint(target):this.world(cue.end.x,cue.end.y);actor.group.position.lerpVectors(original!.position,end,t).add(new T.Vector3(0,Math.sin(t*Math.PI)*.35,0));}if(cue.action==='turn')actor.group.rotation.y+=Math.PI/2*phase;}
  this.renderScene();const width=large?1000:240,height=Math.round(width/this.camera.aspect);if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;const ctx=canvas.getContext('2d')!;ctx.drawImage(this.renderer.domElement,0,0,canvas.width,canvas.height);
  let projected=this.project(this.world(point.x,point.y).add(new T.Vector3(0,actor?1:0,0)));
  if(['E02','T01'].includes(this.activity)){const part=(['wheel','light','door'] as const).find(p=>!this.state.parts.includes(p))||'wheel';projected=this.partScreens()?.[part]||projected;}
  else if(this.activity==='H03'&&cue.action==='wipe'){const visible=this.dirtPoints.filter(d=>d.visible);const dirt=visible[Math.min(visible.length-1,Math.floor(phase*Math.max(0,visible.length-1)))];if(dirt)projected=this.project(dirt.position);}
  else if(cue.item){const target=this.board.targets.find(t=>t.x===cue.end.x&&t.y===cue.end.y),start=this.actors.get(cue.item.id);if(start){const from=this.actorBounds(start).getCenter(new T.Vector3()),to=target?this.targetPoint(target):from;if(step===2&&target)projected=this.project(to);else if(step===0)projected=this.project(from);}}
  const x=projected.x*canvas.width,y=projected.y*canvas.height,scale=canvas.width/1000;
  ctx.strokeStyle='#ba8135';ctx.lineWidth=6*scale;ctx.beginPath();ctx.ellipse(x,y,50*scale,30*scale,0,0,Math.PI*2);ctx.stroke();drawPlaySymbol(ctx,'hand',x+25*scale,y+35*scale,75*scale);
  if(original&&actor){actor.group.position.copy(original.position);actor.group.quaternion.copy(original.quaternion);}this.invalidate();
 }
 private reportFailure(reason:string,error?:unknown){if(!this.disposed){console.warn('立体玩法暂时无法打开：'+reason,error);this.failed();}}
 dispose(){if(this.disposed)return;this.cancel();this.disposed=true;this.abort.abort();cancelAnimationFrame(this.frame);this.observer.disconnect();this.motionPreference.removeEventListener('change',this.setMotionPreference);document.removeEventListener('visibilitychange',this.schedule);this.controls.removeEventListener('change',this.invalidate);this.controls.dispose();const canvas=this.renderer.domElement;
  canvas.removeEventListener('pointerdown',this.down);canvas.removeEventListener('pointermove',this.move);canvas.removeEventListener('pointerup',this.up);canvas.removeEventListener('pointercancel',this.cancel);canvas.removeEventListener('lostpointercapture',this.cancel);canvas.removeEventListener('keydown',this.key);canvas.removeEventListener('webglcontextlost',this.lost);
  disposeModel(new T.Group().add(this.scene,...[...this.templates.values()].map(t=>t.root)));this.scene.traverse(node=>{if(node instanceof T.DirectionalLight)node.dispose();});this.backdrop?.dispose();this.paperBackdrop?.dispose();this.environment?.dispose();this.renderer.dispose();this.renderer.forceContextLoss();canvas.remove();}
}
