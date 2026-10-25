import {useEffect,useRef} from 'react';
import {ArrowLeft,ArrowRight,Play,X} from 'lucide-react';
import type {TouchBoard} from '../game/TouchBoard';

export function PlayGuide({board,step,onStep,close,portrait}:{board:TouchBoard;step:number;onStep:(step:number)=>void;close:()=>void;portrait:boolean}){
 const previews=useRef<(HTMLCanvasElement|null)[]>([]),panel=useRef<HTMLDialogElement>(null),large=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{const dialog=panel.current;dialog?.showModal();return()=>dialog?.close();},[]);
 useEffect(()=>{
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let frame=0,copied=false;const start=performance.now();
  const draw=(now:number)=>{if(!copied){previews.current.forEach((canvas,i)=>{if(canvas)board.guidePreview(canvas,i);});copied=true;}const phase=reduced?1:Math.min(1,(now-start)/1400);if(large.current)board.guidePreview(large.current,step,phase,true);if(phase<1)frame=requestAnimationFrame(draw);};
  frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);
 },[board,step,portrait]);
 return <dialog className="play-guide" ref={panel} aria-label="图示玩法" onCancel={event=>{event.preventDefault();close();}}>
  <div className="guide-heading"><span className="guide-dots" aria-label={`第${step+1}步，共3步`}>{[0,1,2].map(i=><span key={i} data-current={i===step}/>)}</span><button className="touch-icon" aria-label="收起图示玩法" onClick={close}><X/></button></div>
  <div className="guide-demonstration"><canvas ref={large} aria-label={board.guideDescription(step)}/></div>
  <div className="guide-frames">{[0,1,2].map(i=><button key={i} className="guide-frame" aria-label={`第${i+1}步：${board.guideDescription(i)}`} aria-pressed={step===i} onClick={()=>onStep(i)}><canvas ref={canvas=>{previews.current[i]=canvas;}} aria-hidden="true"/><span className="sr-only">{board.guideDescription(i)}</span></button>)}</div>
  <div className="guide-actions"><button className="touch-icon" aria-label="上一步演示" disabled={step===0} onClick={()=>onStep(step-1)}><ArrowLeft/></button><button className="guide-try touch-icon" aria-label="我来试试，收起演示" onClick={close}><Play fill="currentColor"/></button><button className="touch-icon" aria-label={step===2?'演示看完了，我来试试':'下一步演示'} onClick={()=>step===2?close():onStep(step+1)}><ArrowRight/></button></div>
 </dialog>;
}
