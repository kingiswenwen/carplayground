import {useEffect,useRef} from 'react';
import * as T from 'three';
import {SVGRenderer} from 'three/addons/renderers/SVGRenderer.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createVehicle} from './vehicle';
// Same 3D geometry projected on the CPU when WebGL is unavailable. No flat side-photo substitution.
export function SvgVehicle({carId}:{carId:string}){
 const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const el=host.current!,renderer=new SVGRenderer(),scene=new T.Scene(),model=createVehicle(carId,'low'),camera=new T.PerspectiveCamera(36,1,.1,60);renderer.setQuality('low');renderer.setClearColor(new T.Color('#f5f3e9'),0);renderer.domElement.setAttribute('role','application');renderer.domElement.setAttribute('aria-label','立体跑车简化画面，拖动旋转');renderer.domElement.setAttribute('tabindex','0');renderer.domElement.dataset.car=carId;renderer.domElement.dataset.ready='true';
  el.append(renderer.domElement);scene.add(model.root,new T.AmbientLight('#ffffff',1.2));const light=new T.DirectionalLight('#ffffff',1.6);light.position.set(4,6,5);scene.add(light);camera.position.set(4.1,2.3,4.5);
  const controls=new OrbitControls(camera,renderer.domElement as unknown as HTMLElement);controls.target.set(0,.63,0);controls.enablePan=false;controls.enableZoom=false;controls.maxPolarAngle=Math.PI*.49;controls.minPolarAngle=.08;controls.rotateSpeed=.65;controls.update();
  const key=(event:KeyboardEvent)=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const offset=camera.position.clone().sub(controls.target),sphere=new T.Spherical().setFromVector3(offset);sphere.theta+=event.key==='ArrowLeft'?.25:event.key==='ArrowRight'?-.25:0;sphere.phi=T.MathUtils.clamp(sphere.phi+(event.key==='ArrowUp'?-.15:event.key==='ArrowDown'?.15:0),.08,Math.PI*.49);camera.position.copy(controls.target).add(new T.Vector3().setFromSpherical(sphere));controls.update();};renderer.domElement.addEventListener('keydown',key);
  let request=0;const draw=()=>{cancelAnimationFrame(request);request=requestAnimationFrame(()=>{renderer.render(scene,camera);renderer.domElement.dataset.yaw=String(Math.atan2(camera.position.z,camera.position.x));});};const resize=()=>{renderer.setSize(el.clientWidth,el.clientHeight);camera.aspect=el.clientWidth/Math.max(1,el.clientHeight);camera.updateProjectionMatrix();draw();};controls.addEventListener('change',draw);const observer=new ResizeObserver(resize);observer.observe(el);resize();
  return()=>{observer.disconnect();cancelAnimationFrame(request);controls.dispose();renderer.domElement.removeEventListener('keydown',key);renderer.domElement.remove();model.dispose();};
 },[carId]);
 return <div className="svg-vehicle" ref={host}/>;
}
