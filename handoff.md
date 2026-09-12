# 🔐 HANDOFF: Security & Bug Fixes — Fingerprint Attendance System

> **เอกสารนี้สำหรับ AI Agent (Antigravity) นำไปลงมือแก้ต่อ**
> ผลมาจากการ audit จริงเมื่อ 2026-09-12 (อ่าน source ทั้งหมด + ทดสอบ production ที่ `https://fingerprint-hrkp.onrender.com`)
> ทุกข้อยืนยันด้วยหลักฐานจริง ไม่ใช่การเดา — ทำตามลำดับความสำคัญ P0 → P3

---

## 📌 บริบทโปรเจกต์

- ระบบลงเวลาลายนิ้วมือ: Arduino UNO Q (bridge.py) → Node.js/Express + Socket.IO บน Render → Supabase Postgres
- หน้าเว็บ: `login.html`, `index.html` (dashboard), `schedules.html`, `users.html` (ทั้งหมดใน `server/public/`)
- Deploy: Render (Cloud Mode, `SERIAL_ENABLED=false`, บอร์ดต่อผ่าน `bridge.js`)
- DB จริงมีข้อมูล production: users 2 คน, access_logs 135 แถว, ตารางเรียนจริง 22 คาบ
- ⚠️ **ข้อควรระวังตลอดการแก้:** ห้ามทำให้ hardware bridge (`bridge.js` ฝั่ง Uno Q) เชื่อมต่อไม่ได้ และห้ามแก้ข้อมูลบน Supabase production โดยไม่จำเป็น

---

## 🔴 P0-1: ข้อมูลรั่วผ่าน Supabase key ที่ฝังในโค้ด (รั่วจริง ยืนยันแล้ว)

**หลักฐาน:** `server/database.js:4-5` มี URL + key (`sb_publishable_BU-hqTfg...`) hardcode ไว้
ทดสอบยิง Supabase REST ตรงจากภายนอกด้วย key นี้: **อ่านตาราง `users` ได้ (2 แถว) และตาราง `admins` ที่มี `password_hash` ก็อ่านได้ (1 แถว)** — ตาราง `users` ยังมีคอลัมน์ `fingerprint_template` ซึ่งเป็นข้อมูลชีวมิติ (ข้อมูลส่วนบุคคลที่มีความอ่อนไหวตาม PDPA)

**สาเหตุ 2 ชั้น:**
1. key ถูก commit ลง Git (ต้อง rotate)
2. RLS ของ Supabase เปิดให้ anon/publishable role SELECT ได้ทุกตาราง (นี่คือช่องโหว่จริง — publishable key ออกแบบมาให้เปิดเผยได้ ถ้า RLS ปิดกั้นถูกต้อง)

**สิ่งที่ต้องทำ:**
1. ไปที่ Supabase Dashboard → Settings → API → **Rotate keys** (key เก่าตายทันทีหลัง rotate)
2. เปิด **RLS (Row Level Security)** ทุกตาราง: `users`, `admins`, `access_logs` — และ**ไม่สร้าง SELECT policy สำหรับ anon เลย** (เซิร์ฟเวอร์ต้องใช้ `service_role` key เท่านั้น)
3. แก้ `server/database.js`: ลบค่า fallback ออกทั้งหมด →
   ```js
   const SUPABASE_URL = process.env.SUPABASE_URL;
   const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
   if (!SUPABASE_URL || !SUPABASE_KEY) {
     console.error('❌ Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
     process.exit(1);
   }
   ```
4. ตั้ง env บน Render: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (service role — ห้ามใช้ publishable/anon key ฝั่ง server เพราะ RLS จะบล็อก)
5. เพิ่ม `.gitignore` กัน secret (มีอยู่แล้วให้ตรวจว่าครอบคลุม `.env*`)

**ตรวจสอบหลังแก้:**
```bash
# ต้องได้ 401/empty จากภายนอก (key เก่าตายแล้ว + RLS ปิด)
curl -s "https://<PROJECT_REF>.supabase.co/rest/v1/users?select=id&limit=1" -H "apikey: <KEY_เก่า>"
# server ต้อง boot ไม่ขึ้นถ้าไม่มี env
```

---

## 🔴 P0-2: JWT secret ของ production คือค่า hardcoded (ปลอม token แอดมินได้)

**หลักฐาน:** `server/server.js:26` — `const JWT_SECRET = process.env.JWT_SECRET || 'fingerprint_super_secret_key_2026';`
ทดสอบ: เอา secret นี้คำนวณ HMAC กับ token ที่ production ออกมา → **signature ตรงกัน 100% (MATCH: true)** แปลว่า Render ไม่ได้ตั้ง env และทุกคนที่อ่าน repo ได้ สร้าง token แอดมินปลอมได้ทันที

**สิ่งที่ต้องทำ:**
1. แก้ `server.js:26` เป็นบังคับ env (fail fast ถ้าไม่มี):
   ```js
   const JWT_SECRET = process.env.JWT_SECRET;
   if (!JWT_SECRET) { console.error('❌ Missing JWT_SECRET'); process.exit(1); }
   ```
2. ตั้ง env `JWT_SECRET` บน Render ด้วยค่า random ยาว (เช่น `openssl rand -hex 32`)
3. สร้าง secret ใหม่ = token เดิมหมดอีกด้วย (ตั้งใจ)

**ตรวจสอบ:** login แล้วเอา token ไป verify ด้วย secret เก่าต้อง fail

---

## 🔴 P0-3: API ข้อมูลนักศึกษา + Excel export ไม่มีการยืนยันตัวตน

**หลักฐาน (ทดสอบจริงที่ production, ไม่มี cookie/token):**
- `GET /api/rooms` → 200 (เห็นห้อง + อาคาร)
- `GET /api/schedules` → 200 (ตารางสอนเต็ม + ชื่ออาจารย์ทั้งหมด)
- `GET /api/schedules/1/attendance` → 200 (รายชื่อคนลงเวลา + รหัสนักศึกษา)
- `GET /api/schedules/1/export-excel` → **200 ได้ไฟล์ .xlsx จริง 17KB**
- `GET /api/device/serial-status` → 200

**สาเหตุ:** route เหล่านี้ไม่ได้ใส่ middleware `authRequired` (มีตัวอย่างที่ถูกแล้วคือ `/api/users`, `/api/logs`)

**สิ่งที่ต้องทำ** — เติม `authRequired` ที่ `server.js` บรรทัดเหล่านี้:
| Route | บรรทัด |
|---|---|
| `app.get('/api/rooms', ...)` | 963 |
| `app.get('/api/schedules', ...)` | 1024 |
| `app.get('/api/schedules/current', ...)` | 1035 |
| `app.get('/api/schedules/:id/attendance', ...)` | 1045 |
| `app.get('/api/schedules/:id/export-excel', ...)` | 1056 |
| `app.get('/api/device/serial-status', ...)` | 1105 |

⚠️ ตรวจด้วยว่าหน้าเว็บทุกหน้า login ก่อนเรียก API เหล่านี้แล้ว (cookie `token` ถูกส่งไปเอง) — หน้า schedules ใช้ fetch ปกติจึงน่าจะผ่าน แต่ต้องทดสอบในเบราว์เซอร์จริงทุกหน้าหลังแก้

**ตรวจสอบ:**
```bash
curl -s -o /dev/null -w "%{http_code}" https://fingerprint-hrkp.onrender.com/api/schedules/1/export-excel
# ต้องได้ 401
```

---

## 🔴 P0-4: Socket.IO เปิดหมด — ดึงรายชื่อ/ปลอม bridge/inject ข้อมูลได้

**หลักฐาน (ทดสอบสด):** เปิด socket connection ธรรมดาแล้ว emit `get_users_cache` → ได้รายชื่อทั้งหมด (ชื่อ + รหัสนักศึกษา) กลับมาโดยไม่มี auth
นอกจากนี้ event เหล่านี้ไม่มีการยืนยันตัวตนเลย: `register_bridge` (server.js:1329 — ใครก็ปลอมเป็น hardware bridge และ**เตะ bridge ตัวจริงออก**), `bridge_serial_data` (1393 — inject ผลสแกนปลอมได้), `sync_offline_attendance` (1402 — ปลอมบันทึกลงเวลาได้), `start_enroll`/`cancel_enroll` (1261/1300), และ `io` ตั้ง CORS `origin: '*'` (server.js:18-23)

**สิ่งที่ต้องทำ:**
1. เพิ่ม middleware auth ตอน handshake — ตรวจ JWT จาก `socket.handshake.auth.token`:
   ```js
   io.use((socket, next) => {
     try {
       const token = socket.handshake.auth?.token;
       if (!token) return next(new Error('auth required'));
       socket.admin = jwt.verify(token, JWT_SECRET);
       next();
     } catch { next(new Error('invalid token')); }
   });
   ```
2. **⚠️ แก้ `bridge.js` ฝั่ง Uno Q ให้ส่ง token ด้วย** (เช่น `io(URL, { auth: { token: process.env.BRIDGE_TOKEN } })`) และแยกสิทธิ์: event ฝั่ง bridge (`register_bridge`, `bridge_serial_data`, `sync_offline_attendance`, `get_users_cache`, `get_schedules_cache`, `get_today_attendance`) อนุญาตเฉพาะ socket ที่ auth ด้วย `BRIDGE_TOKEN` / บทบาท bridge, event ฝั่งหน้าเว็บ (`start_enroll`, `cancel_enroll`) อนุญาตเฉพาะ admin
3. เปลี่ยน CORS ของ Socket.IO เป็น whitelist origin ที่ต้องการ (หรือ `origin: true, credentials: true` ถ้า same-origin)
4. ตั้ง env `BRIDGE_TOKEN` บน Render และบนบอร์ด Uno Q ให้ตรงกัน

**ตรวจสอบ:** จาก console เบราว์เซอร์ (ไม่ส่ง token): `io(); s.emit('get_users_cache')` ต้องไม่ได้ข้อมูลกลับ

---

## 🔴 P0-5: Default credentials ใช้ได้จริง + ประกาศบนหน้า login

**หลักฐาน:** `login.html:66` แสดงข้อความ "บัญชีเริ่มต้น: admin / admin123" และล็อกอินด้วยชุดนี้ที่ production สำเร็จ (HTTP 200 + token จริง)

**สิ่งที่ต้องทำ:**
1. ลบ block ข้อความนั้นออกจาก `login.html:65-67`
2. เปลี่ยนรหัสผ่าน admin จริงทันที (หรือ seed ให้รหัสแรก random)
3. เพิ่ม rate limit ง่ายๆ ที่ `POST /api/auth/login` (เช่น 5 ครั้ง/นาที/IP ด้วย express-rate-limit) — ตอนนี้ brute force ได้ไม่จำกัด
4. เพิ่ม cookie flags ที่ `server.js:750`: `sameSite: 'strict'` + (`secure: true` — Render เป็น https)

---

## 🐠 P1-6: บั๊ก — ตาราง dashboard พัง (แก้ 1 บรรทัด)

**หลักฐาน:** เปิด `index.html` แล้วตาราง "ตารางบันทึกการเข้า-ออกล่าสุด" ค้าง "กำลังโหลดประวัติการสแกน..." ตลอด
`GET /api/logs` → **HTTP 500: `schedulesManager.loadAttendanceRecords is not a function`**

**สาเหตุ:** `schedules_manager.js:500` มีฟังก์ชัน `loadAttendanceRecords()` อยู่จริง แต่ `module.exports` (บรรทัด 599-617) **ไม่ได้ export มัน** ขณะที่ `server.js:910` เรียกใช้

**สิ่งที่ต้องทำ:** เพิ่ม `loadAttendanceRecords,` เข้าไปใน `module.exports` ของ `schedules_manager.js`
**ตรวจสอบ:** `GET /api/logs` ต้องคืน 200 พร้อมข้อมูล 135 รายการล่าสุด และตารางบน dashboard แสดงผล

---

## 🟡 P2-7: UX — ไม่มี error state เมื่อ API พัง

ตารางเจอ error ก็หมุน spinner ตลอดไป (พิสูจน์จาก P1-6) ให้เพิ่ม: catch ตอน fetch แล้วแสดงแถว "โหลดข้อมูลไม่สำเร็จ + ปุ่มลองใหม่" ใน `tbody` แทน spinner — ทำใน `app.js` ทุกจุดที่ fetch

## 🟡 P2-8: มือถือ — sidebar กินจอเกินครึ่ง

ที่ความกว้าง 390px sidebar กอดสแตกพื้นหลังตั้ง (~370px แนวตั้ง) ก่อนถึงเนื้อหา ให้ทำ sidebar แบบ hamburger collapse บนจอ < md ทั้ง 4 หน้า (markup ซ้ำกันทุกหน้า — พิจารณาฉีดเป็น shared JS partial ไปเลย เพราะตอนนี้ sidebar ถูก copy 4 ไฟล์ แก้ทีลืมแน่นอน)

## 🟡 P2-9: ข้อความ/รายละเอียดไม่ตรงจริง

- `index.html:92`: "บันทึกลง **SQLite** อัตโนมัติ" → ควรเป็น "บันทึกลง Cloud Database (Supabase) อัตโนมัติ"
- Sidebar บน cloud แสดง "R307 Online (COM12)" ทั้งที่ Render ไม่มี COM12 — `server.js` initial emit ใช้ `TARGET_PORT` เสมอ (บรรทัด 1258) ให้ส่ง label ที่ถูกต้องเมื่อเป็น Cloud Bridge (`'Cloud Bridge (Active)'` มีอยู่แล้วใน register_bridge แต่ initial emit ไม่ตรง)
- favicon 404 → เพิ่ม favicon (icon ลายนิ้วมือเดียวกับ logo)
- ใช้ `cdn.tailwindcss.com` (dev build) ในทุกหน้า — ควร build CSS production จริง (Tailwind CLI) แล้วเปลี่ยนเป็นไฟล์ static

---

## 🟢 P3-10: Code quality (ทำตอนโอเคกับ risk แล้ว)

- `database.js` แปล SQL → Supabase ด้วยการจับ substring (เปราะมาก: แก้ SQL นิดเดียวเงียบได้) → ระยะยาว refactor เรียก supabase client ตรงๆ
- Login คืน JWT ทั้ง JSON และ cookie → เหลือแค่ cookie httpOnly พอ (`server.js:751`)
- ไม่มี CSP / X-Frame-Options → เพิ่ม helmet
- `PROJECT REF: xahasiyjrfrtfovrxynf` — อย่าลืมว่า git history ยังมี key เก่าอยู่ หาก repo public พิจารณา rewrite history (BFG) หลัง rotate

---

## ✅ เช็คลิสต์ยืนยันรวม (รันหลังแก้ทุกข้อ)

```bash
BASE=https://fingerprint-hrkp.onrender.com
# ต้องได้ 401 ทั้งหมด:
for p in /api/rooms /api/schedules /api/schedules/1/attendance /api/schedules/1/export-excel /api/users /api/logs /api/stats /api/device/serial-status; do
  echo "$p -> $(curl -s -o /dev/null -w '%{http_code}' $BASE$p)"
done
# login ด้วย admin123 ต้อง 401:
curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}'
# login ด้วยรหัสใหม่ต้อง 200 แล้วเรียกทุก API ด้วย cookie ต้อง 200
# เปิดเว็บจริง: dashboard ตาราง logs แสดงผล / schedules เช็คชื่อ+export ใช้ได้ / มือถือ 390px sidebar collapse
# บอร์ด Uno Q ต้องยังเชื่อมต่อได้ (สถานะ bridge Online บน dashboard)
```

**ลำดับ deploy ที่ปลอดภัย:** rotate Supabase key + ตั้ง env ทั้งหมดบน Render ก่อน → push โค้ดแก้ → ทดสอบเช็คลิสต์ → ทดสอบ hardware bridge เชื่อมต่อจริง
