import {SvgVehicle} from './SvgVehicle';
import {useEffect,useRef,useState} from 'react';
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createVehicle} from './vehicle';
import {assetUrl,getCar} from '../domain/content';

export function VehicleStage({carId,onTouch}:{carId:string;onTouch?:()=>void}){
 const host=useRef<HTMLDivElement>(null),[failed,setFailed]=useState(false),[ready,setReady]=useState(false),[touched,setTouched]=useState(false),[retry,setRetry]=useState(0);
 const touch=useRef(onTouch);touch.current=onTouch;
 useEffect(()=>{
  const box=host.current!;let disposed=false,frame=0,renderer:T.WebGLRenderer|undefined,observer:ResizeObserver|undefined,controls:OrbitControls|undefined;
  const model=createVehicle(carId),scene=new T.Scene();setReady(false);setFailed(false);setTouched(false);
  try{
   renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;renderer.shadowMap.enabled=false;renderer.shadowMap.type=T.PCFShadowMap;
   const canvas=renderer.domElement;canvas.className='vehicle-webgl';canvas.setAttribute('aria-label','立体跑车，拖动旋转看前后左右，双指缩放');canvas.setAttribute('role','application');canvas.tabIndex=0;box.append(canvas);
   scene.add(model.root,new T.HemisphereLight('#f1fbff','#c4aa86',1.5));const sun=new T.DirectionalLight('#fff4df',2.2);sun.position.set(4,7,5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-5;sun.shadow.camera.right=5;sun.shadow.camera.top=5;sun.shadow.camera.bottom=-5;sun.shadow.normalBias=.03;scene.add(sun);
   const floor=new T.Mesh(new T.CircleGeometry(5,72),new T.ShadowMaterial({color:'#28423d',opacity:.18}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
   const camera=new T.PerspectiveCamera(36,1,.1,60);camera.position.set(4.1,2.3,4.5);
   controls=new OrbitControls(camera,canvas);controls.target.set(0,.63,0);controls.enablePan=false;controls.enableDamping=true;controls.dampingFactor=.1;controls.minDistance=5.1;controls.maxDistance=10.5;controls.minPolarAngle=.08;controls.maxPolarAngle=Math.PI*.49;controls.rotateSpeed=.65;controls.update();
   let needsRender=true;
   const resize=()=>{needsRender=true;if(!renderer)return;const w=box.clientWidth,h=box.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();};observer=new ResizeObserver(resize);observer.observe(box);resize();
   let down={x:0,y:0},spin=0;const ray=new T.Raycaster();
   const start=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY};setTouched(true);touch.current?.();};
   const end=(e:PointerEvent)=>{if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>9)return;const rect=canvas.getBoundingClientRect();ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);const hits=ray.intersectObject(model.root,true);if(hits.length){spin=2.6;needsRender=true;model.lamps.forEach(light=>{const m=light.material as T.MeshStandardMaterial;m.emissiveIntensity=m.emissiveIntensity>2?.9:4;});}};
   const key=(e:KeyboardEvent)=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const offset=camera.position.clone().sub(controls!.target),s=new T.Spherical().setFromVector3(offset);s.theta+=(e.key==='ArrowLeft'?.25:e.key==='ArrowRight'?-.25:0);s.phi=T.MathUtils.clamp(s.phi+(e.key==='ArrowUp'?-.15:e.key==='ArrowDown'?.15:0),.08,Math.PI*.49);camera.position.copy(controls!.target).add(new T.Vector3().setFromSpherical(s));controls!.update();needsRender=true;setTouched(true);}};
   const lost=(e:Event)=>{e.preventDefault();setFailed(true);setReady(false);cancelAnimationFrame(frame);};canvas.addEventListener('pointerdown',start);canvas.addEventListener('pointerup',end);canvas.addEventListener('keydown',key);canvas.addEventListener('webglcontextlost',lost);
   let last=performance.now();const render=(now:number)=>{if(disposed)return;const dt=Math.min(.04,(now-last)/1000);last=now;if(!document.hidden){const changed=controls!.update();if(changed||spin>0||needsRender){if(spin>0){spin=Math.max(0,spin-dt);model.wheels.forEach(w=>w.rotation.z+=dt*spin*4);}renderer!.render(scene,camera);needsRender=false;canvas.dataset.yaw=String(Math.atan2(camera.position.z,camera.position.x));canvas.dataset.pitch=String(camera.position.y);canvas.dataset.car=carId;canvas.dataset.ready='true';}}frame=requestAnimationFrame(render);};frame=requestAnimationFrame(render);setReady(true);
   return()=>{disposed=true;cancelAnimationFrame(frame);observer?.disconnect();controls?.dispose();canvas.removeEventListener('pointerdown',start);canvas.removeEventListener('pointerup',end);canvas.removeEventListener('keydown',key);canvas.removeEventListener('webglcontextlost',lost);canvas.remove();model.dispose();floor.geometry.dispose();(floor.material as T.Material).dispose();renderer?.forceContextLoss();renderer?.dispose();};
  }catch(error){console.warn('Vehicle renderer fallback',error);setFailed(true);setReady(false);observer?.disconnect();controls?.dispose();renderer?.dispose();model.dispose();}
  return()=>{disposed=true;cancelAnimationFrame(frame);};
 },[carId,retry]);
 const car=getCar(carId)!;
 return <div className="vehicle-stage" data-ready={ready} data-fallback={failed} ref={host}>
  {!ready&&<img className="vehicle-poster" src={assetUrl(car.game!.side)} alt=""/>}
  {!ready&&!failed&&<span className="stage-loading" aria-label="正在准备小车">🛞</span>}
  {ready&&!touched&&<span className="orbit-invitation" aria-hidden="true">👆<span>↔</span></span>}
  {failed&&<SvgVehicle carId={carId}/>}{failed&&<button className="picture-button stage-retry" aria-label="重新打开立体小车" onClick={()=>setRetry(n=>n+1)}>↻</button>}
 </div>;
}
