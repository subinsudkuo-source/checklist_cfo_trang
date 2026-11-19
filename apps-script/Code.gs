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
    const blank=ss.getSheetByName('Sheet1')||ss.getSheetByName('แผ่น1')||ss.getSheetByName('ชีต1');
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
    if(['uploadStart','uploadChunk','uploadStatus'].includes(req.action)) return json_(resumableUpload_(req,props));
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
  if(typeof req.data!=='string'||req.data.length>4200000||!/^[A-Za-z0-9+/]*={0,2}$/.test(req.data)) throw new Error('กรุณาอัปโหลดไฟล์เป็นส่วนย่อย');
  const bytes=Utilities.base64Decode(req.data);
  const hospital=DriveApp.getFolderById(JSON.parse(props.getProperty('FOLDER_IDS'))[req.hospitalId]);
  const matches=hospital.getFoldersByName('ข้อ '+req.seq); const folder=matches.hasNext()?matches.next():hospital.createFolder('ข้อ '+req.seq);
  const storedName=req.uploadId+'__'+name,existing=folder.getFilesByName(storedName);
  const file=existing.hasNext()?existing.next():folder.createFile(Utilities.newBlob(bytes,req.type||'application/octet-stream',storedName));
  return {ok:true,file:{id:file.getId(),name,size:file.getSize(),type:file.getMimeType(),url:file.getUrl()}};
}
function safeCell_(v) { return typeof v==='string' && /^[=+@-]/.test(v)?"'"+v:v; }
function project_(ss,id,state,version) {
  const rows=SCHEMA.items.map(i=>{ const v=state.items[i.seq]; const score=v.result==='ผ่าน'?2:v.result==='ดำเนินการบางส่วน'?1:v.result==='ไม่ผ่าน'?0:v.result==='ไม่เกี่ยวข้อง'?'N/A':'';
    return [i.displaySeq || i.seq,i.topic,i.text,i.evidence,v.result,score,v.finding,v.measure,v.responsible,v.ssjStatus,v.ssjComment,v.files.map(f=>f.url).join('\n')].map(safeCell_); });
  ss.getSheetByName(id).getRange(2,1,rows.length,DATA_HEADERS.length).setValues(rows).setWrap(true).setVerticalAlignment('top');
  const index=SCHEMA.hospitals.findIndex(h=>h.id===id);
  ss.getSheetByName('โรงพยาบาล').getRange(index+2,5,1,8).setValues([[state.evalDate,state.evalRound,state.evaluator,state.ssjInspector,state.ssjInspectDate,state.submitted?'ส่งแล้ว':'ร่าง',state.submittedAt,version].map(safeCell_)]);
}

// Drive resumable sessions stay server-side; clients receive only an opaque upload ID.
function authorizeLargeUploads() {
  UrlFetchApp.fetch('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
}
function uploadHeader_(response,name) {
  const headers=response.getAllHeaders(),key=Object.keys(headers).find(k=>k.toLowerCase()===name.toLowerCase());
  return key?String(headers[key]):'';
}
function uploadResult_(session) {
  return {ok:true,offset:session.offset,chunkSize:1024*1024,done:!!session.file,file:session.file};
}
function uploadFileInfo_(file,name) {
  return {id:file.getId(),name,size:file.getSize(),type:file.getMimeType(),url:file.getUrl()};
}
function uploadResponse_(response,session,key,props) {
  const code=response.getResponseCode();
  if(code===200||code===201) {
    const metadata=JSON.parse(response.getContentText()),file=DriveApp.getFileById(metadata.id);
    if(file.getSize()!==session.size) throw new Error('ขนาดไฟล์ที่อัปโหลดไม่ครบ กรุณาลองใหม่');
    session.file=uploadFileInfo_(file,session.name);session.offset=session.size;
  } else if(code===308) {
    const range=uploadHeader_(response,'Range'),match=/^bytes=0-(\d+)$/.exec(range);
    session.offset=match?Number(match[1])+1:0;
    if(session.offset>session.size) throw new Error('ตำแหน่งอัปโหลดไม่ถูกต้อง');
  } else if(code===404||code===410) {
    props.deleteProperty(key);throw new Error('การอัปโหลดหมดอายุ กรุณาเลือกไฟล์ใหม่');
  } else {
    throw new Error(code===403?'Google Drive ไม่สามารถรับไฟล์ได้ กรุณาตรวจพื้นที่ว่างและสิทธิ์การใช้งาน':'อัปโหลดไม่สำเร็จ กรุณาลองใหม่');
  }
  props.setProperty(key,JSON.stringify(session));return uploadResult_(session);
}
function resumableUpload_(req,props) {
  if(!SCHEMA.items.some(i=>i.seq===String(req.seq)&&!i.isSubHeader)) throw new Error('ข้อประเมินไม่ถูกต้อง');
  if(!/^[a-zA-Z0-9-]{16,64}$/.test(req.uploadId||'')) throw new Error('Upload id invalid');
  const key='UPLOAD_'+req.uploadId,stored=props.getProperty(key);
  let session=stored?JSON.parse(stored):null;
  if(session&&(session.hospitalId!==req.hospitalId||session.seq!==String(req.seq))) throw new Error('การอัปโหลดไม่ตรงกับโรงพยาบาลหรือข้อประเมิน');
  if(session&&session.expires<Date.now()){props.deleteProperty(key);session=null;}
  if(req.action==='uploadStart') {
    const name=text_(req.name,250).replace(/[\\/\x00-\x1f]/g,'_');
    if(!/\.(pdf|png|jpg|jpeg|webp|doc|docx|xls|xlsx|csv|txt|zip)$/i.test(name)) throw new Error('ชนิดไฟล์ไม่รองรับ');
    if(!Number.isSafeInteger(req.size)||req.size<0) throw new Error('ขนาดไฟล์ไม่ถูกต้อง');
    if(session){if(session.name!==name||session.size!==req.size)throw new Error('ข้อมูลไฟล์ไม่ตรงกับการอัปโหลดเดิม');return uploadResult_(session);}
    Object.entries(props.getProperties()).forEach(([k,v])=>{if(k.startsWith('UPLOAD_')){try{if(JSON.parse(v).expires<Date.now())props.deleteProperty(k);}catch{props.deleteProperty(k);}}});
    const hospital=DriveApp.getFolderById(JSON.parse(props.getProperty('FOLDER_IDS'))[req.hospitalId]);
    const folders=hospital.getFoldersByName('ข้อ '+req.seq),folder=folders.hasNext()?folders.next():hospital.createFolder('ข้อ '+req.seq);
    const storedName=req.uploadId+'__'+name,existing=folder.getFilesByName(storedName);
    session={hospitalId:req.hospitalId,seq:String(req.seq),name,size:req.size,type:text_(req.type||'application/octet-stream',150),offset:0,expires:Date.now()+24*60*60*1000};
    if(existing.hasNext()) {const file=existing.next();if(file.getSize()!==req.size)throw new Error('ข้อมูลไฟล์ไม่ตรงกัน');session.file=uploadFileInfo_(file,name);session.offset=req.size;}
    else if(req.size===0) {session.file=uploadFileInfo_(folder.createFile(Utilities.newBlob([],session.type,storedName)),name);}
    else {
      const response=UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size,mimeType,webViewLink',{
        method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken(),'X-Upload-Content-Type':session.type,'X-Upload-Content-Length':String(req.size)},
        payload:JSON.stringify({name:storedName,mimeType:session.type,parents:[folder.getId()]}),muteHttpExceptions:true,followRedirects:false
      });
      const location=uploadHeader_(response,'Location');
      if(response.getResponseCode()!==200||!/^https:\/\/www\.googleapis\.com\/upload\/drive\//.test(location))throw new Error('เริ่มอัปโหลด Google Drive ไม่สำเร็จ กรุณาตรวจสิทธิ์ Drive API');
      session.url=location;
    }
    props.setProperty(key,JSON.stringify(session));return uploadResult_(session);
  }
  if(!session)throw new Error('ไม่พบการอัปโหลด กรุณาเลือกไฟล์ใหม่');
  if(session.file)return uploadResult_(session);
  if(req.action==='uploadStatus') {
    return uploadResponse_(UrlFetchApp.fetch(session.url,{method:'put',headers:{'Content-Range':'bytes */'+session.size},payload:'',muteHttpExceptions:true,followRedirects:false}),session,key,props);
  }
  if(!Number.isSafeInteger(req.offset)||req.offset<0)throw new Error('ตำแหน่งอัปโหลดไม่ถูกต้อง');
  if(req.offset!==session.offset)return uploadResult_(session);
  if(typeof req.data!=='string'||req.data.length>1398104||!req.data.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(req.data))throw new Error('ส่วนของไฟล์ไม่ถูกต้อง');
  const bytes=Utilities.base64Decode(req.data),end=req.offset+bytes.length;
  if(!bytes.length||bytes.length>1024*1024||end>session.size||(end<session.size&&bytes.length%(256*1024)!==0))throw new Error('ขนาดส่วนของไฟล์ไม่ถูกต้อง');
  return uploadResponse_(UrlFetchApp.fetch(session.url,{method:'put',contentType:session.type,headers:{'Content-Range':'bytes '+req.offset+'-'+(end-1)+'/'+session.size},payload:bytes,muteHttpExceptions:true,followRedirects:false}),session,key,props);
}
