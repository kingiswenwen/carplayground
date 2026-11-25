import {lazy, Suspense, useLayoutEffect, useState, type ReactNode} from 'react';
import {getCar} from '../domain/content';
import {vehicleModel} from '../domain/vehicle-models';
import {vehiclePreview} from '../domain/vehicle-preview';
import {CarThumbnail} from './CarImage';
import {CircleDashed, Rotate3D, RotateCcw} from './TownIcons';
import {VehiclePaintControls} from './VehiclePaintControls';
import type {ShowroomPaint} from '../domain/showroom-paint';

const Model = lazy(() => import('../three/VehicleStage').then(module => ({default:module.VehicleStage})));
export function VehicleViews({carId, title, children}:{carId:string; title?:string; children:ReactNode}) {
  const car = getCar(carId)!;
  const spec = vehicleModel(carId);
  const [readyCar,setReadyCar] = useState('');
  const [failedCar,setFailedCar] = useState('');
  const [paint,setPaint] = useState<ShowroomPaint|null>(null);
  const [attempt,setAttempt] = useState(0);
  const ready=readyCar===carId;
  const failed=!spec||failedCar===carId;
  const original=spec&&/^#[0-9a-f]{6}$/i.test(spec.color)?spec.color:'#7d8f81';

  useLayoutEffect(() => {
    setReadyCar('');
    setFailedCar('');
    setPaint(null);
    setAttempt(0);
  }, [carId]);

  return <div className="vehicle-views" data-mode="model" data-car={carId} data-ready={ready}>
    <div className="vehicle-exhibit">
      <div className="vehicle-frame">
        {failed ? <div className="vehicle-model-error" role="status">
          <p>立体模型暂时没打开。</p>
          {spec&&<button type="button" className="vehicle-secondary" onClick={() => {
            setFailedCar('');setReadyCar('');setAttempt(value=>value+1);
          }}><RotateCcw aria-hidden="true"/>重试立体模型</button>}
        </div> : <Suspense fallback={<div className="vehicle-stage" data-ready="false">
          <CarThumbnail className="vehicle-poster" imageId={vehiclePreview(carId)||car.game!.side} priority/>
          <span className="stage-loading" aria-hidden="true"><CircleDashed/></span>
        </div>}>
          <Model key={attempt} carId={carId} paint={paint} onUnavailable={() => {
            setFailedCar(carId);setReadyCar('');
          }} onReady={() => setReadyCar(carId)}/>
        </Suspense>}
      </div>
      {!failed&&<div className="vehicle-view-footer">
        <p className="vehicle-stage-hint" role="status">
          {ready ? <><Rotate3D aria-hidden="true"/>左右拖动车身旋转</> : '正在加载立体车…'}
        </p>
      </div>}
    </div>
    <div className="vehicle-console">
      {title&&<h2 className="vehicle-name">{title}</h2>}
      {!failed&&(ready
        ? <VehiclePaintControls key={carId} paint={paint} original={original} change={setPaint}/>
        : <div className="vehicle-paint-placeholder" aria-hidden="true"/>)}
      <div className="vehicle-actions">{children}</div>
    </div>
  </div>;
}
