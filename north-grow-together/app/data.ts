export const branches = Array.from({length:10},(_,i)=>`第 ${i+1} 分會`);
export const industries = ['製造與包裝','科技與資訊','設計與行銷','餐飲與食品','工程與建築','專業服務','零售與電商','健康與生活','其他'];
export const cities = ['臺北市','新北市','基隆市','桃園市','新竹市','新竹縣','宜蘭縣','花蓮縣','金門縣','其他'];
export type Profile = {name:string; title:string; branch:string; company:string; industry:string; city:string; area:string; services:string; offer:string; need:string; phone:string; line:string; email:string; website:string; photo:string; pictures:string[]; showPhone:boolean; showLine:boolean; showEmail:boolean};
export type Member = {id:string; branch:string; profile:Profile; status:string; expires:string|null; updated:string;hasPhoto?:number};
export const emptyProfile:Profile={name:'',title:'會員',branch:branches[0],company:'',industry:industries[0],city:cities[0],area:'',services:'',offer:'',need:'',phone:'',line:'',email:'',website:'',photo:'',pictures:[],showPhone:false,showLine:false,showEmail:false};
