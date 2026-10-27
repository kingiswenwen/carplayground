/** A stalled request must have the same recovery path as an HTTP failure. */
export function loadImage(src:string,signal:AbortSignal,timeoutMs=12000):Promise<HTMLImageElement>{
 return new Promise((resolve,reject)=>{
  const image=new Image();
  const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};
  const fail=(reason:Error)=>{cleanup();image.src='';reject(reason);};
  const abort=()=>fail(new Error('Image loading cancelled'));
  const timer=setTimeout(()=>fail(new Error('Image loading timed out')),timeoutMs);
  signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted){abort();return;}
  image.src=src;
  void image.decode().then(()=>{cleanup();resolve(image);},()=>fail(new Error('Image unavailable')));
 });
}
