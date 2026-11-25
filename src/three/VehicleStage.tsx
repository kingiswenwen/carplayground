import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {CarThumbnail} from '../components/CarImage';
import {CircleDashed} from '../components/TownIcons';
import {getCar} from '../domain/content';
import {vehicleModel} from '../domain/vehicle-models';
import {vehiclePreview} from '../domain/vehicle-preview';
import {VehicleRenderer} from './VehicleRenderer';
import type {ShowroomPaint} from '../domain/showroom-paint';

export function VehicleStage({carId, paint, onUnavailable, onReady}: {
  carId:string; paint:ShowroomPaint|null; onUnavailable:()=>void; onReady:()=>void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<VehicleRenderer|null>(null);
  const [readyCar, setReadyCar] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const ready = readyCar===carId;
  const callbacks = useRef({carId,onUnavailable,onReady});
  callbacks.current={carId,onUnavailable,onReady};

  // OrbitControls needs the canvas to stay attached until its listeners are removed.
  useLayoutEffect(() => {
    try {
      stage.current=new VehicleRenderer(host.current!, loadedId => {
        setReadyCar(loadedId);
        if(loadedId===callbacks.current.carId)callbacks.current.onReady();
      }, () => setUnavailable(true));
    } catch {
      setUnavailable(true);
    }
    return () => {stage.current?.dispose();stage.current=null;};
  }, []);
  useLayoutEffect(() => {
    setReadyCar('');
    const spec=vehicleModel(carId);
    if(spec&&stage.current)void stage.current.load(spec);
    else setUnavailable(true);
  }, [carId]);
  useLayoutEffect(() => {
    if(ready)stage.current?.setPaint(paint);
  }, [paint,ready]);
  // The parent first resets its selection, then processes a synchronous WebGL failure.
  useEffect(() => {if(unavailable)callbacks.current.onUnavailable();}, [unavailable]);

  const car=getCar(carId)!;
  return <div className="vehicle-stage" data-ready={ready}>
    <div className="vehicle-model-surface" ref={host}/>
    {!ready&&<CarThumbnail className="vehicle-poster" imageId={vehiclePreview(carId)||car.game!.side}/>}
    {!ready&&<span className="stage-loading" aria-hidden="true"><CircleDashed/></span>}
  </div>;
}
