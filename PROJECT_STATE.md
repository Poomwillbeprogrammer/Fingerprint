# 📌 สถานะโปรเจกต์และบริบทระบบ (PROJECT STATE)
**ระบบลงเวลาเรียนด้วยลายนิ้วมืออัจฉริยะ (IoT Biometric Attendance System - RMUTL)**
*อัปเดตล่าสุด: 15 กันยายน 2569 (พร้อมสำหรับการต่อยอดใน Session ถัดไป)*

---

## 1. สิ่งที่ทำเสร็จแล้ว (Completed Work)

### 1.1 ระบบฮาร์ดแวร์และการแสดงผลบนอุปกรณ์ (IoT Hardware & Uno Q Bridge)
- **Host-Side TrueType Thai Rendering:** เรนเดอร์ภาษาไทยและชื่อ-นามสกุลนักศึกษาคมชัดลงจอ OLED 128x64 ผ่าน Python Pillow (`tahoma.ttf`) บนบอร์ด Arduino UNO Q (Linux side) ไม่พึ่งพาตารางบิตแมปในไมโครคอนโทรลเลอร์
- **16-Byte Pacing & Quiet UART Protocol:** แบ่งส่งข้อมูลภาพเฟรมละ 1,024 ไบต์ เป็นชิ้นละ 16 ไบต์ (หน่วง 6ms) เพื่อป้องกันบัฟเฟอร์ RX FIFO (64 ไบต์) ของ Zephyr OS บน STM32 ล้น พร้อมโหมดเงียบเสียง UART ป้องกันเฟรมแตก/ภาพแหว่ง
- **2-Step Verification:** ระบบยืนยันตัวตน 2 ชั้น (แตะลายนิ้วมือ R307 + กดยืนยันปุ่มฟ้า D2 หรือยกเลิก/สแกนใหม่ปุ่มแดง D3) พร้อม Auto-Cancel หลัง 10 วินาที ป้องกันการสวมสิทธิ์ 100%
- **3-Finger Biometric Redundancy:** ผู้ใช้ 1 คน ผูก 3 ลายนิ้วมือในเซนเซอร์ R307 รองรับกรณีลายนิ้วมือเปียก/ถลอก พร้อมระบบ Pre-enroll duplicate check ป้องกันการบันทึกนิ้วซ้ำ และ Auto-Rollback ลบข้อมูลทันทีหากการลงทะเบียนถูกยกเลิก
- **Hardware Sensor Health Detection:** แยกสถานะการเชื่อมต่อระหว่าง Cloud Bridge กับเซนเซอร์ R307 ออกจากกันอย่างแท้จริง ผ่านคำสั่ง `CHECK_R307` / `verifyPassword()` พร้อมระบบ Fail-Fast สกัดการลงทะเบียนล่วงหน้าหากไม่พบเซนเซอร์
- **Store-and-Forward Offline Attendance:** สามารถสแกนและบันทึกเวลาเรียนได้ทันทีแม้ห้องเรียนไม่มีเน็ต (<1ms) ผ่าน Local Cache (`users_cache.json`, `attendance_cache.json`, `offline_queue.json`) และระบบจะทำการ Background Auto-Sync ข้อมูลขึ้น Cloud ทันทีที่เชื่อมต่อ Wi-Fi สำเร็จ
- **OLED Sharpness Optimization & Zero-Offset Alignment:** ปรับปรุงไดรเวอร์ SH1106 ในเฟิร์มแวร์ STM32 ด้วยคำสั่งควบคุมแบบต่อเนื่องในทรานแซกชันเดียว (`sendCommand2`) บังคับค่า Display Offset เป็น 0x00 แก้ปัญหาภาพเลื่อนลง พร้อมปรับเพิ่ม Contrast เป็น 0xCF, ปรับแต่ง Pre-charge และ VCOM ให้ภาพสว่างคมชัดสมบูรณ์แบบ ควบคู่กับการปรับระยะ Margin ล่างใน `unoq_bridge.py` ป้องกันข้อความชนขอบจอ
- **3-Tier Independent Hardware Health Monitoring (ADR-027):** แยกรายงานสถานะฮาร์ดแวร์ 3 องค์ประกอบอิสระ (Cloud Bridge, เซนเซอร์ R307, จอ OLED SH1106) พร้อมระบบ I2C Bus Detection ตรวจจับการต่อจออัตโนมัติ และรองรับโหมดไม่มีจอ (Headless Operation) โดยไม่บล็อกหรือหน่วงการทำงานของระบบ
- **Physical Confirmation & Duplicate Check Resilience (ADR-028) [แก้ไขเสร็จสมบูรณ์ 100%]:** 
  - **STM32 Firmware (`sketch.ino`):** ปรับปรุงลูปตรวจจับปุ่มกด D2/D3 ให้ตอบกลับคำสั่งสถานะฮาร์ดแวร์ `CHECK_R307` / `CHECK_HARDWARE` จาก Background Watchdog แบบ In-place โดยไม่หลุดออกจากลูปตรวจจับปุ่มกด ช่วยให้กดยืนยันปุ่ม D2 ได้ทันที ไม่ถูก Watchdog ยกเลิก คอมไพล์และอัปโหลดเข้าบอร์ด STM32 ผ่าน OpenOCD (`COM12`) เรียบร้อย
  - **Uno Q Linux Bridge (`unoq_bridge.py`):** แก้ไข Indentation Bug ใน `on_bridge_scan_match` ให้เรียก `send_bitmap_to_mcu` เสมอแม้กรณีตรวจพบว่าลงเวลาซ้ำ เพื่อให้หน้าจอ OLED แสดงภาพแจ้งเตือนการลงเวลาซ้ำเสมอ ไม่ค้างอยู่ที่การ์ดนักศึกษา พร้อมเพิ่ม Watchdog Interlock `is_awaiting_confirmation` ชะลอการยิงคำสั่งตรวจเช็คฮาร์ดแวร์ขณะรอกดปุ่มยืนยัน
  - **Hardware Sync & Cache Purge:** ล้างแคชค้างเก่าบนบอร์ด Uno Q ผ่าน ADB (`rm -f /home/arduino/attendance_cache.json`) และอัปเดตระบบซิงก์ประวัติการลงเวลากับ Cloud Database ให้แม่นยำ 100% โดยสคริปต์บริดจ์ทำงานเป็น Daemon พร้อมทำงานตลอดเวลา (PID 11985 รายงานสถานะ `R307=READY OLED=READY`)
- **Full-Color 1.8" TFT SPI (ST7735 128x160) Migration (ADR-029) [เสร็จสมบูรณ์]:**
  - **ไดรเวอร์ ST7735 แบบ Zero-Dependency (`sketch.ino`):** พัฒนาคลาสไดรเวอร์ SPI C++ ในตัวโดยตรงโดยไม่ต้องพึ่งพาไลบรารีภายนอก ปราศจากปัญหาความเข้ากันไม่ได้บน Zephyr OS บน Arduino UNO Q ควบคุมพิน D8 (RST), D9 (DC), D10 (CS), D11 (MOSI), D13 (SCK)
  - **1-Bit Raster Bitpacking 2,560 ไบต์ พร้อม Dynamic Palette:** ขยายความละเอียดเป็น 128x160 พิกเซล โดยยังคงความคมชัดของภาษาไทย TrueType ผ่าน Pillow บนฝั่ง Linux SoC และส่งผ่าน 16-Byte Chunking Protocol (160 ชิ้น) ปลอดภัยต่อ UART FIFO 64 ไบต์ 100%
  - **ระบบชุดสี RMUTL Theme:** แสดงแถบสถานะและหัวข้อด้วยสีทอง RMUTL Gold (`0xFD20`), พื้นหลัง Espresso (`0x0821`), สีเขียวมรกต (`0x1E10`) เมื่อบันทึกสำเร็จ และสีแดง (`0xF9F8`) เมื่อปฏิเสธหรือยกเลิก
  - **UI Dashboard Alignment:** อัปเดต Hardware Status Card บนเว็บเป็น `จอแสดงผล TFT 1.8"` พร้อมซัพพอร์ตทั้ง `OLED=READY` และ `TFT=READY` แบบไร้รอยต่อ
- **160x128 Landscape Mode & Zone-Based Multi-Color Theming (ADR-030) [เสร็จสมบูรณ์ 100%]:**
  - **Hardware-Accelerated 180° Flip (`sketch.ino`):** ปรับตั้ง ST7735 MADCTL (`0x36`) เป็น `0x60` หมุนหน้าจอเป็นแนวนอน 160x128 ทิศทางถูกต้อง หัวข้ออยู่ขอบบน และแถบปุ่มกดอยู่ขอบล่าง สอดคล้องกับการติดตั้งจอจริง
  - **Zone-Based Multi-Color Rendering:** จัดแบ่งหน้าจอเป็น 3 โซน (Header, Body, Footer) พร้อมแมปสีระดับพิกเซลตามธีม `DESIGN.md`: แถบหัวสีทอง/เขียวมรกต/แดง, ชื่อนักศึกษาขาวบริสุทธิ์ (`0xFFFF`), รหัสวิชาสีอำพัน (`0xFBE0`), ปุ่มฟ้า D2 ยืนยัน (`0x3DFE`) และปุ่มแดง D3 ยกเลิก (`0xF9F8`)
  - **TrueType Thai Landscape Re-layout (`unoq_bridge.py`):** ออกแบบทั้ง 7 หน้าจอใหม่บนสัดส่วน 160x128 แนวนอน รองรับชื่อยาวและวิชาได้ครบถ้วนโดยไม่ตกหล่น และส่งต่อบิตแมป 2,560 ไบต์ผ่าน UART ได้อย่างราบรื่นรวดเร็ว
- **Non-blocking Finger-Release Architecture & Resilient UART Handshake (ADR-032) [เสร็จสมบูรณ์ 100%]:**
  - **ขจัดปัญหาหน้าจอค้างทุกกรณี (Zero Screen Freeze):** แก้ปัญหาหน้าจอค้างที่ "✓ บันทึกเวลาสำเร็จ ✓" หลังสแกนผ่าน, ค้างที่ "Checking Tier 2..." เมื่อไม่พบลายนิ้วมือ, และค้างที่ "ID #15 REMOVED" เมื่อกดยกเลิกการลงทะเบียน
  - **สถาปัตยกรรม `fingerHeld` แบบ Non-blocking (`sketch.ino`):** ใช้แฟล็ก `fingerHeld` ควบคุม `scanFingerprint()` ใน `loop()` โดยไม่มีลูปบล็อคกิ้ง `while` รอปล่อยนิ้ว ทำให้ STM32 สามารถอ่านและประมวลผลคำสั่ง Serial จาก Linux ได้ตลอดเวลา 100%
  - **Silent Background Delete:** ปรับฟังก์ชัน `handleDelete` ให้ทำงานแบบเบื้องหลังเงียบสนิท ไม่เรียก `showUI` หรือหน่วงเวลา `delay(2500)` ทำให้การ Auto-Rollback ตอนยกเลิกลงทะเบียนเสร็จสิ้นในเสี้ยววินาทีโดยไม่รบกวนหน้าจอ TFT
  - **Rock-Solid 200ms Frame Handshake & Inter-frame Pacing (`unoq_bridge.py`):** ฟื้นฟู `initial_wait=0.20` และการหน่วง 150ms ก่อนส่งเฟรมภาพ เพื่อป้องกัน UART RX FIFO (64 ไบต์) บน Zephyr OS ล้น พร้อมแก้ไขการประกาศตัวแปร Global ป้องกัน `UnboundLocalError` อย่างสมบูรณ์
- **Resilient Multi-Level Enrollment & Per-Finger Retry (ADR-033) [เสร็จสมบูรณ์ 100%]:**
  - **Level 1 (STM32 Firmware In-Place Step 2 Retry):** ลูป Step 2 retry สูงสุด 3 ครั้งเมื่อภาพเบลอหรือลายนิ้วมือไม่ตรงกัน โดยไม่ต้องเริ่ม Step 1 ใหม่ รักษา Buffer 1 ไว้ในแรม พร้อมแสดงข้อความและรอบการลองใหม่ชัดเจนบนจอ TFT (`Retry (2/3): Place SAME finger again`)
  - **Level 2 (Server Non-Destructive State Machine):** พัฒนาโมดูล `EnrollmentSession` (`server/enrollment_manager.js`) เปลี่ยนสถานะเป็น `FINGER_FAILED` เมื่อนิ้วใดนิ้วหนึ่งไม่ผ่าน โดยรักษานิ้วที่สำเร็จแล้วไว้ ไม่ลบผู้ใช้ใน DB และรองรับ Socket Event `retry_current_finger` เพื่อเริ่มสแกนเฉพาะนิ้วนั้นใหม่อีกครั้ง
  - **Level 3 (Web UI Interactive Retry):** เพิ่มกล่องแจ้งเตือน `#retryActionBox` ใน `users.html` และ `app.js` พร้อมปุ่มกดลองสแกนนิ้วเดิมใหม่ และแสดงจำนวนนิ้วที่บันทึกสำเร็จแล้ว
  - **TDD Verification:** พัฒนาชุดทดสอบ `tests/test_enrollment_manager.js` ผ่านการทดสอบครบถ้วน 7/7 รายการ (รวมชุดทดสอบทั้งระบบ 20/20 ใน `npm test` และ 14/14 ใน Python `unittest`)

### 1.2 ระบบคลาวด์ ความปลอดภัย และการจัดการตารางเรียน (Cloud Backend & Attendance Engine)
- **สถาปัตยกรรม Hybrid Database:** ใช้ Supabase Cloud PostgreSQL เป็นศูนย์กลางข้อมูลหลัก ผสานกับ Local JSON Cache บนเครื่องลูกข่าย
- **Zero-Trust Security Hardening:**
  - ลบ Hardcoded Secrets ทั้งหมดในโค้ด ย้ายไปควบคุมผ่าน Environment Variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `BRIDGE_TOKEN`)
  - รหัสผ่าน Admin เข้ารหัสด้วย bcrypt พร้อมระบบป้องกัน Brute Force (`express-rate-limit` 5 ครั้ง/นาที/IP) และ Cookie แบบ `httpOnly`, `sameSite: 'strict'`, `secure: true`
  - ลบข้อความแจ้งรหัสผ่านเริ่มต้นออกจากหน้าล็อกอิน
  - บังคับใช้สิทธิ์ `authRequired` บนทุก API Endpoint ป้องกันข้อมูลนักศึกษาและตารางเรียนรั่วไหล
  - คัดกรองการเชื่อมต่อ Socket.IO Handshake แยกสิทธิ์ชัดเจนระหว่าง Web Admin (JWT Token) และ Hardware Bridge (`BRIDGE_TOKEN`)
- **การจัดการตารางเรียนอัจฉริยะ (Multi-Room Timetable Manager):**
  - นำเข้าตารางเรียนจากไฟล์ Excel (.xlsx) ด้วยระบบ 2-Step Preview & Confirm พร้อมฟังก์ชัน Smart Room Detection วิเคราะห์ห้องเรียนและคาบเรียนอัตโนมัติ
  - สลับห้องประจำการของเครื่องสแกนจาก Dashboard แบบเรียลไทม์ และส่งชื่อห้องไปแสดงบนจอ OLED ทันที
  - คำนวณคาบเรียนปัจจุบันและคาบถัดไป ตรวจสอบเวลาเข้าเรียนตรงเวลา vs มาสาย (>15 นาที) พร้อมคำนวณคะแนน
  - **Multi-Room Persistence & Supabase Single Source of Truth (ADR-022, ADR-023, ADR-024):** 
    - ยึดหลัก **Single Source of Truth**: ให้ Supabase Cloud Database (`room_schedules` และ `session_attendance`) เป็นแหล่งข้อมูลถาวรเพียงหนึ่งเดียว
    - บันทึกและสืบค้นผ่าน In-Memory Storage Cache ใน RAM เพื่อการตอบสนองระดับเศษส่วนมิลลิวินาที (Sub-millisecond) สำหรับ Uno Q และ Socket.IO
    - ขจัดโค้ดซ้ำซ้อน (Spaghetti Code) และตัดการอ่าน/เขียนไฟล์ดิสก์ชั่วคราวบน Render ทิ้งทั้งหมด
    - บรรจุห้องเรียนตั้งต้นครบทั้ง 3 ห้อง (ทค.1-101, ทค.1-301, และ ทค.1-201 รวม 60 คาบ) ใน `room_schedules.seed.json` สำหรับใช้เป็น Initial Bootstrap Template เฉพาะกรณีเปิดฐานข้อมูลใหม่
    - เพิ่มฟังก์ชัน `getScheduleById(id)` ค้นหาวิชาจากทุกห้องในระบบ และปรับปรุง `server.js` (เส้นทาง `/export-excel`, `/export-matrix`, และอีเวนต์ `sync_offline_attendance`) ให้ใช้ `getScheduleById` แทน `getAllSchedules().find` ป้องกันปัญหาชื่อไฟล์และข้อมูลวิชาสูญหาย
- **ระบบบันทึกเวลาเรียนแบบรายสัปดาห์ (Weekly Attendance Segmentation):**
  - คำนวณสัปดาห์ตามปฏิทินสากล ISO-8601 (`week_number`, `year`, `year_week`) อิงตามเวลาประเทศไทย (UTC+7) อัตโนมัติ พร้อมแสดงช่วงวันภาษาไทย (เช่น `7 - 13 ก.ย. 2569`)
  - **Weekly Duplicate Prevention Rule:** สแกนเข้าเรียนได้สัปดาห์ละ 1 ครั้งต่อวิชา เมื่อขึ้นสัปดาห์ใหม่สามารถสแกนได้ทันทีโดยไม่ติดประวัติเดิม และแจ้งเตือนหากสแกนซ้ำภายในสัปดาห์เดียวกัน
  - **Dual Excel Export:**
    1. ส่งออกเฉพาะสัปดาห์ที่เลือก (.xlsx)
    2. ส่งออกสรุปภาพรวมทุกสัปดาห์ (Academic Matrix .xlsx) ดึงเฉพาะนักศึกษาที่มีประวัติการลงเวลาในวิชานั้นจริง (ไม่ดึงคนที่ไม่เกี่ยวข้องในระบบมาปน) และไม่ตีตราสถานะ "ขาด" สรุปเฉพาะ "มาตรงเวลา", "มาสาย", และ "รวมเข้าเรียนทั้งหมด" ตามข้อกำหนดล่าสุด
- **การแยกแยะบริบทการบันทึกเวลา (In-Schedule vs Out-of-Schedule Domain Rules):**
  - **ในคาบเรียน (In-Schedule Attendance):** เมื่อสแกนตรงกับคาบเรียนที่กำลังสอนในห้องนั้น (เช่น วิชา 32090207 ในวันจันทร์ 11:00-13:00 หรือ อังคาร 15:00-17:00) ระบบจะบันทึกลงตาราง `session_attendance` คำนวณสถานะมาตรงเวลา/สาย และบังคับใช้การป้องกันสแกนซ้ำรายสัปดาห์
  - **นอกคาบเรียน (Out-of-Schedule / General Access):** เมื่อสแกนนอกช่วงเวลาของตารางสอน ระบบจะจัดเป็น "นอกเวลาเรียน (General)" และบันทึกลงตาราง `access_logs` (ประวัติการเข้า-ออกห้องทั่วไป) โดยไม่นำไปปะปนในสมุดบันทึกเวลาเรียนของรายวิชา ทำให้กดยืนยันบันทึกได้ตลอดเวลาโดยไม่ติดข้อจำกัดสแกนซ้ำรายสัปดาห์ของวิชาเรียน

### 1.3 หน้าเว็บแดชบอร์ดและประสบการณ์ผู้ใช้ (Web UI & Experience)
- **RMUTL Golden Brown Dark Theme:** ปรับโทนสีทั้งระบบเป็นสีน้ำตาลทองและสีเอสเพรสโซ่อบอุ่น (Warm Espresso & Golden Bronze) ตามอัตลักษณ์ มทร.ล้านนา
- **3-Tier Hardware Status Sidebar Card:** ปรับปรุงแถบสถานะด้านซ้าย แยกรายงานสถานะ 3 บรรทัดชัดเจน: Cloud Bridge, เซนเซอร์ R307, และ จอ OLED พร้อมระบุสถานะ "ไม่มีจอ / ปิด" อย่างเป็นกลาง ไม่รบกวนผู้ใช้ในโหมด Headless
- **Typography & Responsive Layout:** ใช้แบบอักษร Prompt สำหรับข้อความภาษาไทย และ JetBrains Mono สำหรับตัวเลข รหัส และข้อมูลเทคนิค พร้อมรองรับการใช้งานบนมือถือ (Mobile Drawer & Responsive Sidebar)
- **Interactive Attendance Modal:** มี Week Selector เลือกดูประวัติย้อนหลังทีละสัปดาห์, แสดง 3 Metric Counters ประจำสัปดาห์แบบไดนามิก และตารางแสดงวันที่ เวลา สถานะ คะแนน แบบเรียลไทม์
- **UX Resilience & Dynamic Room Query:** มี Error State, ปุ่ม Retry เมื่อโหลดข้อมูลไม่สำเร็จ, ป้ายสถานะ `[ซิงก์ออฟไลน์]`, ระบบแจ้งเตือน Toast Message และระบบเชื่อมโยงห้องเรียนแบบไดนามิก (`/schedules.html?room=...`) นำทางจาก Live Dashboard ตรงสู่ห้องปัจจุบันทันทีโดยไม่เด้งกลับห้องเดิม

### 1.4 การปรับปรุงโค้ดและขจัดความซับซ้อนส่วนเกิน (Codebase Streamlining & De-bloat)
- ขจัดโค้ดตารางฟอนต์บิตแมปและฟังก์ชันวาดตัวอักษรไทยที่ไม่ได้ใช้งานออกจากเฟิร์มแวร์ C++ (`sketch/sketch.ino` และ `sketch/thai_font.h`) คืนทรัพยากร Flash/RAM บน STM32
- ลบไฟล์โปรโตไทป์เก่า `python/main.py` (MicroPython ยุคก่อน Linux SoC)
- ลบ `server/card_renderer.js` และตัด 4 แพ็กเกจขยะใน `server/package.json` (`@napi-rs/canvas`, `sqlite3`, `@tailwindcss/vite`, `tailwindcss`) ทำให้ขั้นตอน build/deploy บน Render รวดเร็วและปราศจากปัญหา native build
- ใช้ `fs.readFileSync` มาตรฐานใน `schedules_manager.js` แทนการจัดการ file descriptor ด้วยตนเอง
- ลบสคริปต์ทดสอบเก่า `server/seed.js` เพื่อกำจัดความเสี่ยงต่อการลบฐานข้อมูล Production และลดความซับซ้อนของโค้ด
- ขจัดการเขียนไฟล์ดิสก์ชั่วคราวซ้ำซ้อนบน Render และตัดไฟล์ขยะ `server/data/room_schedules.json` ออกจากระบบ

### 1.5 ชุดทดสอบอัตโนมัติ (Automated Testing Suites - Python & Node.js)
- **Python Bridge Test Suite (`tests/test_unoq_bridge.py`):**
  - พัฒนาชุดทดสอบ Unit Test 14 รายการผ่าน `unittest` ครอบคลุม:
    1. สูตรคำนวณ Slot ลายนิ้วมือ 3-Finger Redundancy `(slot_id - 1) // 3 + 1` และ Boundary/Invalid ID
    2. ระบบป้องกันการสแกนซ้ำรายวันและแคชประวัติ (`record_check_in` / `is_already_checked_in`)
    3. ตรรกะคิวออฟไลน์ (Store-and-forward Offline Queue Persistence & Crash Recovery)
    4. กฎความปลอดภัยของโปรโตคอล 16-Byte Chunking (Zephyr UART 64-Byte FIFO Invariant) ตรวจสอบความยาวทุกคำสั่ง `FRAME_DATA` ว่าไม่เกิน 64 ไบต์ และแปลงกลับครบ 2,560 ไบต์ 100%
    5. ตรรกะการประเมินคาบเรียนและช่วงเวลาสแกนล่วงหน้า 15 นาที (`get_active_schedule`)
  - รองรับการรันทั้งบนเครื่องพัฒนาและรันตรงบนฮาร์ดแวร์บอร์ด Uno Q Linux ผ่าน ADB (`python3 -m unittest test_unoq_bridge.py` ผ่าน 14/14 ใน 0.020s)
- **Node.js Schedules & Attendance Test Suite (`tests/test_schedules_manager.js`):**
  - พัฒนาชุดทดสอบ 13 รายการผ่าน Node.js Native Test Runner (`node:test` และ `node:assert`) ครอบคลุม:
    1. การคำนวณสัปดาห์ปฏิทินสากล ISO-8601 (`getIsoWeekDetails`, `yearWeek`, Monday-Sunday week bounds)
    2. การจัดรูปแบบช่วงวันภาษาไทยปีพุทธศักราช (`getWeekRangeText` เช่น "14 - 20 ก.ย. 2569")
    3. ตัวย่อชื่อวิชาสำหรับหน้าจอ (`generateShortName`)
    4. ตารางแมปวันภาษาไทย 7 วัน (`DAY_MAP` / `DAY_NAMES`)
    5. กฎการแยกสัปดาห์เข้าเรียน (Weekly Attendance Isolation Rule) ตาม `GEMINI.md`
  - สั่งรันได้ทันทีผ่าน `npm test` ในโฟลเดอร์ `server/`
- **Node.js Multi-Finger Resilient Enrollment Test Suite (`tests/test_enrollment_manager.js`) [TDD]:**
  - พัฒนาชุดทดสอบ 7 รายการตามระเบียบวิธี TDD ผ่าน Node.js Native Test Runner ครอบคลุม:
    1. การคำนวณ 3 Slots ต่อคนแบบอัตโนมัติตาม ID ผู้ใช้
    2. การเปลี่ยนผ่านสถานะเมื่อนิ้วที่ 1 สำเร็จไปยังนิ้วที่ 2
    3. การรักษาสถานะนิ้วก่อนหน้าเมื่อนิ้วถัดไปล้มเหลว (Non-destructive failure) โดยไม่ล้างนิ้วที่สำเร็จแล้ว
    4. คำสั่ง `retryCurrentFinger` คืนสถานะ `IN_PROGRESS` เฉพาะ Slot นิ้วที่ล้มเหลวเดิม
    5. การสแกนนิ้วที่ 2 ผ่านหลังการ retry แล้วขยับสู่นิ้วที่ 3 ได้อย่างถูกต้อง
    6. การบันทึกครบทรัพย์ 3 นิ้วและจบเซสชันแบบสมบูรณ์
    7. การคำนวณ Slot ที่ต้อง Rollback เฉพาะรายการที่บันทึกไปแล้วเมื่อกดยกเลิกจริง
  - ทดสอบผ่านฉลุย 7/7 รายการ รวมทั้งสิ้น 20/20 รายการใน `npm test`
- **Hermetic Unit Testing Seam (ADR-034):**
  - สร้าง Seam ตัดขาดการติดต่อเครือข่ายภายนอกระหว่างรัน `npm test` ด้วย `setSupabaseClient(null)` ทำให้ชุดทดสอบรันแบบ Hermetic 100% ปราศจาก Warning `Unregistered API key` และลดเวลารันเทสลงเหลือ ~670ms พร้อมปรับ `database.js` ให้ใช้การ Throw Error แทน `process.exit(1)` เพื่อความยืดหยุ่นในการจัดการข้อผิดพลาด

---

## 2. ไฟล์หลักๆ และโครงสร้างโปรเจกต์ (Core Files & Architecture)

```
Fingerprint/
├── unoq_bridge.py             # สคริปต์บริดจ์หลักบน Arduino Uno Q Linux (Python)
│                              # - ควบคุม UART ติดต่อ STM32
│                              # - เชื่อมต่อ Socket.IO Client ไปยัง Cloud
│                              # - เรนเดอร์ภาษาไทย TFT 160x128 Landscape ด้วย Pillow พร้อม Dynamic Palette
│                              # - จัดการ Offline Queue และ Local Attendance Cache
│                              # - ตรวจเช็คสุขภาพฮาร์ดแวร์ R307 (Watchdog)
│
├── sketch/
│   └── sketch.ino             # เฟิร์มแวร์ C++ บนไมโครคอนโทรลเลอร์ STM32 (Uno Q)
│                              # - ขับเซนเซอร์ R307 และจอ 1.8" TFT SPI 160x128 Landscape (ST7735)
│                              # - ตรวจจับปุ่มกด D2 (Confirm) / D3 (Rescan)
│                              # - ลูป Step 2 Retry 1..3 ครั้งในตัว ไม่ต้องเริ่ม Step 1 ใหม่
│                              # - รับคำสั่งภาพแบบ 16-Byte Chunking (2,560 ไบต์) พร้อม Zone-based Theming
│                              # - รองรับคำสั่ง CHECK_R307 ตรวจจับเซนเซอร์
│
├── server/
│   ├── server.js              # เมนเซิร์ฟเวอร์ Node.js + Express + Socket.IO
│   │                          # - จุดรวม API Endpoints ทั้งหมดพร้อม Middleware รักษาความปลอดภัย
│   │                          # - จัดการ Real-time Events (สแกน, ลงเวลา, ซิงก์แคช, ตรวจสอบซ้ำ)
│   │                          # - จัดการโหมด Serial (Local) และ Cloud Bridge
│   │                          # - เชื่อมต่อ EnrollmentSession รองรับการลองสแกนนิ้วซ้ำเฉพาะนิ้วที่ล้มเหลว
│   │
│   ├── enrollment_manager.js  # โมดูล State Machine ดูแลการลงทะเบียน 3 นิ้วแบบ Non-destructive Retry
│   │                          # - ป้องกันการ Auto-Rollback นิ้วที่บันทึกผ่านไปแล้ว
│   │                          # - รองรับการลองใหม่เฉพาะนิ้ว (Per-Finger Retry)
│   │
│   ├── schedules_manager.js   # ขุมพลังจัดการตารางเรียนและการลงเวลา (Single Source of Truth)
│   │                          # - เชื่อมต่อ Supabase Cloud Database (room_schedules & session_attendance)
│   │                          # - นำเข้าและแปลงไฟล์ Excel ตารางสอน (.xlsx)
│   │                          # - คำนวณคาบเรียนปัจจุบัน และสัปดาห์ ISO-8601
│   │                          # - ตรวจสอบการเช็คชื่อซ้ำรายสัปดาห์ (1 ครั้ง/สัปดาห์/วิชา)
│   │                          # - สร้างไฟล์ Excel Export ทั้งแบบ Single Week และ Academic Matrix
│   │
│   ├── room_schedules.seed.json # ข้อมูลตารางเรียนตั้งต้น 3 ห้อง (101, 201, 301 รวม 60 คาบ) สำหรับ Bootstrap
│   │
│   ├── database.js            # ตัวเชื่อมต่อฐานข้อมูล Supabase PostgreSQL (Master Database)
│   │                          # - จัดการตาราง users, admins, access_logs
│   │
│   └── public/                # ไฟล์หน้าบ้าน Frontend (Vanilla JS + Tailwind CSS)
│       ├── index.html / app.js       # หน้าแดชบอร์ดหลัก ดูสถานะสแกนสด, ฮาร์ดแวร์, สลับห้อง
│       ├── schedules.html / schedules.js # หน้าระบบตารางเรียน, ใบเช็คชื่อรายสัปดาห์, ส่งออก Excel
│       ├── users.html / users.js     # หน้าจัดการผู้ใช้และการลงทะเบียนลายนิ้วมือ 3 นิ้ว
│       ├── login.html                # หน้าเข้าสู่ระบบของผู้ดูแลระบบ
│       └── css/style.css             # ธีมสีน้ำตาลทอง RMUTL และเอฟเฟกต์ Glassmorphism
│
├── GEMINI.md                  # กฎระเบียบและข้อห้ามในการทำงานของ AI Agent ใน Workspace
├── handoff.md                 # รายงานการตรวจสอบความปลอดภัยและบั๊กจากสภาพแวดล้อมจริง
├── DECISIONS.md               # บันทึกการตัดสินใจเชิงสถาปัตยกรรม (ADR) และข้อห้ามที่เคยล้มเหลว
├── PRODUCT.md                 # ข้อกำหนดและขอบเขตผลิตภัณฑ์ (Product Requirements)
└── DESIGN.md                  # คู่มือระบบการออกแบบและอัตลักษณ์สีสถาบัน (Design System)
```

---

## 3. สถานะการแก้ไขและประเด็นที่ต้องทราบ (Current Status & Operational Notes)

1. **[RESOLVED 100%] การแก้ปัญหาปุ่ม D2 ไม่ตอบสนอง และจอค้างในวิชา 32090207 (ADR-028):**
   - แก้ไขลูปปุ่มกดใน `sketch.ino` บน STM32 ไม่ให้ถูกขัดจังหวะด้วยคำสั่งเช็คฮาร์ดแวร์ และแฟลชเข้าบอร์ดเรียบร้อย
   - แก้ไข Indentation Bug ใน `unoq_bridge.py` ให้วาดหน้าจอเตือนเสมอแม้จะลงเวลาซ้ำ
   - ล้างไฟล์แคชค้างเก่า `/home/arduino/attendance_cache.json` บนบอร์ด Uno Q ผ่าน ADB เรียบร้อยแล้ว เซอร์วิสทำงานเป็น Background Daemon (PID 11985) พร้อมใช้งาน
2. **ข้อควรทราบสำหรับการทดสอบวิชา 32090207 ใน Session ถัดไป:**
   - ในฐานข้อมูล `room_schedules` วิชา **32090207 Advanced Computer Programming** (ห้อง ทค.1-101) มีคาบเรียนเฉพาะ:
     - **วันจันทร์:** 11:00 - 13:00 น.
     - **วันอังคาร:** 15:00 - 17:00 น.
   - หากทดสอบสแกนลายนิ้วมือนอกช่วงเวลาดังกล่าว ระบบจะจัดเป็น **"นอกเวลาเรียน (General Access Log)"** บันทึกลงประวัติเข้าห้องทั่วไป และจะไม่บันทึกลงตารางเช็คชื่อของวิชา 32090207
   - **หากต้องการทดสอบการลงเวลาของวิชา 32090207 ทันที:** สามารถปรับเวลาเริ่มต้นและสิ้นสุดของวิชานี้ในตารางเรียนชั่วคราวให้ตรงกับเวลาปัจจุบัน เพื่อทดสอบกระบวนการสแกน → กดยืนยันปุ่มฟ้า D2 → บันทึกลง `session_attendance` และตรวจสอบการขึ้นชื่อบนหน้าเว็บแบบเรียลไทม์
3. **การเปลี่ยนผ่าน Supabase Client เป็น Native (P3 Backlog):**
   - ใน `database.js` ยังมีฟังก์ชันบางส่วนที่แปลงสตริงคำสั่ง SQL ก่อนส่งต่อไปยัง Supabase REST API ซึ่งในอนาคตสามารถปรับปรุงเป็น Native Supabase Client Methods (`.from().select()`) เพื่อความสวยงามและเสถียรภาพสูงสุด

---

## 4. สิ่งที่จะทำต่อในแชทใหม่ (Next Steps for New Chat)

1. **การทดสอบสแกนเช็คชื่อเข้าวิชา 32090207 (Live Schedule Scan Verification):**
   - ปรับช่วงเวลาคาบเรียนของวิชา 32090207 ในตารางให้ตรงกับเวลาปัจจุบัน (หากทดสอบนอกคาบเรียนปกติ)
   - สแกนลายนิ้วมือที่ลงทะเบียนไว้ → ตรวจสอบการแสดงผลชื่อนักศึกษาและวิชาบนจอ OLED → กดปุ่มฟ้า D2 ยืนยัน
   - ตรวจสอบว่าระบบบันทึกเข้า `session_attendance` และแสดงผลสำเร็จบนจอ OLED
2. **การตรวจสอบผลลัพธ์บน Web UI Dashboard และหน้ารายวิชา:**
   - ตรวจสอบหน้าแรก (`index.html`) ว่าแสดงประวัติการสแกนแบบเรียลไทม์
   - ตรวจสอบหน้าตารางเรียน (`schedules.html`) ในวิชา 32090207 ว่าจำนวนผู้มาตรงเวลา/มาสายเพิ่มขึ้น และใน Modal แสดงรายชื่อถูกต้อง
3. **การทดสอบกลไกป้องกันสแกนซ้ำรายสัปดาห์ (Weekly Duplicate Prevention):**
   - ลองสแกนนิ้วเดิมซ้ำในวิชา 32090207 ภายในสัปดาห์เดียวกัน ตรวจสอบว่าหน้าจอ OLED แจ้งเตือนว่าลงเวลาแล้ว และไม่นับจำนวนครั้งซ้ำ
4. **การตรวจสอบการส่งออกไฟล์ Excel (.xlsx):**
   - ทดสอบดาวน์โหลดไฟล์ทั้งแบบ Single Week และแบบ Academic Matrix ตรวจสอบว่าไม่มีคอลัมน์ขาดเรียน และมีเฉพาะนักศึกษาในวิชาจริง

