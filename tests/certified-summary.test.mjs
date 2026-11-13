import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function context(){const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');const code=html.split('<script>')[1].split('</script>')[0].replace('    initUI();','');const c=vm.createContext({});vm.runInContext(code,c);return c;}
test('certified summary uses only accepted numeric results and preserves self assessment',()=>{
 const c=context();const result=vm.runInContext(`
  const values=hospitalState['hosp-1'].items;
  values['34'].result='ผ่าน';values['34'].ssjStatus='รับรองผล';
  values['1'].result='ผ่าน';values['1'].ssjStatus='รับรองผล';
  values['2'].result='ดำเนินการบางส่วน';values['2'].ssjStatus='รับรองผล';
  values['3'].result='ผ่าน';values['3'].ssjStatus='ให้แก้ไข/เพิ่มเติมหลักฐาน';
  values['4'].result='ไม่ผ่าน';values['4'].ssjStatus='ไม่รับรองผล';
  values['5'].result='ผ่าน';
  values['6'].result='ไม่เกี่ยวข้อง';values['6'].ssjStatus='รับรองผล';
  values['7'].ssjStatus='รับรองผล';
  ({certified:calculateCertifiedSummary('hosp-1'),self:calculateHospitalSummary('hosp-1')});
 `,c);
 const t=result.certified.total;assert.equal(t.expected,43);assert.equal(t.assessed,6);assert.equal(t.approved,4);
 assert.equal(t.revision,1);assert.equal(t.rejected,1);assert.equal(t.pending,37);
 assert.equal(t.score,3);assert.equal(t.maxScore,4);assert.equal(t.percent,75);assert.equal(t.grade.text,'พอใช้');
 assert.equal(t.approvedNA,1);assert.equal(t.missingScores,1);assert.equal(result.self.total.score,7);assert.equal(result.self.total.maxScore,10);
 assert.equal(result.certified.byTopic.reduce((n,row)=>n+row.score,0),t.score);
});
test('no certifications means no score or grade, with all assessable items pending',()=>{
 const t=vm.runInContext("calculateCertifiedSummary('hosp-2').total",context());assert.equal(t.expected,43);assert.equal(t.pending,43);assert.equal(t.scored,0);assert.equal(t.percent,null);assert.equal(t.grade,null);
});
