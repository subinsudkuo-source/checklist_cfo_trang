import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function backend(){
 const rows=new Map(),properties={API_SECRET:'server-secret',SPREADSHEET_ID:'sheet-id',FOLDER_IDS:JSON.stringify(Object.fromEntries(Array.from({length:10},(_,i)=>['hosp-'+(i+1),'folder-'+i])))};
 const sheet={getRange(row,col,n=1,m=1){return {getValues:()=>Array.from({length:n},(_,i)=>rows.get(row+i)||[]),setValues(values){values.forEach((v,i)=>rows.set(row+i,v));return this},setWrap(){return this},setVerticalAlignment(){return this}}}};
 const projection={getRange(){return {setValues(){return this},setWrap(){return this},setVerticalAlignment(){return this}}}};
 const context=vm.createContext({console,PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]})},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){},hasLock:()=>true})},SpreadsheetApp:{openById:()=>({getSheetByName:n=>n==='_State'?sheet:projection}),flush(){}},ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})}});
 vm.runInContext(fs.readFileSync(new URL('../apps-script/Schema.gs',import.meta.url),'utf8')+fs.readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8'),context);
 const fresh=()=>vm.runInContext('emptyState_()',context);
 for(let i=0;i<10;i++) rows.set(i+2,['hosp-'+(i+1),0,'',JSON.stringify(fresh())]);
 return {rows,fresh,post:body=>context.doPost({postData:{contents:JSON.stringify(body)}}),context};
}
test('save persists only the selected hospital and rejects stale versions',()=>{
 const b=backend(),state=b.fresh();state.evaluator='ผู้ทดสอบ';state.items['1'].result='ผ่าน';
 const out=b.post({action:'save',secret:'server-secret',hospitalId:'hosp-2',version:0,state});assert.equal(out.ok,true);assert.equal(out.version,1);
 assert.equal(JSON.parse(b.rows.get(3)[3]).items['1'].result,'ผ่าน');assert.equal(JSON.parse(b.rows.get(2)[3]).items['1'].result,'');
 const conflict=b.post({action:'save',secret:'server-secret',hospitalId:'hosp-2',version:0,state});assert.equal(conflict.conflict,true);assert.equal(b.rows.get(3)[1],1);
 const reload=b.post({action:'load',secret:'server-secret'});assert.equal(reload.states['hosp-2'].evaluator,'ผู้ทดสอบ');assert.equal(reload.versions['hosp-1'],0);
});
test('backend rejects unauthenticated requests, bad results and unsafe attachments',()=>{
 const b=backend();assert.equal(b.post({action:'load',secret:'wrong'}).error,'Unauthorized');
 const state=b.fresh();state.items['1'].result='invented';assert.equal(b.post({action:'save',secret:'server-secret',hospitalId:'hosp-1',version:0,state}).ok,false);
 const upload=b.post({action:'upload',secret:'server-secret',hospitalId:'hosp-1',seq:'1',uploadId:'12345678-1234-1234',name:'script.html',data:'YWJj'});assert.equal(upload.ok,false);
 assert.equal(vm.runInContext('safeCell_("=IMPORTXML(1)")',b.context),"'=IMPORTXML(1)");
});
