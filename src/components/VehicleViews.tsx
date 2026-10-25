import {lazy,Suspense,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Box,Camera,CircleDashed,Hand,MoveHorizontal,RotateCcw,RotateCw} from 'lucide-react';
import {assetUrl,getCar} from '../domain/content';
import {vehicleModel} from '../domain/vehicle-models';
const Model=lazy(()=>import('../three/VehicleStage').then(m=>({default:m.VehicleStage})));
export function VehicleViews({carId}:{carId:string}){
 const car=getCar(carId)!,views=car.game?.orbit,modelAvailable=!!vehicleModel(carId);
 const [frame,setFrame]=useState(0),[mode,setMode]=useState<'pictures'|'model'>('pictures'),[ready,setReady]=useState(false),[error,setError]=useState(false),[attempt,setAttempt]=useState(0),[touched,setTouched]=useState(false);
 const img=useRef<HTMLImageElement>(null),down=useRef<{id:number;x:number;y:number}|null>(null);
 const ordered=views?[views[0],views[1],views[2],views[5],views[4],views[3]]:[];
 const view=ordered[frame],src=view?assetUrl(view.image):assetUrl(car.game!.side);
 const showingModel=mode==='model'&&modelAvailable;
 const modelUnavailable=()=>setMode('pictures');
 useLayoutEffect(()=>{setReady(!!img.current?.complete&&!!img.current?.naturalWidth);setError(false);},[src,attempt]);
 useEffect(()=>{if(!views)return;for(const index of [(frame+1)%6,(frame+5)%6]){const image=new Image();image.src=assetUrl(ordered[index].image);}},[carId,frame]);
 const turn=(step:number)=>{setFrame(i=>(i+step+6)%6);setTouched(true);};
 if(!views)return <img className="vehicle-poster" src={src} alt={`${car.name}外观`}/>;
 return <div className="vehicle-views" data-mode={showingModel?'model':'pictures'} data-view={view.id} data-car={carId} data-ready={ready}>
  {!showingModel?<div className="vehicle-turnaround" role="application" tabIndex={0} aria-label="跑车多角度外观，左右拨动看前后和两侧" onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();turn(e.key==='ArrowLeft'?-1:1);}}}
   onPointerDown={e=>{if(down.current)return;down.current={id:e.pointerId,x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}}
   onPointerUp={e=>{const start=down.current;if(!start||start.id!==e.pointerId)return;down.current=null;if(Math.abs(e.clientX-start.x)>35&&Math.abs(e.clientX-start.x)>Math.abs(e.clientY-start.y))turn(e.clientX<start.x?1:-1);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
   onPointerCancel={()=>{down.current=null;}} onLostPointerCapture={()=>{down.current=null;}}>
   <img key={src+'-'+attempt} ref={img} className="vehicle-angle" src={src+(attempt?`?retry=${attempt}`:'')} alt={`${car.name}游戏外观，${view.id}`} draggable={false} data-ready={ready} onLoad={()=>{setReady(true);setError(false);}} onError={()=>{setReady(false);setError(true);}}/>
   {!touched&&!error&&<span className="orbit-invitation" aria-hidden="true"><Hand/><MoveHorizontal/></span>}
  </div>:<Suspense fallback={<div className="stage-loading" aria-label="正在准备立体车"><CircleDashed/></div>}><Model carId={carId} onUnavailable={modelUnavailable}/></Suspense>}
  {modelAvailable&&<button className="picture-button viewer-mode" aria-label={showingModel?'回到多角度外观图':'打开车型立体模型'} onClick={()=>{setMode(showingModel?'pictures':'model');setTouched(true);}}>{showingModel?<Camera/>:<Box/>}</button>}
  {!showingModel&&!error&&<div className="view-turners"><button className="picture-button" aria-label="看前一个角度" onClick={()=>turn(-1)}><RotateCcw/></button><div className="view-dots" aria-hidden="true">{ordered.map((v,i)=><span className={i===frame?'selected':''} key={v.id}/>)}</div><button className="picture-button" aria-label="看后一个角度" onClick={()=>turn(1)}><RotateCw/></button></div>}
  {error&&!showingModel&&<button className="picture-button stage-retry" aria-label="重新加载车辆角度图" onClick={()=>setAttempt(n=>n+1)}><RotateCcw/></button>}
 </div>;
}
