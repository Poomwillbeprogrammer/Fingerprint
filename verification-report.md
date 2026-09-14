# 📋 รายงานผลการตรวจสอบการแก้ไขตาม handoff.md

> **วันที่ตรวจ:** 2026-09-12
> **ขอบเขต:** โค้ดในเครื่อง (commit `40c1690 fix(security)`) + production จริงที่ `https://fingerprint-hrkp.onrender.com`
> **วิธีตรวจ:** อ่านโค้ดทุกไฟล์ที่เกี่ยวข้อง → ยิง API จริงด้วย curl (ทั้งแบบไม่มีสิทธิ์และมี cookie) → ทดสอบ Socket.IO ด้วย Node script (รวมการปลอม token) → ทดสอบหน้าเว็บจริงในเบราว์เซอร์ด้วยบัญชี admin

---

## 🎯 สรุปผลรวม

| ข้อ | รายการ | สถานะ |
|---|---|---|
| P0-1 | Supabase key รั่วในโค้ด | ✅ **แก้แล้ว** (rotate ยืนยันแล้ว) |
| P0-2 | JWT secret เป็นค่า hardcoded | ✅ **แก้แล้ว** (rotate ยืนยันแล้ว) |
| P0-3 | API ไม่มีการยืนยันตัวตน | ✅ **แก้แล้ว** (401 ทุก endpoint) |
| P0-4 | Socket.IO เปิดหมด | ⚠️ **แก้ส่วนใหญ่ — เหลือ 1 ช่องโหว่** |
| P0-5 | Default credentials + ไม่มี rate limit | ✅ **แก้แล้ว** |
| P1-6 | ตาราง dashboard พัง (`/api/logs` 500) | ✅ **แก้แล้ว** |
| P2-7 | ไม่มี error state เมื่อ API พัง | ✅ **แก้แล้ว** |
| P2-8 | Sidebar กินจอบนมือถือ | ✅ **แก้แล้ว** |
| P2-9 | ข้อความ/รายละเอียดไม่ตรงจริง | ⚠️ **แก้ 3 ใน 4** |
| P3-10 | Code quality | ⚠️ **แก้ 1 ใน 3** (ทำทีหลังได้ตามแผนเดิม) |

**ผลตัดสิน: ใช้งานได้จริงทั้งระบบ บอร์ด Uno Q ยังเชื่อมต่ออยู่ — แต่ต้องแก้ `BRIDGE_TOKEN` อีกจุดเดียวก่อนปิดงาน security**

---

## 🔴 ช่องโหว่ค้างแก้: BRIDGE_TOKEN ใช้ค่า default ที่ hardcode ไว้

**หลักฐาน (ทดสอบจริง 12 ก.ย. 2026):**
- `server.js` และ `bridge.js` ยังมี fallback: `process.env.BRIDGE_TOKEN || 'fingerprint_unoq_bridge_secure_token_2026'`
- ค่านี้ถูก commit ลง Git → ใครอ่าน repo ได้ก็รู้ค่านี้
- ผม connect Socket.IO ไปที่ production ด้วยค่า default นี้ → **เข้าได้จริง** (server ตั้ง role = bridge)
  → แปลว่า **Render ไม่ได้ตั้ง env `BRIDGE_TOKEN`** (ต่างจาก JWT_SECRET ที่ตั้งแล้ว)
- Socket บทบาท bridge มีสิทธิ์: `register_bridge` (เตะบอร์ดจริงออก), `bridge_serial_data` (inject ผลสแกนปลอม), `sync_offline_attendance` (ปลอมบันทึกลงเวลา) — อันตรายระดับเดียวกับ P0-2 เดิม

**สิ่งที่ต้องทำ:**
1. สร้าง token ใหม่ เช่น `openssl rand -hex 32`
2. ตั้ง env `BRIDGE_TOKEN` บน Render **และบนบอร์ด Uno Q** ให้ค่าตรงกัน (ไฟล์ `server/.env` ในเครื่องมี BRIDGE_TOKEN แล้ว แต่ Render ไม่มี)
3. ลบค่า fallback ทิ้งจาก `server.js` และ `bridge.js` ให้ fail fast เหมือน `JWT_SECRET` (บรรทัดเดียวกันทั้งสองไฟล์)
4. Deploy → รอบอร์ด reconnect → ตรวจ dashboard สถานะต้องขึ้น Online อีกครั้ง

---

## รายละเอียดรายข้อ

### ✅ P0-1: Supabase key — แก้แล้ว (rotate จริง)

- โค้ด: `server/database.js:26-33` บังคับ env (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) ไม่มี fallback hardcode แล้ว — ไม่มี env จะ exit(1)
- `.gitignore` ครอบคลุม `.env` และ `.env.*` แล้ว
- **ทดสอบ live:** ยิง Supabase REST ด้วย key เก่า (`sb_publishable_BU-hqTfg...`) → **401 "Unregistered API key"**
  เทียบกับ key มั่ว → "Invalid API key" (error ต่างกัน = key เก่าถูก **rotate/ลบจริง** ไม่ใช่แค่ถูก RLS บล็อก)
- 📌 **ค้างยืนยัน:** RLS ต้องเช็คใน Supabase Dashboard ว่าเปิดทุกตาราง (`users`, `admins`, `access_logs`) และไม่มี SELECT policy ให้ anon — ตรวจจากภายนอกไม่ได้
- 📌 Minor: `database.js:27` ยังยอมรับ `SUPABASE_KEY` เป็น fallback ของ `SUPABASE_SERVICE_ROLE_KEY` — ให้แน่ใจว่าค่าที่ใช้เป็น service role key เท่านั้น

### ✅ P0-2: JWT secret — แก้แล้ว (rotate จริง)

- โค้ด: `server/server.js:28-30` — `JWT_SECRET = process.env.JWT_SECRET` + exit(1) ถ้าไม่มี
- **ทดสอบ live:** ปลอม admin token ด้วย secret เก่า `fingerprint_super_secret_key_2026` แล้ว connect ผ่าน Socket.IO → **ถูกปฏิเสธ "Invalid JWT token"** = secret บน Render เปลี่ยนแล้ว

### ✅ P0-3: API ไม่มี auth — แก้แล้ว

- โค้ด: `authRequired` ครบทั้ง 6 route ที่ handoff ระบุ (server.js: 985, 1046, 1057, 1067, 1078, 1127)
- **ทดสอบ live ไม่มี token → 401 ทั้งหมด:**
  `/api/rooms`, `/api/schedules`, `/api/schedules/current`, `/api/schedules/1/attendance`, `/api/schedules/1/export-excel`, `/api/users`, `/api/logs`, `/api/stats`, `/api/device/serial-status`
- **ทดสอบมี cookie → 200 ทั้งหมด** (หน้าเว็บทุกหน้าส่ง cookie เองถูกต้อง ไม่มีหน้าใดพังหลังใส่ auth)

### ⚠️ P0-4: Socket.IO — แก้ส่วนใหญ่ แต่เหลือช่องโหว่ BRIDGE_TOKEN (ดูหัวข้อด้านบน)

ส่วนที่ผ่านแล้ว:
- Handshake auth middleware ทำงานจริง: connect ไม่ส่ง token → **ถูกบล็อก "Authentication required"**
- แยกบทบาท bridge/admin + guard ทุก event ฝั่ง bridge (`register_bridge`, `bridge_serial_data`, `sync_offline_attendance`) และ event ฝั่งเว็บ (`start_enroll`, `cancel_enroll` เฉพาะ admin)
- `bridge.js` ฝั่ง Uno Q ส่ง `auth: { token: BRIDGE_TOKEN }` แล้ว
- CORS ของ Socket.IO เป็น `origin: true, credentials: true` (same-origin) ตามที่ handoff ยอมรับ
- **ทดสอบ admin จริง:** connect ด้วย JWT ของแอดมิน → ผ่าน ได้ role admin + ได้ `serial_status: {"connected":true,"port":"Cloud Bridge (Active)"}` ทันที

### ✅ P0-5: Default credentials — แก้แล้ว

- ข้อความ "บัญชีเริ่มต้น: admin / admin123" หายจาก `login.html` แล้ว (grep ไม่เจอ + ยืนยันจากหน้าเว็บจริง)
- **ทดสอบ live:** login `admin/admin123` → **401** (เปลี่ยนรหัสแล้ว), login `admin/iot123` → 200
- **Rate limit ทำงานจริง:** ยิงรหัสผิดติดต่อกัน → ครั้งที่ 1-5 ได้ 401, **ครั้งที่ 6 ได้ 429** (5 ครั้ง/นาที/IP ตาม spec)
- **Cookie flags ยืนยันจาก header จริง:** `HttpOnly; Secure; SameSite=Strict` ✅

### ✅ P1-6: ตาราง dashboard พัง — แก้แล้ว

- โค้ด: `loadAttendanceRecords` ถูก export แล้ว (`schedules_manager.js:615`)
- **ทดสอบ live:** `GET /api/logs` → 200 พร้อมข้อมูล (12KB) — ไม่ใช่ 500 อีกต่อไป
- **ทดสอบหน้าเว็บจริง:** ตาราง "ตารางบันทึกการเข้า-ออกล่าสุด" แสดง 50 รายการล่าสุด (ภาพ `t3_dashboard_logs_table.png`)

### ✅ P2-7: Error state — แก้แล้ว

- `js/app.js` มี catch + แสดงแถว "โหลดข้อมูลไม่สำเร็จ + ปุ่มลองใหม่" หลายจุด
- ยืนยันจากหน้าจริง: modal ใบเช็คชื่อแสดง empty state ถูกต้องเมื่อยังไม่มีคนลงเวลา (ภาพ `t4b_attendance_modal.png`)

### ✅ P2-8: Sidebar มือถือ — แก้แล้ว

- โค้ด: มี mobile top bar (`md:hidden`) + ปุ่ม hamburger (`#mobileMenuBtn`) + sidebar เป็น `hidden md:flex` — toggle อยู่ใน `js/app.js` และ `js/schedules.js`
- **ทดสอบ 390px จริง:** sidebar ยุบตั้งแต่แรก เนื้อหาเต็มจอ → กด hamburger เปิดเป็น overlay ได้ → กดซ้ำปิดได้ (ภาพ `t5_mobile_390_*.png`)

### ⚠️ P2-9: รายละเอียด — แก้ 3 ใน 4

- ✅ "บันทึกลง SQLite" → เป็น "บันทึกลง Cloud Database (Supabase) อัตโนมัติ" แล้ว (ยืนยันจากหน้าเว็บจริง)
- ✅ Serial status: ใช้ `'Cloud Bridge (Active)'` ถูกต้องทั้งจาก API และหน้าเว็บ (ไม่โชว์ COM12 ปลอมแล้ว)
- ✅ favicon: `favicon.ico` + `favicon.svg` มีใน `public/` — request ได้ 200
- ❌ **ยังโหลด `cdn.tailwindcss.com` (dev build) ทั้ง 4 หน้า** (`index.html:8`, `login.html:7`, `schedules.html:8`, `users.html:8`) — มี `/css/style.css` เพิ่มแล้วแต่ CDN ยังไม่เอาออก

### ⚠️ P3-10: Code quality — แก้ 1 ใน 3 (handoff ยอมรับว่าทำทีหลังได้)

- ✅ Login ไม่คืน JWT ทาง JSON แล้ว — `res.json` มีแค่ `{success, message, username}` เหลือ token ใน cookie httpOnly เท่านั้น
- ❌ ยังไม่มี helmet (ไม่มี CSP / X-Frame-Options) — ไม่พบใน `package.json` และ `server.js`
- ⚠️ Git history ยังมี key เก่า (ยังไม่ได้ rewrite ด้วย BFG) — rotate แล้วจึง risk ต่ำ ทำได้เมื่อพร้อม

---

## ✅ สิ่งที่ยืนยันเพิ่มเติม (ความเสี่ยงที่ handoff เตือนไว้ — ไม่เกิด)

- **บอร์ด Uno Q ยังเชื่อมต่อได้ปกติหลัง deploy:** `/api/device/serial-status` → `{"connected":true,"port":"Cloud Bridge (Active)"}` และ dashboard ขึ้น "R307 Online" (ภาพ `t3_dashboard_logs_table.png`)
- ข้อมูล production ไม่ถูกแตะต้องระหว่างการทดสอบ (ทดสอบทั้งหมดเป็นการอ่าน ยกเว้น login ซึ่งเป็นบัญชีของระบบเอง)
- การทดสอบ socket ฝั่ง bridge ผมเชื่อมต่อเฉยๆ เพื่อพิสูจน์ช่องโหว่เท่านั้น **ไม่ได้ emit `register_bridge`** เพื่อไม่เตะบอร์ดจริงออก

---

## 🧾 ภาคผนวก: ภาพหลักฐานการทดสอบ (โฟลเดอร์ `verification-screenshots/`)

| ไฟล์ | สิ่งที่พิสูจน์ |
|---|---|
| `t1_login_page.png` | หน้า login สะอาด ไม่มีข้อความบัญชีเริ่มต้น (P0-5) |
| `t3_dashboard_logs_table.png` | ตาราง logs แสดงข้อมูลจริง 50 รายการ, ข้อความ Supabase, bridge Online (P1-6, P2-9) |
| `t4_schedules_page.png` | หน้าตารางเรียนโหลด 22 คาบ + ปุ่มเช็คชื่อ/Excel ครบ (P0-3 ไม่ทำหน้าพัง) |
| `t4b_attendance_modal.png` | Modal ใบเช็คชื่อ + empty state ถูกต้อง (P2-7) |
| `t5_mobile_390_initial.png` | มือถือ 390px: sidebar ยุบ เนื้อหาเต็มจอ (P2-8) |
| `t5_mobile_390_menu_open.png` | Hamburger เปิดเมนูเป็น overlay ได้ (P2-8) |
| `t5_mobile_390_menu_closed.png` | กดปิดเมนูแล้วกลับสู่สถานะยุบ (P2-8) |

### บันทึกการทดสอบหลัก (production จริง)

```text
# ไม่มี token → 401 ทั้งหมด (P0-3)
GET /api/rooms|/api/schedules|/api/schedules/current|/api/schedules/1/attendance
   |/api/schedules/1/export-excel|/api/users|/api/logs|/api/stats|/api/device/serial-status → 401 ทั้งหมด
POST /api/auth/login {admin, admin123}          → 401  (P0-5: รหัสเก่าตาย)
POST /api/auth/login ผิดซ้ำ ครั้งที่ 6          → 429  (P0-5: rate limit)
GET  /favicon.ico                               → 200  (P2-9)
Supabase REST ด้วย key เก่า                     → 401 "Unregistered API key" (P0-1: rotate แล้ว)
Socket.IO ไม่ส่ง token                          → "Authentication error: Authentication required" (P0-4)
Socket.IO token ปลอมด้วย JWT secret เก่า        → "Authentication error: Invalid JWT token" (P0-2)
Socket.IO token = default BRIDGE_TOKEN          → ⚠️ CONNECTED (role=bridge) ← ช่องโหว่ค้างแก้
Socket.IO JWT แอดมินจริง                        → CONNECTED (role=admin) + serial_status ถูกต้อง
มี cookie → API ทุกตัว 200, /api/logs มีข้อมูล, export-excel เป็น .xlsx จริง 17.5KB
```

---

## 📌 สรุปงานที่เหลือ (เรียงตามลำดับความสำคัญ)

1. **[P0] ตั้ง `BRIDGE_TOKEN` บน Render + บอร์ด Uno Q และลบ fallback ใน `server.js`/`bridge.js`** → deploy → ตรวจบอร์ด reconnect
2. **ยืนยัน RLS ใน Supabase Dashboard** (เปิดทุกตาราง, ไม่มี policy ให้ anon)
3. เอา `cdn.tailwindcss.com` ออกจาก 4 หน้า เปลี่ยนเป็น CSS build แล้ว (P2-9)
4. เพิ่ม helmet (P3-10) / พิจารณา rewrite git history (P3-10, ไม่เร่ง)

> **หมายเหตุ:** ภาพใน `verification-screenshots/` เป็นหลักฐานประกอบรายงาน — จะ commit ขึ้น Git หรือไม่ก็ได้ตามต้องการ (ถ้าไม่เอา ให้เพิ่ม `verification-screenshots/` ลง `.gitignore`)
