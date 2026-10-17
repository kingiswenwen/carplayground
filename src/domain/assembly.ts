/** All regions sample the SAME licensed, unmodified Ferrari 296 GTB photograph. */
export const assemblyParts = [
 {id:'body',name:'车身',box:'40 35 1140 610',x:73,y:52},
 {id:'door',name:'车门',box:'115 170 195 225',x:18,y:40},
 {id:'front-wheel',name:'前轮',box:'288 267 168 315',x:31,y:63},
 {id:'rear-wheel',name:'后轮',box:'52 151 76 200',x:8,y:37},
] as const;
export type AssemblyPartId = typeof assemblyParts[number]['id'];
export const carSilhouette='M 55 183 Q 58 117 100 105 L 157 109 L 181 105 Q 206 63 278 48 Q 392 28 606 54 Q 697 88 778 157 L 778 139 Q 777 118 801 124 Q 817 127 809 149 L 799 171 L 810 166 Q 924 148 1015 200 Q 1110 244 1142 337 Q 1165 379 1149 429 L 1149 485 Q 1152 536 1108 563 Q 1049 595 923 612 Q 765 635 637 634 Q 525 622 455 573 L 428 566 Q 406 585 374 566 Q 327 542 299 473 L 124 339 Q 93 358 78 325 Q 55 282 55 183 Z';
export const assemblyDoor='M 129 184 L 203 192 L 300 214 L 289 382 L 145 312 L 121 267 Z';
export function placeAssemblyPart(placed: readonly string[], selected: string, target: string): readonly string[] {
 if(selected!==target||placed.includes(selected)||!assemblyParts.some(p=>p.id===selected))return placed;
 return [...placed,selected];
}
