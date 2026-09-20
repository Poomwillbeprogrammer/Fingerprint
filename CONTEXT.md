# IoT Biometric Attendance System (Fingerprint)

ระบบลงเวลาเรียนชีวมิติอัจฉริยะผสานฮาร์ดแวร์ Arduino UNO Q, เซนเซอร์ลายนิ้วมือ R307, หน้าจอ 1.8" TFT SPI, และ Cloud Web Dashboard (Render + Supabase) ประจำมหาวิทยาลัยเทคโนโลยีราชมงคลล้านนา (RMUTL)

## Language

### ผู้ใช้งานและความปลอดภัย (Users & Security)

**User**:
นักศึกษาหรือบุคคลที่ลงทะเบียนลายนิ้วมือ 3 นิ้วไว้ในฮาร์ดแวร์เซนเซอร์ R307 และมีรหัสนักศึกษา 12 หลักสำหรับสแกนเข้าชั้นเรียน
_Avoid_: Account, Member, Client, Student (ในระดับ DB schema)

**Account**:
บัญชีผู้ใช้งานสำหรับเข้าสู่ระบบ Web Dashboard ผ่าน Username และ Password เพื่อบริหารจัดการระบบและการเรียนการสอน
_Avoid_: User, Profile, Login

**Super Admin**:
ผู้ดูแลระบบระดับสูงสุด มีสิทธิ์เต็มในการควบคุมฮาร์ดแวร์ R307, สลับห้องประจำการ, จัดการบัญชีผู้ใช้ทั้งหมด, และดูข้อมูลทุกรายวิชา
_Avoid_: Admin, Root, Master

**Teacher**:
อาจารย์ผู้สอนประจำรายวิชา มีสิทธิ์เข้าดูใบเช็คชื่อ, แก้ไขสถานะการเข้าเรียนรายคน, และส่งออกรายงาน Excel เฉพาะวิชาที่ตนได้รับมอบหมาย
_Avoid_: Instructor, Professor, Staff, Lecturer

---

### บริบทการเรียนและเวลา (Academic & Attendance)

**Subject Schedule**:
คาบการเรียนการสอนที่ระบุวัน เวลา ห้องเรียน กลุ่มเรียน และชื่อผู้สอน ซึ่งถูกนำเข้าจากไฟล์ Excel ตารางสอน
_Avoid_: Course, Class, Timetable, Period

**Attendance Record**:
บันทึกประวัติการเข้าชั้นเรียนจริงของนักศึกษาในคาบเรียนและสัปดาห์นั้นๆ (จำกัด 1 ครั้งต่อสัปดาห์ตามมาตรฐาน ISO-8601)
_Avoid_: Log, Scan Log, Check-in Record

**Attendance Status**:
สถานะการเข้าเรียนที่ประเมินจากเวลาสแกนจริงเทียบกับเวลาเริ่มคาบ ได้แก่ ตรงเวลา (ON_TIME) และ มาสาย (LATE) รวมถึงสถานะขาดเรียน (ABSENT) ที่ปรับแก้ด้วยตนเอง (Manual Override) โดยอาจารย์ผู้สอนหรือ Super Admin (ADR-043)
_Avoid_: Grade, Score, Mark

---

### ความปลอดภัยและการควบคุมเวอร์ชัน (Security & Git Hygiene)

**Git Security Hygiene**:
นโยบายรักษาความปลอดภัยของ Git History และ Artifact ห้าม Commit โฟลเดอร์ `node_modules/`, ไฟล์ Native Binaries (`.node`, `.exe`, `.dll`), ไฟล์ Database (`.db`, `.sqlite`), และไฟล์ Credentials (`.env*`) ลงใน Repository เด็ดขาด เพื่อป้องกันการถูก Flag จากระบบความปลอดภัยของ GitHub และหากตรวจพบคีย์หลุดในประวัติย้อนหลัง ต้องทำการหมุนเวียนคีย์ (Rotate Keys) บน Cloud Provider ทันที (ADR-044)
_Avoid_: Force Push Rewrite on Public Remote, Hardcoded Secrets
