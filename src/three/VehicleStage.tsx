import {vehiclePreview} from '../domain/vehicle-preview';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {CircleDashed,Hand,MoveHorizontal,RotateCcw} from 'lucide-react';
import {VehicleRenderer} from './VehicleRenderer';
import {vehicleModel} from '../domain/vehicle-models';
import {assetUrl,getCar} from '../domain/content';

export function VehicleStage({carId,onTouch,onUnavailable,onReady}:{carId:string;onTouch?:()=>void;onUnavailable:()=>void;onReady?:()=>void}){
 const host=useRef<HTMLDivElement>(null),stage=useRef<VehicleRenderer|null>(null),[readyCar,setReadyCar]=useState(''),[touched,setTouched]=useState(false);
 const [paint,setPaint]=useState<string|null>(null);
 const [unavailable,setUnavailable]=useState(false);
 const paints=[{name:'红色',color:'#df4145'},{name:'橙色',color:'#f08b2c'},{name:'黄色',color:'#ffc928'},{name:'绿色',color:'#30c562'},{name:'蓝色',color:'#3798e8'},{name:'紫色',color:'#8657d6'},{name:'白色',color:'#f0efdf'}];
 const ready=readyCar===carId;
 const callbacks=useRef({carId,onTouch,onUnavailable,onReady});callbacks.current={carId,onTouch,onUnavailable,onReady};
 // OrbitControls resolves its listener root from the still-attached canvas.
 useLayoutEffect(()=>{
  try{stage.current=new VehicleRenderer(host.current!,loadedId=>{setReadyCar(loadedId);if(loadedId===callbacks.current.carId)callbacks.current.onReady?.();},()=>{setTouched(true);callbacks.current.onTouch?.();},()=>setUnavailable(true));}
  catch{setUnavailable(true);}
  return()=>{stage.current?.dispose();stage.current=null;};
 },[]);
 useLayoutEffect(()=>{setReadyCar('');setTouched(false);setPaint(null);const spec=vehicleModel(carId);if(spec&&stage.current)void stage.current.load(spec);else setUnavailable(true);},[carId]);
 // Notify after the parent's car-selection layout reset, which must not replace
 // a synchronous WebGL constructor failure with an empty model view.
 useEffect(()=>{if(unavailable)callbacks.current.onUnavailable();},[unavailable]);
 const car=getCar(carId)!;
 return <div className="vehicle-stage" data-ready={ready}>
  <div className="vehicle-model-surface" ref={host}/>
  {!ready&&<img key={carId} className="vehicle-poster" src={assetUrl(vehiclePreview(carId)||car.game!.side)} alt=""/>}
  {!ready&&<span className="stage-loading" aria-label="正在准备立体车"><CircleDashed/></span>}
  {ready&&!touched&&<span className="orbit-invitation" aria-hidden="true"><Hand/><MoveHorizontal/></span>}
  {ready&&<div className="model-paints" role="group" aria-label="给立体车试颜色"><button type="button" aria-label="还原原车颜色" aria-pressed={paint===null} onClick={()=>{stage.current?.setPaint(null);setPaint(null);setTouched(true);}}><RotateCcw size={18}/></button>{paints.map(choice=><button key={choice.color} type="button" aria-label={`立体车试${choice.name}`} aria-pressed={paint===choice.color} style={{'--paint':choice.color} as React.CSSProperties} onClick={()=>{stage.current?.setPaint(choice.color);setPaint(choice.color);setTouched(true);}}><span/></button>)}</div>}
 </div>;
}
