import {Component,type ReactNode} from 'react';
import {RotateCcw} from 'lucide-react';
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
   <span className="sr-only">这一页暂时没能打开，可以重新打开当前页面。本机已保存的记录仍保留。</span>
   <button className="picture-button" aria-label="重新打开当前页面" onClick={()=>window.location.reload()}><RotateCcw/></button>
  </div>;
 }
}
