import test from 'node:test';import assert from 'node:assert/strict';
import handler from '../api/checklist.js';
function response(){return {headers:{},statusCode:0,setHeader(k,v){this.headers[k]=v},status(c){this.statusCode=c;return this},json(v){this.body=v;return this}};}
const req=(body,extra={})=>({method:'POST',headers:{host:'example.test',origin:'https://example.test'},body,...extra});
test('database is closed until configuration is present',async()=>{delete process.env.ACCESS_CODE;delete process.env.SESSION_SECRET;const r=response();await handler(req({action:'save'}),r);assert.equal(r.statusCode,503)});
test('login, tampered cookie, authenticated upstream and conflict',async()=>{
 process.env.ACCESS_CODE='test-pass';process.env.SESSION_SECRET='test-session';process.env.APPS_SCRIPT_SECRET='backend-only';process.env.APPS_SCRIPT_URL='https://script.google.com/test';
 const bad=response();await handler(req({action:'login',code:'wrong'}),bad);assert.equal(bad.statusCode,401);
 const login=response();await handler(req({action:'login',code:'test-pass'}),login);assert.equal(login.statusCode,200);assert.match(login.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Strict/);
 const cookie=login.headers['Set-Cookie'].split(';')[0];
 const tampered=response();await handler(req({action:'load'},{headers:{host:'example.test',cookie:cookie+'x'}}),tampered);assert.equal(tampered.statusCode,401);
 const oldFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>{assert.equal(url,process.env.APPS_SCRIPT_URL);const sent=JSON.parse(options.body);assert.equal(sent.secret,'backend-only');assert.equal(sent.state.items['34'].result,'');assert.deepEqual(sent.state.items['34'].files,[]);assert.equal(sent.state.items['34.1'].result,'ผ่าน');return {ok:true,json:async()=>({ok:false,conflict:true,error:'conflict'})}};
 try{const r=response();await handler(req({action:'save',secret:'attacker',state:{items:{'34':{result:'ผ่าน',files:[{id:'legacy'}]},'34.1':{result:'ผ่าน'}}}},{headers:{host:'example.test',cookie}}),r);assert.equal(r.statusCode,409);assert.equal(r.body.conflict,true)}finally{globalThis.fetch=oldFetch;}
 const cross=response();await handler(req({action:'login',code:'test-pass'},{headers:{host:'example.test',origin:'https://evil.test'}}),cross);assert.equal(cross.statusCode,403);
});
