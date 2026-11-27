import {lazy, Suspense, useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {getCar} from '../domain/content';
import {vehicleModel} from '../domain/vehicle-models';
import {vehiclePreview} from '../domain/vehicle-preview';
import {CarThumbnail} from './CarImage';
import {CircleDashed, Minus, Plus, Rotate3D, RotateCcw} from './TownIcons';
import {VehiclePaintControls} from './VehiclePaintControls';
import type {ShowroomPaint} from '../domain/showroom-paint';
import {MIN_VEHICLE_ZOOM, MAX_VEHICLE_ZOOM, VEHICLE_ZOOM_STEP, type VehicleViewActions} from '../domain/vehicle-view';

const Model = lazy(() => import('../three/VehicleStage').then(module => ({default:module.VehicleStage})));
export function VehicleViews({carId, title, children}:{carId:string; title?:string; children:ReactNode}) {
  const car = getCar(carId)!;
  const spec = vehicleModel(carId);
  const [readyCar,setReadyCar] = useState('');
  const [failedCar,setFailedCar] = useState('');
  const [paint,setPaint] = useState<ShowroomPaint|null>(null);
  const [attempt,setAttempt] = useState(0);
  const [zoom,setZoom]=useState(100);
  const view=useRef<VehicleViewActions>(null);
  const ready=readyCar===carId;
  const failed=!spec||failedCar===carId;
  const preview=vehiclePreview(carId)||car.game?.side||car.image;
  const original=spec&&/^#[0-9a-f]{6}$/i.test(spec.color)?spec.color:'#7d8f81';

  useLayoutEffect(() => {
    setReadyCar('');
    setFailedCar('');
    setPaint(null);
    setAttempt(0);
    setZoom(100);
  }, [carId]);

  return <div className="vehicle-views" data-mode="model" data-car={carId} data-ready={ready}>
    <div className="vehicle-exhibit">
      <div className="vehicle-frame">
        {failed ? <CarThumbnail className="vehicle-poster" imageId={preview} priority/> : <Suspense fallback={<div className="vehicle-stage" data-ready="false">
          <CarThumbnail className="vehicle-poster" imageId={preview} priority/>
          <span className="stage-loading" aria-hidden="true"><CircleDashed/></span>
        </div>}>
          <Model key={attempt} carId={carId} paint={paint} actionsRef={view} onZoom={setZoom} onUnavailable={() => {
            setFailedCar(carId);setReadyCar('');
          }} onReady={() => setReadyCar(carId)}/>
        </Suspense>}
      </div>
      <div className="vehicle-view-footer">
        {failed ? <>
          <p className="vehicle-stage-hint" role="status">{spec?'立体模型暂时没打开，先看看这辆车的图片。':'这辆车目前提供图片。'}</p>
          {spec&&<button type="button" className="vehicle-text-control" onClick={()=>{
            setFailedCar('');setReadyCar('');setZoom(100);setAttempt(value=>value+1);
          }}><RotateCcw aria-hidden="true"/>重试立体模型</button>}
        </> : <>
        <p className="vehicle-stage-hint" role="status">
          {ready ? <><Rotate3D aria-hidden="true"/>拖动旋转 · 双指缩放</> : '正在加载立体车…'}
        </p>
        {ready&&<div className="vehicle-camera-tools" role="group" aria-label="车模视角">
          <div className="vehicle-zoom" role="group" aria-label="车模缩放">
            <button type="button" className="vehicle-text-control" aria-label="缩小车模" disabled={zoom<=MIN_VEHICLE_ZOOM}
              onClick={()=>view.current?.adjustZoom(-VEHICLE_ZOOM_STEP)}><Minus aria-hidden="true"/></button>
            <span className="vehicle-zoom-value" aria-label={`当前缩放 ${zoom}%`}>{zoom}%</span>
            <button type="button" className="vehicle-text-control" aria-label="放大车模" disabled={zoom>=MAX_VEHICLE_ZOOM}
              onClick={()=>view.current?.adjustZoom(VEHICLE_ZOOM_STEP)}><Plus aria-hidden="true"/></button>
          </div>
          <button type="button" className="vehicle-text-control vehicle-reset-view" onClick={()=>view.current?.resetView()}>
            <RotateCcw aria-hidden="true"/>默认视角
          </button>
        </div>}
        </>}
      </div>
    </div>
    <div className="vehicle-console">
      {title&&<h2 className="vehicle-name">{title}</h2>}
      <div className="vehicle-actions">{children}</div>
      {!failed&&(ready
        ? <VehiclePaintControls key={carId} paint={paint} original={original} change={setPaint}/>
        : <div className="vehicle-paint-placeholder" aria-hidden="true"/>)}
    </div>
  </div>;
}
