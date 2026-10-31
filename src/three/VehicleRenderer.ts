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

/** One context and studio per viewer. Changing cars replaces only the vehicle. */
export class VehicleRenderer{
 private renderer:T.WebGLRenderer;
 private scene=new T.Scene();
 private camera=new T.OrthographicCamera(-3,3,2,-2,.1,60);
 private controls:OrbitControls;
 private observer:ResizeObserver;
 private floor=new T.Mesh(new T.PlaneGeometry(30,30),new T.ShadowMaterial({color:'#30483e',opacity:.23}));
 private environment?:T.WebGLRenderTarget;
 private root?:T.Group;
 private removed:T.Object3D[]=[];
 private bounds?:T.Box3;
 private lamps=new Map<T.MeshStandardMaterial,{color:T.Color;intensity:number}>();
 private paint=new Set<T.MeshStandardMaterial>();
 private abort?:AbortController;
 private timer?:ReturnType<typeof setTimeout>;
 private epoch=0;
 private disposed=false;
 private needsRender=true;
 private frame=0;
 private carId='';
 private first=false;
 private down:{id:number;x:number;y:number}|null=null;
 private pointers=new Set<number>();
 private lights=false;
 constructor(private box:HTMLDivElement,private onReady:()=>void,private onTouch:()=>void,private onUnavailable:()=>void){
  this.renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
  const renderer=this.renderer,canvas=renderer.domElement;
  const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
  const software=!!debug&&/swiftshader|llvmpipe|software/i.test(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
  // Keep the authored materials, but reduce fill work when no hardware GPU is available.
  renderer.setPixelRatio(Math.min(devicePixelRatio,software?.65:1.5));canvas.dataset.quality=software?'simple':'full';renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
  this.scene.environmentIntensity=.6;
  this.scene.add(new T.HemisphereLight('#eaf5ff','#c6bba8',.8));
  const sun=new T.DirectionalLight('#fff7eb',1.6);sun.position.set(3,7,4);sun.castShadow=true;sun.shadow.mapSize.set(512,512);
  Object.assign(sun.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.1,far:20});sun.shadow.normalBias=.012;sun.shadow.bias=-.0001;this.scene.add(sun);
  const fill=new T.DirectionalLight('#e0edff',.65);fill.position.set(-4,3,-5);this.scene.add(fill);
  this.floor.rotation.x=-Math.PI/2;this.floor.position.y=-.008;this.floor.receiveShadow=true;this.scene.add(this.floor);
  canvas.className='vehicle-webgl';canvas.setAttribute('aria-label','立体跑车，拖动旋转看前后左右，双指缩放');canvas.setAttribute('role','application');canvas.tabIndex=0;box.append(canvas);
  this.camera.position.set(5,2.5,6);this.controls=new OrbitControls(this.camera,canvas);this.controls.enablePan=false;this.controls.enableDamping=true;this.controls.dampingFactor=.12;
  this.controls.minZoom=.8;this.controls.maxZoom=2;this.controls.minPolarAngle=.12;this.controls.maxPolarAngle=Math.PI*.48;this.controls.rotateSpeed=.65;
  canvas.addEventListener('pointerdown',this.start);canvas.addEventListener('pointerup',this.end,true);canvas.addEventListener('pointercancel',this.cancel);canvas.addEventListener('lostpointercapture',this.cancel);canvas.addEventListener('keydown',this.key);canvas.addEventListener('webglcontextlost',this.lost);
  this.observer=new ResizeObserver(this.resize);this.observer.observe(box);this.resize();this.frame=requestAnimationFrame(this.render);
 }
 private resize=()=>{
  if(this.disposed)return;const w=Math.max(1,this.box.clientWidth),h=Math.max(1,this.box.clientHeight);this.renderer.setSize(w,h,false);
  if(this.bounds)frameModel(this.camera,this.bounds,w/h);this.needsRender=true;
 };
 private clearCar(){
  this.abort?.abort();clearTimeout(this.timer);this.bounds=undefined;this.lamps.clear();this.paint.clear();this.down=null;this.pointers.clear();
  if(this.root){disposeModel(new T.Group().add(this.root,...this.removed));this.root=undefined;}this.removed=[];
 }
 async load(spec:VehicleModelSpec){
  if(this.disposed)return;const epoch=++this.epoch;this.clearCar();this.first=true;this.carId=spec.id;this.lights=false;
  const canvas=this.renderer.domElement;canvas.dataset.ready='false';delete canvas.dataset.car;delete canvas.dataset.lights;
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
      if(!spec.preservePaint)material.color.set(spec.color);material.roughness=.27;material.metalness=.55;this.paint.add(material);
     }
     if(spec.lampMaterials.includes(material.name)||isVehicleLampName(material.name))this.lamps.set(material,{color:material.emissive.clone(),intensity:material.emissiveIntensity});
    }
   }});
   this.bounds=fitModel(this.root,spec.rotationY);this.scene.add(this.root);
   const offset=this.camera.position.clone().sub(this.controls.target);this.controls.target.copy(this.bounds.getCenter(new T.Vector3()));this.camera.position.copy(this.controls.target).add(offset);this.controls.update();
   if(!this.environment){const room=new RoomEnvironment(),pmrem=new T.PMREMGenerator(this.renderer);try{this.environment=pmrem.fromScene(room,.04,.1,100,{size:64});this.scene.environment=this.environment.texture;}finally{room.dispose();pmrem.dispose();}}
   this.renderer.shadowMap.needsUpdate=true;this.resize();
  }catch(error){if(this.disposed||epoch!==this.epoch)return;console.warn('车辆模型未能打开',error);this.fail();}
 }
 private fail(){if(this.disposed)return;this.dispose();this.onUnavailable();}
 setPaint(color:string){this.paint.forEach(material=>{material.color.set(color);if(material.map){material.map=null;material.needsUpdate=true;}});this.renderer.domElement.dataset.paint=color;this.needsRender=true;}
 private start=(event:PointerEvent)=>{this.pointers.add(event.pointerId);this.down=this.pointers.size===1?{id:event.pointerId,x:event.clientX,y:event.clientY}:null;this.onTouch();};
 private cancel=(event:PointerEvent)=>{this.pointers.delete(event.pointerId);this.down=null;};
 private end=(event:PointerEvent)=>{
  this.pointers.delete(event.pointerId);const down=this.down;this.down=null;
  if(!this.root||!down||down.id!==event.pointerId||this.pointers.size||Math.hypot(event.clientX-down.x,event.clientY-down.y)>9)return;
  const rect=this.renderer.domElement.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),this.camera);
  if(!ray.intersectObject(this.root,true).length||!this.lamps.size)return;this.lights=!this.lights;
  this.lamps.forEach((base,m)=>{m.emissive.copy(this.lights?new T.Color('#fff6d4'):base.color);m.emissiveIntensity=this.lights?2:base.intensity;});this.renderer.domElement.dataset.lights=this.lights?'on':'off';this.needsRender=true;
 };
 private key=(event:KeyboardEvent)=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();
  const sphere=new T.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));sphere.theta+=event.key==='ArrowLeft'?.25:event.key==='ArrowRight'?-.25:0;
  sphere.phi=T.MathUtils.clamp(sphere.phi+(event.key==='ArrowUp'?-.15:event.key==='ArrowDown'?.15:0),.12,Math.PI*.48);
  this.camera.position.copy(this.controls.target).add(new T.Vector3().setFromSpherical(sphere));this.controls.update();this.needsRender=true;this.onTouch();
 };
 private lost=(event:Event)=>{event.preventDefault();this.fail();};
 private render=()=>{
  if(this.disposed)return;
  if(!document.hidden&&this.root&&this.bounds){const changed=this.controls.update();if(changed||this.needsRender){
   // Elevation can change during a drag. Refit without changing the user's zoom.
   frameModel(this.camera,this.bounds,Math.max(1,this.box.clientWidth)/Math.max(1,this.box.clientHeight));
   try{this.renderer.render(this.scene,this.camera);}catch{this.fail();return;}
   const canvas=this.renderer.domElement;canvas.dataset.yaw=String(Math.atan2(this.camera.position.z-this.controls.target.z,this.camera.position.x-this.controls.target.x));canvas.dataset.car=this.carId;canvas.dataset.ready='true';canvas.dataset.source='reviewed-gltf';this.needsRender=false;
   if(this.first){this.first=false;this.onReady();}
  }}
  this.frame=requestAnimationFrame(this.render);
 };
 dispose(){
  if(this.disposed)return;this.disposed=true;++this.epoch;cancelAnimationFrame(this.frame);this.observer.disconnect();this.controls.dispose();this.clearCar();
  const canvas=this.renderer.domElement;canvas.removeEventListener('pointerdown',this.start);canvas.removeEventListener('pointerup',this.end,true);canvas.removeEventListener('pointercancel',this.cancel);canvas.removeEventListener('lostpointercapture',this.cancel);canvas.removeEventListener('keydown',this.key);canvas.removeEventListener('webglcontextlost',this.lost);
  this.environment?.dispose();this.floor.geometry.dispose();this.floor.material.dispose();canvas.remove();this.renderer.dispose();this.renderer.forceContextLoss();
 }
}
