import {useState} from 'react';
import {releaseInfo} from '../domain/release';

export function ReleaseStatus(){
 const[checking,setChecking]=useState(false),[latest,setLatest]=useState(''),[message,setMessage]=useState('');
 const check=async()=>{
  setChecking(true);setLatest('');setMessage('正在核对正式站版本…');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   // The active entry lives at the site root, even when an old immutable
   // release URL has been bookmarked or left open in another tab.
   const entry=new URL('/index.html',window.location.href);
   const response=await fetch(entry,{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error('entry unavailable');
   const document=new DOMParser().parseFromString(await response.text(),'text/html');
   const module=document.querySelector<HTMLScriptElement>('script[type="module"][src]');
   const id=module&&new URL(module.getAttribute('src')!,entry).pathname.match(/\/releases\/([^/]+)\/assets\//)?.[1];
   if(!id)throw Error('release unavailable');
   if(id===releaseInfo.appReleaseId)setMessage('当前页面已是正式站最新版本。');
   else{setLatest(id);setMessage('正式站有新版本，重新打开即可使用。本机收藏、作品和记录会保留。');}
  }catch{setMessage('暂时无法核对正式站版本，请检查网络后重试。当前页面仍可继续使用。');}
  finally{clearTimeout(timer);setChecking(false);}
 };
 const openLatest=()=>{const url=new URL('/index.html',window.location.href);url.search=window.location.search;url.hash=window.location.hash;url.searchParams.set('carplayground-update',String(Date.now()));window.location.replace(url.href);};
 return <section className="parent-card full-width release-status" aria-label="网站版本与更新">
  <h2>网站版本与更新</h2>
  <p>当前页面：{releaseInfo.appVersion} · {releaseInfo.contentReleaseId}</p>
  <p className="release-identity">发布编号：{releaseInfo.appReleaseId}</p>
  <button className="button" disabled={checking} onClick={()=>void check()}>{checking?'正在检查…':'检查网站更新'}</button>
  {message&&<p role="status">{message}</p>}
  {latest&&<button className="button primary" onClick={openLatest}>重新打开最新版本</button>}
 </section>;
}
