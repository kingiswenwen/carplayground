import {ViewerPaint} from './ViewerPaint';
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadModelBytes} from './model-bytes';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';
import {assetUrl} from '../domain/content';
import type {VehicleModelSpec} from '../domain/vehicle-models';
import {disposeModel,fitModel,frameModel} from './model';
import {isVehicleLampName} from './part-names';
import {paintHex, type ShowroomPaint} from '../domain/showroom-paint';
import {MIN_VEHICLE_ZOOM, MAX_VEHICLE_ZOOM, VEHICLE_ZOOM_STEP} from '../domain/vehicle-view';

function makeContactShadow(){
 const size=64, pixels=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const radius=Math.hypot((x+.5)*2/size-1,(y+.5)*2/size-1);
  const feather=T.MathUtils.clamp((1-radius)/.76,0,1);
  const index=(y*size+x)*4;
  pixels[index]=pixels[index+1]=pixels[index+2]=255;
  pixels[index+3]=Math.round(255*feather*feather);
 }
 const texture=new T.DataTexture(pixels,size,size);
 texture.minFilter=T.LinearFilter;texture.magFilter=T.LinearFilter;texture.needsUpdate=true;
 const shadow=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({
  color:'#504438',map:texture,transparent:true,opacity:.33,depthWrite:false,toneMapped:false,
 }));
 shadow.rotation.x=-Math.PI/2;shadow.position.y=-.005;shadow.visible=false;
 return shadow;
}

/** One context and studio per viewer. Changing cars replaces only the vehicle. */
export class VehicleRenderer{
 private renderer:T.WebGLRenderer;
 private scene=new T.Scene();
 private camera=new T.OrthographicCamera(-3,3,2,-2,.1,60);
 private controls:OrbitControls;
 private observer:ResizeObserver;
 private floor=new T.Mesh(new T.PlaneGeometry(30,30),new T.ShadowMaterial({color:'#30483e',opacity:.23}));
 private contactShadow=makeContactShadow();
 private environment?:T.WebGLRenderTarget;
 private root?:T.Group;
 private removed:T.Object3D[]=[];
 private bounds?:T.Box3;
 private lamps=new Map<T.MeshStandardMaterial,{color:T.Color;intensity:number}>();
 private paint?:ViewerPaint;
 private abort?:AbortController;
 private timer?:ReturnType<typeof setTimeout>;
 private epoch=0;
 private disposed=false;
 private needsRender=true;
 private frame=0;
 private aspect=1;
 private reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
 private carId='';
 private first=false;
 private down:{id:number;x:number;y:number}|null=null;
 private pointers=new Set<number>();
 private lights=false;
 private software=false;
 private reportedZoom=100;
 private trackpadZoom=1;
 private touchAxis?:{x:number;y:number;direction?:'horizontal'|'vertical'};
 constructor(private box:HTMLDivElement,private onReady:(carId:string)=>void,private onUnavailable:()=>void,private onZoom:(percent:number)=>void){
  this.renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
  const renderer=this.renderer,canvas=renderer.domElement;
  const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
  const software=!!debug&&/swiftshader|llvmpipe|software/i.test(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
  // Keep the real mesh and authored textures. Software GPUs use a lighter
  // studio and input-driven frames instead of spending seconds on inertia.
  this.software=software;canvas.dataset.quality=software?'simple':'full';renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.96;
  renderer.shadowMap.enabled=!software;renderer.shadowMap.type=T.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
  this.scene.environmentIntensity=.6;
  this.scene.add(new T.HemisphereLight('#f5faff','#cfc4ad',1.0));
  const sun=new T.DirectionalLight('#fff8ee',1.45);sun.position.set(3,7,4);sun.castShadow=true;sun.shadow.mapSize.set(512,512);
  Object.assign(sun.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.1,far:20});sun.shadow.normalBias=.012;sun.shadow.bias=-.0001;this.scene.add(sun);
  const fill=new T.DirectionalLight('#e0edff',.65);fill.position.set(-4,3,-5);this.scene.add(fill);
  this.floor.rotation.x=-Math.PI/2;this.floor.position.y=-.008;this.floor.receiveShadow=true;this.scene.add(this.floor,this.contactShadow);
  canvas.className='vehicle-webgl';canvas.setAttribute('aria-label','立体汽车，拖动或按方向键旋转，双指或按加减键缩放');canvas.setAttribute('role','application');canvas.tabIndex=0;box.append(canvas);
  this.camera.position.set(5,2.5,6);this.controls=new OrbitControls(this.camera,canvas);this.controls.enablePan=false;this.controls.enableDamping=!software&&!this.reduceMotion.matches;this.controls.dampingFactor=.12;this.controls.addEventListener('change',this.invalidate);
  this.controls.minZoom=MIN_VEHICLE_ZOOM/100;this.controls.maxZoom=MAX_VEHICLE_ZOOM/100;
  this.controls.minPolarAngle=.12;this.controls.maxPolarAngle=Math.PI*.48;this.controls.rotateSpeed=.65;
  // OrbitControls sets touch-action:none on connect. Let vertical swipes
  // scroll out of the exhibit while the canvas owns horizontal rotation.
  canvas.style.touchAction='pan-y';
  canvas.addEventListener('wheel',this.wheel,{passive:false,capture:true});
  canvas.addEventListener('touchstart',this.touchStart,{passive:false});
  canvas.addEventListener('touchmove',this.touchMove,{passive:false});
  canvas.addEventListener('gesturestart',this.gestureStart);
  canvas.addEventListener('gesturechange',this.gestureChange);
  canvas.addEventListener('pointerdown',this.start);canvas.addEventListener('pointerup',this.end,true);canvas.addEventListener('pointercancel',this.cancel);canvas.addEventListener('lostpointercapture',this.cancel);canvas.addEventListener('keydown',this.key);canvas.addEventListener('webglcontextlost',this.lost);
  this.reduceMotion.addEventListener('change',this.updateMotion);
  document.addEventListener('visibilitychange',this.invalidate);
  this.observer=new ResizeObserver(this.resize);this.observer.observe(box);this.resize();
 }
 private requestFrame(){
  if(!this.frame&&!this.disposed&&!document.hidden&&this.root&&this.bounds)this.frame=requestAnimationFrame(this.render);
 }
 private invalidate=()=>{this.needsRender=true;this.requestFrame();};
 private updateMotion=()=>{
  this.controls.enableDamping=!this.software&&!this.reduceMotion.matches;
  this.invalidate();
 };
 private resize=()=>{
  if(this.disposed)return;const w=Math.max(1,this.box.clientWidth),h=Math.max(1,this.box.clientHeight);
  // Preserve a sharp one-pixel-per-CSS-pixel view at typical phone sizes and
  // cap the cost of larger software-rendered canvases.
  const ratio=Math.min(devicePixelRatio,this.software?Math.min(1,900/Math.max(w,h)):1.5);
  if(this.renderer.getPixelRatio()!==ratio)this.renderer.setPixelRatio(ratio);
  this.renderer.setSize(w,h,false);
  this.aspect=w/h;
  this.invalidate();
 };
 private clearCar(){
  this.abort?.abort();clearTimeout(this.timer);this.bounds=undefined;this.contactShadow.visible=false;this.lamps.clear();this.paint?.dispose();this.paint=undefined;this.down=null;this.pointers.clear();
  if(this.root){disposeModel(new T.Group().add(this.root,...this.removed));this.root=undefined;}this.removed=[];
 }
 async load(spec:VehicleModelSpec){
  if(this.disposed)return;const canvas=this.renderer.domElement;canvas.style.visibility='hidden';this.renderer.clear();const epoch=++this.epoch;this.clearCar();this.first=true;this.carId=spec.id;this.lights=false;
  canvas.dataset.ready='false';canvas.dataset.paint='original';canvas.dataset.finish='original';delete canvas.dataset.car;delete canvas.dataset.lights;
  const abort=new AbortController();this.abort=abort;
  this.timer=setTimeout(()=>{if(epoch===this.epoch)this.fail();},30000);
  try{
   // Fetch before compiling the studio, so transport errors recover promptly.
   const bytes=await loadModelBytes(assetUrl('model-'+spec.id),spec,abort.signal);if(this.disposed||epoch!==this.epoch)return;
   const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,'');
   if(this.disposed||epoch!==this.epoch){disposeModel(gltf.scene);return;}
   clearTimeout(this.timer);this.root=gltf.scene;
   this.root.traverse(object=>{if(object instanceof T.Line||object instanceof T.Points)object.visible=false;});
   for(const name of spec.excludedNodes){const clean=name.replace(/\s/g,'_').replace(/[\[\]\.:\/]/g,'');const object=this.root.getObjectByName(name)||this.root.getObjectByName(clean);if(object){object.removeFromParent();this.removed.push(object);}}
   this.root.traverse(object=>{if(object instanceof T.Mesh){object.receiveShadow=true;
    const materials=Array.isArray(object.material)?object.material:[object.material];object.castShadow=materials.some(material=>spec.paintMaterials.includes(material.name)||/tire/i.test(material.name));
    for(const material of Array.isArray(object.material)?object.material:[object.material]){if(!(material instanceof T.MeshStandardMaterial))continue;
     if(spec.paintMaterials.includes(material.name)){
      if(spec.recalculateNormals){const original=object.geometry;object.geometry=toCreasedNormals(original,Math.PI/4);if(original!==object.geometry)original.dispose();}
      if(!spec.preservePaint)material.color.set(spec.color);material.roughness=.36;material.metalness=.42;
     }
     if(spec.lampMaterials.includes(material.name)||isVehicleLampName(material.name))this.lamps.set(material,{color:material.emissive.clone(),intensity:material.emissiveIntensity});
    }
   }});
   this.bounds=fitModel(this.root,spec.rotationY);this.paint=new ViewerPaint(this.root,spec,this.bounds);this.scene.add(this.root);
   const size=this.bounds.getSize(new T.Vector3());
   this.contactShadow.scale.set(size.x*1.28,size.z*1.28,1);
   this.contactShadow.material.opacity=this.software?.36:.21;
   this.contactShadow.visible=true;
   this.controls.target.copy(this.bounds.getCenter(new T.Vector3()));
   this.camera.position.set(5,2.5,6).add(this.controls.target);this.setZoom(1);this.controls.saveState();this.resetView();
   if(!this.software&&!this.environment){const room=new RoomEnvironment(),pmrem=new T.PMREMGenerator(this.renderer);try{this.environment=pmrem.fromScene(room,.04,.1,100,{size:64});this.scene.environment=this.environment.texture;}finally{room.dispose();pmrem.dispose();}}
   this.renderer.shadowMap.needsUpdate=true;this.resize();
  }catch(error){if(this.disposed||epoch!==this.epoch)return;console.warn('车辆模型未能打开',error);this.fail();}
 }
 private fail(){if(this.disposed)return;this.dispose();this.onUnavailable();}
 setPaint(paint:ShowroomPaint|null){
  const canvas=this.renderer.domElement,color=paint?paintHex(paint):null;
  const key=color??'original',finish=paint?.finish??'original';
  if(!this.paint||(canvas.dataset.paint===key&&canvas.dataset.finish===finish))return;
  this.paint.setPaint(color,paint?.finish??'gloss');
  canvas.dataset.paint=key;canvas.dataset.finish=finish;this.invalidate();
 }
 private setZoom(zoom:number){
  this.camera.zoom=T.MathUtils.clamp(zoom,this.controls.minZoom,this.controls.maxZoom);
  this.camera.updateProjectionMatrix();this.invalidate();
 }
 adjustZoom(percent:number){if(this.bounds)this.setZoom(this.camera.zoom+percent/100);}
 resetView(){
  if(!this.bounds)return;
  const damping=this.controls.enableDamping;
  this.controls.enableDamping=false;this.controls.update();this.controls.reset();this.controls.enableDamping=damping;
 }
 private wheel=(event:WheelEvent)=>{
  // Keep the normal wheel for page scrolling. Trackpad pinch generally arrives as Ctrl+wheel.
  event.stopImmediatePropagation();
  if(!event.ctrlKey&&!event.metaKey)return;
  event.preventDefault();
  if(this.bounds)this.setZoom(this.camera.zoom*Math.exp(-event.deltaY*(event.deltaMode===1?.06:.009)));
 };
 private touchStart=(event:TouchEvent)=>{
  if(event.targetTouches.length>1){
   this.touchAxis=undefined;if(event.cancelable)event.preventDefault();return;
  }
  const touch=event.targetTouches[0];
  this.touchAxis=touch?{x:touch.clientX,y:touch.clientY}:undefined;
 };
 private touchMove=(event:TouchEvent)=>{
  // Back up touch-action on browsers that still attempt page zoom or navigation.
  if(event.targetTouches.length>1){if(event.cancelable)event.preventDefault();return;}
  const touch=event.targetTouches[0],axis=this.touchAxis;
  if(!touch||!axis)return;
  const dx=Math.abs(touch.clientX-axis.x),dy=Math.abs(touch.clientY-axis.y);
  if(!axis.direction&&Math.max(dx,dy)>=6)axis.direction=dx>dy?'horizontal':'vertical';
  if(axis.direction==='horizontal'&&event.cancelable)event.preventDefault();
 };
 private gestureStart=(event:Event)=>{event.preventDefault();this.trackpadZoom=this.camera.zoom;};
 private gestureChange=(event:Event)=>{
  event.preventDefault();
  const scale=(event as Event&{scale?:number}).scale;
  if(this.bounds&&!this.pointers.size&&scale&&Number.isFinite(scale))this.setZoom(this.trackpadZoom*scale);
 };
 private start=(event:PointerEvent)=>{this.pointers.add(event.pointerId);this.down=this.pointers.size===1?{id:event.pointerId,x:event.clientX,y:event.clientY}:null;};
 private cancel=(event:PointerEvent)=>{this.pointers.delete(event.pointerId);this.down=null;};
 private end=(event:PointerEvent)=>{
  this.pointers.delete(event.pointerId);const down=this.down;this.down=null;
  if(!this.root||!down||down.id!==event.pointerId||this.pointers.size||Math.hypot(event.clientX-down.x,event.clientY-down.y)>9)return;
  const rect=this.renderer.domElement.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),this.camera);
  if(!ray.intersectObject(this.root,true).length||!this.lamps.size)return;this.lights=!this.lights;
  this.lamps.forEach((base,m)=>{m.emissive.copy(this.lights?new T.Color('#fff6d4'):base.color);m.emissiveIntensity=this.lights?2:base.intensity;});this.renderer.domElement.dataset.lights=this.lights?'on':'off';this.invalidate();
 };
 private key=(event:KeyboardEvent)=>{
  if(['+','=','-','_','0','Home'].includes(event.key)){
   event.preventDefault();
   if(event.key==='0'||event.key==='Home')this.resetView();
   else this.adjustZoom(['-','_'].includes(event.key)?-VEHICLE_ZOOM_STEP:VEHICLE_ZOOM_STEP);
   return;
  }
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();
  const sphere=new T.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));sphere.theta+=event.key==='ArrowLeft'?.25:event.key==='ArrowRight'?-.25:0;
  sphere.phi=T.MathUtils.clamp(sphere.phi+(event.key==='ArrowUp'?-.15:event.key==='ArrowDown'?.15:0),.12,Math.PI*.48);
  this.camera.position.copy(this.controls.target).add(new T.Vector3().setFromSpherical(sphere));this.controls.update();this.invalidate();
 };
 private lost=(event:Event)=>{event.preventDefault();this.fail();};
 private render=()=>{
  if(this.disposed)return;
  let settling=false;
  if(!document.hidden&&this.root&&this.bounds){
   const changed=this.controls.update();
   settling=changed&&this.controls.enableDamping;
   if(changed||this.needsRender){
    // Elevation can change during a drag. Refit without changing the user's zoom.
    frameModel(this.camera,this.bounds,this.aspect);
    try{this.renderer.render(this.scene,this.camera);}catch{this.fail();return;}
    const canvas=this.renderer.domElement,zoom=Math.round(this.camera.zoom*100);canvas.dataset.yaw=String(Math.atan2(this.camera.position.z-this.controls.target.z,this.camera.position.x-this.controls.target.x));canvas.dataset.zoom=String(zoom);canvas.dataset.car=this.carId;canvas.dataset.ready='true';canvas.dataset.source='reviewed-gltf';canvas.style.visibility='';this.needsRender=false;
    if(zoom!==this.reportedZoom){this.reportedZoom=zoom;this.onZoom(zoom);}
    if(this.first){this.first=false;this.onReady(this.carId);}
   }
  }
  this.frame=0;
  if(settling||this.needsRender)this.requestFrame();
 };
 dispose(){
  if(this.disposed)return;this.disposed=true;++this.epoch;cancelAnimationFrame(this.frame);this.observer.disconnect();this.controls.removeEventListener('change',this.invalidate);this.controls.dispose();this.clearCar();
  this.reduceMotion.removeEventListener('change',this.updateMotion);document.removeEventListener('visibilitychange',this.invalidate);
  const canvas=this.renderer.domElement;canvas.removeEventListener('pointerdown',this.start);canvas.removeEventListener('pointerup',this.end,true);canvas.removeEventListener('pointercancel',this.cancel);canvas.removeEventListener('lostpointercapture',this.cancel);canvas.removeEventListener('keydown',this.key);canvas.removeEventListener('webglcontextlost',this.lost);
  canvas.removeEventListener('wheel',this.wheel,true);canvas.removeEventListener('touchstart',this.touchStart);canvas.removeEventListener('touchmove',this.touchMove);canvas.removeEventListener('gesturestart',this.gestureStart);canvas.removeEventListener('gesturechange',this.gestureChange);
  this.environment?.dispose();this.floor.geometry.dispose();this.floor.material.dispose();disposeModel(this.contactShadow);canvas.remove();this.renderer.dispose();this.renderer.forceContextLoss();
 }
}
