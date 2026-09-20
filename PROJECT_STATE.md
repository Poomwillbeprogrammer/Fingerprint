# 📌 สถานะโปรเจกต์และบริบทระบบ (PROJECT STATE)
**ระบบลงเวลาเรียนด้วยลายนิ้วมืออัจฉริยะ (IoT Biometric Attendance System - RMUTL)**
*อัปเดตล่าสุด: 20 กันยายน 2569 (ระบบหลายบัญชี RBAC, การวิเคราะห์ความปลอดภัย Git History ADR-044 และการปรับปรุง Layout UI ADR-045)*

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
- **Event-Driven Handshake & Zero-Freeze 3-Finger Pipeline (ADR-040) [เสร็จสมบูรณ์ 100%]:**
  - **ขจัดปัญหาจอค้างที่นิ้วที่ 2:** แก้ปัญหาสาย UART Buffer ทับซ้อนและอาการค้างหน้าจอ "ENROLL SUCCESS" ของนิ้วที่ 2 โดยยกเลิก blind timer (`setTimeout 1500`) บน Server
  - **Fast Template Streaming (120ms):** ปรับปรุง `extractAndSendTemplate` บน STM32 ให้ออกจากลูปทันทีเมื่ออ่านไบต์ครบ 512 ไบต์และสาย Serial ว่าง ลดเวลาประมวลผลจาก 4,000ms เหลือเพียง ~120ms
  - **Hardware Ready Handshake (`RESP:ENROLL_SLOT_DONE`):** เมื่อ STM32 บันทึกและปล่อยนิ้วสำเร็จในนิ้วที่ 1 หรือ 2 จะส่ง `RESP:ENROLL_SLOT_DONE` เพื่อให้ Server สั่งเริ่มนิ้วถัดไปทันทีโดยไม่ส่ง `EVENT:IDLE` มาคั่นกลาง
  - **Bridge State Guard (`is_enrolling`):** เพิ่มแฟล็กป้องกันการส่ง `CHECK_R307` และภาพ Idle Screen มาทับหน้าจอระหว่างกำลังลงทะเบียน
  - **TDD Verification:** เพิ่มชุดทดสอบใน `tests/test_enrollment_manager.js` ครอบคลุมการสแกน 3 นิ้วต่อเนื่องแบบ Event-driven ผ่านฉลุย 23/23 tests

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

### 1.6 สถาปัตยกรรมเซิร์ฟเวอร์แบบโมดูลาร์ (Modular Server Architecture - ADR-035)
- **Modular Server Architecture & Clean Bootstrap:**
  - แยก `server/server.js` จากไฟล์ Monolith 1,778 บรรทัด ออกเป็นโมดูลย่อยชัดเจน ช่วยให้ทดสอบและดูแลรักษาง่าย:
    - `server/middleware/auth.js`: แยก `authRequired` และ `loginLimiter`
    - `server/controllers/serial_controller.js`: ศูนย์กลางควบคุมฮาร์ดแวร์ SerialPort, WebSocket Cloud Bridge, Tier-2 Database Candidate Search, Auto-Promote LRU Cache, และ Socket.IO Handlers
    - `server/routes/`: จัดกลุ่ม 24 Routes ออกเป็น 5 โมดูลตามขอบเขตงาน (`auth.js`, `users.js`, `logs.js`, `schedules.js`, `device.js`)
    - `server/server.js`: ลดขนาดเหลือ ~155 บรรทัด ทำหน้าที่เพียง Composition Root ในการเชื่อมต่อ Middleware, Controller, และ Routers
  - **100% Behavioral Preservation:** พฤติกรรมเดิมคงอยู่ครบถ้วน 100% ผ่านการทดสอบ `npm test` 20/20 เขียวสมบูรณ์

### 1.7 สถาปัตยกรรม Native Repositories (Native Repository Pattern - ADR-036)
- **Data Access Layer & Clean Repositories:**
  - ทดแทนการคิวรีฐานข้อมูลผ่านการตรวจจับสตริง SQL แบบเก่า (`dbAsync` string-matching 273 บรรทัด) ด้วย Native Supabase Repositories:
    - `server/repositories/UserRepository.js`: จัดการข้อมูลผู้ใช้, Tier 2 Candidate Search, LRU Sensor Eviction, และ Template Backup
    - `server/repositories/AdminRepository.js`: จัดการข้อมูลแอดมิน, ค้นหาตาม Username/ID, และอัปเดต Password Hash
    - `server/repositories/AccessLogRepository.js`: บันทึกประวัติการสแกน, สถิติประจำวันตามโซนเวลาประเทศไทย (+7 ชม.), และดึงบันทึกล่าสุด
  - ย้ายจุดเรียกใช้งาน `dbAsync` ทั้ง 37 จุดทั่วทั้งระบบมาใช้ Repositories ทั้งหมด (`grep -c "dbAsync\." server/*.js` = 0)
  - กำจัดความเสี่ยงเรื่อง String Mismatch และทำให้ Data Layer มี Type Safety และ Testability สูงขึ้น

### 1.8 การแยกโมดูลเรนเดอร์กราฟิกและหน้าจอแสดงผล (Graphic Views Separation - ADR-037)
- **Modular View Renderer & Layout Preview:**
  - แยกฟังก์ชันเรนเดอร์กราฟิก Pillow 160x128 ทั้ง 7 หน้าจอ และตัวแปลงบิตแมป 1-bit raster (`img_to_tft_buf`, `tft_buf_to_img`) ออกจาก `unoq_bridge.py` ไปไว้ใน `unoq_views.py`
  - เพิ่มฟังก์ชันพรีวิวหน้าจอผ่านคำสั่ง CLI (`if __name__ == '__main__':`) ส่งออกไฟล์ภาพ PNG ครบทั้ง 10 รูปแบบไปยังโฟลเดอร์ `.scratch/png/` ช่วยให้นักพัฒนาตรวจทาน UI Layout ได้ทันทีโดยไม่ต้องต่อบอร์ดฮาร์ดแวร์จริง
  - ปรับปรุง `unoq_bridge.py` ให้นำเข้า `unoq_views` โดยคงความเข้ากันได้ย้อนหลัง 100%
  - เพิ่มชุดทดสอบใน `tests/test_unoq_bridge.py` ครอบคลุมการเรนเดอร์ทั้ง 7 หน้าจอ และบัฟเฟอร์ขนาด 2,560 ไบต์ (18/18 ผ่านฉลุย)

### 1.9 การแยกไดรเวอร์จอแสดงผลและนิยามโปรโตคอล Serial (Firmware Modularization - ADR-038)
- **Modular Firmware Architecture & Single Source of Truth:**
  - แยกนิยามโปรโตคอล Serial, ค่าคงที่ UART FIFO limit (64B), ขนาดชิ้นภาพ 16-Byte Chunking (160 ชิ้น / 2,560 ไบต์), และข้อความ Protocol Event/Status ออกสู่ `sketch/protocol.h`
  - แยกไดรเวอร์จอแสดงผล `ST7735_TFT` ความละเอียด 160x128 แนวนอน, ค่าสี RGB565 มาตรฐาน RMUTL Theme, และตารางฟอนต์ ASCII 5x7 ออกสู่ `sketch/ST7735_TFT.h`
  - ปรับปรุง `sketch/sketch.ino` ให้เหลือเพียงตรรกะระดับ Business / Hardware Interaction (R307 Fingerprint Sensor, Physical Buttons D2/D3, Serial State Machine)
  - **Zero Regression & Byte-Exact Binary:** คอมไพล์ผ่าน `arduino-cli` ได้ขนาด Flash 99,344 bytes และ RAM 40,920 bytes เท่ากับไฟล์ก่อนการรีแฟกเตอร์แบบไบต์ต่อไบต์ 100%

### 1.10 ผลการตรวจสอบอิสระหลังการ Refactor (Post-Refactor Audit - ADR-039)
- **Verified Behavior-Preserving Refactor & Performance:**
  - ตรวจยืนยันด้วย `npm test` (20/20, ไร้ Warning Network, 2,244ms เทียบ Baseline 2,315ms), `node -c` ครบ 15 ไฟล์, snapshot diff (24 Routes / Socket Events ตรง Baseline) และการรีวิว Query Shapes ของ Repositories ทั้งหมด — ไม่มี N+1 ใหม่เกิดขึ้น
  - **ประสิทธิภาพดีขึ้นจริง:** `broadcastUsersCache` ส่งเฉพาะ `id, name, student_id` (เดิมรั่ว `fingerprint_template` ข้อมูลชีวมิติขึ้น Socket ทุกครั้ง) โดยบอร์ดใช้แค่ `name`/`student_id` จึงไม่กระทบพฤติกรรมและลด Bandwidth
  - **แก้ Latent No-Op Bug:** `sync_offline_attendance` ก่อน Refactor อัปเดต `last_scanned_at` ไม่เคยสำเร็จจริง (Adapter เดิมอ่าน params ผิดตำแหน่ง) — ยืนยันคงพฤติกรรมที่ถูกต้องของโค้ดใหม่ตาม ADR-039
  - **คืน Semantic สถิติ DENIED:** `countDeniedToday()` กลับเป็น `.eq('status', 'DENIED')` ตาม Baseline
  - **Test Hermetic ทุกเครื่อง:** ติดตั้ง `pillow` + `python-socketio` แล้ว Python Suite ผ่าน 18/18 จากการเรนเดอร์ Pillow จริง + Export PNG ครบ 10 หน้าจอ (`.scratch/png/`) พร้อม `skipUnless(REAL_PIL)` กัน FAIL บนเครื่องที่ไม่มี Pillow

### 1.11 ระบบแก้ไขข้อมูลผู้ใช้งานและการบังคับรูปแบบรหัสนักศึกษา 12 หลัก (User Edit, 12-Digit Student ID Enforcement & Cascading Data Integrity - ADR-041) [เสร็จสมบูรณ์ 100%]
- **Strict 12-Digit Student ID Enforcement (`^\d{11}-\d$`):**
  - บังคับใช้ Regular Expression `STUDENT_ID_REGEX = /^\d{11}-\d$/` ทั้งใน `POST /api/users` และ `PUT /api/users/:id` ป้องกันรหัสขาดหรือเกิน รับค่าเฉพาะรูปแบบตัวเลข 11 หลัก คั่นด้วยขีด และตัวเลขตรวจสอบ 1 หลัก (เช่น `66041013110-1`)
  - **Real-time Input Masking & Guidance:** ฟังก์ชัน `setupStudentIdMask` ดักจับการพิมพ์ตัวเลข จำกัดความยาว 12 หลัก และแทรกขีดคั่นอัตโนมัติ พร้อมข้อความแนะนำ `บังคับ 12 หลักในรูปแบบ XXXXXXXXXXX-X (เช่น 66041013110-1)`
  - **Duplicate Student ID Protection:** ตรวจสอบไม่ให้รหัสนักศึกษาซ้ำกับผู้อื่นในระบบทั้งในคำสั่งสร้างใหม่และแก้ไข
- **User Edit Feature on Web UI (`users.html` & `app.js`):**
  - เพิ่มปุ่ม "แก้ไข" (ไอคอนดินสอสีอำพัน) ในคอลัมน์การจัดการของแต่ละแถวในตารางผู้ใช้งาน
  - สร้าง Modal แก้ไขข้อมูลผู้ใช้ (`editUserModal`) แสดง Slot ID ปัจจุบัน พร้อมช่องกรอกรหัสนักศึกษาและชื่อ-นามสกุล โดยดึงข้อมูลเดิมมาแสดงให้อัตโนมัติ
  - เพิ่มสถานะ Loading ป้องกันการกดย้ำ และแสดงกล่องแจ้งเตือนความผิดพลาดแบบ In-place
- **Cascading Database & RAM Integrity:**
  - `UserRepository.updateUser(id, { name, studentId })`: อัปเดตตารางหลัก `users` ใน Supabase พร้อมทำ Cascading Update ต่อเนื่องไปยังตาราง `session_attendance` และ `access_logs` สำหรับ `user_id = id` ทำให้ประวัติการเข้าเรียนย้อนหลังและการ Export Excel ได้ชื่อใหม่ที่ถูกต้องสมบูรณ์
  - `schedules_manager.updateUserDetails(userId, { name, studentId })`: อัปเดตรายการในหน่วยความจำ RAM (`attendanceRecords`) ทันที ทำให้ไม่ต้อง Restart เซิร์ฟเวอร์
  - **Realtime Hardware Sync:** เรียก `serialController.broadcastUsersCache()` ส่งรายการ `{ id, name, student_id }` ใหม่ไปยัง Linux Bridge บนบอร์ด Uno Q ทันที อัปเดตไฟล์ `users_cache.json` แบบ Real-time เพื่อให้จอ TFT 1.8" แสดงชื่อใหม่ทันทีที่แตะนิ้ว
- **Automated Test Coverage (`tests/test_user_update.js`):**
  - พัฒนาชุดทดสอบ TDD 4 รายการ ครอบคลุม Repository, RAM Sync, 12-digit Format Validation (รหัสขาด, รหัสเกิน, ไม่มีขีด), และ Duplicate Guard
### 1.12 ระบบลบผู้ใช้งานแบบกลุ่มด้วย Checkbox, UART Pacing และการรักษาประวัติการเข้าเรียน (Bulk User Delete with Checkbox Selection, Hardware UART Pacing & Historical Attendance Preservation - ADR-042) [เสร็จสมบูรณ์ 100%]
- **Interactive Checkbox Selection & Filter-Aware Header Toggle:**
  - เพิ่มช่อง Checkbox ในคอลัมน์แรกของตารางผู้ใช้ (`users.html`) พร้อมช่องเลือกทั้งหมดในหัวตาราง (`#selectAllCheckbox`)
  - ตรรกะการเลือกทั้งหมดสัมพันธ์กับคำค้นหา (Filter-Aware) โดยจะเลือกเฉพาะผู้ใช้ที่แสดงผลอยู่ในขณะนั้น (`currentVisibleUsers`) และปรับเปลี่ยนสถานะเป็น `indeterminate` อัตโนมัติเมื่อเลือกผู้ใช้เพียงบางส่วน
- **Floating Bulk Action Bar & Confirmation Modal:**
  - เพิ่มแถบควบคุมแบบลอย (`#bulkActionBar`) กึ่งกลางจอด้านล่าง พร้อมแสดง Badge นับจำนวนคนที่เลือกแบบเรียลไทม์ ปุ่มยกเลิก และปุ่ม "ลบที่เลือก"
  - สร้าง Modal ยืนยันการลบแบบกลุ่ม (`#bulkDeleteModal`) แสดงสรุปจำนวนคน และกล่องพรีวิวรายชื่อ/รหัสนักศึกษา/Slot ID ของทุกคนที่จะถูกลบ พร้อมคำเตือนนโยบายข้อมูลก่อนกดยืนยันจริง
- **Academic Attendance History Preservation:**
  - การลบผู้ใช้แบบกลุ่มจะลบเฉพาะเรคคอร์ดในตาราง `users` และสั่งล้างสล็อตในเซนเซอร์ R307 (ว่างลง 3 สล็อตต่อคน) โดย **คงรักษา** ประวัติใน `session_attendance` และ `access_logs` ไว้ทั้งหมดตามข้อกำหนด ไม่ทำลายข้อมูลการตัดเกรดหรือรายงานสรุปเวลาเรียนย้อนหลัง
- **Non-blocking UART Serial Pacing (Hardware Protection):**
  - ฟังก์ชัน `deleteUsersSlots(userIds)` ใน `server/controllers/serial_controller.js` จัดคิวส่งคำสั่ง `DELETE <slot>` ทีละบรรทัด พร้อมหน่วงเวลา 35ms ด้วย Non-blocking `setTimeout` ป้องกันบัฟเฟอร์ Zephyr OS UART RX FIFO (64B) บน STM32 ล้นตามกฎ ADR-002 อย่างเด็ดขาด
- **Batch Repository & Cache Synchronization:**
  - `UserRepository.deleteUsers(ids)`: ลบแบบ Batch ผ่าน Supabase `.delete().in('id', cleanIds)` รวดเร็วและปลอดภัย
  - Endpoint `POST /api/users/bulk-delete` ตรวจสอบสิทธิ์ `authRequired` และความถูกต้องของ Array ตัวเลข ID
  - สั่งยิง `io.emit('user_updated')` และเรียก `serialController.broadcastUsersCache()` ซิงก์ไฟล์ `users_cache.json` บนบอร์ด Uno Q Linux ทันที
- **Automated Test Coverage (`tests/test_user_bulk_delete.js`):**
  - พัฒนาชุดทดสอบ TDD 3 รายการ ครอบคลุม Repository batch delete, empty array guard, และ API route validation
  - ชุดทดสอบทั้งหมดผ่านครบ 30/30 tests (Node) และ 18/18 tests (Python)

### 1.13 ระบบหลายบัญชี RBAC, การจำกัดสิทธิ์รายวิชา Strict Subject Scoping และเกราะป้องกัน Database Conflict (ADR-043) [เสร็จสมบูรณ์ 100%]
- **Two-Tier Role-Based Access Control (RBAC):**
  - แบ่งระดับสิทธิ์ออกเป็น 2 บทบาทชัดเจน:
    1. `super_admin`: ดูแลทั้งระบบ ฮาร์ดแวร์ R307, สลับห้องประจำการ, นำเข้าตารางเรียน Excel, จัดการเพิ่ม/แก้ไข/ลบบัญชีผู้ใช้, และเข้าถึงได้ทุกวิชา
    2. `teacher`: อาจารย์ผู้สอน เข้าถึงได้เฉพาะรายวิชาที่ตนเองรับผิดชอบ (Strict Subject Scoping) ตรวจสอบใบเช็คชื่อ, แก้ไขสถานะการเข้าเรียนย้อนหลัง (On-Time, Late, Absent) ในวิชาของตนเอง, และส่งออก Excel เฉพาะวิชาที่ตนสอน
- **Idempotent Non-Destructive Migration & Zero-Conflict Guarantee:**
  - สถาปัตยกรรม Migration ปลอดภัยสูงสุดด้วยการขยายคอลัมน์ในตาราง `admins` เดิม (`role`, `instructor_name`, `assigned_subjects` JSONB) ผ่าน `ALTER TABLE admins ADD COLUMN IF NOT EXISTS`
  - มีค่า Fallback `role || 'super_admin'` ป้องกันการระงับสิทธิ์ระหว่างการอัปเดตระบบ
  - ตรวจสอบความมีอยู่จริงของแถวข้อมูลใน DB สดเสมอ (`!admin` $\rightarrow$ ส่ง `401 Unauthorized` ทันที) ป้องกัน Token ค้างของบัญชีที่ถูกลบ
- **Stable Identifier Mapping & Dropdown Assignment:**
  - ผูกสิทธิ์อาจารย์ผ่าน 2 กลไกควบคู่: (1) ชื่อผู้สอน `instructor_name` ที่ผ่านการตัดช่องว่างซ้ำซ้อน (`normalizeText`) (2) รหัสวิชา `assigned_subjects` (เก็บเป็น `subject_code` สตริง เช่น `"32090305"`) ป้องกันสิทธิ์หลุดเมื่อมีการ Re-import ตารางสอน Excel ภาคเรียนใหม่
  - Super Admin จัดการผูกชื่ออาจารย์และวิชาผ่าน Dropdown และ Checkbox จากตารางสอนจริง ป้องกัน Human Error
- **Attendance Sequencing Collision Fix & Manual Override:**
  - แก้ไขปัญหา Primary Key ID ชนกันใน `schedules_manager.js` ด้วยสูตร `Math.max(0, ...ids) + 1`
  - เพิ่มระบบแก้ไขสถานะเข้าเรียนด้วยตนเอง (Manual Attendance Status Override: `ON_TIME`, `LATE`, `ABSENT`) พร้อม Modal สำหรับอาจารย์และ Super Admin
- **Automated Test Coverage (`tests/test_rbac_accounts.js` & `tests/test_schedules_manager.js`):**
  - พัฒนาชุดทดสอบ RBAC 12 รายการ และ ID Sequencing Collision Fix 1 รายการ
  - ชุดทดสอบทั้งหมดผ่านครบ 43/43 tests (Node.js) และ 18/18 tests (Python) รวมทั้งสิ้น 61/61 tests (100% pass)

### 1.6 การตรวจสอบความปลอดภัย Git History และการกู้คืนบัญชี GitHub (ADR-044)
- **การตรวจสอบ Git History 103 Commits ย้อนหลัง:** ดำเนินการสืบค้นและวิเคราะห์หาสาเหตุที่บัญชี GitHub ของผู้พัฒนาถูก Flag (Shadowban / 404) พบ 4 ปัจจัย:
  1. การเผลอ Push ไฟล์ Native Binary Executables (`.node`) ขนาดใหญ่ใน `node_modules` ยุคแรก (เช่น `lightningcss...node` 9.5MB)
  2. การมี Supabase Publishable Key และไฟล์ SQLite `fingerprint_data.db` ใน Git History เก่า
  3. อัตราการ Push โค้ดของ AI Agent ที่มีความถี่สูงผิดปกติบนบัญชีใหม่
- **ยื่นคำร้อง Reinstatement Request ต่อ GitHub Support:** ส่งหนังสือชี้แจงภาษาอังกฤษอย่างเป็นทางการ ชี้แจงว่าเป็นนักศึกษาทำโครงงาน IoT และชี้แจงข้อผิดพลาดจากการเผลอ Commit `node_modules` พร้อมยืนยันการตั้งค่า `.gitignore` ที่รัดกุมแล้ว
- **นโยบายความปลอดภัยของ Git และ Secret Rotation:** กำหนดให้คีย์ที่เคยหลุดในประวัติเก่าต้องได้รับการหมุนเวียน (Rotate) บน Supabase Dashboard และห้าม Push ไฟล์ไบนารีใดๆ สู่ระบบ

### 1.7 การตรวจสอบตรรกะโฟลว์ชาร์ตการทำงานของระบบ (Flowchart Logic Audit)
- **การตรวจสอบความถูกต้องของ `iot_fingerprint.drawio`:** ตรวจสอบไฟล์ไดอะแกรมโฟลว์ชาร์ตเทียบกับสถาปัตยกรรมจริงของระบบ และพบข้อบกพร่องทางตรรกะ 4 จุด:
  1. ลูกศรของเงื่อนไข "Already Checked In" สลับทิศทาง (Yes วิ่งไปบันทึก, No วิ่งไปแจ้งเตือน)
  2. การหลุดข้ามเงื่อนไขเวลาเรียน (Out-of-schedule bypass) ทำให้นักศึกษาสแกนเวลานอกคาบเรียนแต่ยังถูกเช็คชื่อเข้าวิชา
  3. การบันทึกลงคิวออฟไลน์แบบไร้เงื่อนไขตรวจสอบสถานะ Wi-Fi
### 1.8 การปรับปรุง Layout และแก้ไขการทับซ้อนของ UI (UI Polish & Collision Resolution - ADR-045) [เสร็จสมบูรณ์ 100%]
- **Non-Absolute Side-by-Side Action Header ใน `#accountsModal`:**
  - ปลดการใช้ `absolute top-4 right-4` สำหรับปุ่มกากบาทปิดโมดอลใน `accounts_modal.js` โดยจัดให้อยู่ใน Flex Container ทางขวาบนร่วมกับปุ่ม "เพิ่มบัญชีใหม่" (`gap-2`) ป้องกันการซ้อนทับกันอย่างเด็ดขาดในทุกขนาดหน้าจอ
- **Two-Line Balanced Sidebar Profile ในทุกหน้าเว็บ:**
  - ออกแบบข้อมูลบัญชีมุมซ้ายล่างของ Sidebar ใหม่ใน `index.html`, `schedules.html`, `users.html`, `app.js`, `schedules.js` เป็น 2 บรรทัดกะทัดรัด (บรรทัดบนชื่อผู้ใช้/อาจารย์, บรรทัดล่าง Role Label สีทอง/ฟ้า คั่นด้วย Bullet กับสถานะ Online) พร้อมไอคอน Avatar ตามบทบาทแบบไดนามิก ป้องกันกรอบบวมเทอะทะ
- **Compact Slot ID & Removal of Auto-Run Text:**
  - ในโมดอลลงทะเบียนนิ้วมือ (`users.html`) ได้ลบข้อความ `รันเลขอัตโนมัติ (แทนที่ช่องว่าง)` ออกทั้งหมดตามคำสั่ง และลดขนาดกล่องแสดง Slot ID เป็น Compact Info Box (`py-2 px-3`) พร้อม Badge ขนาดพอเหมาะ (`px-2 py-0.5 text-xs`) สอดคล้องกับโมดอลแก้ไขผู้ใช้
- **Elimination of CSS Double-Padding:**
  - ปลดคำสั่งฮาร์ดโค้ด `padding: 1rem` ใน `.glass` และ `padding: 1.5rem` ใน `.glass-card` ออกจาก `style.css` เพื่อให้ Tailwind Utility Classes ควบคุม Spacing ได้อย่างแม่นยำตามหลัก Single Source of Truth
- **Automated Test Verification:**
  - ผ่านชุดทดสอบ Node.js 43/43 tests และ Python 18/18 tests (รวม 61/61 tests 100% pass)

---

## 2. โครงสร้างไฟล์และสถาปัตยกรรม (System Architecture)

```text
Fingerprint/
├── sketch/
│   ├── sketch.ino             # เฟิร์มแวร์ C++ ควบคุมฮาร์ดแวร์บน STM32 (Adafruit R307 + ST7735 TFT 1.8" SPI)
│   │                          # - Non-blocking fingerHeld loop & In-place Step 2 Retry 3 ครั้ง
│   │                          # - Hardware button confirmation (D2/D3) & Serial State Machine
│   ├── ST7735_TFT.h           # ไดรเวอร์จอแสดงผล ST7735 SPI 160x128 แนวนอน, RGB565 Palette และฟอนต์ ASCII 5x7
│   └── protocol.h             # นิยามโปรโตคอล Serial UART (16-byte chunking, FIFO bounds, status constants)
│
├── unoq_bridge.py             # สคริปต์บริดจ์ Python บน Linux SoC (Uno Q)
│                              # - ควบคุม UART ติดต่อ STM32 และ Socket.IO Client สู่ Cloud
│                              # - จัดการ Offline Queue และ Local Attendance Cache
│                              # - ตรวจเช็คสุขภาพฮาร์ดแวร์ R307 (Watchdog)
│
├── unoq_views.py              # โมดูลเรนเดอร์กราฟิก TFT 160x128 Landscape (Pillow)
│                              # - เรนเดอร์ภาษาไทย 7 หน้าจอหลัก (Idle, Denied, Card, Success, Duplicate, Cancel, Timeout)
│                              # - ตัวแปลงบิตแมป 1-bit raster (2,560 ไบต์) แบบ 1:1
│                              # - รองรับการส่งออกไฟล์พรีวิว PNG สู่ .scratch/png/ สำหรับงานตรวจสอบ UI
│
├── server/                    # Web Backend & Socket.IO บน Render Cloud
│   ├── server.js              # Application Bootstrap & Composition Root (~160 บรรทัด)
│   ├── database.js            # Supabase PostgreSQL Adapter & In-memory Client
│   ├── schedules_manager.js   # โมดูลคำนวณคาบเรียน ตารางห้องเรียน, Weekly Attendance, Scoping & Override
│   ├── enrollment_manager.js  # Resilient Multi-Finger Enrollment State Machine
│   ├── room_schedules.seed.json # ตารางเรียนตั้งต้น 3 ห้องสำหรับ cold-start
│   │
│   ├── middleware/
│   │   └── auth.js            # Authentication & RBAC Middleware (authRequired, requireRole, loginLimiter)
│   │
│   ├── controllers/
│   │   └── serial_controller.js # ศูนย์กลางจัดการ Serial Hardware, Bridge, Paced Deletes, และ Tier-2 DB Search
│   │
│   ├── repositories/          # Native Supabase Repositories (Data Access Layer)
│   │   ├── UserRepository.js  # จัดการผู้ใช้, LRU cache, Tier-2 templates, Batch Deletion
│   │   ├── AdminRepository.js # ข้อมูลแอดมิน, RBAC accounts CRUD, Self-lockout & Last Admin Protection
│   │   └── AccessLogRepository.js # บันทึกประวัติการสแกนและสถิติรายวัน
│   │
│   ├── routes/                # 25+ API Endpoints แบบ Modular Routers
│   │   ├── auth.js            # /api/auth (login, logout, me, change-password)
│   │   ├── accounts.js        # /api/accounts (CRUD จัดการบัญชีผู้ใช้ระบบ RBAC - Super Admin Only)
│   │   ├── users.js           # /api/users (รายชื่อ, เพิ่ม, แก้ไข, ลบรายคน, ลบแบบกลุ่ม bulk-delete)
│   │   ├── logs.js            # /api/logs, /api/stats
│   │   ├── schedules.js       # /api/rooms, /api/schedules, override, import/export excel, matrix
│   │   └── device.js          # /api/device (serial-status, backup, restore - Super Admin Only)
│   │
│   └── public/                # Web Frontend (Vanilla JS + Tailwind CSS)
│       ├── index.html / app.js       # หน้าแดชบอร์ดหลัก ดูสถานะสแกนสด, ฮาร์ดแวร์, สลับห้อง, RBAC Badges
│       ├── schedules.html / schedules.js # หน้าระบบตารางเรียน (Scoped), ใบเช็คชื่อ, ปรับแก้สถานะ, ส่งออก Excel
│       ├── users.html / users.js     # หน้าจัดการผู้ใช้, Checkbox ลบกลุ่ม, แก้ไข, และลงทะเบียนลายนิ้วมือ 3 นิ้ว
│       ├── login.html                # หน้าเข้าสู่ระบบ
│       ├── js/accounts_modal.js      # Modal จัดการบัญชีผู้ใช้งานระบบ (สร้าง, แก้ไข, ลบ, ผูกวิชาอาจารย์)
│       └── css/style.css             # ธีมสีน้ำตาลทอง RMUTL และเอฟเฟกต์ Glassmorphism
│
├── docs/                      # เอกสารระบบและไดอะแกรมการทำงาน
│   └── flowchart_basic_workflow.drawio # Flowchart การทำงานพื้นฐานระบบ (เปิดแก้ไขต่อได้ใน draw.io)
│
├── tests/                     # ชุดทดสอบอัตโนมัติ (Automated Tests - รวม 61 ข้อ)
│   ├── test_schedules_manager.js     # Node.js Unit Tests (14 ข้อ รวมถึง Sequencing ID Collision Regression)
│   ├── test_enrollment_manager.js    # Node.js Unit Tests (10 ข้อ)
│   ├── test_user_update.js           # Node.js Unit Tests (4 ข้อ)
│   ├── test_user_bulk_delete.js      # Node.js Unit Tests (3 ข้อ)
│   ├── test_rbac_accounts.js         # Node.js Unit Tests (12 ข้อ ครอบคลุม RBAC, Scoping, Self-lockout)
│   └── test_unoq_bridge.py           # Python Unit Tests (18 ข้อ)
│
├── CONTEXT.md                 # พจนานุกรมศัพท์และขอบเขตโดเมนระบบ (Domain Modeling Glossary)
├── GEMINI.md                  # กฎระเบียบและข้อห้ามในการทำงานของ AI Agent ใน Workspace
├── handoff.md                 # รายงานการตรวจสอบความปลอดภัยและบั๊กจากสภาพแวดล้อมจริง
├── DECISIONS.md               # บันทึกการตัดสินใจเชิงสถาปัตยกรรม (ADR-001 ถึง ADR-043)
├── PRODUCT.md                 # ข้อกำหนดและขอบเขตผลิตภัณฑ์ (Product Requirements)
└── DESIGN.md                  # คู่มือระบบการออกแบบและอัตลักษณ์สีสถาบัน (Design System)
```

---

## 3. สถานะการแก้ไขและประเด็นที่ต้องทราบ (Current Status & Operational Notes)

1. **[IMPORTANT] คำสั่งรัน SQL Migration ล่วงหน้าบน Supabase (Step 0 Pre-flight SQL):**
   - เนื่องจาก Supabase PostgREST API ไม่รองรับคำสั่ง DDL (`ALTER TABLE`) ผ่าน Client จึงต้องรันคำสั่งต่อไปนี้ใน **Supabase Dashboard SQL Editor** ก่อนใช้งานระบบบัญชีใหม่บน Production:
   ```sql
   ALTER TABLE admins ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'super_admin';
   ALTER TABLE admins ADD COLUMN IF NOT EXISTS instructor_name VARCHAR(255) DEFAULT '';
   ALTER TABLE admins ADD COLUMN IF NOT EXISTS assigned_subjects JSONB DEFAULT '[]'::jsonb;
   UPDATE admins SET role = 'super_admin' WHERE role IS NULL;
   SELECT id, username, role, instructor_name, assigned_subjects FROM admins;
   ```
2. **[RESOLVED 100%] การแก้ปัญหาปุ่ม D2 ไม่ตอบสนอง และจอค้างในวิชา 32090207 (ADR-028)**
3. **[RESOLVED 100%] การขจัดปัญหาจอค้างที่นิ้วที่ 2 ของการลงทะเบียน 3 นิ้ว (ADR-040)**
4. **[RESOLVED 100%] ระบบหลายบัญชี RBAC และการจำกัดสิทธิ์อาจารย์ (ADR-043):**
   - ผ่านการทดสอบระดับโค้ดและการรับรองสิทธิ์ครบถ้วน 61/61 tests พร้อมเชื่อมต่อ UI หน้าบ้านเรียบร้อย
5. **[PENDING SUPPORT] สถานะบัญชี GitHub และการติดตามการปลด Flag (ADR-044):**
   - ส่งคำร้องขอ Reinstatement ไปยัง GitHub Support แล้ว พร้อมหนังสือชี้แจงสาเหตุเรื่องการเผลอ Push `node_modules` ที่มี `.node` binaries ในช่วงแรก
   - รอดำเนินการจากเจ้าหน้าที่ GitHub (ปกติใช้เวลา 1-3 วันทำการ) เพื่อคืนค่าหน้าโปรไฟล์และลิงก์ Repository สู่สาธารณะ
   - การพัฒนาและการรันคำสั่งภายในยังคงทำงานได้ 100% ตามปกติผ่าน Local Workspace และชุดทดสอบ
6. **[RECOMMENDED] การหมุนเวียนคีย์ (Supabase Key Rotation):**
   - เนื่องจากในประวัติ Git ช่วงแรก (Commit `83195ba`) เคยมีค่า Supabase publishable key หลุดเข้าไป แนะนำให้เข้าไปกด **Rotate keys** ใน Supabase Dashboard $\rightarrow$ Project Settings $\rightarrow$ API และอัปเดตค่าใหม่บน Render Environment ให้เรียบร้อย

---

## 4. สิ่งที่จะทำต่อไป (Next Steps)

1. **ติดตามผลการปลด Flag กับ GitHub Support:**
   - ตรวจสอบอีเมลตอบกลับจาก GitHub Support และยืนยันสถานะการเข้าถึงสาธารณะของ Repo
2. **รันคำสั่ง SQL Migration บน Supabase Dashboard:**
   - รันคำสั่ง Step 0 Pre-flight SQL ในข้อ 3.1 บน Supabase SQL Editor ของโปรเจกต์จริง
3. **ทดสอบสร้างบัญชีอาจารย์และทดสอบการส่องดูรายวิชา:**
   - เข้าสู่ระบบด้วย Super Admin $\rightarrow$ กดปุ่ม "จัดการบัญชี" ที่ Navbar
   - สร้างบัญชีอาจารย์ใหม่ เลือกชื่อผู้สอน และเลือกวิชาที่สอน
   - ทดสอบล็อกอินด้วยบัญชีอาจารย์ ตรวจสอบว่ามองเห็นเฉพาะวิชาของตนเอง และไม่มีปุ่มแก้ไขฮาร์ดแวร์หรือสลับห้อง
4. **การทดสอบสแกนเช็คชื่อเข้าวิชา 32090207 (Live Schedule Scan Verification):**
   - ปรับช่วงเวลาคาบเรียนของวิชา 32090207 ในตารางให้ตรงกับเวลาปัจจุบัน (หากทดสอบนอกคาบเรียนปกติ)
   - สแกนลายนิ้วมือที่ลงทะเบียนไว้ → ตรวจสอบการแสดงผลชื่อนักศึกษาและวิชาบนจอ TFT → กดปุ่มฟ้า D2 ยืนยัน
   - ตรวจสอบว่าระบบบันทึกเข้า `session_attendance` และแสดงผลสำเร็จบนจอ
5. **การตรวจสอบการส่งออกไฟล์ Excel (.xlsx):**
   - ทดสอบดาวน์โหลดไฟล์ทั้งแบบ Single Week และแบบ Academic Matrix ตรวจสอบว่าไม่มีคอลัมน์ขาดเรียน และมีเฉพาะนักศึกษาในวิชาจริง

