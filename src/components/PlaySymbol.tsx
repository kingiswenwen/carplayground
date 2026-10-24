import {symbolSvg} from '../visual/play-symbols';

export function PlaySymbol({name,className=''}:{name:string;className?:string}){
  // Only locally authored constant SVG paths reach this markup.
  const svg=symbolSvg(name)||symbolSvg('star')!;
  return <span className={`play-symbol ${className}`} aria-hidden="true" dangerouslySetInnerHTML={{__html:svg}}/>;
}
