import {useEffect,useRef,useState} from 'react';
import {CircleDashed,Hand,MoveHorizontal} from 'lucide-react';
import {VehicleRenderer} from './VehicleRenderer';
import {vehicleModel} from '../domain/vehicle-models';
import {assetUrl,getCar} from '../domain/content';

export function VehicleStage({carId,onTouch,onUnavailable}:{carId:string;onTouch?:()=>void;onUnavailable:()=>void}){
 const host=useRef<HTMLDivElement>(null),stage=useRef<VehicleRenderer|null>(null),[ready,setReady]=useState(false),[touched,setTouched]=useState(false);
 const callbacks=useRef({onTouch,onUnavailable});callbacks.current={onTouch,onUnavailable};
 useEffect(()=>{
  try{stage.current=new VehicleRenderer(host.current!,()=>setReady(true),()=>{setTouched(true);callbacks.current.onTouch?.();},()=>callbacks.current.onUnavailable());}
  catch{callbacks.current.onUnavailable();}
  return()=>{stage.current?.dispose();stage.current=null;};
 },[]);
 useEffect(()=>{setReady(false);setTouched(false);const spec=vehicleModel(carId);if(spec&&stage.current)void stage.current.load(spec);else callbacks.current.onUnavailable();},[carId]);
 const car=getCar(carId)!;
 return <div className="vehicle-stage" data-ready={ready} ref={host}>
  {!ready&&<img className="vehicle-poster" src={assetUrl(car.game!.side)} alt=""/>}
  {!ready&&<span className="stage-loading" aria-label="正在准备立体车"><CircleDashed/></span>}
  {ready&&!touched&&<span className="orbit-invitation" aria-hidden="true"><Hand/><MoveHorizontal/></span>}
 </div>;
}
