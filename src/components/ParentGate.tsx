import {useEffect,useRef} from 'react';
import {ArrowRight, Users, X} from './TownIcons';
import '../styles/family.css';

export function ParentGate({close}:{close:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const element=dialog.current;
    element?.showModal();
    return ()=>element?.close();
  },[]);

  async function dismiss(){
    const element=dialog.current;
    if(!element || element.dataset.closing)return;
    element.dataset.closing='true';
    await Promise.allSettled(element.getAnimations().map(animation=>animation.finished));
    if(element.isConnected){
      element.close();
      close();
    }
  }

  return <dialog className="parent-gate" ref={dialog} aria-labelledby="parent-gate-title"
    aria-describedby="parent-gate-description"
    onCancel={e=>{e.preventDefault();void dismiss();}}
    onClick={e=>{
      if(e.target!==e.currentTarget)return;
      const box=e.currentTarget.getBoundingClientRect();
      if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)void dismiss();
    }}>
    <div>
      <button className="round-button gate-close" aria-label="关闭家长入口" onClick={()=>void dismiss()}><X size={20}/></button>
      <Users size={34}/>
      <h2 id="parent-gate-title">请家长来看看</h2>
      <p id="parent-gate-description">这里可以调整声音、查看探索记录和管理备份。</p>
      <a className="button primary" href="#/parent" onClick={close}>我是家长，进入设置 <ArrowRight size={20}/></a>
      <button className="text-button" onClick={()=>void dismiss()}>继续在小镇玩</button>
    </div>
  </dialog>;
}
