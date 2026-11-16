import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function frontend(){const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');const c=vm.createContext({});vm.runInContext(html.split('<script>')[1].split('</script>')[0].replace('    initUI();',''),c);return c;}
test('web and Apps Script share continuous visible numbers while retaining data identities',()=>{
 const c=frontend();const web=JSON.parse(vm.runInContext('JSON.stringify(CHECKLIST_ITEMS.map(i=>({id:i.seq,number:displayAssessmentNumber(i),text:i.text})))',c));
 const b=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../apps-script/Schema.gs',import.meta.url),'utf8'),b);
 const backend=JSON.parse(vm.runInContext('JSON.stringify(SCHEMA.items.map(i=>({id:i.seq,number:i.displaySeq||i.seq,text:i.text})))',b));
 assert.deepEqual(web,backend);assert.equal(web.length,43);
 assert.deepEqual(web.filter(i=>!i.number.includes('.')).map(i=>Number(i.number)),Array.from({length:40},(_,i)=>i+1));
 assert.equal(web.find(i=>i.id==='13').number,'12');assert.ok(web.find(i=>i.id==='13').text.startsWith('2.6 '));
 assert.equal(web.find(i=>i.id==='34').number,'33');assert.equal(web.find(i=>i.id==='34.1').number,'33.1');
 assert.ok(!web.some(i=>i.text.includes('2.6 ตรวจสอบการเบิกจ่ายให้ผู้ขายภายใน 5 วัน')));
});
test('existing answers stay with their original question when its display number changes',()=>{
 const r=vm.runInContext(`hospitalState['hosp-1'].items['13'].result='ผ่าน';hospitalState['hosp-1'].items['13'].ssjStatus='รับรองผล';({self:calculateHospitalSummary('hosp-1').total,verified:calculateCertifiedSummary('hosp-1').total})`,frontend());
 assert.equal(r.self.score,2);assert.equal(r.self.count,1);assert.equal(r.verified.score,2);assert.equal(r.verified.approved,1);
});
