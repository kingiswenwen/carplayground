import {useRef,type RefObject} from 'react';
import {Search,X} from './TownIcons';

type Props={
  label:string;
  clearLabel:string;
  placeholder:string;
  value:string;
  change:(value:string)=>void;
  className:string;
  inputRef?:RefObject<HTMLInputElement|null>;
};

export function TownSearch({label,clearLabel,placeholder,value,change,className,inputRef}:Props){
  const localRef=useRef<HTMLInputElement>(null);
  const input=inputRef||localRef;
  return <div className={`town-search ${className}`}>
    <Search aria-hidden="true"/>
    <input ref={input} type="search" aria-label={label} placeholder={placeholder}
      value={value} onChange={event=>change(event.target.value)}/>
    {value&&<button type="button" className="town-search-clear" aria-label={clearLabel} onClick={()=>{
      change('');
      input.current?.focus();
    }}><X size={18}/></button>}
  </div>;
}
