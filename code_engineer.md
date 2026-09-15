# 🛠️ CODE ENGINEER BRIEF: Behavior-Preserving Architecture Refactor

> **เอกสารส่งมอบงานสำหรับ AI Agent (Antigravity) — ผู้ Hold Project**
> จัดทำเมื่อ 2026-09-16 โดย ZCode จากการตรวจสอบข้อเท็จจริงกับซอร์สโค้ดจริงทั้งหมด (อ่านไฟล์ + รัน `npm test` + grep พิสูจน์ทุกข้อ ไม่ใช่การเดา)
> **พันธกิจ:** ปรับโครงสร้างโค้ด (Refactor) ตามแผนด้านล่าง โดย **ผลลัพธ์ (Output/Behavior) ของระบบต้องเหมือนเดิม 100% ทุกขั้นตอน** — นี่คือกติกาสูงสุด เหนือกว่าความสวยงามของโค้ดทุกกรณี

---

## 🚨 กติกาเหล็ก (Iron Rules) — ผู้ถือเอกสารต้องปฏิบัติโดยเคร่งครัด

1. **ห้ามเปลี่ยนพฤติกรรมโค้ดเด็ดขาด** — งานนี้คือ "ย้ายโค้ด ไม่ใช่แก้โค้ด" ห้ามแตะ: logic การคำนวณ, เงื่อนไข if, ข้อความ error/log ทุกตัวอักษร (รวม emoji), ลำดับการทำงาน, ชื่อ API endpoint, รูปร่าง JSON response, ชื่อ Socket.IO event, ชื่อ environment variable
2. **ห้ามรวมงาน refactor กับงานแก้บั๊ก/เพิ่มฟีเจอร์** — หากระหว่างย้ายโค้ดพบบั๊ก ให้จดไว้ใน `.scratch/` แล้วรายงาน ไม่ใช่แก้ตอนนั้น
3. **ห้ามรัน `node server.js` ในเครื่องลอคอล** (กฎ GEMINI.md §1 — production อยู่บน Render เท่านั้น) เครื่องมือตรวจที่อนุญาต: `node -c <file>`, `npm test`, grep/diff
4. **ห้ามแตะสิ่งเหล่านี้โดยไม่มีคำสั่งจากเจ้าของโปรเจ็กต์:**
   - `server/.env` และตัวแปรบน Render
   - ข้อมูล/สคีมาบน Supabase production
   - โปรโตคอล Serial ทุกไบต์ (ข้อควรระวังจาก ADR-029: บิตแมป 2,560 ไบต์ → chunk 16 ไบต์ = 32 hex chars, ไม่เกิน 49 ตัวอักษร/บรรทัด, หน่วง 5ms ระหว่าง chunk)
   - ไฟล์ `server/bridge.js` (ฝั่ง Uno Q เชื่อม production)
5. **ห้ามเพิ่ม/ลบ dependency ใหม่** (`package.json`, Python packages) — ใช้ของเดิมทั้งหมด
6. **ทำทีละ Phase, จบ Phase ต้อง commit แยก** — ห้ามยุบรวมหลาย phase ใน commit เดียว และ phase ถัดไปต้องเริ่มจาก commit ที่ผ่านการตรวจแล้วเท่านั้น
7. **ถ้า phase ใดตรวจไม่ผ่าน ให้หยุดและรายงาน** — ห้าม improvise, ห้ามแก้โดยเปลี่ยนพฤติกรรมเพื่อให้ test ผ่าน
8. **ผูกพันกับเอกสาร workspace:** ปฏิบัติตาม `GEMINI.md` (domain invariants §2: Course-Scoped Attendees, Non-Punitive Records, Weekly Isolation ISO-8601) และอัปเดตเอกสารทุกครั้ง (GEMINI.md §3): `PROJECT_STATE.md`, `DECISIONS.md` (จด ADR ใหม่ — ADR ล่าสุดคือ ADR-033 เริ่มนับใหม่ที่ ADR-034)
9. **Deploy:** push ไป `origin/website` ตามกฎ GEMINI.md เมื่อ phase ผ่านการตรวจครบเท่านั้น — ห้าม push ขณะใดขณะหนึ่งที่ `npm test` ไม่เขียว

---

## 📋 ผลตรวจข้อเท็จจริง (Fact-Check) — ตัวเลขจริง ณ วันที่ 2026-09-16

| # | ข้อกล่าวอ้างจากแผนเดิม | ผลตรวจ | หลักฐาน |
|---|---|---|---|
| 0 | — | ⚠️ **พบเพิ่ม:** มีโฟลเดอร์ `Fingerprint/` ซ้อนใน root เป็นสำเนาซ้ำของทั้งโปรเจ็กต์ (untracked, `git ls-files | grep -c "^Fingerprint/"` = 0) | ทำให้ grep/wc เจอไฟล์ซ้ำสองชุด |
| 1 | server.js 1,751 บรรทัด monolith | ✅ ตรง (จริง ๆ **1,777 บรรทัด**), 24 routes ผูกตรงกับ `app` ไม่มี Router, `handleSerialData` ยาว ~850 บรรทัด (server.js:495 → ~1346) | `grep -n "app\.\(get\|post\|...\)"` |
| 2 | database.js ใช้ Regex แปลง SQL | ⚠️ ผิดรายละเอียด — **ไม่ใช้ Regex** แต่ใช้ `s.includes('FROM USERS')` จับ keyword แล้ว dispatch ไป query Supabase ที่ hardcode (เปราะบางกว่า regex: if/else พึ่งลำดับ, ต้องมี exclude เช่น database.js:199) | อ่าน `server/database.js` ทั้งไฟล์ (325 บรรทัด, adapter อยู่ 40-312) |
| 3 | npm test ยิง Supabase จริง | ✅ ตรง — รันจริงได้: **20/20 ผ่าน + warning** `⚠️ [Supabase] บันทึกเวลาเข้าเรียนขึ้น Cloud ไม่สำเร็จ: Unregistered API key` | รัน `npm test` ใน `server/` |
| 4 | unoq_bridge.py รวม View + Comm | ✅ ตรง (1,055 บรรทัด, render 7 ฟังก์ชัน) | บรรทัด 183, 224, 258, 331, 373, 417, 451 |
| 5 | sketch.ino รวม Driver + Protocol | ✅ ตรง (1,535 บรรทัด, คลาส ST7735_TFT ที่ 146-~520) | `grep -n "class \|void "` |
| 6 | Frontend ซ้ำกัน 3 ไฟล์ | ❌ **ไม่ตรง** — ไม่มี `users.js` (users.html โหลด app.js), `playSound` มีแค่ app.js:19, `showToast` มีแค่ schedules.js:898, `formatDateTime` มีแค่ app.js:245, auth เป็น cookie-based (server.js:55) | `ls server/public/js/` |

**ข้อสรุปเชิงแผน:** ทำข้อ 3 → 1 → 2 → 4 → 5 ตามลำดับด้านล่าง และ **ข้อ 6 ตัดออกจากขอบเขต (descoped)** ตามหลักฐาน

---

## 📏 Baseline ที่ต้องคงไว้ (ตรวจก่อน-หลังทุก Phase)

### Phase 0 ต้องสร้าง snapshot ไว้เป็นสัญญา (Contract) ก่อนแตะโค้ดใด ๆ

```bash
# สร้างไว้ใน .scratch/baseline/ (git track ได้ ใช้เทียบหลัง refactor)
grep -nE "app\.(get|post|put|delete|patch)\(" server/server.js   > .scratch/baseline/routes.txt
grep -nE "(io|socket)\.(on|emit|use)\(" server/server.js         > .scratch/baseline/socket_events.txt
grep -nE "dbAsync\.(get|all|run)\(" server/server.js             > .scratch/baseline/dbasync_calls.txt
grep -nE "def (render_|send_)" unoq_bridge.py                    > .scratch/baseline/views.txt
cd server && npm test 2>&1 | tail -15                            > .scratch/baseline/npm_test.txt
```

**ค่าที่ห้ามเปลี่ยน (ยืนยันแล้ว ณ วันที่จัดทำ):**

| รายการ | ค่า Baseline |
|---|---|
| `npm test` | **20 tests, 6 suites, 20 pass, 0 fail** (ดู `baseline/npm_test.txt`) |
| Warning ที่อนุญาตให้หายได้ | มีเพียงอันเดียว: `Unregistered API key` → **หายได้หลัง Phase 1 เท่านั้น และห้ามมี warning อื่นเกิดขึ้นแทน** |
| Routes | **24 routes** ตามตารางด้านล่าง — path, method, ลำดับ middleware (`authRequired`, `loginLimiter`, `upload.single('file')`) ต้องตรงเป๊ก |
| Supabase query semantics | ดู §Phase 3 — ทุก branch มีดีเทลที่ต้องเลียนแบบเป๊ก |
| โปรโตคอลจอ TFT | 2,560 ไบต์ / chunk 16 ไบต์ / 5ms delay (ADR-029) |

### ตารางสัญญา 24 Routes (ห้ามเปลี่ยน path/method/middleware)

| Method | Path | บรรทัดเดิม | Middleware |
|---|---|---|---|
| POST | /api/auth/login | 801 | `loginLimiter` |
| POST | /api/auth/logout | 827 | — |
| GET | /api/auth/me | 832 | `authRequired` |
| POST | /api/auth/change-password | 837 | `authRequired` |
| GET | /api/users | 873 | `authRequired` |
| POST | /api/users | 882 | `authRequired` |
| DELETE | /api/users/:id | 934 | `authRequired` |
| GET | /api/logs | 962 | `authRequired` |
| GET | /api/stats | 1005 | `authRequired` |
| GET | /api/rooms | 1033 | `authRequired` |
| POST | /api/rooms/active | 1043 | `authRequired` |
| DELETE | /api/rooms/:roomName | 1063 | `authRequired` |
| POST | /api/schedules/preview-excel | 1080 | `authRequired`, `upload.single('file')` |
| GET | /api/schedules | 1094 | `authRequired` |
| GET | /api/schedules/current | 1105 | `authRequired` |
| GET | /api/schedules/:id/attendance | 1115 | `authRequired` |
| GET | /api/schedules/:id/export-excel | 1126 | `authRequired` |
| GET | /api/schedules/:id/export-matrix | 1145 | `authRequired` |
| POST | /api/schedules/import-excel | 1162 | `authRequired`, `upload.single('file')` |
| GET | /api/device/serial-status | 1195 | `authRequired` |
| POST | /api/device/backup/:id | 1205 | `authRequired` |
| POST | /api/device/restore/:id | 1226 | `authRequired` |
| POST | /api/device/restore-all | 1263 | `authRequired` |
| POST | /api/device/backup-all | 1306 | `authRequired` |

---

## 🗺️ แผนงานทีละ Phase

### Phase 0: เตรียมพื้นที่ (ไม่แตะ logic)
1. ลบโฟลเดอร์ `Fingerprint/` (สำเนาซ้ำ untracked) — **ตรวจก่อนลบ:** `git ls-files | grep -c "^Fingerprint/"` ต้องเป็น 0 (ยืนยันแล้วว่าเป็น 0) แล้วลบด้วยการลบไดเรกทอรีปกติ ไม่ใช่ git rm
2. สร้าง snapshot ตามคำสั่งใน §Baseline และ commit snapshot เป็นจุดอ้างอิง
3. **เกณฑ์ผ่าน:** baseline ไฟล์ครบ 5 ไฟล์, `npm test` เขียว 20/20, `git status` สะอาด

### Phase 1: Seam Supabase ให้ test Hermetic (ADR-034) — เสี่ยงต่ำสุด
**ปัญหาที่พิสูจน์แล้ว:** `server/schedules_manager.js:5-9` require `./database` แบบมี try/catch แล้ว แต่ catch ช่วยไม่ได้เมื่อ env หาย เพราะ `server/database.js:32` ใช้ `process.exit(1)` ซึ่ง try/catch ดักไม่ได้ และเครื่อง dev มี `server/.env` อยู่ ทำให้ได้ client key ไม่ถูกต้อง แล้ว `recordSessionAttendance` (schedules_manager.js:618-644) ยิงขึ้น cloud ระหว่าง test

**สิ่งที่ทำ (สองขั้น แยกกันชัดเจน):**
1. เพิ่ม setter ใน `schedules_manager.js` (ทุก call site ของ supabase ในไฟล์นี้มี guard `if (supabase)` อยู่แล้ว — ให้ client เป็น null คือปิดเครือข่าย):
   ```js
   function setSupabaseClient(client) { supabase = client; }
   // export เพิ่มใน module.exports พร้อมของเดิม
   ```
2. ใน `tests/test_schedules_manager.js` — หลัง `require('../server/schedules_manager')` ให้เรียก `setSupabaseClient(null)` ก่อนชุดทดสอบรัน (module top-level ไม่ยิงเครือข่ายเอง warning เกิดเฉพาะตอน test เรียก `recordSessionAttendance`)
3. **แยก commit นี้ออกเป็นขั้นที่สอง (ทำหลัง 1-2 ผ่าน):** เปลี่ยน `process.exit(1)` ใน `database.js:32` เป็น `throw new Error(...)` แล้วย้ายการจับ/exit ไปที่ bootstrap ของ `server.js` (`start()` หรือก่อน `app.listen`) — พฤติกรรมรวมต้องเท่าเดิม: server ต้องไม่ boot เมื่อ env หาย
4. **เกณฑ์ผ่าน:** `npm test` = 20 pass / 0 fail / **ไม่มี warning Supabase แม้แต่บรรทัดเดียว** / ระยะเวลารันไม่เพิ่มจาก baseline (~2.3s) / `node -c` ผ่านทุกไฟล์ที่แตะ

### Phase 2: แตก server.js → routes/ + controllers/ (ADR-035)
1. สร้าง `server/routes/auth.js`, `users.js`, `schedules.js`, `logs.js` (รวม `/api/stats`), **`device.js`** (แผนเดิมลืมกลุ่มนี้ — 5 routes บรรทัด 1195-1346) แต่ละไฟล์ export `express.Router()` / ใน server.js เหลือ `app.use('/api/auth', require('./routes/auth'))` เป็นต้น
2. ย้าย `authRequired` และ `loginLimiter` ไปที่เดียว (แนะนำ `server/middleware/auth.js`) — ห้ามแก้ logic JWT/cookie (`req.cookies.token || authorization header`) เด็ดขาด
3. สร้าง `server/controllers/serial_controller.js` แบบ factory รับ context (เทียบแบบที่ `enrollment_manager.js` ทำไว้): ครอบ `initSerial, scheduleReconnect, sendSerialCommand, sendNextRestoreChunk, sendNextCompareChunk, startTier2Search, checkNextTier2Candidate, autoPromoteToSensor, processScanEvent, cleanupFailedEnroll, handleSerialData` (server.js:103-~1340)
4. **จุดเสี่ยงสูงสุด:** state ร่วม (`serialPort`, `serialParser`, cache, `io`) ที่ route device กับ serial handler ใช้ร่วมกัน ต้องมีเจ้าของเดียวคือ controller แล้ว route เรียกผ่านเท่านั้น — **ห้ามทำ state สองชุด** / `multer` `upload` instance และ static serving / CORS / cookie-parser อยู่ที่ server.js เดิมทุกอย่าง
5. **เกณฑ์ผ่าน:** `diff .scratch/baseline/routes.txt <(grep -nE "..." ใหม่)` — path/method/middleware ตรงเป๊กทั้ง 24 / diff socket_events.txt ตรงเป๊ก / `npm test` 20/0 / `node -c server/server.js` ผ่าน

### Phase 3: Repository Pattern (ADR-036) — ทำหลัง Phase 2
1. สร้าง `server/repositories/UserRepository.js`, `AdminRepository.js`, `AccessLogRepository.js` ด้วย Supabase Query Builder ตรง โดย call sites มี **37 จุดใน server.js** (ดู baseline/dbasync_calls.txt) — 0 จุดใน schedules_manager.js
2. **แมปทุก branch ของ dbAsync (server/database.js:40-312) แบบ 1:1 เลียนแบบพฤติกรรมเป๊ก รวมถึงดีเทลที่ดูเหมือนขยะแต่คือพฤติกรรมจริง:**
   - `all()`: 4 branches — เช่น Tier-2 candidates ต้องมี `.or('in_sensor.eq.0,in_sensor.is.null')`, `.not('fingerprint_template','is',null)`, order `last_scanned_at desc nullsLast`, `.limit(60)`, และ filter `.length >= 512` ในฝั่ง JS
   - `get()`: 8 branches — เช่น stats ต้องคง logic timezone กรุงเทพ (`+7*3600*1000`, database.js:163-168) และ fallback คืน `null` เมื่อไม่เข้าเคสใด
   - `run()`: 11 branches — เช่น `INSERT INTO access_logs` ต้อง `.select('id').single()` แล้วคืน `{ lastID, changes: 1 }`, ตัด whitespace จาก template (`.replace(/\s+/g,'')`, database.js:209), ข้าม timestamp เมื่อเป็น 'now'
3. ย้าย call sites ทีละ repository → ลบ `dbAsync` ได้เมื่อ call site เหลือ 0 → `initDatabase` และ custom `.env` loader (database.js:6-23) คงไว้เดิม
4. **เกณฑ์ผ่าน:** `grep -c "dbAsync\." server/*.js` = 0 / `npm test` 20/0 / ไม่มีไฟล์ใด query Supabase ด้วย pattern string-matching หลงเหลือ

### Phase 4: แยก unoq_views.py (ADR-037) — ฝั่งบอร์ด ไม่กระทบ Render
1. ย้ายจาก `unoq_bridge.py`: Pillow imports + ตัวแปลงบิตแมป (บรรทัด 158-181) + render ทั้ง 7 (`render_idle_screen:183, render_denied_screen:224, render_user_card:258, render_confirm_success:331, render_already_checked_in:373, render_cancelled_screen:417, render_timeout_screen:451`) ไปไฟล์ root `unoq_views.py` (โฟลเดอร์เดียวกัน — deployment บนบอร์ดต้องพา 2 ไฟล์ไปด้วยกัน)
2. bridge เรียก `from unoq_views import ...` / เพิ่ม `if __name__ == '__main__':` ใน unoq_views.py สำหรับ export PNG ทุกหน้าจอบนเครื่อง dev (เครื่องมือดู layout โดยไม่ต้องต่อบอร์ด)
3. อัปเดต `tests/test_unoq_bridge.py` ให้ import จากที่ใหม่ (ไฟล์นี้ mock socketio/PIL อยู่แล้ว แก้เฉพาะ path)
4. **เกณฑ์ผ่าน:** `diff` views.txt ตรงเป๊ก (แค่เปลี่ยนไฟล์ที่อยู่) / pytest หรือ `python -m unittest tests/test_unoq_bridge.py` เขียวเท่า baseline / PNG export ได้ครบทุกหน้าจอ / ห้ามเปลี่ยน byte ที่ส่งออกจาก `send_bitmap_to_mcu` แม้แต่ไบต์เดียว

### Phase 5: แยก sketch/ST7735_TFT.h + sketch/protocol.h (ADR-038)
1. ย้าย `class ST7735_TFT` (sketch.ino:146-~520) ไป `ST7735_TFT.h` พร้อม include guard / นิยาม state + คำสั่ง Serial ไป `protocol.h`
2. **ข้อควรระวัง Arduino:** ไฟล์ .h ต้องอยู่ในโฟลเดอร์ `sketch/` เดียวกัน / .ino เดิมพึ่ง auto-prototype generation — พอย้ายโค้ดออก ต้องประกาศ prototype เองครบ / คง `#include <Adafruit_Fingerprint.h>` และ `#define mySerial Serial1` (บรรทัด 1-36) ไว้ที่เดิม
3. **เกณฑ์ผ่าน (บังคับ):** compile ผ่านด้วย `arduino-cli compile` ถ้ามีในเครื่อง หรือ Arduino IDE ก่อน commit — **ห้าม commit sketch ที่ compile ไม่ผ่านทุกกรณี** / ไบนารีที่ได้ต้องมีขนาดใกล้เคียงเดิม (แค่ย้ายโค้ด ไม่เปลี่ยน logic)

### Phase 6 (DESCOPED — ห้ามทำโดยไม่มีคำสั่ง)
ข้อ "รวม common.js ฝั่ง Frontend" จากแผนเดิม **ถูกตัดออก** เพราะตรวจแล้วไม่มี duplication 3 ไฟล์ตามที่อ้าง (ไม่มี users.js, แต่ละ utility มีไฟล์เดียว) — หากเจ้าของโปรเจ็กต์ต้องการภายหลัง ให้เปิด issue ใหม่ใน `.scratch/`

---

## ✅ Checklist ปิดโปรเจ็กต์ (Definition of Done)

- [ ] ทุก Phase มี commit แยก + ADR ครบ (ADR-034 ถึง ADR-038) ใน `DECISIONS.md`
- [ ] `PROJECT_STATE.md` อัปเดต "โครงสร้างไฟล์" และ "สิ่งที่ทำเสร็จแล้ว" ตาม GEMINI.md §3
- [ ] `npm test`: 20 pass / 0 fail / ไม่มี warning network (Phase 1 เป็นต้นไป)
- [ ] Snapshot diff ทุกไฟล์ (routes, socket_events, views) ตรง baseline 100%
- [ ] `grep -c "dbAsync\." server/*.js` = 0 และไม่มี string-matching SQL dispatch หลงเหลือ
- [ ] sketch compile ผ่าน / PNG export จาก unoq_views.py ได้ครบ
- [ ] `server.js` เหลือหน้าที่ bootstrap เท่านั้น
- [ ] ไม่มี dependency ใหม่, ไม่มีข้อความ error/UI เปลี่ยน, ไม่มี path/event เปลี่ยน

## 🔁 ถ้าเจอความขัดแย้งระหว่างทำงาน

ลำดับความสำคัญ: **พฤติกรรมเดิม 100% > แผนในเอกสารนี้ > ความสวยงามของโค้ด**
ถ้า phase ใดพบว่าต้องเปลี่ยนพฤติกรรมเพื่อให้ refactor สำเร็จ — ให้**หยุด** จดประเด็นลง `.scratch/` แล้วรายงานกลับเจ้าของโปรเจ็กต์เพื่อตัดสินใจ ไม่ใช่ดำเนินการต่อเอง
