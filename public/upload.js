function readChunk(blob) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(',')[1]);
    reader.onerror=()=>reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    reader.readAsDataURL(blob);
  });
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function uploadAttachment(file,context,api,onProgress=()=>{},options={}) {
  const base={...context,name:file.name,type:file.type,size:file.size,uploadId:options.uploadId||crypto.randomUUID()};
  const encode=options.readChunk||readChunk,wait=options.pause||pause;
  let status;
  for(let attempt=0;attempt<3;attempt++) {
    try {status=await api('uploadStart',base);break;}
    catch(error){if(attempt===2)throw error;await wait(500*(attempt+1));}
  }
  let failures=0;
  while(!status.done) {
    const offset=status.offset;
    if(!Number.isSafeInteger(offset)||offset<0||offset>=file.size)throw new Error('ตำแหน่งอัปโหลดไม่ถูกต้อง กรุณาเลือกไฟล์ใหม่');
    onProgress(Math.floor(offset/file.size*100));
    const data=await encode(file.slice(offset,Math.min(offset+1024*1024,file.size)));
    try {
      const next=await api('uploadChunk',{hospitalId:base.hospitalId,seq:base.seq,uploadId:base.uploadId,offset,data});
      if(!next.done&&next.offset<=offset)throw new Error('อัปโหลดไม่คืบหน้า กรุณาลองใหม่');
      status=next;failures=0;
    } catch(error) {
      if(++failures>3)throw error;
      await wait(500*failures);
      // Ask Drive for its committed offset before retrying a request whose response was lost.
      try {status=await api('uploadStatus',{hospitalId:base.hospitalId,seq:base.seq,uploadId:base.uploadId});}
      catch {if(failures===3)throw error;}
    }
  }
  if(!status.file||Number(status.file.size)!==file.size)throw new Error('อัปโหลดไฟล์ไม่ครบ กรุณาลองใหม่');
  onProgress(100);return status.file;
}
