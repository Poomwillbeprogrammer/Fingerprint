# 📌 Project Scratchpad & Active Context
สถานะปัจจุบันของระบบ: **STABLE / PRODUCTION READY 🟢**

---

### 🚀 สรุปสถานะระบบปัจจุบัน (Current Working State)
* **Arduino UNO Q (STM32 MCU):** เฟิร์มแวร์ C++ เสถียร 100% ควบคุมเซนเซอร์ R307, หน้าจอ SH1106 OLED, ปุ่มกด D2/D3, รายงาน `EVENT:IDLE`, `EVENT:NO_MATCH`, และระบบตรวจจับลายนิ้วมือซ้ำก่อนบันทึก
* **Uno Q Linux SoC:** สคริปต์ `unoq_bridge.py` รันเบื้องหลัง (PID 1331) เรนเดอร์ฟอนต์ไทย Tahoma 11pt คมชัด พร้อมแคชตารางห้อง (`active_room.json`) และประวัติการเช็คชื่อ (`attendance_cache.json`)
* **Cloud Server (Render):** Node.js Express & Socket.IO เซิร์ฟเวอร์รันปกติที่ `https://fingerprint-hrkp.onrender.com` พร้อมระบบจัดการตารางเรียนแยกห้อง (Multi-room Timetable)
* **Database (Supabase):** ฐานข้อมูล PostgreSQL ซิงก์รายชื่อผู้ใช้, ตารางเรียน, และประวัติการสแกน (Access Logs) สมบูรณ์
* **Code Repository:** สาขา `website` บน GitHub ซิงก์ล่าสุดตรงกับระบบที่ติดตั้งจริง

---

### ⚙️ ข้อมูลการเชื่อมต่อที่สำคัญ (Environment Info)
* **Internal IPC Port:** `127.0.0.1:7500` (Baudrate 115200 bps)
* **Sensor Baudrate:** 57600 bps (Serial1 บน Pins 0 RX, 1 TX)
* **OLED Display:** SH1106 I2C Addr `0x3C` (Software I2C บน Pins A4 SDA, A5 SCL)
* **Button Confirm (ยืนยัน):** Pin `D2` (ปุ่มฟ้า) ต่อลง GND (Active LOW, `INPUT_PULLUP`)
* **Button Rescan (สแกนใหม่/ยกเลิก):** Pin `D3` (ปุ่มแดง) ต่อลง GND (Active LOW, `INPUT_PULLUP`)
* **Font Path บนบอร์ด:** `/home/arduino/tahoma.ttf`
* **Local Users Cache:** `/home/arduino/users_cache.json`
* **Local Attendance Cache:** `/home/arduino/attendance_cache.json`
* **Local Offline Queue:** `/home/arduino/offline_queue.json`
* **Active Room Cache:** `/home/arduino/active_room.txt`

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
6. **[TASK-6] ระบบจัดการตารางเรียนแยกห้อง (Multi-Room Timetable) และซิงก์ห้องใช้งาน:** ✅ COMPLETED
   - [x] รองรับการนำเข้าไฟล์ตารางเรียน Excel (.xlsx) พร้อมระบบวิเคราะห์ห้องเรียนอัจฉริยะ (Smart Room Detection)
   - [x] สร้างหน้าจัดการตารางเรียน `schedules.html` และระบบสลับห้องประจำการของเครื่อง Uno Q บน Dashboard
   - [x] ส่งอีเวนต์ `sync_device_room` ซิงก์ชื่อห้องลงบอร์ด Uno Q แบบเรียลไทม์ และบันทึกลง `active_room.json`
   - [x] หน้าจอ Idle บน OLED แสดงแถบสถานะห้องด้านล่าง: `[ <ชื่อห้อง> ] พร้อมใช้งาน` ตลอดเวลา
7. **[TASK-7] ปรับการแสดงผลปุ่มกดตามสีจริง (ปุ่มฟ้า/ปุ่มแดง) และขยายชื่อเต็ม 11pt Bold บน OLED:** ✅ COMPLETED
   - [x] ปรับข้อความแนะนำใต้จอเป็น `[ ปุ่มฟ้า:ยืนยัน | ปุ่มแดง:สแกน ]` ตรงกับสีของปุ่มฮาร์ดแวร์จริง
   - [x] ขยายขนาดฟอนต์ชื่อ-นามสกุลภาษาไทยเป็น 11pt ตัวหนา คมชัด เต็มความกว้างของหน้าจอ
   - [x] ตัดรหัสนักศึกษา 13 หลักออกจากหน้าจอ OLED เพื่อป้องกันปัญหาข้อความล้นจอหรือตกขอบ (รหัสยังคงบันทึกลงฐานข้อมูลอย่างครบถ้วน)
8. **[TASK-8] แคชการลงเวลาประจำวันบนเครื่อง (Local Attendance Cache) ป้องกัน Frame Storm:** ✅ COMPLETED
   - [x] เพิ่มระบบแคช `attendance_cache.json` และตัวแปร `checked_in_records` บน Uno Q Linux
   - [x] เมื่อกดปุ่มฟ้า D2 ยืนยัน ตัวบอร์ดจะส่งเฟรมภาพเพียงครั้งเดียว และไม่ส่งซ้ำเมื่อเซิร์ฟเวอร์ตอบกลับ
   - [x] เพิ่ม Socket handler `get_today_attendance` ใน `server.js` ให้บอร์ดดึงประวัติการเช็คชื่อของวันปัจจุบันมาแคชไว้ตั้งแต่เริ่มเชื่อมต่อ
9. **[TASK-9] ประสานเวลาบู๊ตบอร์ด (Boot Synchronization) และกู้คืนหน้าจออัตโนมัติเมื่อสแกนไม่ผ่าน:** ✅ COMPLETED
   - [x] แก้ไขบั๊กหน้าจอค้าง "READY FOR SCAN" ตอนเปิดเครื่องครั้งแรก โดยให้ STM32 ส่ง `EVENT:IDLE` เมื่อจบ `setup()`
   - [x] เพิ่ม Settling Time 2.0 วินาทีและตัวเฝ้าระวัง (Watchdog 3.5s) ฝั่ง Linux ช่วยการันตีว่าจอจะขึ้นหน้าจอ Idle พร้อมชื่อห้อง 100%
   - [x] จัดการอีเวนต์ `EVENT:NO_MATCH` หน่วงเวลา 1.6 วินาที โชว์หน้าแจ้งเตือนภาษาไทย "ไม่พบข้อมูลลายนิ้วมือ" 3.0 วินาที แล้วกลับสู่หน้าจอ Idle อัตโนมัติ
   - [x] ติดตั้งตัวคุมความเร็วการส่งเฟรมภาพ (Frame Pacing Gap 600ms) และ Bitmap Hash Deduplication ป้องกันคำสั่งชนกันบน UART
10. **[TASK-10] ระบบบันทึกเวลาออฟไลน์และซิงก์ย้อนหลังอัตโนมัติ (Store-and-Forward Offline Attendance Logging):** ✅ COMPLETED
    - [x] จัดทำคิวออฟไลน์ `offline_queue.json` บน Uno Q Linux เก็บประวัติสแกนพร้อมเวลาจริง (Real-Time Timestamp)
    - [x] OLED แจ้งสถานะ `บันทึกออฟไลน์ (รอเน็ต)` เมื่อไม่มีเน็ต และปฏิเสธทันที `ไม่พบข้อมูล (โหมดออฟไลน์)` เมื่อเป็น Tier 1 No Match
    - [x] ระบบ Auto-Sync เบื้องหลังทันทีที่เชื่อมต่อ Wi-Fi สำเร็จ พร้อมกลไก Server ACK ป้องกันข้อมูลสูญหาย
    - [x] Server บันทึกลง Supabase โดยรักษาวันเวลาสแกนจริง และส่งอีเวนต์อัปเดตหน้า Dashboard แบบเรียลไทม์
    - [x] หน้าเว็บแสดงป้ายกำกับสีส้ม `[ซิงก์ออฟไลน์]` และสถานะ `Tier 1 (Offline)`
