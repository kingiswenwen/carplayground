import {useEffect,useRef,useState} from 'react';
import {CircleDashed,Hand,MoveHorizontal} from 'lucide-react';
import {VehicleRenderer} from './VehicleRenderer';
import {vehicleModel} from '../domain/vehicle-models';
import {assetUrl,getCar} from '../domain/content';

export function VehicleStage({carId,onTouch,onUnavailable,onReady}:{carId:string;onTouch?:()=>void;onUnavailable:()=>void;onReady?:()=>void}){
 const host=useRef<HTMLDivElement>(null),stage=useRef<VehicleRenderer|null>(null),[ready,setReady]=useState(false),[touched,setTouched]=useState(false);
 const [paint,setPaint]=useState<string|null>(null);
 const paints=[{name:'红色',color:'#df4145'},{name:'橙色',color:'#f08b2c'},{name:'黄色',color:'#ffc928'},{name:'绿色',color:'#30c562'},{name:'蓝色',color:'#3798e8'},{name:'紫色',color:'#8657d6'},{name:'白色',color:'#f0efdf'}];
 const callbacks=useRef({onTouch,onUnavailable,onReady});callbacks.current={onTouch,onUnavailable,onReady};
 useEffect(()=>{
  try{stage.current=new VehicleRenderer(host.current!,()=>{setReady(true);callbacks.current.onReady?.();},()=>{setTouched(true);callbacks.current.onTouch?.();},()=>callbacks.current.onUnavailable());}
  catch{callbacks.current.onUnavailable();}
  return()=>{stage.current?.dispose();stage.current=null;};
 },[]);
 useEffect(()=>{setReady(false);setTouched(false);setPaint(null);const spec=vehicleModel(carId);if(spec&&stage.current)void stage.current.load(spec);else callbacks.current.onUnavailable();},[carId]);
 const car=getCar(carId)!;
 return <div className="vehicle-stage" data-ready={ready}>
  <div className="vehicle-model-surface" ref={host}/>
  {!ready&&<img className="vehicle-poster" src={assetUrl(car.game!.side)} alt=""/>}
  {!ready&&<span className="stage-loading" aria-label="正在准备立体车"><CircleDashed/></span>}
  {ready&&!touched&&<span className="orbit-invitation" aria-hidden="true"><Hand/><MoveHorizontal/></span>}
  {ready&&!!vehicleModel(carId)?.paintMaterials.length&&<div className="model-paints" role="group" aria-label="给立体车试颜色">{paints.map(choice=><button key={choice.color} type="button" aria-label={`立体车试${choice.name}`} aria-pressed={(paint||vehicleModel(carId)?.color)===choice.color} style={{'--paint':choice.color} as React.CSSProperties} onClick={()=>{stage.current?.setPaint(choice.color);setPaint(choice.color);setTouched(true);}}><span/></button>)}</div>}
 </div>;
}
