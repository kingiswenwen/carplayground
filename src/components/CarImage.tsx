import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { assetUrl, content, getCar, type Color, type Part } from '../domain/content';

type Props = { lazy?: boolean; carId?: string; color?: Color; hotspots?: boolean; active?: Part; onPart?: (part: Part) => void; priority?: boolean; onReadyChange?: (ready: boolean) => void };
export function CarImage({ lazy = false, carId = 'CAR01', color = 'white', hotspots = false, active, onPart, priority, onReadyChange }: Props) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const imageElement = useRef<HTMLImageElement>(null);
  const readyCallback = useRef(onReadyChange); readyCallback.current = onReadyChange;
  useEffect(() => { readyCallback.current?.(status === 'ready'); }, [status, retry]);
  const car = getCar(carId) || content.cars[0];
  const imageId = car.id === 'CAR01' ? content.car.images[color] : car.displayImage || car.image;
  useLayoutEffect(() => { const element=imageElement.current;setStatus(element?.complete ? (element.naturalWidth>0 ? 'ready' : 'error') : 'loading');setRetry(0); }, [imageId]);
  const image = content.assets.find(a => a.id === imageId)!;
  return <div className={`car-image ${status} ${car.id === 'CAR01' || car.displayImage ? '' : 'real-photo'}`} style={{ aspectRatio: `${image.width}/${image.height}` }}>
    <img ref={imageElement} key={retry} src={assetUrl(imageId) + (retry ? `?retry=${retry}` : '')}
      alt={car.id !== 'CAR01' ? `${car.name}，${car.color}，${car.displayImage ? '依据实拍制作的展示图' : '实拍照片'}` : `${color === 'white' ? '白色' : color === 'red' ? '红色教学配色' : '蓝色教学配色'}兰博基尼 Revuelto，左前方视角`}
      width={image.width} height={image.height} draggable={false} loading={lazy ? 'lazy' : 'eager'} fetchPriority={priority ? 'high' : 'auto'}
      onLoad={() => setStatus('ready')} onError={() => setStatus('error')} />
    {status === 'loading' && <span className="image-loading">小车正在驶来…</span>}
    {status === 'error' && <div className="image-error" role="alert"><p>这张图片还没到，再试一次</p>
      <button onClick={event => { event.stopPropagation(); setStatus('loading'); setRetry(r => r + 1); }}><RefreshCw size={20} />重新加载</button></div>}
    {hotspots && car.id === 'CAR01' && status === 'ready' && content.car.hotspots.map(part =>
      <button key={part.id} className={`hotspot ${active === part.id ? 'active' : ''}`} aria-label={`${part.zh} ${part.id}`}
        aria-pressed={active === part.id} style={{ left: `${part.x * 100}%`, top: `${part.y * 100}%` }} onClick={() => onPart?.(part.id)}>
        <span className="hotspot-dot" /><span className="hotspot-label">{part.zh}</span>
      </button>)}
  </div>;
}
