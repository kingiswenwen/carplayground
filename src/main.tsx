import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { releaseInfo } from './domain/release';
import {assetUrl} from './domain/content';
import './styles.css';
import './styles/immersive.css';
import './styles/motion-assembly.css';
import './styles/showcase.css';
import './styles/touch-play.css';
import './styles/child-world.css';
import './styles/play-world.css';
import './styles/play-help.css';
class Recovery extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <main className="empty-state"><span aria-hidden="true">🛞</span><p className="sr-only">小车休息一下，可以刷新重试。</p><button className="picture-button" aria-label="重新打开展厅" onClick={() => { const next = new URL(window.location.href); next.searchParams.set('carplayground-retry', String(Date.now())); next.hash = '/cars'; window.location.replace(next.href); }}>↻</button></main> : this.props.children;
  }
}
// Fonts share the manifest's versioned/CDN media base, just like car art.
// Register synchronously so document.fonts.ready also covers screenshot loading.
if(typeof FontFace!=='undefined'&&document.fonts){
  for(const [id,weight]of [['town-font-regular','400 600'],['town-font-bold','700 900']]){
    const face=new FontFace('Town Sans',`url(${JSON.stringify(assetUrl(id))})`,{weight,display:'swap'});
    document.fonts.add(face);void face.load().catch(()=>{});
  }
}
document.documentElement.dataset.appReleaseId = releaseInfo.appReleaseId;
document.documentElement.dataset.contentReleaseId = releaseInfo.contentReleaseId;
createRoot(document.getElementById('root')!).render(<StrictMode><Recovery><App /></Recovery></StrictMode>);

import './styles/catalogue-select.css';

import './styles/town.css';
