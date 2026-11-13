# Checklist CFO จังหวัดตรัง

แบบประเมินโรงพยาบาล 10 แห่งจาก HTML ต้นฉบับ เชื่อม Google Sheets และเก็บไฟล์แนบใน Google Drive ผ่าน Apps Script โดยเรียกผ่าน Vercel API

## ระบบที่เผยแพร่

- เว็บ: https://checklist-cfo-trang.vercel.app
- ฐานข้อมูล: https://docs.google.com/spreadsheets/d/1cv8N3jRikfm12h_9ilYkuR--ZPkG__aObvuiDJlQAYU/edit
- โฟลเดอร์ข้อมูล: https://drive.google.com/drive/folders/1vsgucl7xQi6KmLeRJqvNtI3ZnL_1xWbw

รหัสเข้าใช้จัดส่งให้เจ้าของระบบแยกจาก repository ตัวแปรเชื่อมต่อจริงเก็บเป็น Secret ใน production ของ Vercel การ push สาขา `main` จะ deploy อัตโนมัติด้วยค่าตั้งค่าล่าสุด

## โครงสร้าง

- `public/` หน้าเว็บภาษาไทย พร้อมบันทึกอัตโนมัติ สถานะบันทึก สำรอง JSON และโหลดล่าสุด
- `api/checklist.js` ตรวจรหัสเข้าใช้ ออกคุกกี้ HttpOnly และส่งคำขอไป Apps Script โดยไม่เปิดเผย secret ให้เบราว์เซอร์
- `apps-script/Schema.gs` โรงพยาบาลและเกณฑ์ประเมินจากไฟล์ต้นฉบับ
- `apps-script/Code.gs` สร้างฐานข้อมูล อัปโหลดไฟล์ ตรวจรุ่นข้อมูล ป้องกันการบันทึกทับ และเขียนแท็บรายโรงพยาบาล

## ติดตั้ง Apps Script

1. สร้างโปรเจกต์ Apps Script แล้วใส่ `Schema.gs` และ `Code.gs` (หรือรวมเนื้อหาเป็นไฟล์เดียว)
2. เรียก `setup` และอนุญาตสิทธิ์ Sheets/Drive เพื่อสร้างฐานข้อมูลในโฟลเดอร์ที่กำหนด เรียกซ้ำได้โดยไม่ล้างข้อมูล
3. Deploy เป็น Web app โดย Execute as Me และเข้าถึงได้แบบ Anyone; ทุกคำขอข้อมูลต้องมี `API_SECRET` ที่ตรวจฝั่งเซิร์ฟเวอร์ การเผยแพร่ URL ไม่ได้ทำให้ Drive/Sheets เป็นสาธารณะ
4. ตั้ง `APPS_SCRIPT_URL` เป็น URL `/exec` และ `APPS_SCRIPT_SECRET` ให้ตรงกับ `API_SECRET` ใน Script Properties

## Vercel

เชื่อม GitHub repository ตั้ง Framework เป็น Other, Output Directory เป็น `public` และ Node.js 22

ตั้ง environment variables ฝั่งเซิร์ฟเวอร์: `APPS_SCRIPT_URL`, `APPS_SCRIPT_SECRET`, `ACCESS_CODE` (รหัสร่วมสำหรับผู้ใช้งานที่ได้รับอนุญาต) และ `SESSION_SECRET` (ค่าสุ่มยาว) ห้าม commit ค่าจริงเข้า GitHub

## พฤติกรรมและข้อจำกัด

- ข้อมูลปัจจุบันของแต่ละโรงพยาบาลเก็บใน `_State` และแสดงเป็นตารางใน `hosp-1` ถึง `hosp-10`; แท็บ `โรงพยาบาล` เก็บผู้ประเมิน รอบ วันที่ และสถานะส่ง
- ข้อมูลแก้ผ่านเว็บเป็นหลัก ตารางรายโรงพยาบาลเป็นข้อมูลที่ระบบสร้างจาก snapshot การแก้ตารางเองจะไม่อัปเดต snapshot
- แต่ละโรงพยาบาลมีแบบประเมินปัจจุบันหนึ่งชุด รอบประเมินเป็นข้อมูลกำกับ การเปลี่ยนรอบไม่ได้สร้างประวัติชุดใหม่
- ทุกผู้ที่ทราบรหัสร่วมสามารถดู/แก้ไขทั้ง 10 โรงพยาบาล ระบบนี้ยังไม่แยกสิทธิ์รายโรงพยาบาลหรือผู้ตรวจ
- ไฟล์แนบแยก `โรงพยาบาล/ข้อประเมิน/` รองรับ PDF, PNG/JPG/WEBP, Word, Excel, CSV, TXT, ZIP ขนาดสูงสุด 3 MB ต่อไฟล์ สูงสุด 30 ไฟล์ต่อข้อ
- เปิดไฟล์ต้องมีสิทธิ์ Drive เดิม ระบบไม่เปลี่ยนการแชร์ไฟล์เป็นสาธารณะ
- ลบลิงก์จากแบบประเมินไม่ลบไฟล์ใน Drive เพื่อรักษาต้นฉบับ ไฟล์อัปโหลดที่ยังไม่บันทึกอาจคงอยู่ในโฟลเดอร์
- หากเกิดข้อมูลชนกัน ระบบหยุดบันทึกและให้สำรอง JSON ก่อนโหลดล่าสุด; ข้อมูลที่ยังไม่บันทึกอยู่เฉพาะหน้าเว็บ
- Google Apps Script มีโควตาและเวลาประมวลผลจำกัด เหมาะกับการใช้งานภายในปริมาณไม่สูง

เอกสารอ้างอิง: [Apps Script Web Apps](https://developers.google.com/apps-script/guides/web), [Content Service](https://developers.google.com/apps-script/guides/content), [Vercel Functions limits](https://vercel.com/docs/functions/limitations)

ทดสอบโค้ดด้วย `npm test`
