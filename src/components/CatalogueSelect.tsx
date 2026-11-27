import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Check,ChevronDown} from './TownIcons';
import {TownSearch} from './TownSearch';

type Option={value:string;label:string;keywords?:string};
export function CatalogueSelect({label,name,value,options,onChange}:{label:string;name:string;value:string;options:Option[];onChange:(value:string)=>void}){
 const id=useId(),trigger=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null),search=useRef<HTMLInputElement>(null);
 const focusSearch=useRef(true);
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');
 const [position,setPosition]=useState<{left:number;width:number;top?:number;bottom?:number;maxHeight:number}>();
 const selected=options.find(option=>option.value===value)||options[0];
 const filtered=options.filter(option=>(option.label+' '+option.value+' '+(option.keywords||'')).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const close=(focus=false)=>{setOpen(false);if(focus)trigger.current?.focus();};
 const choose=(option:Option)=>{onChange(option.value);close(true);};
 useLayoutEffect(()=>{
  if(!open)return;
  const place=(event?:Event)=>{
   if(event?.target instanceof Node&&popup.current?.contains(event.target))return;
   const rect=trigger.current!.getBoundingClientRect(),viewport=window.visualViewport,visibleTop=viewport?.offsetTop||0,visibleBottom=visibleTop+(viewport?.height||innerHeight);
   const width=Math.min(Math.max(rect.width,260),innerWidth-32),below=visibleBottom-rect.bottom-16,above=rect.top-visibleTop-16,down=below>=220||below>=above;
   const maxHeight=Math.max(100,Math.min(400,visibleBottom-visibleTop-32,down?below:above));
   const anchor=down
     ? {top:Math.max(visibleTop+16,Math.min(rect.bottom+8,visibleBottom-maxHeight-16))}
     : {bottom:innerHeight-Math.min(visibleBottom-16,Math.max(rect.top-8,visibleTop+maxHeight+16))};
   setPosition({left:Math.max(16,Math.min(rect.left,innerWidth-width-16)),width,maxHeight,...anchor});
  };
  place();
  if(focusSearch.current)search.current?.focus({preventScroll:true});
  else popup.current?.querySelector<HTMLButtonElement>('[aria-selected=true]')?.focus({preventScroll:true});
  window.addEventListener('resize',place);window.addEventListener('scroll',place,true);window.visualViewport?.addEventListener('resize',place);window.visualViewport?.addEventListener('scroll',place);
  return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);window.visualViewport?.removeEventListener('resize',place);window.visualViewport?.removeEventListener('scroll',place);};
 },[open]);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(!popup.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))close();};
  document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
 },[open]);
 const move=(direction:number)=>{
  const buttons=Array.from(popup.current?.querySelectorAll<HTMLButtonElement>('[role=option]')||[]);if(!buttons.length)return;
  const current=buttons.indexOf(document.activeElement as HTMLButtonElement);
  buttons[current<0?(direction>0?0:buttons.length-1):(current+direction+buttons.length)%buttons.length].focus();
 };
 return <div className="catalogue-select">
  <span id={id+'-label'}>{label}</span>
  <button ref={trigger} className="catalogue-select-trigger" role="combobox" type="button" aria-label={name} aria-describedby={id+'-value'} aria-expanded={open} aria-haspopup="listbox" aria-controls={open?id+'-options':undefined}
   onClick={event=>{
    focusSearch.current=event.detail===0||!window.matchMedia('(pointer: coarse)').matches;
    setQuery('');setOpen(!open);
   }} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();focusSearch.current=true;setQuery('');setOpen(true);}if(event.key==='Escape')close();}}>
   <span id={id+'-value'}>{selected.label}</span><ChevronDown size={18} aria-hidden="true"/>
  </button>
  {(open||position)&&createPortal(<div ref={popup} className="catalogue-select-popup" data-side={position?.bottom===undefined?'below':'above'} hidden={!open} inert={!open} aria-hidden={!open} style={position} onKeyDown={event=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();move(event.key==='ArrowDown'?1:-1);}
   if(event.key==='Tab'){
    if(query&&((event.target===search.current&&!event.shiftKey)||(event.target instanceof HTMLElement&&event.target.classList.contains('town-search-clear')&&event.shiftKey)))return;
    close(true);
   }
  }}>
   <TownSearch className="catalogue-option-search" label={`搜索${label}`} clearLabel={`清空${label}搜索`} placeholder={`搜索${label}`}
     value={query} change={setQuery} inputRef={search}/>
   <div id={id+'-options'} role="listbox" aria-labelledby={id+'-label'} className="catalogue-options">
    {filtered.map(option=><button key={option.value} type="button" role="option" aria-selected={option.value===value} onClick={()=>choose(option)}><span>{option.label}</span>{option.value===value&&<Check size={18} aria-hidden="true"/>}</button>)}
   </div>
   {!filtered.length&&<p className="catalogue-no-options" role="status">没有找到，可以换个名字试试。</p>}
  </div>,document.body)}
 </div>;
}
