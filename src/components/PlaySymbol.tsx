import {useState,type ComponentPropsWithoutRef} from 'react';
import {symbolImage,symbolPreview} from '../visual/play-symbols';

export function PlaySymbol({name,className='',...props}:{name:string}&Omit<ComponentPropsWithoutRef<'span'>,'children'>){
  const [failed,setFailed]=useState<string>();
  const image=symbolImage(name);
  return <span {...props} className={`play-symbol ${className}`} aria-hidden={props['aria-label']?undefined:true}>
    <img src={image&&failed!==image?image:symbolPreview(name)} alt="" draggable={false} onError={()=>setFailed(image)}/>
  </span>;
}
