import { getDatabase } from "@netlify/database";
import type { Config } from "@netlify/functions";
import crypto from "node:crypto";

const defaults=["Princeton","Harvard","Stanford","Cornell","Dartmouth","Columbia","MIT"];
export default async(req:Request)=>{
 try{
  if(req.method!=="GET"&&req.method!=="PUT")return Response.json({error:"Method not allowed"},{status:405});
  if(req.method==="PUT"){
   const secret=Netlify.env.get("ADMIN_PASSWORD")||"";
   const expected=secret?crypto.createHmac("sha256",secret).update("wonderland-admin").digest("hex"):"";
   const supplied=(req.headers.get("authorization")||"").replace(/^Bearer /,"");
   if(!secret||supplied.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return Response.json({error:"관리자 로그인이 필요합니다."},{status:401});
   const data:any=await req.json();
   if(!Array.isArray(data.classes))return Response.json({error:"반 목록을 입력해 주세요."},{status:400});
   const classes=data.classes.map((v:any)=>typeof v==="string"?v.trim():"");
   if(!classes.length||classes.length>40||classes.some((v:string)=>!v||v.length>60)||new Set(classes.map((v:string)=>v.toLowerCase())).size!==classes.length)return Response.json({error:"반 이름을 확인해 주세요. 중복 없이 1~40개 입력할 수 있습니다."},{status:400});
   const db=getDatabase();
   await db.sql`INSERT INTO survey_settings(key,value) VALUES('classes',${JSON.stringify(classes)}::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`;
   return Response.json({classes});
  }
  const db=getDatabase();
  const [row]:any[]=await db.sql`SELECT value FROM survey_settings WHERE key='classes'`;
  const classes=row?.value?(typeof row.value==="string"?JSON.parse(row.value):row.value):defaults;
  return Response.json({classes},{headers:{"cache-control":"no-store"}});
 }catch(e){console.error("Class settings error",e);return Response.json({error:"반 목록을 불러오거나 저장하지 못했습니다."},{status:500})}
};
export const config:Config={path:"/class-settings"};
