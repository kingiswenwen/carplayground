import {useEffect,useRef,useState} from 'react';
import {CircleDashed,Rotate3D,Hand,Scan} from 'lucide-react';
import type {TouchBoard,BoardSnapshot} from '../game/TouchBoard';
import {TouchWorldRenderer} from './TouchWorldRenderer';

export function TouchWorld3D({board,carId,id,state,paused,onUnavailable,onPreview,onReadyChange}:{board:TouchBoard;carId:string;id:string;state:BoardSnapshot;paused:boolean;onUnavailable:()=>void;onReadyChange?:(ready:boolean)=>void;onPreview?:(render:TouchWorldRenderer['guidePreview']|null)=>void}){
 const host=useRef<HTMLDivElement>(null),world=useRef<TouchWorldRenderer|null>(null),[ready,setReady]=useState(false),[orbit,setOrbit]=useState(false);
 const height=board.height;
 const orbitMode=useRef(false);
 const callback=useRef(onUnavailable);callback.current=onUnavailable;
 useEffect(()=>{
  setReady(false);onReadyChange?.(false);let alive=true;
  try{world.current=new TouchWorldRenderer(host.current!,board,carId,id,state,value=>{if(alive){setReady(value);onReadyChange?.(value);}},()=>{if(alive)callback.current();});world.current.setOrbit(orbitMode.current);world.current.setPaused(paused);onPreview?.((...args)=>world.current?.guidePreview(...args));}catch(error){console.warn('立体场景初始化失败',error);callback.current();}
  return()=>{alive=false;world.current?.dispose();world.current=null;onPreview?.(null);onReadyChange?.(false);};
 },[board,carId,id,height]);
 useEffect(()=>{world.current?.update(state);},[state]);
 useEffect(()=>{world.current?.setPaused(paused);},[paused]);
 return <div className="touch-world" data-ready={ready} data-orbit={orbit}>
  <div className="touch-world-host" ref={host}/>
  {!ready&&<div className="world-preparing" role="status" aria-label="正在准备立体场景"><CircleDashed/></div>}
  {ready&&<div className="world-camera-tools"><button className="touch-icon" aria-label={orbit?'回到触碰玩法':'转动看看立体场景'} aria-pressed={orbit} onClick={()=>{const next=!orbit;orbitMode.current=next;setOrbit(next);world.current?.setOrbit(next);}}>{orbit?<Hand/>:<Rotate3D/>}</button><button className="touch-icon" aria-label="场景镜头归位" onClick={()=>world.current?.resetCamera()}><Scan/></button></div>}
 </div>;
}
