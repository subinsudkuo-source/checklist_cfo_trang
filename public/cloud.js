// Loaded after the original UI. Database secrets stay in the Vercel function.
let cloudReady=false,cloudBusy=false,cloudVersions={},cloudDirty=new Map(),cloudTimer;
const cloudStatus=document.getElementById('cloud-status');
const cloudOverlay=document.getElementById('cloud-login');
function cloudMessage(text,error=false) { cloudStatus.textContent=text; cloudStatus.style.color=error?'#b91c1c':'#0f5f5c'; }
async function cloudApi(action,data={}) {
  const response=await fetch('/api/checklist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data})});
  const result=await response.json();
  if(!response.ok||!result.ok) { const error=new Error(result.error||'เชื่อมต่อไม่สำเร็จ'); error.conflict=result.conflict; throw error; }
  return result;
}
async function cloudLoad() {
  const data=await cloudApi('load');
  Object.keys(hospitalState).forEach(id=>{ if(data.states[id]) hospitalState[id]=data.states[id]; });
  cloudVersions=data.versions; cloudDirty.clear(); cloudReady=true;
  cloudOverlay.hidden=true; syncMetaInputs(); renderActiveView(); cloudMessage('เชื่อมต่อ Google Sheets แล้ว');
}
function markCloudDirty(id=currentHospitalId) {
  if(!cloudReady) return;
  cloudDirty.set(id,(cloudDirty.get(id)||0)+1);
  cloudMessage('มีข้อมูลยังไม่บันทึก'); clearTimeout(cloudTimer); cloudTimer=setTimeout(cloudSave,1200);
}
async function cloudSave() {
  if(!cloudReady||cloudBusy||cloudDirty.size===0) return;
  cloudBusy=true; cloudMessage('กำลังบันทึกลง Google Sheets…');
  try {
    for(const [id,generation] of [...cloudDirty]) {
      const snapshot=JSON.parse(JSON.stringify(hospitalState[id]));
      const data=await cloudApi('save',{hospitalId:id,version:cloudVersions[id]||0,state:snapshot});
      cloudVersions[id]=data.version;
      if(cloudDirty.get(id)===generation) cloudDirty.delete(id);
    }
    cloudMessage(cloudDirty.size?'มีข้อมูลใหม่รอบันทึก':'บันทึกลง Google Sheets แล้ว '+new Date().toLocaleTimeString('th-TH'));
    if(cloudDirty.size) cloudTimer=setTimeout(cloudSave,500);
  } catch(error) {
    cloudMessage(error.message,true);
    if(error.conflict) { cloudReady=false; document.getElementById('cloud-backup').hidden=false; }
  } finally { cloudBusy=false; }
}
document.addEventListener('input',event=>{ if(event.target.closest('.container')) markCloudDirty(); });
document.addEventListener('change',event=>{ if(event.target.matches('select') && event.target.closest('#checklist-tbody, #ssj-tbody')) markCloudDirty(); });
document.getElementById('ssj-approve-ready-btn')?.addEventListener('click',()=>markCloudDirty());
document.getElementById('cloud-save').addEventListener('click',cloudSave);
document.getElementById('cloud-reload').addEventListener('click',async()=>{
  if((cloudDirty.size||cloudBusy) && !confirm('มีข้อมูลยังไม่บันทึก ต้องการโหลดข้อมูลล่าสุดแทนที่ข้อมูลในหน้านี้หรือไม่?')) return;
  if(cloudBusy) return;
  try { await cloudLoad(); } catch(error) { cloudMessage(error.message,true); }
});
document.getElementById('cloud-backup').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(hospitalState,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='checklist-backup-'+Date.now()+'.json';a.click();URL.revokeObjectURL(a.href);
});
document.getElementById('cloud-logout').addEventListener('click',async()=>{
  if(cloudDirty.size||cloudBusy) { cloudMessage('กรุณาบันทึกหรือสำรองข้อมูลก่อนออกจากระบบ',true);return; }
  await cloudApi('logout'); location.reload();
});
document.getElementById('cloud-login-form').addEventListener('submit',async event=>{
  event.preventDefault(); const button=event.target.querySelector('button');button.disabled=true;
  try { await cloudApi('login',{code:document.getElementById('cloud-code').value});await cloudLoad();document.getElementById('cloud-code').value=''; }
  catch(error) { document.getElementById('cloud-login-error').textContent=error.message; }
  finally {button.disabled=false;}
});
const originalSubmit=handleSubmitChecklist;
handleSubmitChecklist=function(){originalSubmit();markCloudDirty();cloudSave();};
// Existing listeners captured the original function; persist its state after each click.
['submit-checklist-top-btn','submit-checklist-bottom-btn'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>{markCloudDirty();cloudSave();}));
handleFilesSelected=async function(seq,fileList) {
  if(!cloudReady) return;
  const id=currentHospitalId;
  for(const file of Array.from(fileList||[])) {
    if(file.size>3*1024*1024) {cloudMessage('แนบไฟล์ได้ไม่เกิน 3 MB ต่อไฟล์',true);continue;}
    if(!/\.(pdf|png|jpg|jpeg|webp|doc|docx|xls|xlsx|csv|txt|zip)$/i.test(file.name)) {cloudMessage('ชนิดไฟล์ไม่รองรับ',true);continue;}
    cloudMessage('กำลังอัปโหลด '+file.name+'…');
    try {
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('อ่านไฟล์ไม่สำเร็จ'));reader.readAsDataURL(file);});
      const result=await cloudApi('upload',{hospitalId:id,seq,name:file.name,type:file.type,data,uploadId:crypto.randomUUID()});
      hospitalState[id].items[seq].files.push(result.file);markCloudDirty(id);
      if(currentHospitalId===id) renderActiveView();
    } catch(error) {cloudMessage(error.message,true);}
  }
};
const originalOpenFile=openFileModal;
openFileModal=function(item,file) {
  originalOpenFile(item,file);
  if(file.url && /^https:\/\/drive\.google\.com\//.test(file.url)) {
    const link=document.createElement('a');link.href=file.url;link.target='_blank';link.rel='noopener noreferrer';link.className='btn btn-primary';link.textContent='เปิดไฟล์ใน Google Drive';
    document.getElementById('file-modal-body').appendChild(link);
  }
};
window.addEventListener('beforeunload',event=>{if(cloudDirty.size||cloudBusy){event.preventDefault();event.returnValue='';}});
cloudApi('health').then(async status=>{
  if(!status.configured) {document.getElementById('cloud-login-error').textContent='ระบบกำลังรอตั้งค่า Apps Script และฐานข้อมูล';return;}
  try {await cloudLoad();} catch { /* Show login form for a new or expired session. */ }
}).catch(()=>{document.getElementById('cloud-login-error').textContent='ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';});
