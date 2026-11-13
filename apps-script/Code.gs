const ROOT_FOLDER_ID = '1vsgucl7xQi6KmLeRJqvNtI3ZnL_1xWbw';
const STATE_HEADERS = ['hospitalId', 'version', 'updatedAt', 'stateJson'];
const DATA_HEADERS = ['ข้อ', 'หมวด', 'รายการประเมิน', 'หลักฐานที่คาดหวัง', 'ผลประเมิน', 'คะแนน', 'ข้อค้นพบ', 'มาตรการ', 'ผู้รับผิดชอบ', 'ผลตรวจ สสจ.', 'ความเห็น สสจ.', 'ไฟล์แนบ Drive'];

function setup() {
  const lock=LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const props=PropertiesService.getScriptProperties();
    const root=DriveApp.getFolderById(ROOT_FOLDER_ID);
    let id=props.getProperty('SPREADSHEET_ID');
    const ss=id?SpreadsheetApp.openById(id):SpreadsheetApp.create('ฐานข้อมูล Checklist CFO โรงพยาบาลจังหวัดตรัง');
    if(!id) { DriveApp.getFileById(ss.getId()).moveTo(root); props.setProperty('SPREADSHEET_ID',ss.getId()); }
    if(!props.getProperty('API_SECRET')) props.setProperty('API_SECRET',Utilities.getUuid()+Utilities.getUuid());
    const state=ensureSheet_(ss,'_State',STATE_HEADERS);
    const hospitals=ensureSheet_(ss,'โรงพยาบาล',['รหัส','โรงพยาบาล','อำเภอ','โฟลเดอร์ไฟล์แนบ','วันที่ประเมิน','รอบประเมิน','ผู้ประเมิน','ผู้ตรวจ สสจ.','วันที่ตรวจ สสจ.','ส่งแบบประเมิน','เวลาส่ง','รุ่นข้อมูล']);
    const folderIds=JSON.parse(props.getProperty('FOLDER_IDS')||'{}');
    SCHEMA.hospitals.forEach((h,i)=>{
      if(!folderIds[h.id]) { const matches=root.getFoldersByName(h.name); folderIds[h.id]=matches.hasNext()?matches.next().getId():root.createFolder(h.name).getId(); }
      if(state.getLastRow()<i+2) state.getRange(i+2,1,1,4).setValues([[h.id,0,'',JSON.stringify(emptyState_())]]);
      const snapshot=JSON.parse(state.getRange(i+2,4).getValue());
      const ver=Number(state.getRange(i+2,2).getValue());
      ensureSheet_(ss,h.id,DATA_HEADERS);
      hospitals.getRange(i+2,1,1,4).setValues([[h.id,h.name,h.district,'https://drive.google.com/drive/folders/'+folderIds[h.id]]]);
      project_(ss,h.id,snapshot,ver);
    });
    props.setProperty('FOLDER_IDS',JSON.stringify(folderIds));
    state.hideSheet();
    const blank=ss.getSheetByName('Sheet1')||ss.getSheetByName('แผ่น1');
    if(blank && blank.getLastRow()===0 && ss.getSheets().length>1) ss.deleteSheet(blank);
    SpreadsheetApp.flush();
    console.log('ฐานข้อมูล: '+ss.getUrl());
    console.log('สร้าง/ตรวจสอบครบ '+SCHEMA.hospitals.length+' โรงพยาบาล');
  } finally { lock.releaseLock(); }
}

function ensureSheet_(ss,name,headers) {
  const s=ss.getSheetByName(name)||ss.insertSheet(name);
  if(s.getLastRow()===0) {
    s.getRange(1,1,1,headers.length).setValues([headers]).setBackground('#0f5f5c').setFontColor('#ffffff').setFontWeight('bold');
    s.setFrozenRows(1); s.setColumnWidths(1,headers.length,150);
    if(name.startsWith('hosp-')) { s.setColumnWidth(1,55); s.setColumnWidth(3,420); s.setColumnWidth(4,280); }
  }
  return s;
}
function emptyState_() {
  const items={}; SCHEMA.items.forEach(i=>items[i.seq]={result:'',finding:'',measure:'',responsible:'',files:[],ssjStatus:'',ssjComment:''});
  return {evalDate:'',evalRound:'',evaluator:'',ssjInspector:'',ssjInspectDate:'',submitted:false,submittedAt:'',submitWarning:'',items};
}
function json_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { return json_({ok:true,service:'Checklist CFO Trang',version:1}); }
function doPost(e) {
  const lock=LockService.getScriptLock();
  try {
    const req=JSON.parse(e.postData.contents||'{}');
    const props=PropertiesService.getScriptProperties();
    if(!props.getProperty('API_SECRET') || req.secret!==props.getProperty('API_SECRET')) return json_({ok:false,error:'Unauthorized'});
    lock.waitLock(30000);
    const ss=SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID'));
    if(req.action==='load') {
      const rows=ss.getSheetByName('_State').getRange(2,1,SCHEMA.hospitals.length,4).getValues();
      const states={},versions={}; rows.forEach(r=>{states[r[0]]=JSON.parse(r[3]);versions[r[0]]=Number(r[1]);});
      return json_({ok:true,states,versions});
    }
    const index=SCHEMA.hospitals.findIndex(h=>h.id===req.hospitalId);
    if(index<0) throw new Error('โรงพยาบาลไม่ถูกต้อง');
    if(req.action==='upload') return json_(upload_(req,props));
    if(req.action!=='save') throw new Error('Unknown action');
    const sheet=ss.getSheetByName('_State'), row=index+2;
    const [id,version,updatedAt,stored]=sheet.getRange(row,1,1,4).getValues()[0];
    if(Number(req.version)!==Number(version)) return json_({ok:false,conflict:true,error:'มีผู้แก้ไขข้อมูลโรงพยาบาลนี้แล้ว กรุณาสำรองข้อมูลที่แก้ไขและโหลดข้อมูลล่าสุด'});
    const clean=validateState_(req.state,props,req.hospitalId);
    const data=JSON.stringify(clean); if(data.length>45000) throw new Error('ข้อมูลยาวเกินกำหนด กรุณาลดข้อความหรือจำนวนไฟล์แนบ');
    const next=Number(version)+1;
    sheet.getRange(row,1,1,4).setValues([[id,next,new Date().toISOString(),data]]);
    project_(ss,id,clean,next); SpreadsheetApp.flush();
    return json_({ok:true,version:next});
  } catch(err) { return json_({ok:false,error:String(err.message||err)}); }
  finally { if(lock.hasLock()) lock.releaseLock(); }
}
function text_(value,max) { const v=String(value||''); if(v.length>(max||4000)) throw new Error('ข้อความยาวเกินกำหนด'); return v; }
function validateState_(s,props,hospitalId) {
  if(!s || !s.items) throw new Error('ข้อมูลไม่ถูกต้อง');
  const out=emptyState_();
  ['evalDate','evalRound','evaluator','ssjInspector','ssjInspectDate','submittedAt','submitWarning'].forEach(k=>out[k]=text_(s[k]));
  out.submitted=s.submitted===true;
  const folderId=JSON.parse(props.getProperty('FOLDER_IDS'))[hospitalId];
  SCHEMA.items.forEach(i=>{
    const v=s.items[i.seq]||{},target=out.items[i.seq];
    if(!['','ผ่าน','ดำเนินการบางส่วน','ไม่ผ่าน','ไม่เกี่ยวข้อง'].includes(v.result||'')) throw new Error('ผลประเมินไม่ถูกต้อง');
    if(!['','รับรองผล','ให้แก้ไข/เพิ่มเติมหลักฐาน','ไม่รับรองผล'].includes(v.ssjStatus||'')) throw new Error('ผลตรวจไม่ถูกต้อง');
    ['result','finding','measure','responsible','ssjStatus','ssjComment'].forEach(k=>target[k]=text_(v[k]));
    if(!Array.isArray(v.files)||v.files.length>30) throw new Error('ไฟล์แนบต้องไม่เกิน 30 ไฟล์ต่อข้อ');
    target.files=v.files.map(f=>{
      if(!/^[\w-]{10,}$/.test(f.id||'')) throw new Error('กรุณาอัปโหลดไฟล์ให้เสร็จก่อนบันทึก');
      const file=DriveApp.getFileById(f.id),parents=file.getParents(); let valid=false;
      while(parents.hasNext()) { const parent=parents.next(); if(parent.getName()!=='ข้อ '+i.seq) continue; const ancestors=parent.getParents(); while(ancestors.hasNext()) if(ancestors.next().getId()===folderId) valid=true; }
      if(!valid) throw new Error('ไฟล์แนบไม่ตรงกับโรงพยาบาลหรือข้อประเมิน');
      return {id:file.getId(),name:text_(f.name,250),size:file.getSize(),type:file.getMimeType(),url:file.getUrl()};
    });
  }); return out;
}
function upload_(req,props) {
  if(!SCHEMA.items.some(i=>i.seq===String(req.seq)&&!i.isSubHeader)) throw new Error('ข้อประเมินไม่ถูกต้อง');
  if(!/^[a-zA-Z0-9-]{16,64}$/.test(req.uploadId||'')) throw new Error('Upload id invalid');
  const name=text_(req.name,250).replace(/[\\/\x00-\x1f]/g,'_');
  if(!/\.(pdf|png|jpg|jpeg|webp|doc|docx|xls|xlsx|csv|txt|zip)$/i.test(name)) throw new Error('ชนิดไฟล์ไม่รองรับ');
  if(typeof req.data!=='string'||req.data.length>4200000||!/^[A-Za-z0-9+/]*={0,2}$/.test(req.data)) throw new Error('ไฟล์ไม่ถูกต้องหรือใหญ่เกิน 3 MB');
  const bytes=Utilities.base64Decode(req.data); if(bytes.length>3*1024*1024) throw new Error('ขนาดไฟล์เกิน 3 MB');
  const hospital=DriveApp.getFolderById(JSON.parse(props.getProperty('FOLDER_IDS'))[req.hospitalId]);
  const matches=hospital.getFoldersByName('ข้อ '+req.seq); const folder=matches.hasNext()?matches.next():hospital.createFolder('ข้อ '+req.seq);
  const storedName=req.uploadId+'__'+name,existing=folder.getFilesByName(storedName);
  const file=existing.hasNext()?existing.next():folder.createFile(Utilities.newBlob(bytes,req.type||'application/octet-stream',storedName));
  return {ok:true,file:{id:file.getId(),name,size:file.getSize(),type:file.getMimeType(),url:file.getUrl()}};
}
function safeCell_(v) { return typeof v==='string' && /^[=+@-]/.test(v)?"'"+v:v; }
function project_(ss,id,state,version) {
  const rows=SCHEMA.items.map(i=>{ const v=state.items[i.seq]; const score=v.result==='ผ่าน'?2:v.result==='ดำเนินการบางส่วน'?1:v.result==='ไม่ผ่าน'?0:v.result==='ไม่เกี่ยวข้อง'?'N/A':'';
    return [i.seq,i.topic,i.text,i.evidence,v.result,score,v.finding,v.measure,v.responsible,v.ssjStatus,v.ssjComment,v.files.map(f=>f.url).join('\n')].map(safeCell_); });
  ss.getSheetByName(id).getRange(2,1,rows.length,DATA_HEADERS.length).setValues(rows).setWrap(true).setVerticalAlignment('top');
  const index=SCHEMA.hospitals.findIndex(h=>h.id===id);
  ss.getSheetByName('โรงพยาบาล').getRange(index+2,5,1,8).setValues([[state.evalDate,state.evalRound,state.evaluator,state.ssjInspector,state.ssjInspectDate,state.submitted?'ส่งแล้ว':'ร่าง',state.submittedAt,version].map(safeCell_)]);
}
