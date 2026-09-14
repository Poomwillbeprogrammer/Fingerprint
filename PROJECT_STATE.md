# 📌 สถานะโปรเจกต์และบริบทระบบ (PROJECT STATE)
**ระบบลงเวลาเรียนด้วยลายนิ้วมืออัจฉริยะ (IoT Biometric Attendance System - RMUTL)**
*อัปเดตล่าสุด: กันยายน 2569*

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

### 1.3 หน้าเว็บแดชบอร์ดและประสบการณ์ผู้ใช้ (Web UI & Experience)
- **RMUTL Golden Brown Dark Theme:** ปรับโทนสีทั้งระบบเป็นสีน้ำตาลทองและสีเอสเพรสโซ่อบอุ่น (Warm Espresso & Golden Bronze) ตามอัตลักษณ์ มทร.ล้านนา
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

---

## 2. ไฟล์หลักๆ และโครงสร้างโปรเจกต์ (Core Files & Architecture)

```
Fingerprint/
├── unoq_bridge.py             # สคริปต์บริดจ์หลักบน Arduino Uno Q Linux (Python)
│                              # - ควบคุม UART ติดต่อ STM32
│                              # - เชื่อมต่อ Socket.IO Client ไปยัง Cloud
│                              # - เรนเดอร์ภาษาไทย OLED 128x64 ด้วย Pillow
│                              # - จัดการ Offline Queue และ Local Attendance Cache
│                              # - ตรวจเช็คสุขภาพฮาร์ดแวร์ R307 (Watchdog)
│
├── sketch/
│   └── sketch.ino             # เฟิร์มแวร์ C++ บนไมโครคอนโทรลเลอร์ STM32 (Uno Q)
│                              # - ขับเซนเซอร์ R307 และจอ OLED 128x64 (I2C)
│                              # - ตรวจจับปุ่มกด D2 (Confirm) / D3 (Rescan)
│                              # - รับคำสั่งภาพแบบ 16-Byte Chunking ทาง Serial
│                              # - รองรับคำสั่ง CHECK_R307 ตรวจจับเซนเซอร์
│
├── server/
│   ├── server.js              # เมนเซิร์ฟเวอร์ Node.js + Express + Socket.IO
│   │                          # - จุดรวม API Endpoints ทั้งหมดพร้อม Middleware รักษาความปลอดภัย
│   │                          # - จัดการ Real-time Events (สแกน, ลงเวลา, ซิงก์แคช, ตรวจสอบซ้ำ)
│   │                          # - จัดการโหมด Serial (Local) และ Cloud Bridge
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

## 3. ปัญหาที่กำลังแก้ค้างอยู่ (Open / In-Progress Issues)

1. **การตรวจสอบความพร้อมของ Environment บน Render Production:**
   - โค้ดได้รับการปรับปรุงให้ใช้งานตัวแปรสภาพแวดล้อมและมีความปลอดภัยสูงแล้ว แต่ต้องอาศัยการตั้งค่าตัวแปรบน Render ให้ครบถ้วน (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `BRIDGE_TOKEN`) เซิร์ฟเวอร์จึงจะทำงานได้ 100%
2. **การซิงก์เวอร์ชันระหว่าง Cloud และฮาร์ดแวร์บอร์ดจริง:**
   - สคริปต์ `unoq_bridge.py` บนบอร์ด Arduino Uno Q หน้างานจริง ต้องได้รับการตั้งค่า `BRIDGE_TOKEN` ให้ตรงกับคลาวด์ เพื่อให้ผ่านกระบวนการ Socket.IO Handshake Authentication
3. **การเปลี่ยนผ่านการคิวรี Supabase ให้เป็น Native Client:**
   - ใน `database.js` ยังมีฟังก์ชันบางส่วนที่แปลงสตริงคำสั่ง SQL ก่อนส่งต่อไปยัง Supabase REST API ซึ่งในอนาคตควรปรับปรุงเป็น Native Supabase Client Methods (`.from().select()`) ทั้งหมด เพื่อความแม่นยำและเสถียรภาพสูงสุด

---

## 4. สิ่งที่จะทำต่อไป (Next Steps / Roadmap)

1. **การทดสอบ End-to-End ร่วมกับอุปกรณ์จริงหน้าห้องเรียน:**
   - รันการทดสอบสแกนลายนิ้วมือผ่านเซนเซอร์ R307 ในคาบเรียนจริง สังเกตความถูกต้องของชื่อวิชา ห้องเรียน และเวลาบนหน้าจอ OLED
   - ทดสอบการกดปุ่มยืนยัน D2 (ปุ่มฟ้า) และปุ่มยกเลิก D3 (ปุ่มแดง) ว่าบันทึกลงระบบทันที
   - ตรวจสอบระบบป้องกันสแกนซ้ำในสัปดาห์เดียวกัน และทดสอบการสแกนในสัปดาห์ถัดไป
2. **การตรวจสอบไฟล์รายงาน Academic Matrix Excel บน Render:**
   - ทดสอบคลิกปุ่ม "สรุปทุกสัปดาห์ (Matrix .xlsx)" บนเซิร์ฟเวอร์จริง เพื่อตรวจสอบว่าไฟล์ที่ดาวน์โหลดออกมามีเฉพาะนักศึกษาในวิชานั้นจริง และไม่มีคอลัมน์ขาดเรียนตามที่กำหนด
3. **ระบบแจ้งเตือนผ่าน Messaging Platform (Future Feature):**
   - พัฒนาระบบส่งข้อความแจ้งเตือนอาจารย์ผู้สอนผ่าน LINE Notify / Telegram เมื่อเริ่มคาบเรียน หรือสรุปรายชื่อผู้เข้าเรียนอัตโนมัติเมื่อหมดเวลาคาบ
4. **การบริหารจัดการสิทธิ์ผู้สอนหลายท่าน (Multi-Instructor Role Management):**
   - พัฒนาระบบบัญชีอาจารย์แยกรายบุคคล เพื่อให้อาจารย์แต่ละท่านสามารถเข้าสู่ระบบเพื่อจัดการและดูเฉพาะตารางสอนและรายงานของวิชาตนเองได้
