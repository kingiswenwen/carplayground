import {Component,type ReactNode} from 'react';
import {RotateCcw} from './TownIcons';
import {PlaySymbol} from './PlaySymbol';

// Lazy imports cache rejected requests. Reloading keeps the route and local
// records while asking the browser for a fresh module graph.
export class PageRecovery extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return{failed:true};}
 render(){
  if(!this.state.failed)return this.props.children;
  return <div className="empty-state pictorial-error page-recovery" role="alert">
   <PlaySymbol name="car"/>
   <span>这一页暂时没能打开。点下方箭头重试，本机记录仍保留。</span>
   <button className="picture-button" aria-label="重新打开当前页面" onClick={()=>window.location.reload()}><RotateCcw/></button>
  </div>;
 }
}
