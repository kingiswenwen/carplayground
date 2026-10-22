import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { assetUrl, content, type SceneId } from '../domain/content';
export type SceneArtId = SceneId | 'world' | 'driving';
export function sceneArtUrl(scene: SceneArtId) {
  return content.assets.some(a => a.id === `scene-${scene}`) ? assetUrl(`scene-${scene}`) : `${import.meta.env.BASE_URL}media/scenes/${scene}-v3.webp`;
}
const descriptions: Record<SceneArtId, string> = {
  driving: '绿树和车库环绕的封闭运动实验场，平地车道用于比较小模型的运动',
  world: '汽车游乐园全景，环形道路连接汽车展厅、停车小镇、发现工坊和公园旅行',
  showroom: '阳光穿过拱窗，真实汽车停在明亮的展厅展台上',
  parking: '绿树环绕的停车小院，入口、停车地面和洗车棚清晰可见',
  workshop: '有工具柜、窗户和木质实验台的汽车发现工坊',
  travel: '沿着林间小路，经过公园、图书馆和博物馆',
};
export function SceneArt({ scene, priority = false, imageId }: { scene: SceneArtId; priority?: boolean; imageId?: string }) {
  const holder=useRef<HTMLDivElement>(null);
  const [active,setActive]=useState(priority);
  useEffect(()=>{if(active)return;if(!('IntersectionObserver' in window)){setActive(true);return;}const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setActive(true);observer.disconnect();}},{rootMargin:'160px'});if(holder.current)observer.observe(holder.current);return()=>observer.disconnect();},[active]);
  const [status, setStatus] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  return <div ref={holder} className={`scene-art scene-art-${scene} art-${status}`} data-scene-art={scene}>
    {active&&<img key={attempt} src={(imageId ? assetUrl(imageId) : sceneArtUrl(scene)) + (attempt ? `?retry=${attempt}` : '')} alt={imageId ? `${descriptions[scene]}，白色 Revuelto 停在场景中，GPT 生成情境图` : descriptions[scene]} width="1536" height="1024" draggable={false} loading={priority?'eager':'lazy'} fetchPriority={priority ? 'high' : 'auto'} onLoad={() => setStatus('ready')} onError={() => setStatus('error')} />}
    {status === 'loading' && <span className="scene-loading">小世界正在打开…</span>}
    {status === 'error' && <div className="scene-art-error" role="status"><span>风景图片暂时没到，下面的入口仍可以使用。</span><button className="button" onClick={() => { setStatus('loading'); setAttempt(v => v + 1); }}><RefreshCw size={18}/>重新加载风景</button></div>}
  </div>;
}
