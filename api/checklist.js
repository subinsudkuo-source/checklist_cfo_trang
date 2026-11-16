export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Method not allowed'});
  const origin=req.headers.origin;
  if(origin && origin!==`https://${req.headers.host}` && origin!==`http://${req.headers.host}`) return res.status(403).json({ok:false,error:'Invalid origin'});
  let body; try { body=typeof req.body==='string'?JSON.parse(req.body):req.body; } catch { return res.status(400).json({ok:false,error:'Invalid JSON'}); }
  if(!body || typeof body!=='object') return res.status(400).json({ok:false,error:'Invalid request'});
  const {action}=body;
  if(action==='health') return res.status(200).json({ok:true,configured:!!(process.env.APPS_SCRIPT_URL&&process.env.APPS_SCRIPT_SECRET)});
  if(!['load','save','upload'].includes(action)) return res.status(400).json({ok:false,error:'Unknown action'});
  if(!process.env.APPS_SCRIPT_URL || !process.env.APPS_SCRIPT_SECRET) return res.status(503).json({ok:false,error:'ยังไม่ได้เชื่อมต่อ Apps Script'});
  if(JSON.stringify(body).length>4300000) return res.status(413).json({ok:false,error:'ไฟล์มีขนาดใหญ่เกินกำหนด'});
  // Stable ID 34 is displayed as section 33; only its subitems are assessable.
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
