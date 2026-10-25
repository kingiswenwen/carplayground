import {useEffect,useRef,useState} from 'react';
import {CircleDashed,Hand,MoveHorizontal,RotateCcw} from 'lucide-react';
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {SvgVehicle} from './SvgVehicle';
import {createVehicle} from './vehicle';
import {assetUrl,getCar} from '../domain/content';

export function VehicleStage({carId,onTouch}:{carId:string;onTouch?:()=>void}){
 const host=useRef<HTMLDivElement>(null),[failed,setFailed]=useState(false),[ready,setReady]=useState(false),[touched,setTouched]=useState(false),[retry,setRetry]=useState(0);
 const touch=useRef(onTouch);touch.current=onTouch;
 useEffect(()=>{
  const box=host.current!;let disposed=false,cleaned=false,stopped=false,frame=0;
  let renderer:T.WebGLRenderer|undefined,observer:ResizeObserver|undefined,controls:OrbitControls|undefined;
  const model=createVehicle(carId),scene=new T.Scene();setReady(false);setFailed(false);setTouched(false);
  const floor=new T.Mesh(new T.PlaneGeometry(200,200),new T.ShadowMaterial({color:'#3b5149',opacity:.20}));
  floor.rotation.x=-Math.PI/2;floor.position.y=.006;floor.receiveShadow=true;scene.add(floor,model.root);
  let cleanEvents=()=>{};
  const dispose=()=>{
   if(cleaned)return;cleaned=true;
   disposed=true;cancelAnimationFrame(frame);observer?.disconnect();controls?.dispose();cleanEvents();
   model.dispose();floor.geometry.dispose();floor.material.dispose();
   if(renderer){renderer.domElement.remove();renderer.forceContextLoss();renderer.dispose();}
  };
  try{
   renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
   renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));renderer.outputColorSpace=T.SRGBColorSpace;
   renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;
   renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
   scene.add(new T.HemisphereLight('#f5fbff','#d9cbb6',.9));
   const sun=new T.DirectionalLight('#fff6e5',2.0);sun.position.set(3,7,4);sun.castShadow=true;
   sun.shadow.mapSize.set(512,512);Object.assign(sun.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.1,far:20});sun.shadow.normalBias=.015;sun.shadow.bias=-.0002;sun.shadow.radius=2;scene.add(sun);
   const fill=new T.DirectionalLight('#dfedff',.75);fill.position.set(-4,3,-5);scene.add(fill);
   const canvas=renderer.domElement;canvas.className='vehicle-webgl';canvas.setAttribute('aria-label','立体跑车，拖动旋转看前后左右，双指缩放');canvas.setAttribute('role','application');canvas.tabIndex=0;box.append(canvas);
   const camera=new T.OrthographicCamera(-3,3,1.5,-1.5,.1,60);camera.position.set(5,2.7,6);
   controls=new OrbitControls(camera,canvas);controls.target.set(0,.58,0);controls.enablePan=false;controls.enableDamping=true;controls.dampingFactor=.12;
   controls.minZoom=.75;controls.maxZoom=2;controls.minPolarAngle=.12;controls.maxPolarAngle=Math.PI*.48;controls.rotateSpeed=.65;controls.update();
   let needsRender=true;
   const resize=()=>{if(!renderer)return;const w=box.clientWidth,h=Math.max(1,box.clientHeight),aspect=w/h,halfHeight=Math.max(1.43,2.75/aspect);
    renderer.setSize(w,h,false);camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;camera.top=halfHeight;camera.bottom=-halfHeight;camera.updateProjectionMatrix();needsRender=true;};
   observer=new ResizeObserver(resize);observer.observe(box);resize();
   let down={x:0,y:0};const ray=new T.Raycaster();
   const start=(event:PointerEvent)=>{down={x:event.clientX,y:event.clientY};setTouched(true);touch.current?.();};
   const end=(event:PointerEvent)=>{
    if(Math.hypot(event.clientX-down.x,event.clientY-down.y)>9)return;
    const rect=canvas.getBoundingClientRect();ray.setFromCamera(new T.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
    if(ray.intersectObject(model.root,true).length){model.lamps.forEach(light=>{const m=light.material as T.MeshStandardMaterial;m.emissiveIntensity=m.emissiveIntensity>1?.65:1.8;});needsRender=true;}
   };
   const key=(event:KeyboardEvent)=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();
    const offset=camera.position.clone().sub(controls!.target),sphere=new T.Spherical().setFromVector3(offset);
    sphere.theta+=event.key==='ArrowLeft'?.25:event.key==='ArrowRight'?-.25:0;
    sphere.phi=T.MathUtils.clamp(sphere.phi+(event.key==='ArrowUp'?-.15:event.key==='ArrowDown'?.15:0),.12,Math.PI*.48);
    camera.position.copy(controls!.target).add(new T.Vector3().setFromSpherical(sphere));controls!.update();needsRender=true;setTouched(true);
   };
   const lost=(event:Event)=>{event.preventDefault();stopped=true;setFailed(true);setReady(false);cancelAnimationFrame(frame);};
   canvas.addEventListener('pointerdown',start);canvas.addEventListener('pointerup',end);canvas.addEventListener('keydown',key);canvas.addEventListener('webglcontextlost',lost);
   cleanEvents=()=>{canvas.removeEventListener('pointerdown',start);canvas.removeEventListener('pointerup',end);canvas.removeEventListener('keydown',key);canvas.removeEventListener('webglcontextlost',lost);};
   let first=true;
   const render=()=>{
    if(disposed||stopped)return;
    if(!document.hidden){const changed=controls!.update();if(changed||needsRender){
     try{renderer!.render(scene,camera);}catch{setFailed(true);setReady(false);dispose();return;}
     needsRender=false;canvas.dataset.yaw=String(Math.atan2(camera.position.z,camera.position.x));canvas.dataset.pitch=String(camera.position.y);canvas.dataset.car=carId;canvas.dataset.ready='true';
     if(first){first=false;setReady(true);}
    }}
    if(!stopped)frame=requestAnimationFrame(render);
   };
   frame=requestAnimationFrame(render);
  }catch{setFailed(true);setReady(false);dispose();}
  return dispose;
 },[carId,retry]);
 const car=getCar(carId)!;
 return <div className="vehicle-stage" data-ready={ready} data-fallback={failed} ref={host}>
  {!ready&&!failed&&<img className="vehicle-poster" src={assetUrl(car.game!.side)} alt=""/>}
  {!ready&&!failed&&<span className="stage-loading" aria-label="正在准备小车"><CircleDashed/></span>}
  {ready&&!touched&&<span className="orbit-invitation" aria-hidden="true"><Hand/><MoveHorizontal/></span>}
  {failed&&<SvgVehicle carId={carId}/>}
  {failed&&<button className="picture-button stage-retry" aria-label="重新打开立体小车" onClick={()=>setRetry(n=>n+1)}><RotateCcw/></button>}
 </div>;
}
