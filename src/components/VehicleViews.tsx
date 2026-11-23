import {lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode} from 'react';
import {assetUrl, getCar} from '../domain/content';
import {vehicleModel} from '../domain/vehicle-models';
import {vehiclePreview} from '../domain/vehicle-preview';
import {CarThumbnail} from './CarImage';
import {ArrowLeft, ArrowRight, Box, Camera, CircleDashed, Rotate3D} from './TownIcons';

const Model = lazy(() => import('../three/VehicleStage').then(module => ({default:module.VehicleStage})));
const paints = [
  {name:'红', color:'#df4145'}, {name:'橙', color:'#f08b2c'}, {name:'黄', color:'#ffc928'},
  {name:'绿', color:'#30c562'}, {name:'蓝', color:'#3798e8'}, {name:'紫', color:'#8657d6'}, {name:'白', color:'#f0efdf'},
];
const angleLabels: Record<string, string> = {
  'front-left':'左前方', front:'正前方', 'front-right':'右前方',
  right:'右侧', rear:'正后方', left:'左侧', side:'侧面', top:'俯视',
};

export function VehicleViews({carId, title, children}:{carId:string; title?:string; children:ReactNode}) {
  const car = getCar(carId)!;
  const views = car.game?.orbit;
  const modelAvailable = !!vehicleModel(carId);
  const [mode, setMode] = useState<'pictures'|'model'>(modelAvailable?'model':'pictures');
  const [modelReadyCar, setModelReadyCar] = useState('');
  const [modelFailed, setModelFailed] = useState(false);
  const [paint, setPaint] = useState<string|null>(null);
  const [frame, setFrame] = useState(0);
  const [imageStatus, setImageStatus] = useState<'loading'|'ready'|'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const image = useRef<HTMLImageElement>(null);
  const down = useRef<{id:number;x:number;y:number}|null>(null);

  const ordered = views ? [views[0],views[1],views[2],views[5],views[4],views[3]] :
    [{id:'side',image:car.game!.side},{id:'top',image:car.game!.top}];
  const view = ordered[frame % ordered.length];
  const src = assetUrl(view.image);
  const showingModel = mode==='model' && modelAvailable;
  const modelReady = modelReadyCar===carId;
  const angleName = angleLabels[view.id];

  useLayoutEffect(() => {
    setMode(vehicleModel(carId)?'model':'pictures');
    setModelReadyCar('');
    setModelFailed(false);
    setPaint(null);
    setFrame(0);
    setAttempt(0);
    down.current=null;
  }, [carId]);
  useLayoutEffect(() => {
    const current = image.current;
    setImageStatus(current?.complete ? (current.naturalWidth?'ready':'error') : 'loading');
  }, [src, attempt, showingModel]);
  useEffect(() => {
    if(showingModel || !views)return;
    for(const index of [(frame+1)%6,(frame+5)%6]){
      const preload = new Image();
      preload.src = assetUrl(ordered[index].image);
    }
  }, [carId, frame, showingModel]);

  function changeMode(next:'pictures'|'model') {
    if(mode===next)return;
    setModelReadyCar('');
    setModelFailed(false);
    setMode(next);
  }
  function modelUnavailable() {
    setModelFailed(true);
    setModelReadyCar('');
    setMode('pictures');
  }
  function turn(step:number) {
    setFrame(index => (index+step+ordered.length)%ordered.length);
    setAttempt(0);
  }

  return <div className="vehicle-views" data-mode={showingModel?'model':'pictures'} data-view={view.id}
    data-car={carId} data-ready={showingModel?modelReady:imageStatus==='ready'}>
    <div className="vehicle-exhibit">
      <div className="vehicle-frame">
        {showingModel ? <Suspense fallback={<div className="vehicle-stage" data-ready="false">
          <CarThumbnail className="vehicle-poster" imageId={vehiclePreview(carId)||car.game!.side} priority/>
          <span className="stage-loading" aria-hidden="true"><CircleDashed/></span>
        </div>}>
          <Model carId={carId} paint={paint} onUnavailable={modelUnavailable} onReady={() => setModelReadyCar(carId)}/>
        </Suspense> : <div className="vehicle-turnaround" role="application" tabIndex={0}
          aria-label={views?'跑车多角度外观，左右拨动看前后和两侧':'跑车侧视与俯视外观，左右拨动切换'}
          onKeyDown={event => {
            if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
            event.preventDefault();
            turn(event.key==='ArrowLeft'?-1:1);
          }}
          onPointerDown={event => {
            if(down.current)return;
            down.current={id:event.pointerId,x:event.clientX,y:event.clientY};
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={event => {
            const start=down.current;
            if(!start||start.id!==event.pointerId)return;
            down.current=null;
            const dx=event.clientX-start.x, dy=event.clientY-start.y;
            if(Math.abs(dx)>35&&Math.abs(dx)>Math.abs(dy))turn(dx<0?1:-1);
            if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {down.current=null;}} onLostPointerCapture={() => {down.current=null;}}>
          <img key={`${src}:${attempt}`} ref={image} className="vehicle-angle"
            src={src+(attempt?`?retry=${attempt}`:'')} alt={`${car.name}，${angleName}`} draggable={false}
            data-ready={imageStatus==='ready'} onLoad={() => setImageStatus('ready')} onError={() => setImageStatus('error')}/>
        </div>}
      </div>
      <div className="vehicle-view-footer">
        {showingModel ? <p className="vehicle-stage-hint" role="status">
          {modelReady ? <><Rotate3D aria-hidden="true"/>拖动车身，转着看</> : '正在加载立体车…'}
        </p> : imageStatus==='error' ? <div className="vehicle-image-error" role="status">
          <span>外观图加载失败</span>
          <button type="button" className="vehicle-text-control" aria-label="再试一次，重新加载外观图"
            onClick={() => {setImageStatus('loading');setAttempt(value => value+1);}}>再试一次</button>
        </div> : <div className="vehicle-angle-controls" aria-label="浏览车型角度">
          <button type="button" className="vehicle-text-control" onClick={() => turn(-1)}><ArrowLeft aria-hidden="true"/>上一角度</button>
          <span role="status">{imageStatus==='ready'?angleName:'加载外观图…'}</span>
          <button type="button" className="vehicle-text-control" onClick={() => turn(1)}>下一角度<ArrowRight aria-hidden="true"/></button>
        </div>}
      </div>
    </div>
    <div className="vehicle-console">
      {title&&<h2 className="vehicle-name">{title}</h2>}
      <div className="vehicle-options">
        {modelAvailable&&<div className="vehicle-option">
          <span className="vehicle-option-label">查看方式</span>
          <div className="vehicle-modes" role="group" aria-label="查看方式">
            <button type="button" aria-pressed={showingModel} onClick={() => changeMode('model')}>
              <Box aria-hidden="true"/>立体模型
            </button>
            <button type="button" aria-pressed={!showingModel} onClick={() => changeMode('pictures')}>
              <Camera aria-hidden="true"/>外观图
            </button>
          </div>
        </div>}
        {showingModel&&modelReady ? <div className="model-paints" role="group" aria-label="给立体车试颜色">
          <div className="vehicle-paint-header">
            <span className="vehicle-option-label">车身颜色</span>
            <button type="button" className="vehicle-text-control paint-reset"
              aria-pressed={paint===null} onClick={() => setPaint(null)}>还原原色</button>
          </div>
          <div className="vehicle-swatches">
            {paints.map(choice => <button key={choice.color} type="button" aria-label={`立体车试${choice.name}色`}
              aria-pressed={paint===choice.color} style={{'--paint':choice.color} as CSSProperties} onClick={() => setPaint(choice.color)}>
              <span className="vehicle-swatch" aria-hidden="true"/>{choice.name}
            </button>)}
          </div>
        </div> : !showingModel&&<p className="vehicle-mode-note" role="status">
          {modelFailed ? '立体模型暂时打不开，已切到外观图。' : modelAvailable ? '切到立体模型可以试车身颜色。' : '这辆车目前提供外观图。'}
        </p>}
      </div>
      <div className="vehicle-actions">{children}</div>
    </div>
  </div>;
}
