// One illustrated vocabulary for the DOM and the interactive canvas.
// These are authored vectors: no platform-dependent emoji fonts or remote assets.
const ink = '#365653';
const shapes: Record<string, string> = {
  home: '<path fill="#eed9b0" d="M20 47h60v42H20z"/><path fill="#e98265" d="M8 47 50 13l42 34-8 10-34-27-34 27z"/><path fill="#78b7b3" d="M40 61h21v28H40z"/><path fill="#fff9e7" d="M26 57h10v14H26zm40 0h10v14H66z"/>',
  garage: '<path fill="#f3ca70" d="M13 39h74v51H13z"/><path fill="#e98265" d="m5 39 45-26 45 26-7 10-38-22-38 22z"/><path fill="#567c82" d="M24 54h52v36H24z"/><path stroke="#a0c2c2" d="M28 61h44m-44 9h44m-44 9h44"/>',
  car: '<path fill="#f2c85d" d="m14 48 11-21h39l17 21 10 7v22H9V57z"/><path fill="#79b7c4" d="m31 33-8 17h49L59 33z"/><path stroke="#fff7da" d="M15 60h12m47 0h11"/><circle cx="26" cy="77" r="11" fill="#40555a"/><circle cx="75" cy="77" r="11" fill="#40555a"/><path stroke="#e1e9e6" d="M26 73v8m49-8v8"/>',
  world: '<path fill="#c0d698" d="M9 83Q15 47 41 57q15-35 36-7l16 33z"/><path d="M53 89q-26-17-1-30t2-23" stroke="#fff3cf" stroke-width="14" fill="none"/><path fill="#e97d62" d="M53 13h24l-8 10 8 10H53z"/><path d="M53 10v35"/>',
  tree: '<path stroke="#b18157" stroke-width="12" d="M50 56v34"/><path fill="#87b777" d="M50 10c-16 0-20 13-17 21C9 33 14 64 34 64c7 15 29 12 33-1 24-1 26-29 7-34 0-12-12-22-24-19"/><path stroke="#b9d69c" d="m50 58-12-9m12 2 13-14"/>',
  sun: '<g stroke="#ecc05d" stroke-width="7"><path d="M50 5v10m0 70v10M5 50h10m70 0h10M18 18l8 8m48 48 8 8M18 82l8-8m48-48 8-8"/></g><circle cx="50" cy="50" r="25" fill="#f4cf68" stroke="none"/><path stroke="#fff5c4" d="M35 45q2-11 12-12"/>',
  cloud: '<path fill="#f4faf5" stroke="#c0d6d4" d="M24 70C4 70 5 43 24 42c-2-29 38-35 45-11 28-4 38 34 12 39z"/>',
  rain: '<path fill="#b4cdd4" d="M23 52C5 52 7 28 23 27c2-24 38-27 45-5 27-5 39 30 12 30z"/><g stroke="#68b6d0" stroke-width="7"><path d="m25 67-5 11m32-11-5 11m32-11-5 11m-37 7-4 9m30-9-4 9"/></g>',
  umbrella: '<path stroke="#60849d" stroke-width="7" fill="none" d="M51 28v52q0 15-14 9-7-3-6-9"/><path fill="#e79172" d="M8 52a43 43 0 0 1 85 0q-11-11-21 0-10-11-21 0-12-11-21 0Q20 41 8 52"/><path stroke="#f5c7ac" fill="none" d="M50 11Q31 22 30 51m20-40q20 11 22 40"/>',
  sponge: '<path fill="#edbd58" d="M13 43q0-11 12-11h52q11 0 11 11v30q0 12-12 12H25q-12 0-12-12z"/><path fill="#f6d77b" stroke="none" d="M13 43q0-11 12-11h52q11 0 11 11v17H13z"/><g fill="#d5a44e" stroke="none"><circle cx="28" cy="47" r="5"/><circle cx="53" cy="42" r="4"/><circle cx="71" cy="51" r="5"/><circle cx="40" cy="68" r="4"/></g><g fill="#e6f8fa" stroke="#8dc9d3" stroke-width="2"><circle cx="28" cy="17" r="9"/><circle cx="63" cy="15" r="6"/><circle cx="83" cy="27" r="8"/></g>',
  bubbles: '<g fill="#e5f9fa" stroke="#85c6cf" stroke-width="3"><circle cx="33" cy="52" r="25"/><circle cx="68" cy="27" r="18"/><circle cx="77" cy="70" r="13"/></g><g stroke="#fff" stroke-width="5"><path d="M20 44q2-7 9-8m31-14 4-3m5 47 3-2"/></g>',
  shower: '<path stroke="#7da0a8" stroke-width="11" fill="none" d="m27 17 16 19"/><path fill="#9bbac0" d="m35 38 19-17 24 29-23 19z"/><path stroke="#619eb4" stroke-width="5" d="m22 53-13 8m20 4L14 80m31-9-9 18m24-13-3 17"/>',
  wheel: '<circle cx="50" cy="50" r="36" fill="#43565b"/><circle cx="50" cy="50" r="24" fill="#b2c9cb"/><g stroke="#f5f7ed" stroke-width="5"><path d="M50 27v46M27 50h46M34 34l32 32m-32 0 32-32"/></g><circle cx="50" cy="50" r="9" fill="#e4b85e"/>',
  tool: '<path stroke="#729ea9" stroke-width="18" d="m29 72 42-42"/><path fill="#a6c5c7" d="M53 13q20-10 32 9L67 36l-4-17-13 17c-13-11-7-19 3-23"/><circle cx="26" cy="76" r="14" fill="#a6c5c7"/><circle cx="26" cy="76" r="5" fill="#fff8e7" stroke="none"/>',
  bridge: '<path stroke="#7fc3d3" stroke-width="9" d="M8 79q12-8 24 0t24 0 24 0 14 0"/><path fill="#cda271" d="M10 60q40-60 80 0v12H75Q50 24 25 72H10z"/><path stroke="#ead1a5" stroke-width="5" d="M8 59h84M17 48v-9m16-1V25m17 9V17m17 21V25m16 23v-9"/>',
  plank: '<path fill="#d4a171" d="M9 31h82v38H9z"/><path stroke="#b78151" d="M16 44h68m-68 13h45"/><circle cx="18" cy="37" r="2" stroke="none" fill="#8e694e"/>',
  road: '<path stroke="#9db49f" stroke-width="40" fill="none" d="M8 80h45V20h40"/><path stroke="#69888a" stroke-width="28" fill="none" d="M8 80h45V20h40"/><path stroke="#fff3cf" stroke-width="3" stroke-dasharray="8 8" fill="none" d="M8 80h45V20h40"/>',
  flag: '<path stroke="#8a8873" stroke-width="7" d="M25 12v77"/><path fill="#e58266" d="M28 15h56L70 34l14 19H28z"/><path stroke="#f6cd94" d="M35 23h29"/>',
  bag: '<path fill="#d9966a" d="M22 30q0-13 14-13h28q14 0 14 13v52q0 9-11 9H33q-11 0-11-9z"/><path stroke="#ad7554" fill="none" d="M40 16V9h20v7M22 40h56"/><path fill="#efbb80" d="M31 56h38v22H31z"/><path stroke="#fff0d2" d="M46 38h9"/>',
  coat: '<path fill="#f2ce6d" d="m32 21 18 9 18-9 23 20-14 20-9-8v36H32V53l-9 8L9 41z"/><path fill="#e2b55a" d="m33 20 17 12 18-12-5-11H38z"/><path stroke="#fff3c5" d="M50 32v50M37 63v12m26-12v12"/>',
  cap: '<path fill="#7ca7b2" d="M20 57a32 32 0 0 1 64 0z"/><path fill="#568393" d="M14 57h73q8 1 9 12-40 14-82-1z"/><path stroke="#afd0cf" d="M51 27q-10 11-10 30"/>',
  water: '<path fill="#8fcbd7" d="M29 23h42l-5 66H35z"/><path stroke="#fff4d9" stroke-width="6" d="m58 21 9-14h20"/><path fill="#b9e5e8" d="M32 43h36l-3 35H35z"/>',
  belt: '<path fill="#87a8ad" d="M30 14h39v70H30z"/><path stroke="#395e69" stroke-width="11" d="m24 20 54 57m-56-4h56"/><rect x="39" y="48" width="25" height="23" rx="5" fill="#f0bb66"/>',
  seat: '<path fill="#83a5b0" d="M25 12h43v44H25z"/><path fill="#abc8c8" d="M25 57h58v19H25z"/><path stroke="#66878d" stroke-width="8" d="M30 78v14m47-14v14"/>',
  friend: '<path fill="#7ba6a4" d="M22 89V65q0-18 28-18t28 18v24z"/><circle cx="50" cy="31" r="23" fill="#e8b792"/><path fill="#687c70" d="M27 25q0-23 25-23 24 4 22 23z"/><path stroke="#fff3d6" d="M40 63v18m20-18v18"/><g fill="#365653" stroke="none"><circle cx="42" cy="31" r="2.3"/><circle cx="59" cy="31" r="2.3"/></g><path fill="none" d="M43 40q8 6 15-1"/>',
  heart: '<path fill="#df927c" d="M50 85 14 49C-4 22 28 5 50 29 72 5 104 22 86 49z"/><path stroke="#f6c1a7" d="M20 32q5-9 13-7"/>',
  hand: '<path fill="#f1c880" d="M35 87 15 60q-6-10 4-13 5-1 13 12V18q0-12 10-12 9 0 9 12v28-8q0-11 11-8 6 1 6 12-1-10 9-8 7 2 6 13 10-4 12 8l-3 23-13 15z"/><path stroke="#dca96c" d="M51 46v15m16-14v15m15-13v14"/>',
  star: '<path fill="#f0c866" d="m50 7 13 27 30 5-22 22 5 31-26-15-27 15 6-31L7 39l30-5z"/><path stroke="#fff0b1" d="m43 37 7-14"/>',
  sparkle: '<path fill="#e8bd5c" stroke="none" d="M51 4 62 36l32 14-32 12-11 34-13-34L5 50l33-14z"/><path stroke="#fff2bb" d="M51 30v15"/>',
  lamp: '<path fill="#eac16c" d="m18 72 47-45 18 18-46 45z"/><path fill="#6d9aa8" d="m58 19 13-12 23 25-11 13z"/><path fill="#fff0b2" stroke="none" d="m94 30 6-12-10-18-12 5z"/>',
  palette: '<path fill="#d5a57c" d="M82 66C114 25 62-4 27 15-8 35 5 88 36 89c20 1 5-23 22-26 8-1 15 12 24 3"/><g stroke="none"><circle cx="30" cy="33" r="8" fill="#d77b62"/><circle cx="53" cy="24" r="8" fill="#edc464"/><circle cx="74" cy="40" r="8" fill="#83adb9"/><circle cx="22" cy="57" r="8" fill="#83b48b"/></g>',
  pencil: '<path fill="#e9aa6c" d="m20 79 4-24 43-44 20 20-44 44z"/><path fill="#fae1ac" d="m20 79 4-24 19 20z"/><path stroke="#dd826a" stroke-width="10" d="m67 12 19 19"/><path stroke="#fff0c7" d="m34 58 32-32"/>',
  book: '<path fill="#85aeba" d="M8 20q22-5 42 6 20-11 42-6v63q-24-6-42 4-20-10-42-4z"/><path stroke="#fff3d6" fill="none" d="M50 28v57M18 35l22 7m-22 9 22 7m21-16 21-7m-21 23 21-7"/>',
  flower: '<path stroke="#8aad75" stroke-width="8" d="M50 50v42"/><path fill="#8aad75" d="M47 78Q24 57 24 77q3 12 23 7"/><g fill="#e9a190"><circle cx="50" cy="23" r="15"/><circle cx="72" cy="40" r="15"/><circle cx="64" cy="63" r="15"/><circle cx="36" cy="63" r="15"/><circle cx="28" cy="40" r="15"/></g><circle cx="50" cy="43" r="13" fill="#f2ce72"/>',
  butterfly: '<path fill="#dba07c" d="M45 39C2-14-10 67 39 58 3 98 62 105 50 60c4 45 63 38 25-2 49 9 37-72-5-19z"/><path stroke="#526d62" stroke-width="7" d="M56 30v39"/><path fill="none" d="m54 29-8-14m12 14 9-14"/>',
  dinosaur: '<path fill="#90b387" d="M16 68 6 48l31 6V31C35 6 79 6 82 25v13H62v36l20 10H61L48 72 35 86H15l18-18z"/><circle cx="67" cy="23" r="3" fill="#365653" stroke="none"/><path stroke="#c8dba3" stroke-width="5" d="m40 44 11 7"/>',
  bone: '<path fill="#f2e6cc" d="M29 29C7 1-6 38 18 44l35 31C55 103 96 89 74 69c29-5 13-38-5-20L36 21c-3-26-32-12-7 8"/>',
  bear: '<circle cx="25" cy="25" r="15" fill="#ba9672"/><circle cx="75" cy="25" r="15" fill="#ba9672"/><circle cx="50" cy="53" r="37" fill="#d2ac83"/><ellipse cx="50" cy="66" rx="20" ry="15" fill="#f1d5aa"/><g fill="#365653" stroke="none"><circle cx="36" cy="48" r="4"/><circle cx="65" cy="48" r="4"/><ellipse cx="50" cy="61" rx="7" ry="5"/></g><path fill="none" d="M50 65v9m-9-1q9 7 18 0"/>',
  clock: '<circle cx="50" cy="50" r="37" fill="#f8edd2"/><path stroke="#719a9c" stroke-width="7" fill="none" d="M50 23v29l18 11"/>',
  arrow: '<path stroke="#709a91" stroke-width="12" fill="none" d="M14 50h67M60 27l23 23-23 23"/>',
  light: '<path fill="#f0d477" d="M28 30q0-26 24-26 28 2 23 31-1 15-15 27H41Q25 47 28 30"/><path stroke="#839993" stroke-width="9" d="M41 70h20m-19 12h18"/>',
  smile: '<circle cx="50" cy="50" r="37" fill="#f1cd77"/><g fill="#365653" stroke="none"><circle cx="37" cy="43" r="4"/><circle cx="63" cy="43" r="4"/></g><path fill="none" stroke-width="4" d="M32 59q18 21 36 0"/>',
  worried: '<circle cx="50" cy="50" r="37" fill="#f1cd77"/><g fill="#365653" stroke="none"><circle cx="37" cy="43" r="4"/><circle cx="63" cy="43" r="4"/></g><path fill="none" stroke-width="4" d="M35 72q15-17 30 0"/>',
  leaf: '<path fill="#90b68a" d="M15 76C-2 26 47 7 88 14 90 62 65 100 15 76"/><path fill="none" stroke="#d2dfad" stroke-width="5" d="m19 77 51-45m-37 32-1-19m15 6 22 3"/>',
  moon: '<path fill="#e7d395" d="M70 10C19-2-1 57 35 83c20 15 47 4 55-15C44 83 27 35 70 10"/>',
  ball: '<circle cx="50" cy="50" r="36" fill="#dd9b75"/><path stroke="#f7dbab" stroke-width="7" fill="none" d="M15 50h70M50 15q-23 34 0 70m0-70q23 34 0 70"/>',
  ice: '<path fill="#a5d5de" d="m17 31 31-18 35 18v42L49 91 17 73z"/><path stroke="#e1f4ed" fill="none" d="m17 31 33 19 33-19M50 50v40m-24-51 12-7"/>',
  stop: '<path fill="#d9826d" d="M32 11h36l23 23v34L68 91H32L9 68V34z"/><path stroke="#fff0d7" stroke-width="11" d="M27 51h46"/>',
  red: '<circle cx="50" cy="50" r="35" fill="#df816d"/><path stroke="#f5b9a4" d="M27 39q3-10 14-13"/>',
  blue: '<circle cx="50" cy="50" r="35" fill="#72a7ba"/><path stroke="#b9dae0" d="M27 39q3-10 14-13"/>',
  white: '<circle cx="50" cy="50" r="35" fill="#f8f4df"/>',
  box: '<path fill="#d4af7e" d="m10 26 40-15 40 15v49L50 91 10 75z"/><path fill="none" stroke="#f1d8ae" d="m10 26 40 16 40-16M50 42v49M30 19l40 16v20"/>',
};

const aliases:Record<string,string>={'🏡':'home','🏠':'garage','🏎️':'car','🚗':'car','🚙':'car','🌳':'tree','☀️':'sun','☁️':'cloud','🌧️':'rain','☂️':'umbrella','🧽':'sponge','🫧':'bubbles','🚿':'shower','🛞':'wheel','🔧':'tool','🌉':'bridge','🪵':'plank','🛣️':'road','🏁':'flag','🎒':'bag','🧥':'coat','🧢':'cap','🥤':'water','🪑':'seat','🧑‍🔧':'friend','🤝':'friend','🫂':'friend','💛':'heart','👋':'hand','👆':'hand','🖐️':'hand','⭐':'star','✨':'sparkle','🔦':'lamp','💡':'light','🎨':'palette','🖍️':'pencil','📚':'book','📖':'book','🦋':'butterfly','🌼':'flower','🦕':'dinosaur','🦴':'bone','🐻':'bear','⌛':'clock','➜':'arrow','✓':'sparkle','😊':'smile','😟':'worried','🌒':'moon','⚽':'ball','🧊':'ice','🛑':'stop','🔴':'red','🔵':'blue','💦':'shower','📦':'box','🛒':'box','🎪':'home','🅿️':'garage','💨':'arrow','🌈':'world','👀':'smile'};
export function symbolName(name:string){return aliases[name]||name;}
export function symbolSvg(name:string){
  const body=shapes[symbolName(name)];
  return body?`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="${ink}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`:undefined;
}
const images=new Map<string,HTMLImageElement>();
let loading:Promise<void>|undefined;
export function loadPlaySymbols(){
  return loading??=Promise.all(Object.keys(shapes).map(async name=>{
    const image=new Image();image.src=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(symbolSvg(name)!)}`;
    await image.decode();images.set(name,image);
  })).then(()=>{}).catch(error=>{loading=undefined;throw error;});
}
export function drawPlaySymbol(ctx:CanvasRenderingContext2D,name:string,x:number,y:number,size:number){
  const image=images.get(symbolName(name));
  if(!image)return false;
  ctx.drawImage(image,x-size/2,y-size/2,size,size);return true;
}
