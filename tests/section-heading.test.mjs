import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
test('section 34 never contributes scores, attachments, issues or certification counts',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const script=html.split('<script>')[1].split('</script>')[0].replace('    initUI();','');
 const context=vm.createContext({});vm.runInContext(script,context);
 const total=vm.runInContext(`
   hospitalState['hosp-1'].items['34']={result:'ดำเนินการบางส่วน',files:[{name:'legacy'}],ssjStatus:'รับรองผล',ssjComment:'legacy',finding:'',measure:'',responsible:''};
   hospitalState['hosp-1'].items['34.1'].result='ผ่าน';
   hospitalState['hosp-1'].items['34.2'].result='ดำเนินการบางส่วน';
   hospitalState['hosp-1'].items['34.3'].result='ไม่ผ่าน';
   hospitalState['hosp-1'].items['34.1'].files=[{name:'actual evidence'}];
   calculateHospitalSummary('hosp-1').total;
 `,context);
 assert.equal(total.count,3);assert.equal(total.score,3);assert.equal(total.maxScore,6);
 assert.equal(total.itemsWithFiles,1);assert.equal(total.totalFilesCount,1);assert.equal(total.issueCount,2);
 assert.equal(total.ssjApprovedCount,0);assert.equal(total.ssjCommentCount,0);
});
