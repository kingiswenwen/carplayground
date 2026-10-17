import { useLayoutEffect, useRef, useState } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import { assetUrl, content, getCar } from '../domain/content';
import { audio } from '../services/audio';
import '../styles/photo-gallery.css';

export function CarPhotoGallery({ carId, interiorOnly = false }: { carId: string; interiorOnly?: boolean }) {
  const car = getCar(carId)!;
  const views = car.views.filter(view => !interiorOnly || view.id === 'interior');
  const [selectedId, setSelectedId] = useState(views[0]?.id);
  const selected = views.find(view => view.id === selectedId) || views[0];
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const [word, setWord] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  const asset = content.assets.find(item => item.id === selected?.image);
  useLayoutEffect(() => {
    const element = image.current;
    setStatus(element?.complete ? (element.naturalWidth ? 'ready' : 'error') : 'loading');
    setWord(false);
  }, [selected?.image, retry]);
  if (!selected || !asset) return null;
  const changeView = (id: string) => { audio.stop(); setSelectedId(id); setRetry(0); };
  return <section className={`car-photo-gallery ${interiorOnly ? 'interior-only' : ''}`} aria-label={interiorOnly ? '看看真实座椅' : `${car.model} 的不同方向`}>
    <div className="photo-gallery-heading"><Camera size={26}/><div>{interiorOnly ? <h3>坐进车里看看</h3> : <h2>换个方向看看</h2>}<p>{interiorOnly ? '点点座椅，听听它的名字。' : '看看车头、车尾，还有另一侧的小发现。'}</p></div></div>
    {!interiorOnly && <div className="photo-view-choices" role="group" aria-label="选择观察方向">{views.map(view => <button key={view.id} className={selected.id === view.id ? 'selected' : ''} aria-pressed={selected.id === view.id} onClick={() => changeView(view.id)}>{view.label}</button>)}</div>}
    <figure>
      <div className="photo-view-frame" style={{ aspectRatio: `${asset.width}/${asset.height}` }}>
        <img ref={image} key={`${selected.image}-${retry}`} src={assetUrl(selected.image) + (retry ? `?retry=${retry}` : '')} alt={`${car.name}，${selected.caption}`} width={asset.width} height={asset.height} loading="lazy" draggable={false} onLoad={() => setStatus('ready')} onError={() => setStatus('error')}/>
        {status === 'loading' && <span className="photo-view-loading" role="status">照片正在准备…</span>}
        {status === 'error' && <div className="photo-view-error" role="alert"><p>这张照片还没到，可以再试一次。</p><button className="button" onClick={() => { setStatus('loading'); setRetry(n => n + 1); }}><RefreshCw size={19}/>重试照片</button></div>}
        {status === 'ready' && selected.hotspots?.map(point => <button key={point.word} className={`photo-word-hotspot ${word ? 'selected' : ''}`} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} aria-label="座椅 seat" aria-pressed={word} onClick={() => { setWord(true); void audio.play('zh-seat', 'seat'); }}><span/>座椅</button>)}
      </div>
      <figcaption>{selected.caption}</figcaption>
    </figure>
    {word && <p className="photo-spoken-word" role="status">座椅 <strong>seat</strong></p>}
    <details className="photo-attribution"><summary>照片出处</summary><p><a href={selected.credit.sourceUrl} target="_blank" rel="noreferrer">{selected.credit.author}</a> · <a href={selected.credit.licenseUrl} target="_blank" rel="noreferrer">{selected.credit.license}</a> · 图片已缩小并转为网页格式，保留完整画面。</p></details>
  </section>;
}
