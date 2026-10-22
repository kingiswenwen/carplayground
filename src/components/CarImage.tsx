import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { RefreshCw } from 'lucide-react';
import { assetUrl, content, getCar, type Color, type Part } from '../domain/content';

type Props = { presentation?: 'object' | 'showcase'; lazy?: boolean; carId?: string; color?: Color; hotspots?: boolean; active?: Part; onPart?: (part: Part) => void; marker?: { x: number; y: number }; priority?: boolean; onReadyChange?: (ready: boolean) => void };
export function CarImage({ presentation = 'object', lazy = false, carId = 'CAR01', color = 'white', hotspots = false, active, onPart, marker, priority, onReadyChange }: Props) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const holder = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!lazy || !!priority);
  useEffect(() => {
    if (visible) return;
    if (!lazy || priority || !('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '160px' });
    if (holder.current) observer.observe(holder.current);
    return () => observer.disconnect();
  }, [lazy, priority, visible]);
  const imageElement = useRef<HTMLImageElement>(null);
  const readyCallback = useRef(onReadyChange); readyCallback.current = onReadyChange;
  useEffect(() => { readyCallback.current?.(status === 'ready'); }, [status, retry]);
  const car = getCar(carId) || content.cars[0];
  const showcase = presentation === 'showcase';
  const imageId = showcase ? car.showcaseImage : car.id === 'CAR01' ? content.car.images[color] : car.displayImage || car.image;
  useLayoutEffect(() => { const element=imageElement.current;setStatus(element?.complete ? (element.naturalWidth>0 ? 'ready' : 'error') : 'loading');setRetry(0); }, [imageId]);
  const image = content.assets.find(a => a.id === imageId)!;
  const points = showcase ? car.showcaseHotspots : car.hotspots;
  const showPoints = hotspots && status === 'ready';
  return <div ref={holder} className={`car-image ${status} ${showcase ? 'car-showcase' : car.id === 'CAR01' || car.displayImage ? '' : 'real-photo'} ${showPoints ? 'has-part-hotspots' : ''}`} style={{ aspectRatio: `${image.width}/${image.height}`, '--part-count': points.length } as CSSProperties}>
    {visible && <img ref={imageElement} key={retry} src={assetUrl(imageId) + (retry ? `?retry=${retry}` : '')}
      alt={showcase ? `${car.name}，${car.color}，GPT 生成的展厅情境图` : car.id !== 'CAR01' ? `${car.name}，${car.color}，${car.displayImage ? '依据实拍制作的展示图' : '实拍照片'}` : `${color === 'white' ? '白色' : color === 'red' ? '红色教学配色' : '蓝色教学配色'}兰博基尼 Revuelto，左前方视角`}
      width={image.width} height={image.height} draggable={false} loading={lazy ? 'lazy' : 'eager'} fetchPriority={priority ? 'high' : 'auto'}
      onLoad={() => setStatus('ready')} onError={() => setStatus('error')} />}
    {status === 'loading' && <span className="image-loading">小车正在驶来…</span>}
    {status === 'error' && <div className="image-error" role="alert"><p>这张图片还没到，再试一次</p>
      <button onClick={event => { event.preventDefault(); event.stopPropagation(); setStatus('loading'); setRetry(r => r + 1); }}><RefreshCw size={20} />重新加载</button></div>}
    {showPoints && points.map(part =>
      <button key={part.id} className={`hotspot ${active === part.id ? 'active' : ''}`} aria-label={`${part.zh} ${part.id}`}
        aria-pressed={active === part.id} style={{ left: `${part.x * 100}%`, top: `${part.y * 100}%` }} onClick={() => onPart?.(part.id)}>
        <span className="hotspot-dot" /><span className="hotspot-label">{part.zh}</span>
      </button>)}
    {showPoints && points.map(part => <span aria-hidden="true" key={'marker-'+part.id} className={`car-part-marker ${active === part.id ? 'active' : ''}`} style={{left:`${part.x*100}%`,top:`${part.y*image.height!/image.width!*100}cqw`}}/>)}
    {status === 'ready' && marker && <span aria-hidden="true" className="observation-marker" style={{left:`${marker.x*100}%`,top:`${marker.y*100}%`}}/>}
  </div>;
}
