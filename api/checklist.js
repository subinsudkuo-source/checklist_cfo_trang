import { createHmac, timingSafeEqual } from 'node:crypto';
const equal = (a,b) => { const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||'')); return x.length===y.length && timingSafeEqual(x,y); };
function sign(value) { return createHmac('sha256',process.env.SESSION_SECRET).update(value).digest('base64url'); }
function authorized(req) {
  const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('cfo_session='));
  if(!cookie || !process.env.SESSION_SECRET) return false;
  const [expiry,mac]=cookie.slice(12).split('.');
  return Number(expiry)>Date.now() && equal(mac,sign(expiry));
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Method not allowed'});
  const origin=req.headers.origin;
  if(origin && origin!==`https://${req.headers.host}` && origin!==`http://${req.headers.host}`) return res.status(403).json({ok:false,error:'Invalid origin'});
  let body; try { body=typeof req.body==='string'?JSON.parse(req.body):req.body; } catch { return res.status(400).json({ok:false,error:'Invalid JSON'}); }
  if(!body || typeof body!=='object') return res.status(400).json({ok:false,error:'Invalid request'});
  const {action}=body;
  if(action==='health') return res.status(200).json({ok:true,configured:!!(process.env.APPS_SCRIPT_URL&&process.env.APPS_SCRIPT_SECRET&&process.env.ACCESS_CODE&&process.env.SESSION_SECRET)});
  if(!process.env.ACCESS_CODE || !process.env.SESSION_SECRET) return res.status(503).json({ok:false,error:'ระบบกำลังรอตั้งค่าการเชื่อมต่อฐานข้อมูล'});
  if(action==='login') {
    if(!equal(body.code,process.env.ACCESS_CODE)) return res.status(401).json({ok:false,error:'รหัสเข้าใช้งานไม่ถูกต้อง'});
    const expiry=String(Date.now()+8*3600*1000);
    res.setHeader('Set-Cookie',`cfo_session=${expiry}.${sign(expiry)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
    return res.status(200).json({ok:true});
  }
  if(action==='logout') { res.setHeader('Set-Cookie','cfo_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'); return res.status(200).json({ok:true}); }
  if(!authorized(req)) return res.status(401).json({ok:false,error:'กรุณาเข้าสู่ระบบ'});
  if(!['load','save','upload'].includes(action)) return res.status(400).json({ok:false,error:'Unknown action'});
  if(!process.env.APPS_SCRIPT_URL || !process.env.APPS_SCRIPT_SECRET) return res.status(503).json({ok:false,error:'ยังไม่ได้เชื่อมต่อ Apps Script'});
  if(JSON.stringify(body).length>4300000) return res.status(413).json({ok:false,error:'ไฟล์มีขนาดใหญ่เกินกำหนด'});
  // Item 34 is a section heading; only 34.1–34.3 are assessable.
  if(action==='save' && body.state?.items?.['34']) {
    body={...body,state:{...body.state,items:{...body.state.items,
      '34':{...body.state.items['34'],result:'',files:[],ssjStatus:'',ssjComment:''}
    }}};
  }
  try {
    const response=await fetch(process.env.APPS_SCRIPT_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,secret:process.env.APPS_SCRIPT_SECRET}),redirect:'follow',signal:AbortSignal.timeout(55000)});
    if(!response.ok) throw new Error('upstream');
    const data=await response.json();
    return res.status(data.ok?200:data.conflict?409:400).json(data);
  } catch { return res.status(502).json({ok:false,error:'ติดต่อฐานข้อมูลไม่สำเร็จ กรุณาลองใหม่ ข้อมูลที่ยังไม่บันทึกยังอยู่ในหน้านี้'}); }
}
