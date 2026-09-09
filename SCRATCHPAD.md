# 📌 Project Scratchpad & Active Context
สถานะปัจจุบันของระบบ: **IN PROGRESS (Active Feature Sprint) 🟡**

---

### 🚀 สรุปสถานะระบบปัจจุบัน (Current Working State)
* **Arduino UNO Q (STM32 MCU):** เฟิร์มแวร์ C++ เสถียร ควบคุมเซนเซอร์ R307 และหน้าจอ SH1106 OLED (กำลังเพิ่มระบบปุ่มกด D2/D3)
* **Uno Q Linux SoC:** สคริปต์ `unoq_bridge.py` รันเบื้องหลัง เรนเดอร์ฟอนต์ไทย Tahoma และสตรีมภาพ 16-byte chunks ได้สมบูรณ์
* **Cloud Server (Render):** เซิร์ฟเวอร์ Node.js Express รันปกติที่ `https://fingerprint-hrkp.onrender.com`
* **Database (Supabase):** ฐานข้อมูล PostgreSQL ซิงก์รายชื่อ 5 คน และบันทึกประวัติการสแกนแบบเรียลไทม์

---

### ⚙️ ข้อมูลการเชื่อมต่อที่สำคัญ (Environment Info)
* **Internal IPC Port:** `127.0.0.1:7500` (Baudrate 115200 bps)
* **Sensor Baudrate:** 57600 bps (Serial1 บน Pins 0 RX, 1 TX)
* **OLED Display:** SH1106 I2C Addr `0x3C` (Software I2C บน Pins A4 SDA, A5 SCL)
* **Button Confirm (ยืนยัน):** Pin `D2` (Active LOW, INPUT_PULLUP)
* **Button Rescan (สแกนใหม่):** Pin `D3` (Active LOW, INPUT_PULLUP)
* **Font Path บนบอร์ด:** `/home/arduino/tahoma.ttf`
* **Local Cache บนบอร์ด:** `/home/arduino/users_cache.json`

---

### 🎯 เป้าหมายปัจจุบันที่กำลังดำเนินการ (Current Sprint)
1. **[TASK-1] เพิ่มปุ่มกด Physical Switch ยืนยันการลงเวลา (Confirm D2 & Rescan D3):** ✅ COMPLETED
   - [x] กำหนด Pin D2 (Confirm) และ D3 (Rescan) ใน `sketch.ino` ด้วย `INPUT_PULLUP`
   - [x] ปรับ State Machine: สแกนติด ➡️ โชว์ชื่อ ➡️ รอ 5 วิ (ถ้ากด D2 ➡️ บันทึก, ถ้ากด D3 หรือครบ 5 วิ ➡️ ยกเลิก)
   - [x] ปรับ UI บน OLED ใน `unoq_bridge.py`: แสดงคำแนะนำ `[D2: ยืนยัน | D3: สแกนใหม่]`
   - [x] สื่อสารกับ Server: เมื่อกด D2 ถึงจะส่ง `log_attendance` ขึ้น Supabase (ปรับ `server.js` เรียบร้อย)
   - [x] Compile และ Upload เฟิร์มแวร์ลง STM32 (COM12) สำเร็จ 100%
   - [x] Deploy `unoq_bridge.py` บน Uno Q Linux SoC และเชื่อมต่อ Socket 7500 สำเร็จ 100%
2. **[TASK-2] ปรับปรุงระบบลงทะเบียน 3 นิ้วต่อ 1 ผู้ใช้ (3-Finger Enrollment):** ✅ COMPLETED
3. **[TASK-3] แก้ไขการซิงค์ Template 3 นิ้วลง Database และป้ายสถานะผู้ใช้บนหน้าเว็บ:** ✅ COMPLETED
   - [x] แก้ไข Slot ID vs User ID Mismatch ใน `TEMPLATE:` handler ของ `server.js`
   - [x] ปรับปรุงการจัดเก็บและรวม Template 3 นิ้วลงคอลัมน์ `fingerprint_template` และตั้ง `in_sensor = 1`
   - [x] ปรับปรุงฟังก์ชัน Backup และ Restore ให้รองรับ 3 Slot ต่อ 1 ผู้ใช้
   - [x] กู้คืน Template ทั้ง 3 นิ้วของผู้ใช้ `poppp` (ID #2) จาก R307 Flash เข้า Supabase สำเร็จ
   - [x] หน้าเว็บแสดงสถานะ "Tier 1 (ในเซนเซอร์)" ป้ายสีเขียวเรียบร้อย 100%

