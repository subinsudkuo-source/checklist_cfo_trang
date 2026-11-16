import test from 'node:test';import assert from 'node:assert/strict';
import handler from '../api/checklist.js';
function response(){return {headers:{},statusCode:0,setHeader(k,v){this.headers[k]=v},status(c){this.statusCode=c;return this},json(v){this.body=v;return this}};}
const req=(body,headers={})=>({method:'POST',headers:{host:'example.test',origin:'https://example.test',...headers},body});
test('health and requests need only the Apps Script connection configuration',async()=>{
 delete process.env.APPS_SCRIPT_URL;delete process.env.APPS_SCRIPT_SECRET;
 const h=response();await handler(req({action:'health'}),h);assert.equal(h.body.configured,false);
 const r=response();await handler(req({action:'load'}),r);assert.equal(r.statusCode,503);
});
test('requests work without login or cookies and keep the backend secret server-side',async()=>{
 process.env.APPS_SCRIPT_SECRET='backend-only';process.env.APPS_SCRIPT_URL='https://script.google.com/test';
 delete process.env.ACCESS_CODE;delete process.env.SESSION_SECRET;
 const health=response();await handler(req({action:'health'}),health);assert.equal(health.body.configured,true);
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,process.env.APPS_SCRIPT_URL);const sent=JSON.parse(options.body);assert.equal(sent.secret,'backend-only');
  if(sent.action==='load')return {ok:true,json:async()=>({ok:true,states:{},versions:{}})};
  assert.equal(sent.state.items['34'].result,'');assert.deepEqual(sent.state.items['34'].files,[]);assert.equal(sent.state.items['34.1'].result,'ผ่าน');
  return {ok:true,json:async()=>({ok:false,conflict:true,error:'conflict'})};
 };
 try{
  const loaded=response();await handler(req({action:'load',secret:'attacker'}),loaded);assert.equal(loaded.statusCode,200);assert.equal(loaded.body.ok,true);assert.equal(loaded.headers['Set-Cookie'],undefined);
  const saved=response();await handler(req({action:'save',state:{items:{'34':{result:'ผ่าน',files:[{id:'legacy'}]},'34.1':{result:'ผ่าน'}}}}),saved);assert.equal(saved.statusCode,409);
 }finally{globalThis.fetch=originalFetch;}
 const cross=response();await handler(req({action:'load'},{origin:'https://evil.test'}),cross);assert.equal(cross.statusCode,403);
});
