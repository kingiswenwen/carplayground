import {content,getActivity,type ActivityId} from './content';

// Invitations connect every activity, but never force navigation or rate a child.
const path:ActivityId[]=['H03','E01','M01','M02','M03','L03','M04','T04','T01','E02','E03','P01','S01','T02','T03','S02','S03','L01','C02','H01','H02','L02','C01','C03','A01','A02'];
export function nextInvitation(id:ActivityId,carId:string){
 const index=path.indexOf(id),next=index>=0?getActivity(path[index+1]):undefined;
 if(!next)return {href:'#/garage',picture:'garage',label:'把今天的小作品带回车库',goal:'把今天的小作品带回车库。'};
 const chosen=next.carIds.includes(carId)?carId:next.carIds[0];
 return {href:`#/play/${next.id}?car=${chosen}`,picture:next.id,label:`接着玩：${next.title}`,goal:next.goal};
}
export function activityPath(){return path.filter(id=>content.activities.some(a=>a.id===id));}
