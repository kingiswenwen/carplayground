import {useState} from 'react';
import {symbolImage,symbolSvg} from '../visual/play-symbols';

export function PlaySymbol({name,className=''}:{name:string;className?:string}){
  const [failed,setFailed]=useState<string>();
  const image=symbolImage(name);
  if(image&&failed!==image)return <span className={`play-symbol ${className}`} aria-hidden="true"><img src={image} alt="" draggable={false} onError={()=>setFailed(image)}/></span>;
  // Only locally authored constant SVG paths reach the fallback markup.
  const svg=symbolSvg(name)||symbolSvg('star')!;
  return <span className={`play-symbol ${className}`} aria-hidden="true" dangerouslySetInnerHTML={{__html:svg}}/>;
}
