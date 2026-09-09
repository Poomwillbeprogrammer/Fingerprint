# 📌 Project Scratchpad & Active Context
สถานะปัจจุบันของระบบ: **STABLE / PRODUCTION READY 🟢**

---

### 🚀 สรุปสถานะระบบปัจจุบัน (Current Working State)
* **Arduino UNO Q (STM32 MCU):** เฟิร์มแวร์ C++ เสถียร 100% ควบคุมเซนเซอร์ R307, หน้าจอ SH1106 OLED, ปุ่มกด D2/D3, และระบบตรวจจับลายนิ้วมือซ้ำก่อนบันทึก
* **Uno Q Linux SoC:** สคริปต์ `unoq_bridge.py` รันเบื้องหลัง (PID 1990) เรนเดอร์ฟอนต์ไทย Tahoma คมชัดสมบูรณ์แบบ และสตรีมภาพ 16-byte chunks ไหลลื่น
* **Cloud Server (Render):** Node.js Express & Socket.IO เซิร์ฟเวอร์รันปกติที่ `https://fingerprint-hrkp.onrender.com`
* **Database (Supabase):** ฐานข้อมูล PostgreSQL ซิงก์รายชื่อผู้ใช้แบบ Realtime และเก็บบันทึกประวัติการสแกน (Access Logs) สมบูรณ์
* **Code Repository:** สาขา `website` บน GitHub ซิงก์ล่าสุดตรงกับระบบที่ติดตั้งจริง

---

### ⚙️ ข้อมูลการเชื่อมต่อที่สำคัญ (Environment Info)
* **Internal IPC Port:** `127.0.0.1:7500` (Baudrate 115200 bps)
* **Sensor Baudrate:** 57600 bps (Serial1 บน Pins 0 RX, 1 TX)
* **OLED Display:** SH1106 I2C Addr `0x3C` (Software I2C บน Pins A4 SDA, A5 SCL)
* **Button Confirm (ยืนยัน):** Pin `D2` ต่อลง GND (Active LOW, `INPUT_PULLUP`)
* **Button Rescan (สแกนใหม่):** Pin `D3` ต่อลง GND (Active LOW, `INPUT_PULLUP`)
* **Font Path บนบอร์ด:** `/home/arduino/tahoma.ttf`
* **Local Cache บนบอร์ด:** `/home/arduino/users_cache.json`

---

### 🎯 ประวัติการพัฒนางานสำคัญ (Sprint History & Completed Tasks)
1. **[TASK-1] เพิ่มปุ่มกด Physical Switch ยืนยันการลงเวลา (Confirm D2 & Rescan D3):** ✅ COMPLETED
   - [x] กำหนด Pin D2 (Confirm) และ D3 (Rescan) ใน `sketch.ino` ด้วย `INPUT_PULLUP`
   - [x] ปรับ State Machine: สแกนติด ➡️ โชว์ชื่อ ➡️ รอ 10 วิ (ถ้ากด D2 ➡️ บันทึก, ถ้ากด D3 หรือครบ 10 วิ ➡️ ยกเลิกอัตโนมัติ)
   - [x] ปรับ UI บน OLED ใน `unoq_bridge.py`: แสดงคำแนะนำ `[D2: ยืนยัน | D3: สแกนใหม่]`
   - [x] หน่วงเวลาแสดงหน้าต่างผลลัพธ์ 3.5 วินาที เพื่อให้ผู้ใช้อ่านชื่อตนเองได้อย่างชัดเจน
2. **[TASK-2] ปรับปรุงระบบลงทะเบียน 3 นิ้วต่อ 1 ผู้ใช้ (3-Finger Enrollment):** ✅ COMPLETED
   - [x] คำนวณ Slot Mapping: `Slot1 = (User-1)*3+1`, `Slot2 = (User-1)*3+2`, `Slot3 = (User-1)*3+3`
   - [x] รองรับผู้ใช้ได้สูงสุด 100 คน (300 Slots) ในหน่วยความจำเซนเซอร์ R307
   - [x] หน้าเว็บมีระบบแนะนำทีละขั้นตอนสด (Step Guidance)
3. **[TASK-3] แก้ไขการซิงค์ Template 3 นิ้วลง Database และป้ายสถานะผู้ใช้บนหน้าเว็บ:** ✅ COMPLETED
   - [x] แก้ไข Slot ID vs User ID Mismatch ใน `TEMPLATE:` handler ของ `server.js`
   - [x] รวม Template ทั้ง 3 นิ้วลงคอลัมน์ `fingerprint_template` และตั้ง `in_sensor = 1`
   - [x] ปรับปรุงฟังก์ชัน Backup และ Restore ให้รองรับ 3 Slot ต่อ 1 ผู้ใช้
   - [x] กู้คืน Template ผู้ใช้ ID #2 (`poppp`) เข้า Supabase สำเร็จ แสดงป้ายสีเขียว **Tier 1** สมบูรณ์
4. **[TASK-4] ระบบ Auto-Rollback ลบข้อมูลใน DB และเซนเซอร์เมื่อยกเลิกหรือล้มเหลว:** ✅ COMPLETED
   - [x] สร้างฟังก์ชันกลาง `cleanupFailedEnroll()` ใน `server.js`
   - [x] สั่ง R307 ลบ Slot 1, 2, 3 ที่บันทึกค้างไว้
   - [x] รัน `DELETE FROM users WHERE id = ?` ใน Supabase ทันที ไม่ทิ้งข้อมูลขยะ
   - [x] ผูกเข้ากับเหตุการณ์กดยกเลิกจากหน้าเว็บ, ปุ่ม X, ปิดหน้าต่าง, หมดเวลา (TIMEOUT), หรือสแกนไม่ผ่าน
5. **[TASK-5] ตรวจจับลายนิ้วมือซ้ำในระดับฮาร์ดแวร์ (Duplicate Fingerprint Rejection):** ✅ COMPLETED
   - [x] ใน `sketch.ino` ขั้นตอนที่ 1 รัน `finger.fingerSearch(1)` ก่อนสร้างโมเดล
   - [x] หากพบนิ้วซ้ำ OLED แสดง "DUPLICATE FINGER" และส่ง `RESP:ENROLL_FAIL_DUPLICATE`
   - [x] Server ค้นหาชื่อเจ้าของนิ้วเดิม และส่งเตือนหน้าเว็บ: `ลายนิ้วมือนี้มีในระบบแล้ว (ตรงกับผู้ใช้ ID #...)`
   - [x] แก้ปัญหาเว็บค้าง: ลูปรอ 10 วินาทีใน Arduino แทรก `if (Serial.available()) break;` ตัดเข้าสู่คำสั่งใหม่ได้ทันที ไม่ค้างอีกต่อไป

