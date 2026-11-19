import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {uploadAttachment} from '../public/upload.js';
test('large attachments stream in bounded chunks and recover a lost response without duplicating bytes',async()=>{
 const size=9*1024*1024+123,bytes=Buffer.alloc(size,73),file=new Blob([bytes]);Object.defineProperties(file,{name:{value:'large.txt'},type:{value:'text/plain'}});
 let offset=0,lost=false,starts=0;const received=[],progress=[];
 const metadata={id:'file-id',size,name:file.name};
 const api=async(action,req)=>{
  if(action==='uploadStart'){starts++;assert.equal(req.size,size);return {offset:0,done:false};}
  if(action==='uploadStatus')return {offset,done:offset===size,file:offset===size?metadata:undefined};
  assert.equal(req.offset,offset);const chunk=Buffer.from(req.data,'base64');assert.ok(chunk.length<=1024*1024);received.push(chunk);offset+=chunk.length;
  if(!lost&&offset===2*1024*1024){lost=true;throw Error('response lost');}
  return {offset,done:offset===size,file:offset===size?metadata:undefined};
 };
 const result=await uploadAttachment(file,{hospitalId:'hosp-1',seq:'13'},api,n=>progress.push(n),{uploadId:'test-upload-12345678',readChunk:async blob=>Buffer.from(await blob.arrayBuffer()).toString('base64'),pause:async()=>{}});
 assert.deepEqual(result,metadata);assert.equal(starts,1);assert.deepEqual(Buffer.concat(received),bytes);assert.equal(progress.at(-1),100);
});
function backendUpload(){
 const props={},responses=[],calls=[];let fileSize=0;
 const file={getId:()=> 'file-id',getSize:()=>fileSize,getMimeType:()=> 'text/plain',getUrl:()=> 'https://drive.google.com/file/d/file-id/view'};
 const folder={getId:()=> 'item-folder',getFilesByName:()=>({hasNext:()=>false})};
 const context=vm.createContext({PropertiesService:{},ScriptApp:{getOAuthToken:()=> 'private-token'},Utilities:{base64Decode:s=>Array.from(Buffer.from(s,'base64'))},DriveApp:{getFileById:()=>file,getFolderById:()=>({getFoldersByName:()=>({hasNext:()=>true,next:()=>folder})})},UrlFetchApp:{fetch:(url,options)=>{calls.push({url,options});const x=responses.shift();if(!x)throw Error('unexpected fetch');return {getResponseCode:()=>x.code,getAllHeaders:()=>x.headers||{},getContentText:()=>JSON.stringify(x.body||{})}}}});
 vm.runInContext(fs.readFileSync(new URL('../apps-script/Schema.gs',import.meta.url),'utf8')+fs.readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8'),context);
 props.FOLDER_IDS=JSON.stringify({'hosp-1':'hospital-folder'});
 const properties={getProperty:k=>props[k],setProperty:(k,v)=>{props[k]=v},deleteProperty:k=>delete props[k],getProperties:()=>props};
 const base={hospitalId:'hosp-1',seq:'13',uploadId:'test-upload-12345678'};
 return {props,responses,calls,base,setSize:s=>fileSize=s,call:req=>JSON.parse(JSON.stringify(context.resumableUpload_({...base,...req},properties)))};
}
test('Drive resumable upload supports large totals, checks offsets, and keeps credentials and session URLs server-side',()=>{
 const b=backendUpload(),size=12*1024*1024,location='https://www.googleapis.com/upload/drive/v3/files?upload_id=private-session';
 b.responses.push({code:200,headers:{location}});
 const start=b.call({action:'uploadStart',name:'large.txt',type:'text/plain',size});assert.equal(start.offset,0);assert.ok(!JSON.stringify(start).includes('private'));assert.equal(b.calls[0].options.headers['X-Upload-Content-Length'],String(size));
 assert.throws(()=>b.call({action:'uploadChunk',hospitalId:'hosp-2',offset:0,data:'YQ=='}),/โรงพยาบาล/);
 assert.throws(()=>b.call({action:'uploadChunk',offset:0,data:'YQ=='}),/ขนาดส่วน/);
 b.responses.push({code:308,headers:{Range:'bytes=0-1048575'}});
 const chunk=b.call({action:'uploadChunk',offset:0,data:Buffer.alloc(1024*1024).toString('base64')});assert.equal(chunk.offset,1024*1024);assert.equal(b.calls.at(-1).options.headers['Content-Range'],'bytes 0-1048575/'+size);
 const calls=b.calls.length;assert.equal(b.call({action:'uploadChunk',offset:0,data:'YQ=='}).offset,1024*1024);assert.equal(b.calls.length,calls);
 b.responses.push({code:200,body:{id:'file-id'}});b.setSize(size);
 const done=b.call({action:'uploadStatus'});assert.equal(done.done,true);assert.equal(done.file.size,size);assert.equal(b.call({action:'uploadStatus'}).file.id,'file-id');
});
