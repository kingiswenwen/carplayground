import {useId, useRef, useState, type CSSProperties} from 'react';
import {paintColor, paintFinishes, paintHex, type PaintColor, type ShowroomPaint} from '../domain/showroom-paint';
import {ChevronDown} from './TownIcons';

const presets = [
  {name:'红', color:'#df4145'}, {name:'橙', color:'#f08b2c'}, {name:'黄', color:'#ffc928'},
  {name:'绿', color:'#30c562'}, {name:'蓝', color:'#3798e8'}, {name:'紫', color:'#8657d6'}, {name:'白', color:'#f0efdf'},
];
const ranges = [
  {axis:'hue', label:'色相', max:360, unit:'°'},
  {axis:'saturation', label:'饱和度', max:100, unit:'%'},
  {axis:'brightness', label:'明度', max:100, unit:'%'},
] as const;
const spectrum='linear-gradient(90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)';

export function VehiclePaintControls({paint, original, change}:{
  paint:ShowroomPaint|null; original:string; change:(value:ShowroomPaint|null)=>void;
}) {
  const id=useId();
  const codeToggle=useRef<HTMLButtonElement>(null);
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState(original);
  const [error,setError]=useState(false);
  const color=paint??paintColor(original);
  const hex=paintHex(color);
  const finish=paint?.finish??'gloss';
  const tracks={
    hue:spectrum,
    saturation:`linear-gradient(90deg, ${paintHex({...color,saturation:0})}, ${paintHex({...color,saturation:100})})`,
    brightness:`linear-gradient(90deg, #000, ${paintHex({...color,brightness:100})})`,
  };
  function setColor(next:PaintColor){change({...next,finish});}
  function closeCode(){setEditing(false);setError(false);}

  return <div className="model-paints" role="group" aria-label="给立体车试颜色">
    <div className="vehicle-paint-header">
      <h3 className="vehicle-option-label">车漆调色</h3>
      <button ref={codeToggle} type="button" className="vehicle-paint-value" aria-label="输入颜色代码" aria-expanded={editing} aria-controls={editing?id+'-code':undefined}
        onClick={()=>{if(editing)closeCode();else{setDraft(hex);setEditing(true);}}}>
        <span aria-hidden="true" className="vehicle-swatch" style={{background:hex}}/>{hex.toUpperCase()}<ChevronDown aria-hidden="true"/>
      </button>
      <button type="button" className="vehicle-text-control paint-reset" aria-pressed={paint===null}
        onClick={()=>{change(null);closeCode();}}>还原原色</button>
    </div>
    {editing&&<form className="vehicle-color-code" id={id+'-code'} onSubmit={event=>{
      event.preventDefault();
      const match=draft.trim().match(/^#?([\da-f]{6}|[\da-f]{3})$/i);
      if(!match){setError(true);return;}
      const code=match[1].toLowerCase();
      setColor(paintColor('#'+(code.length===3?[...code].map(char=>char+char).join(''):code)));
      closeCode();
      codeToggle.current?.focus();
    }}>
      <label>颜色代码 <input value={draft} autoComplete="off" spellCheck={false} aria-invalid={error}
        onChange={event=>{setDraft(event.currentTarget.value);setError(false);}}/></label>
      <button className="vehicle-text-control" type="submit">应用</button>
      {error&&<p className="vehicle-color-error" role="alert">请输入颜色代码，例如 #26A69A。</p>}
    </form>}
    <div className="vehicle-paint-sliders">
      {ranges.map(({axis,label,max,unit})=>{
        const value=Math.round(color[axis]);
        return <label key={axis} className="vehicle-paint-slider">
          <span>{label}</span>
          <input type="range" aria-label={label} aria-valuetext={value+unit} min={0} max={max} value={value}
            style={{'--paint-track':tracks[axis]} as CSSProperties}
            onChange={event=>setColor({...color,[axis]:event.currentTarget.valueAsNumber})}/>
          <span className="vehicle-paint-number" aria-hidden="true">{value}{unit}</span>
        </label>;
      })}
    </div>
    <div className="vehicle-paint-finishes" role="radiogroup" aria-label="漆面">
      {paintFinishes.map(option=><label key={option.id} className="vehicle-paint-finish" data-finish={option.id}
        style={{'--paint':hex} as CSSProperties}>
        <input type="radio" name={id+'-finish'} checked={paint?.finish===option.id}
          onChange={()=>change({...color,finish:option.id})}/>
        <span className="vehicle-finish-sample" aria-hidden="true"/>{option.label}
      </label>)}
    </div>
    <div className="vehicle-swatches" role="group" aria-label="常用颜色">
      {presets.map(choice=><button key={choice.color} type="button" aria-label={`立体车试${choice.name}色`}
        aria-pressed={paint!==null&&hex===choice.color} style={{'--paint':choice.color} as CSSProperties}
        onClick={()=>{setColor(paintColor(choice.color));closeCode();}}>
        <span className="vehicle-swatch" aria-hidden="true"/>
      </button>)}
    </div>
  </div>;
}
