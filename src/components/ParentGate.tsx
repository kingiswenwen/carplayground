import { useEffect, useRef } from 'react';
import { ArrowRight, Users, X } from 'lucide-react';
export function ParentGate({close}:{close:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const d=dialog.current;d?.showModal();return()=>d?.close();},[]);
 return <dialog className="parent-gate" ref={dialog} onCancel={close} onClick={e=>{if(e.target===e.currentTarget)close();}}><div><button className="round-button gate-close" aria-label="关闭家长入口" onClick={close}><X size={20}/></button><Users size={34}/><h2>请家长来看看</h2><p>这里可以调整声音、查看本机作品和管理备份。</p><a className="button primary" href="#/parent" onClick={close}>我是家长，进入设置 <ArrowRight size={20}/></a><button className="text-button" onClick={close}>继续在乐园玩</button></div></dialog>;
}
