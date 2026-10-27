import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';
import {drawPlaySymbol,symbolSvg} from '../visual/play-symbols';
import type {TouchBoard,BoardSnapshot} from '../game/TouchBoard';
import {vehicleModel} from '../domain/vehicle-models';
import {loadPlayVehicle,type PlayVehicle} from './play-model';
import {disposeModel} from './model';

type Item=TouchBoard['items'][number];
type Actor={group:T.Group;model?:T.Group;sourceCar?:string;wheels:T.Group[];x:number;z:number;yaw:number;scale:number;bounds?:T.Box3;light?:(T.MeshStandardMaterial|T.MeshLambertMaterial)[]};
const UNIT=.02;
const colors={ink:'#365653',cream:'#fff5da',green:'#8eb987',road:'#7c9899',water:'#8dccdf',wood:'#c99562'};
const material=(color:string,_roughness=.7)=>new T.MeshLambertMaterial({color});
function block(w:number,h:number,d:number,color:string){const m=new T.Mesh(new T.BoxGeometry(w,h,d),material(color));m.castShadow=true;m.receiveShadow=true;return m;}
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
 private dirt=new T.Group();
 private tracks=new T.Group();
 private markCount=0;
 private shadow?:T.Group;
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
 private orbit=false;
 private pointer:{id:number;item?:string;start:T.Vector3;boardStart:{x:number;y:number};wash?:boolean}|null=null;
 private last=performance.now();
 private time=0;
 private rendered=0;
 private revision='';
 private needsRender=true;
 private complete=false;
 private washKey='';
 private assemblyWidth=0;
 private state:BoardSnapshot;
 private reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 paused=false;
 constructor(private host:HTMLDivElement,private board:TouchBoard,private carId:string,private activity:string,state:BoardSnapshot,private changed:(ready:boolean)=>void,private failed:()=>void){
  this.state=state;
  this.renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
  const gl=this.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');const software=!!debug&&/swiftshader|llvmpipe|software/i.test(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));// Gameplay uses light diffuse surfaces; the showroom retains full PBR detail.
  this.software=software;this.simpleMaterials=true;this.renderer.domElement.dataset.quality=software?'simple':'balanced';this.renderer.setPixelRatio(Math.min(devicePixelRatio,software?.65:1.25));this.renderer.setClearColor('#d9edf0');
  this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1;
  this.renderer.shadowMap.enabled=false;
  const canvas=this.renderer.domElement;canvas.className='touch-world-canvas';canvas.tabIndex=0;canvas.setAttribute('role','application');canvas.setAttribute('aria-label',activity==='H03'?'立体洗车场景，直接擦洗车身；回车擦洗下一处，第一辆洗净后回车换车':'立体汽车互动场景，直接拖动车辆和物件；方向键移动，回车放下，方括号选择物体');canvas.dataset.ready='false';canvas.dataset.activity=activity;host.append(canvas);
  this.scene.add(new T.HemisphereLight('#f2faff','#adc395',2.2));
  const sun=new T.DirectionalLight('#fff5df',3.1);sun.position.set(-8,18,10);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-15;sun.shadow.camera.right=15;sun.shadow.camera.top=20;sun.shadow.camera.bottom=-20;sun.shadow.normalBias=.035;sun.shadow.bias=-.0003;this.scene.add(sun);
  this.scene.add(this.retired,this.scenery,this.dirt,this.tracks);this.retired.visible=false;

  this.controls=new OrbitControls(this.camera,canvas);this.controls.enablePan=false;this.controls.enableDamping=true;this.controls.minPolarAngle=.25;this.controls.maxPolarAngle=1.35;this.controls.minDistance=18;this.controls.maxDistance=65;this.controls.enabled=false;
  this.buildScenery();this.resetCamera();
  canvas.addEventListener('pointerdown',this.down);canvas.addEventListener('pointermove',this.move);canvas.addEventListener('pointerup',this.up);canvas.addEventListener('pointercancel',this.cancel);canvas.addEventListener('lostpointercapture',this.cancel);canvas.addEventListener('keydown',this.key);canvas.addEventListener('webglcontextlost',this.lost);
  this.observer=new ResizeObserver(this.resize);this.observer.observe(host);this.resize();
  void this.load().catch(error=>this.reportFailure('model loading',error));
  this.frame=requestAnimationFrame(this.draw);
 }
 update(state:BoardSnapshot){this.state=state;}
 setOrbit(enabled:boolean){this.orbit=enabled;this.controls.enabled=enabled;this.needsRender=true;this.cancel();}
 resetCamera(){const length=this.board.height*UNIT;this.camera.position.set(10,Math.max(19,length*1.2),Math.max(18,length*1.15));this.camera.lookAt(0,0,0);this.controls.target.set(0,0,0);this.controls.update();this.resize();}
 private resize=()=>{if(this.disposed)return;const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight);this.renderer.setSize(w,h,false);this.camera.aspect=w/h;const depth=this.board.height*UNIT;const distance=Math.max(depth*1.9,22/this.camera.aspect/Math.tan(37*Math.PI/360)/2)*1.12;const direction=this.camera.position.clone().sub(this.controls.target).normalize();this.camera.position.copy(this.controls.target).addScaledVector(direction,distance);this.camera.updateProjectionMatrix();if(this.activity==='T04'&&this.actors.size)this.fitAssemblyCamera();this.needsRender=true;};
 private fitAssemblyCamera(){
  const depth=this.board.height*UNIT,bounds=new T.Box3(new T.Vector3(-11,-.5,-depth/2-1),new T.Vector3(11,0,depth/2+1));
  for(const actor of this.actors.values())if(actor.group.visible)bounds.expandByObject(actor.group,true);
  const direction=this.camera.position.clone().sub(this.controls.target).normalize(),center=bounds.getCenter(new T.Vector3());
  this.controls.target.copy(center);let distance=this.camera.position.distanceTo(center);
  for(let attempt=0;attempt<30;attempt++){
   this.camera.position.copy(center).addScaledVector(direction,distance);this.camera.lookAt(center);this.camera.updateMatrixWorld(true);
   const projected=this.screenBounds(bounds);if(projected.min.x>=.07&&projected.min.y>=.07&&projected.max.x<=.93&&projected.max.y<=.93)break;distance*=1.08;
  }
  this.controls.update();this.needsRender=true;
 }
 private actorBounds(actor:Actor){actor.group.updateWorldMatrix(true,false);return actor.bounds!.clone().applyMatrix4(actor.group.matrixWorld);}
 private screenBounds(bounds:T.Box3){const min=new T.Vector2(Infinity,Infinity),max=new T.Vector2(-Infinity,-Infinity);for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=this.project(new T.Vector3(x,y,z));min.min(new T.Vector2(p.x,p.y));max.max(new T.Vector2(p.x,p.y));}return{min:{x:min.x,y:min.y},max:{x:max.x,y:max.y}};}
 private async load(){
  const ids=new Set([this.carId,...this.board.items.filter(i=>i.kind==='car'&&i.carId&&vehicleModel(i.carId)).map(i=>i.carId!)]);
  const timer=setTimeout(()=>{this.abort.abort();this.reportFailure('model timeout');},30000);
  try{await Promise.all([...ids].map(async id=>{const model=await loadPlayVehicle(id,this.abort.signal);if(this.disposed){disposeModel(model.root);return;}this.templates.set(id,model);}));
   if(this.disposed)return;this.sync();this.renderer.render(this.scene,this.camera);this.sync();this.ready=true;this.renderer.domElement.dataset.ready='true';this.renderer.domElement.dataset.modelCount=String(this.templates.size);this.changed(true);
  }finally{clearTimeout(timer);}
 }
 private world(x:number,y:number){return new T.Vector3((x-500)*UNIT,0,(y-this.board.height/2)*UNIT);}
 private point(event:PointerEvent){const rect=this.renderer.domElement.getBoundingClientRect();this.ray.setFromCamera(new T.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),this.camera);return this.ray.ray.intersectPlane(this.floorPlane,new T.Vector3());}
 private boardPoint(point:T.Vector3){return{x:point.x/UNIT+500,y:point.z/UNIT+this.board.height/2};}
 private pick(){this.scene.updateMatrixWorld(true);const roots=[...this.actors.values()].map(a=>a.group);return this.ray.intersectObjects(roots,true).find(hit=>hit.object.visible&&this.visibleParents(hit.object));}
 private visibleParents(object:T.Object3D):boolean{if(!object.visible)return false;return object.parent?this.visibleParents(object.parent):true;}
 private actorId(object:T.Object3D){let p:T.Object3D|null=object;while(p){if(p.userData.item)return p.userData.item as string;p=p.parent;}return undefined;}
 private partAt(actor:Actor,hit:T.Intersection){
  const p=actor.group.worldToLocal(hit.point.clone()),name=(hit.object.name+' '+(Array.isArray((hit.object as T.Mesh).material)?((hit.object as T.Mesh).material as T.Material[])[hit.face?.materialIndex||0]?.name:((hit.object as T.Mesh).material as T.Material)?.name)).toLowerCase();
  const bounds=this.templates.get(actor.sourceCar!)!.bounds,size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()),x=(p.x-center.x)/size.x,y=(p.y-bounds.min.y)/size.y,z=Math.abs(p.z-center.z)/size.z;
  const wheel=actor.wheels.some(w=>{let node:T.Object3D|null=hit.object;while(node){if(node===w)return true;node=node.parent;}return false;});
  if(wheel||/wheel|tire|tyre|rim/.test(name)&&y<.5||!actor.wheels.length&&Math.abs(x)>.22&&Math.abs(x)<.43&&y>.02&&y<.4&&z>.27)return 'wheel' as const;
  if(/head.?light|head.?lamp/.test(name)||x>.36&&y>.12&&y<.58)return 'light' as const;
  if(Math.abs(x)<.25&&y>.18&&y<.64&&z>.32)return 'door' as const;
  return undefined;
 }
 private partScreens(){
  const actor=this.actors.get('parts-car');if(!actor)return undefined;actor.group.updateWorldMatrix(true,true);const cameraKey=[...this.camera.matrixWorld.elements,...this.camera.projectionMatrix.elements,...actor.group.matrixWorld.elements].map(n=>n.toFixed(4)).join(',');if(actor.group.userData.partCamera===cameraKey&&actor.group.userData.partScreens)return actor.group.userData.partScreens;
  actor.group.updateWorldMatrix(true,true);const bounds=new T.Box3().setFromObject(actor.model!,true),screen=this.screenBounds(bounds),points:Record<string,{x:number;y:number}>={},scores:Record<string,number>={};
  const ray=new T.Raycaster();for(let y=0;y<16;y++)for(let x=0;x<28;x++){const p={x:screen.min.x+(screen.max.x-screen.min.x)*(x+.5)/28,y:screen.min.y+(screen.max.y-screen.min.y)*(y+.5)/16};ray.setFromCamera(new T.Vector2(p.x*2-1,1-p.y*2),this.camera);const hit=ray.intersectObject(actor.model!,true).find(h=>this.visibleParents(h.object));if(!hit)continue;const part=this.partAt(actor,hit);const key=part||'other',local=actor.group.worldToLocal(hit.point.clone()),bounds=this.templates.get(actor.sourceCar!)!.bounds,size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()),normalized=new T.Vector3((local.x-center.x)/size.x,(local.y-bounds.min.y)/size.y,Math.abs(local.z-center.z)/size.z),ideal=part==='wheel'?new T.Vector3(.3,.23,.43):part==='light'?new T.Vector3(.44,.32,.35):part==='door'?new T.Vector3(0,.4,.45):new T.Vector3(0,.85,.15),score=normalized.distanceToSquared(ideal);if(scores[key]===undefined||score<scores[key]){scores[key]=score;points[key]=p;}}
  actor.group.userData.partCamera=cameraKey;actor.group.userData.partScreens=points;return points;
 }
 private activatePart(actor:Actor,part:'wheel'|'door'|'light',point:T.Vector3){
  this.board.touchPart(part,actor.wheels.length>0,!!actor.light?.length);if(this.partPulse){this.partPulse.mesh.removeFromParent();disposeModel(this.partPulse.mesh);}const ring=new T.Mesh(new T.RingGeometry(.22,.3,24),new T.MeshBasicMaterial({color:'#ffe49a',depthTest:false,transparent:true,opacity:1}));ring.position.copy(point);ring.quaternion.copy(this.camera.quaternion);ring.renderOrder=10;this.scene.add(ring);this.partPulse={mesh:ring,part,life:1.2};delete actor.group.userData.partCamera;this.needsRender=true;
  if(part==='light')actor.light?.forEach(m=>{m.emissive.set('#fff0a0');m.emissiveIntensity=2;});
  if(part==='wheel')for(const wheel of actor.wheels)wheel.rotateOnAxis(wheel.userData.axis,Math.PI*.8);
  this.burst(point,part==='light'?'#fff4b2':'#a5d6d3');
 }
 private down=(event:PointerEvent)=>{
  if(!this.ready||this.paused||this.orbit||this.pointer)return;const floor=this.point(event);if(!floor)return;
  const hit=this.pick(),id=hit&&this.actorId(hit.object);const item=this.board.items.find(i=>i.id===id);
  if(this.activity==='H03'&&id==='wash-car'&&!this.state.wash.waiting&&!this.state.completed){this.pointer={id:event.pointerId,start:floor,boardStart:this.boardPoint(floor),wash:true};this.renderer.domElement.setPointerCapture(event.pointerId);this.scrub(hit!.point);return;}
  if(['E02','T01'].includes(this.activity)&&hit&&id==='parts-car'){
   const actor=this.actors.get(id)!,part=this.partAt(actor,hit);if(!part){this.board.showHint();return;}this.activatePart(actor,part,hit.point);return;
  }
  // Surface-specific games only accept the visible mesh hit, never hidden flat hit areas.
  if(['E02','T01'].includes(this.activity)||this.activity==='H03'&&!this.state.wash.waiting&&!this.state.completed){this.board.showHint();return;}
  if(!item){const point=this.boardPoint(floor);this.pointer={id:event.pointerId,start:floor.clone(),boardStart:point};this.board.down(event.pointerId,point,event.timeStamp);this.renderer.domElement.setPointerCapture(event.pointerId);return;}
  this.pointer={id:event.pointerId,item:item.id,start:floor.clone(),boardStart:{x:item.x,y:item.y}};
  this.board.down(event.pointerId,{x:item.x,y:item.y},event.timeStamp);this.renderer.domElement.setPointerCapture(event.pointerId);
 };
 private move=(event:PointerEvent)=>{const pointer=this.pointer;if(!pointer||pointer.id!==event.pointerId||this.paused)return;const p=this.point(event);if(!p)return;
  if(pointer.wash){const hit=this.pick();if(hit&&this.actorId(hit.object)==='wash-car')this.scrub(hit.point);return;}
  this.board.move(pointer.id,{x:pointer.boardStart.x+(p.x-pointer.start.x)/UNIT,y:pointer.boardStart.y+(p.z-pointer.start.z)/UNIT},event.timeStamp);
 };
 private up=(event:PointerEvent)=>{const pointer=this.pointer;if(!pointer||pointer.id!==event.pointerId)return;const p=this.point(event);this.pointer=null;
  if(!pointer.wash&&p){let drop={x:pointer.boardStart.x+(p.x-pointer.start.x)/UNIT,y:pointer.boardStart.y+(p.z-pointer.start.z)/UNIT};
   const socketHit=this.ray.intersectObjects([...this.targets.values()].filter(g=>g.visible),true)[0];let node:T.Object3D|undefined=socketHit?.object;let socket:string|undefined;while(node){if(node.userData.target)socket=node.userData.target;node=node.parent||undefined;}
   const floor=this.boardPoint(p),target=this.board.targets.find(t=>t.id===socket)||this.board.targets.find(t=>t.enabled!==false&&!t.occupied&&Math.abs(floor.x-t.x)<t.w/2+18&&Math.abs(floor.y-t.y)<t.h/2+18);
   if(target&&p.distanceTo(pointer.start)>.2){drop={x:target.x,y:target.y};this.board.move(pointer.id,drop,event.timeStamp);}
   this.board.up(pointer.id,drop,event.timeStamp);
  }
  if(this.renderer.domElement.hasPointerCapture(event.pointerId))this.renderer.domElement.releasePointerCapture(event.pointerId);
 };
 private cancel=(event?:PointerEvent)=>{if(event&&this.pointer?.id!==event.pointerId)return;this.board.cancel(this.pointer?.id);this.pointer=null;};
 private key=(event:KeyboardEvent)=>{
  if(this.paused||!this.ready)return;
  if(['E02','T01'].includes(this.activity)&&['Enter',' '].includes(event.key)){event.preventDefault();const actor=this.actors.get('parts-car');if(actor){const part=(['wheel','door','light'] as const).find(p=>!this.state.parts.includes(p))||'wheel';const point=this.partScreens()?.[part];let hit:T.Intersection|undefined;if(point){this.ray.setFromCamera(new T.Vector2(point.x*2-1,1-point.y*2),this.camera);hit=this.ray.intersectObject(actor.model!,true).find(h=>this.visibleParents(h.object));}this.activatePart(actor,part,hit?.point||this.actorBounds(actor).getCenter(new T.Vector3()));}return;}
  if(this.activity==='H03'&&['Enter',' '].includes(event.key)){event.preventDefault();
   if(this.state.wash.waiting){const next=this.board.items.find(i=>i.id==='next-car');if(next)this.board.down(-1,{x:next.x,y:next.y},performance.now());}
   else{const dirt=this.dirtPoints.find(d=>d.visible);if(dirt)this.scrub(dirt.position);}
   return;
  }
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' ','Escape','[',']'].includes(event.key)){event.preventDefault();this.board.keyboard(event.key);}
 };
 private lost=(event:Event)=>{event.preventDefault();this.reportFailure('WebGL context lost');};
 private copyMaterial(source:T.Material){
  if(!this.simpleMaterials||!(source instanceof T.MeshStandardMaterial))return source.clone();
  const material=new T.MeshLambertMaterial({color:source.color,map:source.map,alphaMap:source.alphaMap,normalMap:source.normalMap,emissive:source.emissive,emissiveMap:source.emissiveMap,emissiveIntensity:source.emissiveIntensity,opacity:source.opacity,transparent:source.transparent,alphaTest:source.alphaTest,side:source.side,vertexColors:source.vertexColors});material.name=source.name;material.normalScale.copy(source.normalScale);return material;
 }
 private vehicle(item:Item|{id:string;carId:string;w:number}):Actor{
  const sourceCar='carId'in item&&item.carId&&this.templates.has(item.carId)?item.carId:this.carId;
  const template=this.templates.get(sourceCar)!;
  const model=template.root.clone(true),group=new T.Group();group.add(model);group.userData.item=item.id;
  const shadow=new T.Mesh(new T.CircleGeometry(1,24),new T.MeshBasicMaterial({color:'#33483a',transparent:true,opacity:.18,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.scale.set(2.15,.85,1);shadow.position.y=.018;group.add(shadow);
  const paint=new Map<T.Material,T.Material>(),light:(T.MeshStandardMaterial|T.MeshLambertMaterial)[]=[],wheels:T.Group[]=[];
  model.traverse(object=>{if(!(object instanceof T.Mesh))return;const old=Array.isArray(object.material)?object.material:[object.material];const next=old.map(m=>{if(!paint.has(m))paint.set(m,this.copyMaterial(m));return paint.get(m)!;});object.material=Array.isArray(object.material)?next:next[0];
   for(const m of next)if(m instanceof T.MeshStandardMaterial||m instanceof T.MeshLambertMaterial){if(template.paint.some(p=>p.name===m.name)&&'carId'in item&&['E01','M04','L03'].includes(this.activity)){m.color.set(item.id.includes('blue')||item.carId==='CAR11'?'#2e8ed4':item.id.includes('white')||item.carId==='CAR15'?'#f7f5e9':'#dc4940');m.map=null;}
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
  if(item.kind==='wheel'){
   const template=this.templates.get(this.carId),front=item.id==='wheel-0';const originals=template?.wheels.filter(object=>{const p=new T.Box3().setFromObject(object,true).getCenter(new T.Vector3());return(front?p.x<-.4:p.x>.4)&&p.z>.1;})||[];
   if(originals.length){const parts=new T.Group();for(const original of originals){const copy=original.clone(true);original.updateWorldMatrix(true,false);original.matrixWorld.decompose(copy.position,copy.quaternion,copy.scale);parts.add(copy);}const b=new T.Box3().setFromObject(parts,true),size=b.getSize(new T.Vector3()),center=b.getCenter(new T.Vector3());parts.position.sub(center);const holder=new T.Group();holder.add(parts);holder.scale.setScalar(w*.8/Math.max(size.x,size.y));group.add(holder);}
   else{const tire=new T.Mesh(new T.TorusGeometry(w*.34,w*.15,10,24),material('#37474b'));tire.castShadow=true;group.add(tire);const hub=new T.Mesh(new T.CylinderGeometry(w*.25,w*.25,.18,12),material('#c8d8d8',.3));hub.rotation.x=Math.PI/2;group.add(hub);add(group,ball(w*.09,'#edc96f'),0,0,.18);}
  }else if(item.kind==='plank'){add(group,block(w,.28,h,colors.wood),0,.14);for(let x=-w/2+.5;x<w/2;x+=.6)add(group,block(.035,.035,h*.9,'#e9c99b'),x,.3);}
  else if(item.kind==='road'){
   add(group,block(w,.12,h,'#afc59a'),0,.02);const shape=this.state.road.shapes[item.turn!]||'LR';
   for(const direction of shape){const along=direction==='L'||direction==='R';add(group,block(along?w*.5:w*.48,.08,along?h*.48:h*.5,colors.road),direction==='L'?-w*.25:direction==='R'?w*.25:0,.12,direction==='U'?-h*.25:direction==='D'?h*.25:0);}
  }else if(item.kind==='bay'){this.outline(group,w,h,colors.cream);}
  else if(item.kind==='shape'){if(item.glyph==='●')add(group,ball(w*.5,item.color||'#e49b64'),0,w*.5);else add(group,block(w,w,w,item.color||'#73a2bc'),0,w*.5);}
  else if(item.id==='signal'){add(group,block(.22,2,.22,colors.ink),0,1);add(group,block(1.1,2,.5,colors.ink),0,2.3);add(group,ball(.32,'#d96554'),0,2.75,.3);add(group,ball(.32,'#6bba7e'),0,1.9,.3);}
  else if(item.id.startsWith('ink-')){add(group,new T.Mesh(new T.CylinderGeometry(.65,.7,.35,24),material(item.color||'#e0a060')),0,.2);}
  else if(item.glyph==='🌳'||item.id==='stamp-0'){add(group,block(.25,1.2,.25,colors.wood),0,.6);add(group,ball(.7,'#79ac7b'),0,1.5);add(group,ball(.5,'#a6c38a'),.4,1.65);}
  else if(item.glyph==='☀️'||item.id==='stamp-1'){add(group,ball(.65,'#f0cb69'),0,.85);for(let i=0;i<8;i++){const a=i*Math.PI/4;const ray=block(.15,.4,.15,'#f0cb69');ray.rotation.z=-a;add(group,ray,Math.sin(a),.85+Math.cos(a));}}
  else if(item.glyph==='🧽'||item.id==='sponge'){add(group,block(w*.8,.55,h*.7,'#ecc56c'),0,.4);for(let i=0;i<6;i++)add(group,ball(.08,'#cba45c'),(i%3-1)*.3,.7,(Math.floor(i/3)-.5)*.3);}
  else if(item.glyph==='🎒'||item.id==='request'){add(group,block(w*.7,1.4,.65,item.id==='request'?'#f2c980':'#d99772'),0,.8);const handle=new T.Mesh(new T.TorusGeometry(.35,.08,6,16,Math.PI),material(colors.ink));add(group,handle,0,1.6);}
  else if(item.glyph==='🥤'||item.id==='water'){add(group,new T.Mesh(new T.CylinderGeometry(.35,.27,1.2,16),material(colors.water)),0,.65);add(group,block(.08,.55,.08,colors.cream),.15,1.45);}
  else if(item.glyph==='🧢'||item.id==='hat'){const dome=new T.Mesh(new T.SphereGeometry(.6,16,10,0,Math.PI*2,0,Math.PI/2),material('#7aa7b5'));add(group,dome,0,.2);add(group,block(1.4,.1,.7,'#628b9d'),.2,.2,.2);}
  else if(item.glyph==='belt'){const belt=block(.2,1.6,.16,'#466a79');belt.rotation.z=-.7;add(group,belt,0,.9);add(group,block(.5,.45,.2,'#e1b56b'),0,.8,.15);}
  else if(item.glyph==='📚'){for(let i=0;i<3;i++)add(group,block(1,.25,.8,['#749eab','#e2aa77','#afbf81'][i]),0,.2+i*.25);}
  else if(item.glyph==='☂️'){const top=new T.Mesh(new T.ConeGeometry(.9,.5,8,1,true),material('#e29878'));add(group,top,0,1.4);add(group,block(.1,1.2,.1,'#648697'),0,.6);}
  else{const svg=symbolSvg(item.glyph||'star');if(svg){const art=new T.Group();const paths=new SVGLoader().parse(svg).paths;for(const path of paths){if(path.color.getHexString()==='000000'&&(path.userData?.style as {fill?:string}|undefined)?.fill==='none')continue;for(const shape of SVGLoader.createShapes(path)){const mesh=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:8,bevelEnabled:true,bevelSize:1,bevelThickness:1,bevelSegments:1,steps:1,curveSegments:5}),new T.MeshStandardMaterial({color:path.color,roughness:.7,side:T.DoubleSide}));mesh.castShadow=true;art.add(mesh);}}const size=Math.min(w,h)*.008;art.scale.set(size,-size,size);art.position.set(-50*size,100*size,.1);group.add(art);}else add(group,ball(.6,item.color||'#e2b879'),0,.65);}
  const bounds=new T.Box3().setFromObject(group,true),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());const hit=new T.Mesh(new T.BoxGeometry(Math.max(.6,size.x),Math.max(.5,size.y),Math.max(.6,size.z)),new T.MeshBasicMaterial({transparent:true,opacity:0,colorWrite:false,depthWrite:false}));hit.position.copy(center);hit.userData.pickProxy=true;group.add(hit);this.scene.add(group);return{group,wheels:[],x:0,z:0,yaw:0,scale:1,bounds:bounds.clone()};
 }
 private targetPoint(target:{id:string;x:number;y:number}){
  if(this.activity==='T04'&&target.id.startsWith('wheel-')){const template=this.templates.get(this.carId),body=this.board.targets.find(t=>t.id==='body');if(template&&body){const front=target.id==='wheel-0',centers=template.wheels.map(w=>new T.Box3().setFromObject(w,true).getCenter(new T.Vector3())).filter(p=>(front?p.x<-.4:p.x>.4)&&p.z>.1);if(centers.length){const center=centers.reduce((a,p)=>a.add(p),new T.Vector3()).multiplyScalar(1/centers.length);return this.world(body.x,body.y).addScaledVector(center,body.w*UNIT/4.65);}}}
  if(this.activity==='T04'&&target.id.startsWith('wheel-')){const body=this.board.targets.find(t=>t.id==='body'),bounds=this.templates.get(this.carId)?.bounds;if(body&&bounds){const size=bounds.getSize(new T.Vector3()),scale=body.w*UNIT/4.65;return this.world(body.x,body.y).add(new T.Vector3(target.id==='wheel-0'?-1.35:1.35,.4,size.z*.43).multiplyScalar(scale));}}
  return this.world(target.x,target.y);
 }
 private outline(parent:T.Object3D,w:number,d:number,color:string){for(const [x,z,a,b]of [[0,-d/2,w,.07],[0,d/2,w,.07],[-w/2,0,.07,d],[w/2,0,.07,d]])add(parent,block(a,.06,b,color),x,.045,z);}
 private buildScenery(){
  const depth=this.board.height*UNIT;const road=['M01','M02','M03','L03','P01','S01','E03','T03','H01'].includes(this.activity);
  const floor=block(22,.5,depth+2,road?'#aec796':'#d9c399');floor.position.y=-.35;this.scenery.add(floor);
  if(road){const surface=block(19.5,.06,depth*.85,colors.road);surface.position.y=-.06;this.scenery.add(surface);for(let x=-9;x<10;x+=1.3)add(this.scenery,block(.65,.025,.09,'#f9edc7'),x,.015,0);}
  if(['P01','S01'].includes(this.activity)){for(let i=0;i<35;i++)add(this.scenery,ball(.13,'#b29b75'),-9+(i%14)*1.35,.09,depth*.15+Math.floor(i/14)*.4);}
  if(this.activity==='H03'){for(const x of [-9,9])add(this.scenery,block(.4,6,.4,'#75aaa8'),x,3,-depth*.25);add(this.scenery,block(18.4,.4,.4,'#75aaa8'),0,6,-depth*.25);for(let x=-8;x<=8;x+=2)add(this.scenery,block(.15,.6,.15,'#c4ecf4'),x,5.5,-depth*.25);}
  if(this.activity==='T02'){add(this.scenery,block(7.8,.16,depth*.8,'#83c8dc'),0,-.1,-1);for(const x of [-4.1,4.1])add(this.scenery,block(.15,.2,depth*.8,'#e1dfbb'),x,.04,-1);}
  for(const x of [-10.3,10.3]){add(this.scenery,block(.15,.35,depth+1,'#91aa87'),x,0);}
 }
 private sync(){
  const seen=new Set<string>();
  for(const item of this.board.items){seen.add(item.id);let actor=this.actors.get(item.id);
   if(actor&&item.kind==='road'&&actor.group.userData.road!==this.state.road.shapes[item.turn!]){this.retired.add(actor.group);this.actors.delete(item.id);actor=undefined;}
   if(!actor){actor=item.kind==='car'||item.kind==='body'?this.vehicle({...item,carId:item.carId||this.carId}):this.prop(item);this.actors.set(item.id,actor);if(item.kind==='road')actor.group.userData.road=this.state.road.shapes[item.turn!];}
   const position=this.world(item.x,item.y),dx=position.x-actor.x,dz=position.z-actor.z,dist=Math.hypot(dx,dz),held=this.board.selectedItem===item.id;
   if(actor.model&&dist>.002&&dist<3){const target=Math.atan2(-dz,dx);if(this.activity!=='T04'&&!item.placed)actor.yaw+=Math.atan2(Math.sin(target-actor.yaw),Math.cos(target-actor.yaw))*.2;for(const wheel of actor.wheels)wheel.rotateOnAxis(wheel.userData.axis,dist/.3/Math.max(.1,actor.scale));}
   if(actor.model){actor.scale=item.w*UNIT/4.65;actor.group.scale.setScalar(actor.scale);}
   actor.group.position.set(position.x,held&&this.pointer?.item===item.id ? .55 : .03,position.z);if(item.placed&&this.activity!=='T03')actor.yaw*=.7;actor.group.rotation.y=actor.yaw;
   if(actor.model&&this.activity==='P01'&&item.id==='comparison'){actor.group.position.y+=Math.sin(position.x*18)*Math.min(.04,dist*.4);actor.group.rotation.z=Math.sin(position.x*10)*Math.min(.025,dist*.2);}
   if(item.kind==='wheel'){actor.group.visible=!item.placed;actor.group.position.y=1;actor.group.rotation.z=position.x*1.4;}
   if(item.kind==='bay'&&item.placed)actor.group.visible=false;
   if(item.id==='signal'){const red=actor.group.children[2] as T.Mesh,green=actor.group.children[3]as T.Mesh;(red.material as T.MeshStandardMaterial).emissive.set(this.state.signalGreen?'#000000':'#d95440');(green.material as T.MeshStandardMaterial).emissive.set(this.state.signalGreen?'#75df8d':'#000000');}
   if(item.id==='body'){
    for(const wheel of actor.wheels){const center=new T.Box3().setFromObject(wheel,true).getCenter(new T.Vector3());const relative=center.clone().sub(actor.group.position);if(relative.z>0)wheel.visible=!!this.board.items.find(i=>i.id===(relative.x<0?'wheel-0':'wheel-1'))?.placed;}
    // An inseparable author mesh is a translucent assembly preview, rather
    // than an already finished vehicle above unrelated loose parts.
    if(!actor.wheels.length)actor.model?.traverse(object=>{if(!(object instanceof T.Mesh))return;for(const m of Array.isArray(object.material)?object.material:[object.material]){m.userData.baseOpacity??=m.opacity;const preview=!this.board.items.filter(i=>i.kind==='wheel').every(i=>i.placed);m.opacity=m.userData.baseOpacity*(preview?.24:1);m.transparent=preview||m.opacity<1;m.depthWrite=!preview;}});
   }
   actor.x=position.x;actor.z=position.z;
  }
  if(this.activity==='T04'){const width=this.board.items.find(i=>i.id==='body')?.w||0;if(width!==this.assemblyWidth){this.assemblyWidth=width;this.fitAssemblyCamera();}}
  if(this.activity==='H03'){
   const key=`${this.state.wash.clean}-${this.state.wash.waiting}`;
   if(key!==this.washKey){this.washKey=key;const previous=this.actors.get('wash-car');if(previous)this.retired.add(previous.group);const id=this.state.wash.clean===1&&!this.state.wash.waiting?'CAR11':this.carId;const actor=this.vehicle({id:'wash-car',carId:id,w:820});actor.group.position.copy(this.world(500,this.board.height*.4));this.actors.set('wash-car',actor);this.createDirt(actor);}
   seen.add('wash-car');
  }
  for(const[id,actor]of this.actors)if(!seen.has(id)){this.retired.add(actor.group);this.actors.delete(id);}
  const targetIds=new Set(this.board.targets.map(t=>t.id));
  for(const[id,group]of this.targets)if(!targetIds.has(id)){this.retired.add(group);this.targets.delete(id);}
  for(const target of this.board.targets){let group=this.targets.get(target.id);if(!group){group=new T.Group();group.userData.target=target.id;
    if(this.activity==='T04'&&target.id.startsWith('wheel-')){const radius=target.w*UNIT*.43;const ring=new T.Mesh(new T.TorusGeometry(radius,.065,6,32),new T.MeshBasicMaterial({color:'#fff2be'}));group.add(ring);const hit=new T.Mesh(new T.BoxGeometry(radius*2.3,radius*2.3,.5),new T.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false}));group.add(hit);}
    else this.outline(group,target.w*UNIT,target.h*UNIT,target.color||colors.cream);
    if(target.glyph&&!/^\d$/.test(target.glyph)){const prop=this.prop({id:'target-'+target.id,kind:'prop',glyph:target.glyph,w:Math.min(target.w,150),h:Math.min(target.h,150),x:0,y:0,home:{x:0,y:0}});group.add(prop.group);prop.group.traverse(o=>delete o.userData.item);}
    if(target.glyph&&/^\d$/.test(target.glyph)){for(let i=0;i<Number(target.glyph);i++)add(group,ball(.16,colors.cream),-.35*(Number(target.glyph)-1)+i*.7,.2,-target.h*UNIT*.32);}
    this.scene.add(group);this.targets.set(target.id,group);}group.position.copy(this.targetPoint(target));group.visible=target.enabled!==false&&(!target.occupied||!!target.glyph)&&!(this.activity==='T04'&&target.id.startsWith('wheel-')&&!this.board.targets[0]?.occupied);}
  if(this.activity==='S02'){
   const car=this.actors.get('shadow-car'),lamp=this.actors.get('lamp');if(car&&lamp){if(!this.shadow){this.shadow=car.group.clone(true);this.shadow.traverse(o=>{delete o.userData.item;if(o instanceof T.Mesh)o.material=new T.MeshBasicMaterial({color:'#445b5f',transparent:true,opacity:.35,depthWrite:false});});this.scene.add(this.shadow);}
    this.shadow.position.copy(car.group.position).add(new T.Vector3((car.x-lamp.x)*.6,0,(car.z-lamp.z)*.2));this.shadow.position.y=.035;this.shadow.scale.set(car.scale*(1+Math.abs(car.x-lamp.x)*.04),.006,car.scale);this.shadow.rotation.y=car.yaw;}
  }
  if(this.activity==='A02'&&this.board.artwork.length!==this.markCount){for(const child of [...this.tracks.children]){child.removeFromParent();disposeModel(child);}this.markCount=this.board.artwork.length;for(const mark of this.board.artwork){const point=this.world(mark.x*1000,mark.y*this.board.height);for(const dz of [-.5,.5]){const tread=block(.16,.035,.3,mark.color);add(this.tracks,tread,point.x,.03,point.z+dz);}}}

  if(this.state.completed&&!this.complete){this.burst(new T.Vector3(0,2,0),'#f1ca6c',32);}this.complete=this.state.completed;
  this.renderer.domElement.dataset.state=JSON.stringify({...this.state,partScreens:this.partScreens(),partEffect:this.partPulse?{part:this.partPulse.part,screen:this.project(this.partPulse.mesh.position)}:undefined,boardHeight:this.board.height,floorProjection:new T.Matrix4().multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse).toArray(),items:this.board.items.map(i=>({id:i.id,x:i.x,y:i.y,placed:!!i.placed})),actors:[...this.actors].map(([id,a])=>({id,sourceCar:a.sourceCar,position:a.group.position.toArray(),screen:this.project(this.actorBounds(a).getCenter(new T.Vector3())),screenBounds:a.model?this.screenBounds(this.actorBounds(a)):undefined,yaw:a.group.rotation.y,mesh:!!a.model,wheelCount:a.wheels.length,wheelRotation:a.wheels[0]?.quaternion.toArray()})),targetScreens:this.board.targets.map(t=>({id:t.id,screen:this.project(this.targetPoint(t))})),dirt:this.dirtPoints.filter(p=>p.visible).map(p=>this.project(p.position)),camera:this.camera.position.toArray(),triangles:this.renderer.info.render.triangles});
 }
 private project(point:T.Vector3){const p=point.clone().project(this.camera);return{x:(p.x+1)/2,y:(1-p.y)/2};}
 private createDirt(actor:Actor){
  for(const child of [...this.dirt.children])this.retired.add(child);this.dirtPoints=[];
  if(this.state.wash.waiting||this.state.completed)return;
  const box=new T.Box3().setFromObject(actor.group),size=box.getSize(new T.Vector3());this.scene.updateMatrixWorld(true);
  for(let i=0;i<48;i++){const x=box.min.x+size.x*(.06+(i%12)/13),z=box.min.z+size.z*(.1+Math.floor(i/12)/4.5);const ray=new T.Raycaster(new T.Vector3(x,box.max.y+1,z),new T.Vector3(0,-1,0));const hit=ray.intersectObject(actor.group,true)[0];if(!hit)continue;const toward=hit.point.clone().sub(this.camera.position);const visible=new T.Raycaster(this.camera.position,toward.normalize()).intersectObject(actor.group,true)[0];if(!visible||visible.point.distanceTo(hit.point)>.18)continue;const dirt=ball(.09+(.05*(i%3)),i%2?'#89684b':'#b08a5b');dirt.scale.y=.35;dirt.position.copy(hit.point).addScaledVector(hit.face?.normal||new T.Vector3(0,1,0),.035);this.dirt.add(dirt);this.dirtPoints.push(dirt);}
 }
 private scrub(point:T.Vector3){
  this.needsRender=true;
  if(!this.dirtPoints.length)return;
  for(const dirt of this.dirtPoints)if(dirt.visible&&dirt.position.distanceTo(point)<1.65)dirt.visible=false;
  this.board.washSurface(1-this.dirtPoints.filter(p=>p.visible).length/this.dirtPoints.length);
  if(!this.reduced&&!this.software&&this.particles.length<12){const mesh=ball(.1,'#d5f5f6');mesh.material=new T.MeshLambertMaterial({color:'#e1faff',transparent:true,opacity:.65});mesh.position.copy(point);this.scene.add(mesh);this.particles.push({mesh,velocity:new T.Vector3((Math.random()-.5)*1.5,1.2,(Math.random()-.5)*1.5),life:1});}
 }
 private burst(at:T.Vector3,color:string,count=7){if(this.reduced||this.software)return;if(this.simpleMaterials)count=Math.min(count,8);for(let i=0;i<count;i++){const mesh=new T.Mesh(new T.IcosahedronGeometry(.08,0),material(i%2?color:'#b8dccc'));mesh.position.copy(at);this.scene.add(mesh);this.particles.push({mesh,velocity:new T.Vector3((Math.random()-.5)*5,2+Math.random()*4,(Math.random()-.5)*5),life:1.1});}}
 private draw=(now:number)=>{
  if(this.disposed)return;if(now-this.rendered<33||document.hidden){this.frame=requestAnimationFrame(this.draw);return;}this.rendered=now;const dt=Math.min(.25,(now-this.last)/1000);this.last=now;
  if(!this.paused){this.time+=dt;const revision=JSON.stringify([this.state,this.board.items.map(i=>[i.x,i.y,i.w,i.h,i.placed,i.turn]),this.board.selectedItem]);if(revision!==this.revision){this.revision=revision;this.needsRender=true;if(this.ready)this.sync();}for(const p of this.particles){p.life-=dt;p.velocity.y-=dt*4;p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.scale.setScalar(Math.max(.01,p.life));if(p.life<=0){p.mesh.removeFromParent();disposeModel(p.mesh);}}this.particles=this.particles.filter(p=>p.life>0);}
  if(!this.paused&&this.partPulse){const pulse=this.partPulse;pulse.life-=dt;pulse.mesh.scale.setScalar(this.reduced?1:1+(1.2-pulse.life)*.45);if(pulse.life<=0){pulse.mesh.removeFromParent();disposeModel(pulse.mesh);this.partPulse=undefined;this.needsRender=true;}}
  const changed=this.controls.update();if(this.needsRender||changed||this.particles.length||this.partPulse){try{this.renderer.render(this.scene,this.camera);if(this.ready)this.sync();this.needsRender=false;}catch(error){this.reportFailure('render',error);return;}}this.frame=requestAnimationFrame(this.draw);
 };
 guidePreview(canvas:HTMLCanvasElement,step:number,phase:number,large=false){
  if(!this.ready)return;const cue=this.board.demonstration,actor=this.actors.get(cue.item?.id||'wash-car');
  const original=actor&&{position:actor.group.position.clone(),quaternion:actor.group.quaternion.clone()};
  const point=step===0?cue.start:step===2?cue.end:{x:cue.start.x+(cue.end.x-cue.start.x)*phase,y:cue.start.y+(cue.end.y-cue.start.y)*phase};
  if(actor&&step>0){if(['drag','push'].includes(cue.action)){const target=this.board.targets.find(t=>t.x===cue.end.x&&t.y===cue.end.y),t=step===2?1:phase,end=target?this.targetPoint(target):this.world(cue.end.x,cue.end.y);actor.group.position.lerpVectors(original!.position,end,t).add(new T.Vector3(0,Math.sin(t*Math.PI)*.35,0));}if(cue.action==='turn')actor.group.rotation.y+=Math.PI/2*phase;}
  this.renderer.render(this.scene,this.camera);canvas.width=large?1000:240;canvas.height=Math.round(canvas.width/this.camera.aspect);const ctx=canvas.getContext('2d')!;ctx.drawImage(this.renderer.domElement,0,0,canvas.width,canvas.height);
  let projected=this.project(this.world(point.x,point.y).add(new T.Vector3(0,actor?1:0,0)));
  if(['E02','T01'].includes(this.activity)){const part=(['wheel','light','door'] as const).find(p=>!this.state.parts.includes(p))||'wheel';projected=this.partScreens()?.[part]||projected;}
  else if(this.activity==='H03'&&cue.action==='wipe'){const visible=this.dirtPoints.filter(d=>d.visible);const dirt=visible[Math.min(visible.length-1,Math.floor(phase*Math.max(0,visible.length-1)))];if(dirt)projected=this.project(dirt.position);}
  else if(cue.item){const target=this.board.targets.find(t=>t.x===cue.end.x&&t.y===cue.end.y),start=this.actors.get(cue.item.id);if(start){const from=this.actorBounds(start).getCenter(new T.Vector3()),to=target?this.targetPoint(target):from;if(step===2&&target)projected=this.project(to);else if(step===0)projected=this.project(from);}}
  const x=projected.x*canvas.width,y=projected.y*canvas.height,scale=canvas.width/1000;
  ctx.strokeStyle='#ba8135';ctx.lineWidth=6*scale;ctx.beginPath();ctx.ellipse(x,y,50*scale,30*scale,0,0,Math.PI*2);ctx.stroke();drawPlaySymbol(ctx,'hand',x+25*scale,y+35*scale,75*scale);
  if(original&&actor){actor.group.position.copy(original.position);actor.group.quaternion.copy(original.quaternion);}this.needsRender=true;
 }
 private reportFailure(reason:string,error?:unknown){if(!this.disposed){console.warn('立体玩法暂时无法打开：'+reason,error);this.failed();}}
 dispose(){if(this.disposed)return;this.cancel();this.disposed=true;this.abort.abort();cancelAnimationFrame(this.frame);this.observer.disconnect();this.controls.dispose();const canvas=this.renderer.domElement;
  canvas.removeEventListener('pointerdown',this.down);canvas.removeEventListener('pointermove',this.move);canvas.removeEventListener('pointerup',this.up);canvas.removeEventListener('pointercancel',this.cancel);canvas.removeEventListener('lostpointercapture',this.cancel);canvas.removeEventListener('keydown',this.key);canvas.removeEventListener('webglcontextlost',this.lost);
  disposeModel(new T.Group().add(this.scene,...[...this.templates.values()].map(t=>t.root)));this.renderer.dispose();this.renderer.forceContextLoss();canvas.remove();}
}
