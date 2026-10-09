import { getDatabase } from "@netlify/database";
import type { Config } from "@netlify/functions";
import crypto from "node:crypto";
import * as XLSX from "xlsx";

export default async (req: Request) => {
  try {
    if (req.method !== "GET") return Response.json({error:"허용되지 않는 요청입니다."},{status:405});
    const secret = Netlify.env.get("ADMIN_PASSWORD") || "";
    const expected = secret ? crypto.createHmac("sha256",secret).update("wonderland-admin").digest("hex") : "";
    const supplied = (req.headers.get("authorization") || "").replace(/^Bearer /,"");
    if (!secret || supplied.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))) {
      return Response.json({error:"관리자 로그인이 필요합니다."},{status:401});
    }
    const id = new URL(req.url).pathname.split("/").filter(Boolean).pop() || "";
    if (!/^[a-zA-Z0-9-]{1,40}$/.test(id)) return Response.json({error:"잘못된 설문 번호입니다."},{status:400});
    const db = getDatabase();
    const [poll]:any[] = await db.sql`SELECT id,title,survey_type FROM polls WHERE id=${id}`;
    if (!poll) return Response.json({error:"설문을 찾을 수 없습니다."},{status:404});
    const responses:any[] = await db.sql`
      SELECT r.id,r.class_name,r.respondent_name,r.extra_data,r.created_at,
             COALESCE(string_agg(o.label, ', ' ORDER BY o.position), '') AS answer
      FROM responses r
      LEFT JOIN response_answers ra ON ra.response_id=r.id
      LEFT JOIN poll_options o ON o.id=ra.option_id
      WHERE r.poll_id=${id}
      GROUP BY r.id,r.class_name,r.respondent_name,r.extra_data,r.created_at
      ORDER BY r.created_at ASC
    `;
    const rows=responses.map((r:any)=>{
      const extra=typeof r.extra_data==="string"?JSON.parse(r.extra_data||"{}"):(r.extra_data||{});
      return {
        "반":r.class_name||"",
        "원아 이름":r.respondent_name||"",
        "총 참가인원":extra.totalAttendees??"",
        "조부모 참석 여부":extra.grandparentsAttending||"",
        "조부모 인원":extra.grandparentCount??"",
        "선택 응답":r.answer||"",
        "응답시간":r.created_at?new Date(r.created_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"}):""
      };
    });
    const headers=["반","원아 이름","총 참가인원","조부모 참석 여부","조부모 인원","선택 응답","응답시간"];
    const sheet=XLSX.utils.json_to_sheet(rows,{header:headers});
    if(!rows.length) XLSX.utils.sheet_add_aoa(sheet,[headers],{origin:"A1"});
    sheet["!cols"]=[{wch:18},{wch:18},{wch:16},{wch:20},{wch:16},{wch:34},{wch:24}];
    const book=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book,sheet,"설문 응답");
    const bytes=XLSX.write(book,{bookType:"xlsx",type:"buffer"});
    return new Response(bytes,{headers:{
      "content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition":`attachment; filename="wonderland-survey-${id}.xlsx"`,
      "cache-control":"no-store"
    }});
  } catch(e) {
    console.error("Survey Excel export failed",e);
    return Response.json({error:"Excel 파일 생성에 실패했습니다."},{status:500});
  }
};
export const config:Config={path:"/survey-export/:id",method:"GET"};
