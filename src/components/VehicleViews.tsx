import {lazy, Suspense, useLayoutEffect, useState, type CSSProperties, type ReactNode} from 'react';
import {getCar} from '../domain/content';
import {vehicleModel} from '../domain/vehicle-models';
import {vehiclePreview} from '../domain/vehicle-preview';
import {CarThumbnail} from './CarImage';
import {CircleDashed, Rotate3D, RotateCcw} from './TownIcons';

const Model = lazy(() => import('../three/VehicleStage').then(module => ({default:module.VehicleStage})));
const paints = [
  {name:'红', color:'#df4145'}, {name:'橙', color:'#f08b2c'}, {name:'黄', color:'#ffc928'},
  {name:'绿', color:'#30c562'}, {name:'蓝', color:'#3798e8'}, {name:'紫', color:'#8657d6'}, {name:'白', color:'#f0efdf'},
];

function PaintControls({paint, original, change}:{paint:string|null; original:string; change:(value:string|null)=>void}) {
  const [draft,setDraft] = useState(paint??original);
  const [error,setError] = useState(false);
  function select(color:string|null){
    change(color);
    setDraft(color??original);
    setError(false);
  }
  return <div className="model-paints" role="group" aria-label="给立体车试颜色">
    <div className="vehicle-paint-header">
      <span className="vehicle-option-label">车身颜色</span>
      <button type="button" className="vehicle-text-control paint-reset"
        aria-pressed={paint===null} onClick={() => select(null)}>还原原色</button>
    </div>
    <div className="vehicle-paint-inputs">
      <label className="vehicle-custom-color">
        <input type="color" value={paint??original} onChange={event => select(event.currentTarget.value)}/>
        <span>自定义颜色</span>
      </label>
      <form className="vehicle-color-code" onSubmit={event=>{
        event.preventDefault();
        const match = draft.trim().match(/^#?([\da-f]{6}|[\da-f]{3})$/i);
        if(!match){setError(true);return;}
        const code=match[1].toLowerCase();
        select('#'+(code.length===3?[...code].map(char=>char+char).join(''):code));
      }}>
        <label>颜色代码 <input value={draft} autoComplete="off" spellCheck={false} aria-invalid={error}
          onChange={event=>{setDraft(event.currentTarget.value);setError(false);}}/></label>
        <button className="vehicle-text-control" type="submit">应用</button>
      </form>
    </div>
    {error&&<p className="vehicle-color-error" role="alert">请输入颜色代码，例如 #26A69A。</p>}
    <div className="vehicle-swatches">
      {paints.map(choice => <button key={choice.color} type="button" aria-label={`立体车试${choice.name}色`}
        aria-pressed={paint===choice.color} style={{'--paint':choice.color} as CSSProperties} onClick={() => select(choice.color)}>
        <span className="vehicle-swatch" aria-hidden="true"/>{choice.name}
      </button>)}
    </div>
  </div>;
}

export function VehicleViews({carId, title, children}:{carId:string; title?:string; children:ReactNode}) {
  const car = getCar(carId)!;
  const spec = vehicleModel(carId);
  const [readyCar,setReadyCar] = useState('');
  const [failedCar,setFailedCar] = useState('');
  const [paint,setPaint] = useState<string|null>(null);
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
      {ready&&!failed&&<PaintControls key={carId} paint={paint} original={original} change={setPaint}/>}
      <div className="vehicle-actions">{children}</div>
    </div>
  </div>;
}
