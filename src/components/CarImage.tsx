import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { RefreshCw } from 'lucide-react';
import { assetUrl, content, getDisplayCar, type Color, type Part } from '../domain/content';

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
  const car = getDisplayCar(carId) || content.cars[0];
  const showcase = presentation === 'showcase';
  const illustration = !hotspots && car.illustrationImage;
  const imageId = illustration || car.game?.side || (showcase ? car.showcaseImage : car.id === 'CAR01' ? content.car.images[color] : car.displayImage || car.image);
  useLayoutEffect(() => { const element=imageElement.current;setStatus(element?.complete ? (element.naturalWidth>0 ? 'ready' : 'error') : 'loading');setRetry(0); }, [imageId]);
  const image = content.assets.find(a => a.id === imageId)!;
  const points = car.game ? car.hotspots : showcase ? car.showcaseHotspots : car.hotspots;
  const showPoints = hotspots && status === 'ready';
  return <div ref={holder} className={`car-image ${status} ${showcase ? 'car-showcase' : car.id === 'CAR01' || car.displayImage ? '' : 'real-photo'} ${showPoints ? 'has-part-hotspots' : ''}`} style={{ aspectRatio: `${image.width}/${image.height}`, '--part-count': points.length } as CSSProperties}>
    {visible && <img ref={imageElement} key={retry} src={assetUrl(imageId) + (retry ? `?retry=${retry}` : '')}
      alt={`${car.name}，${illustration?'按真实车型生成的游戏插画':car.game?.side.startsWith('render-')?'独立立体模型预览':'游戏跑车'}`}
      width={image.width} height={image.height} draggable={false} loading={lazy ? 'lazy' : 'eager'} fetchPriority={priority ? 'high' : 'auto'}
      onLoad={() => setStatus('ready')} onError={() => setStatus('error')} />}
    {status === 'loading' && <span className="image-loading" aria-label="正在准备小车">🛞</span>}
    {status === 'error' && <div className="image-error" role="alert"><span className="sr-only">这张图片还没到，再试一次</span>
      <button aria-label="重新加载小车图片" onClick={event => { event.preventDefault(); event.stopPropagation(); setStatus('loading'); setRetry(r => r + 1); }}><RefreshCw size={20} /></button></div>}
    {showPoints && points.map(part =>
      <button key={part.id} className={`hotspot ${active === part.id ? 'active' : ''}`} aria-label={`${part.zh} ${part.id}`}
        aria-pressed={active === part.id} style={{ left: `${part.x * 100}%`, top: `${part.y * 100}%` }} onClick={() => onPart?.(part.id)}>
        <span className="hotspot-dot" />
      </button>)}
    {showPoints && points.map(part => <span aria-hidden="true" key={'marker-'+part.id} className={`car-part-marker ${active === part.id ? 'active' : ''}`} style={{left:`${part.x*100}%`,top:`${part.y*image.height!/image.width!*100}cqw`}}/>)}
    {status === 'ready' && marker && <span aria-hidden="true" className="observation-marker" style={{left:`${marker.x*100}%`,top:`${marker.y*100}%`}}/>}
  </div>;
}
