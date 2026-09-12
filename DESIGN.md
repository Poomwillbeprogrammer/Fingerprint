---
name: IoT Biometric Attendance System
description: Cyber-physical classroom attendance and hardware dashboard
colors:
  primary: "#06b6d4"
  primary-glow: "rgba(6, 182, 212, 0.25)"
  primary-dark: "#0891b2"
  secondary: "#2563eb"
  accent-cyan: "#22d3ee"
  status-success: "#10b981"
  status-success-glow: "rgba(16, 185, 129, 0.5)"
  status-warning: "#f59e0b"
  status-warning-glow: "rgba(245, 158, 11, 0.5)"
  status-danger: "#f43f5e"
  status-danger-glow: "rgba(244, 63, 94, 0.5)"
  bg-void: "#020617"
  bg-surface: "#0f172a"
  bg-card: "rgba(30, 41, 59, 0.85)"
  bg-glass: "rgba(30, 41, 59, 0.7)"
  border-subtle: "rgba(255, 255, 255, 0.08)"
  border-card: "rgba(255, 255, 255, 0.1)"
  border-slate: "#334155"
  text-main: "#f8fafc"
  text-muted: "#94a3b8"
  text-dim: "#64748b"
typography:
  display:
    fontFamily: "Prompt, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.25
  headline:
    fontFamily: "Prompt, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "Prompt, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Prompt, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "0.6875rem"
    fontWeight: 600
    letterSpacing: "0.05em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-main}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-dark}"
  button-secondary:
    backgroundColor: "{colors.bg-surface}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  card-glass:
    backgroundColor: "{colors.bg-card}"
    rounded: "{rounded.xl}"
    padding: "24px"
  input-field:
    backgroundColor: "{colors.bg-surface}"
    textColor: "{colors.text-main}"
    rounded: "{rounded.lg}"
    padding: "10px 14px"
  badge-status:
    backgroundColor: "rgba(16, 185, 129, 0.15)"
    textColor: "{colors.status-success}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
---

# Design System: IoT Biometric Attendance System

## Overview

**Creative North Star: "The Cyber-Physical Classroom"**

ระบบการออกแบบนี้สะท้อนจุดบรรจบระหว่างความก้าวหน้าของฮาร์ดแวร์ IoT ชีวมิติ (Biometric IoT Hardware) และความเคร่งครัดเป็นระเบียบของระบบวิชาการในมหาวิทยาลัย บรรยากาศโดยรวมถูกสร้างขึ้นในโทน **Deep Tech & Precise** โดยใช้พื้นหลังสีรัตติกาลลึก (Deep Void Slate `#020617` และ `#0f172a`) ตัดกับพื้นผิวแผ่นกระจกฝ้าซ้อนทับ (Glassmorphism) ที่ขับเน้นความรู้สึกเสมือนห้องปฏิบัติการคอมพิวเตอร์ระดับสูงในศตวรรษที่ 21

เอกลักษณ์ของระบบอยู่ที่การใช้แสงสว่างเฉพาะจุด (Luminance Hierarchy) ดุจสัญญาณไฟเซนเซอร์และหน้าจอเทอร์มินัล การปฏิสัมพันธ์ทุกจุดได้รับการออกแบบให้มีความมั่นใจ หนักแน่น และโปร่งใส (Tactile & Confident) ทุกข้อมูลการแตะนิ้ว ตารางสอน และสถานะการเชื่อมต่อบอร์ดฮาร์ดแวร์ ได้รับการจัดลำดับชั้นอย่างมีระเบียบ ไร้สิ่งรบกวนสายตาที่ไม่จำเป็น

**Key Characteristics:**
- **Cyber-Physical Glass Surfaces:** แผงควบคุมและกล่องข้อมูลแบบกระจกฝ้าโปร่งแสง ขอบบาง 1px รับแสงสะท้อนนุ่มนวล
- **Luminous Telemetry Accents:** แสงเรืองรอง (Ambient Glow) ของสี Electric Cyan และสีสถานะชีวมิติ ที่ทำหน้าที่ชี้นำสายตา
- **Bilingual Typographic Harmony:** การจัดวางฟอนต์ภาษาไทย `Prompt` ที่อ่านง่ายและอบอุ่น เข้ากับรหัสตัวเลขทางเทคนิค `JetBrains Mono` ได้อย่างลงตัว
- **Anti-References:** หลีกเลี่ยงหน้าตาแบบ Generic Bootstrap/Admin ขาว-เทา และหลีกเลี่ยงความฉูดฉาดแบบเกมมิ่งคีย์บอร์ด RGB ที่ขาดความน่าเชื่อถือทางวิชาการ

---

## Colors

ชุดสีหลักแบบ **Cybernetic Bio-Lab** ผสมผสานโทนสีดำ-น้ำเงินลึกของจักรวาล เข้ากับแสงนีออนของสัญญาณข้อมูลดิจิทัล

### Primary
- **Electric Cyan** (`#06b6d4` / `#22d3ee`): สีหลักของระบบ เป็นตัวแทนของสัญญาณข้อมูลชีวมิติและฮาร์ดแวร์ดิจิทัล ใช้กับปุ่มแอคชันหลัก, ไอคอนระบบ, เคอร์เซอร์พิมพ์, และเส้นเน้น Active State
- **Cobalt Pulse** (`#2563eb`): สีน้ำเงินเข้มลึกที่ใช้เป็น Gradient คู่กับ Electric Cyan เพื่อสร้างมิติของพลังงานและความมั่นคง

### Secondary
- **Indigo Beam** (`#6366f1`): สีม่วงครามที่ใช้สำหรับป้ายระบุประเภทข้อมูลขั้นสูง เช่น ป้ายสิทธิ์แอดมิน หรือโหมดการประมวลผลพิเศษ

### Status Colors
- **Bio Emerald** (`#10b981` / `#34d399`): สัญลักษณ์ของความถูกต้อง เช่น สถานะ "ตรงเวลา" (On-Time), "R307 Online", และการลงเวลาผ่านสำเร็จ
- **Beacon Amber** (`#f59e0b` / `#fbbf24`): สัญญาณเตือนที่ต้องการความสนใจ เช่น "มาสาย" (Late), "R307 Not Found (สายหลุด/ไม่ได้ต่อ)", และสถานะออฟไลน์รอซิงก์
- **Alert Crimson** (`#f43f5e` / `#fb7185`): สัญญาณข้อผิดพลาดหรือการปฏิเสธ เช่น "ขาดเรียน" (Absent), การสแกนลายนิ้วมือไม่ผ่าน (Denied), และระบบออฟไลน์สมบูรณ์

### Neutral
- **Deep Void Slate** (`#020617`): พื้นหลังสุดลึกของหน้าจอ สร้างความสงัดและลดแสงสะท้อนรบกวนสายตา
- **Surface Slate** (`#0f172a`): พื้นหลังระดับกลางสำหรับคอนเทนเนอร์หลัก แถบนำทาง และช่องกรอกข้อมูล
- **Glass Card Slate** (`rgba(30, 41, 59, 0.85)`): พื้นผิวการ์ดกระจกฝ้าซ้อนทับ พร้อมเส้นขอบขาวบาง 10%
- **Text Main** (`#f8fafc`): สีข้อความหลักสีขาวนวล คอนทราสต์สูง อ่านง่ายสบายตา
- **Text Muted** (`#94a3b8`): สีข้อความรองและคำอธิบายสเตตัสที่ไม่แย่งสายตา

### Named Rules
- **The Telemetry Glow Rule:** สีเน้นเรืองแสง (Cyan, Emerald, Amber, Crimson) จะต้องถูกใช้เฉพาะบนจุดที่มีความหมายทางฟังก์ชัน (สถานะอุปกรณ์, ปุ่มกระทำสำคัญ, ผลการสแกน) เท่านั้น ห้ามใช้เป็นสีพื้นหลังกว้าง ๆ โดยไม่มีบทบาท
- **The Status Contrast Rule:** ทุกป้ายสถานะต้องประกอบด้วยไฟสีและข้อความตัวอักษรกำกับคู่กันเสมอ ห้ามพึ่งพาการแสดงผลด้วยจุดสีเพียงอย่างเดียว

---

## Typography

**Display & Headline Font:** `Prompt` (Google Fonts, sans-serif)  
**Body Font:** `Prompt` (Google Fonts, sans-serif)  
**Label & Telemetry Mono Font:** `JetBrains Mono` (Google Fonts, monospace)

**Character:** การจับคู่ระหว่าง `Prompt` ที่มีความโค้งมน เป็นมิตร ชัดเจนตามหลักการยศาสตร์อักษรไทย เข้ากับ `JetBrains Mono` ที่คมกริบและเที่ยงตรงทางคณิตศาสตร์ สื่อถึงระบบวิชาการที่ขับเคลื่อนด้วยเทคโนโลยีวิศวกรรม

### Hierarchy
- **Display** (Bold 700, 30px / 1.875rem, Line-height 1.25): หัวข้อหลักของหน้า เช่น "แดชบอร์ดลงเวลาเรียนสด"
- **Headline** (Bold 700, 20px / 1.25rem, Line-height 1.3): หัวข้อกล่องการ์ดและตาราง เช่น "บันทึกการลงเวลาล่าสุด", "ตารางเรียนวันนี้"
- **Title** (Semibold 600, 14px / 0.875rem, Line-height 1.4): ชื่อปุ่มกด, ชื่อคอลัมน์ตาราง, หัวข้อฟอร์มอินพุต
- **Body** (Regular 400, 14px / 0.875rem, Line-height 1.5): ข้อความอธิบายทั่วไป, รายชื่อนักศึกษาในตาราง
- **Label / Mono** (Semibold 600, 11px / 0.6875rem, Letter-spacing 0.05em): รหัสนักศึกษา (เช่น `6604101311`), รหัสวิชา (เช่น `04-024-301`), เวลาสแกน (`13:30:15`), และสถานะฮาร์ดแวร์

### Named Rules
- **The Monospace Identity Rule:** ข้อมูลตัวเลขที่เป็นรหัสชีวมิติ, เวลาประทับ (Timestamp), รหัสประจำตัวนักศึกษา และสถานะพอร์ตฮาร์ดแวร์ **ต้องใช้ฟอนต์ `JetBrains Mono` พร้อม `font-variant-numeric: tabular-nums` เสมอ** เพื่อรักษาความกว้างของตัวเลขให้ตรงหลักและอ่านได้อย่างแม่นยำ

---

## Layout

ระบบใช้รูปแบบ **Sidebar + Focused Stage Model**:

1. **โครงสร้างสัดส่วนหน้าจอ (Desktop):**
   - **Sidebar คงที่ด้านซ้าย:** กว้าง 256px (`w-64`) เป็น Glass Panel แสดงแบรนด์, ลิงก์นำทาง, ป้ายสถานะฮาร์ดแวร์เซนเซอร์, และข้อมูลโปรไฟล์แอดมิน
   - **Main Stage ด้านขวา:** ขยายเต็มพื้นที่ที่เหลือ (`flex-1`) พร้อม Padding ขนาดใหญ่ (`p-6` ถึง `p-8`) จัดการ์ดเป็นระบบ Grid Responsive
2. **การตอบสนองบนจอมือถือ (Mobile < 768px):**
   - Sidebar ด้านข้างจะถูกยุบซ่อน และแทนที่ด้วย **Sticky Top Bar** พร้อมปุ่ม Hamburger Toggle Menu เมื่อกดจะเปิดถาดสลับหน้าลงมาอย่างราบรื่น
   - ตารางข้อมูลและกริดสถิติจะสลับเป็นแบบเลื่อนในแนวนอน (`overflow-x-auto`) ป้องกันการบีบอัดตัวอักษรจนเสียรูป
3. **ระยะจังหวะช่องไฟ (Spatial Rhythm):**
   - ใช้ระบบมาตรส่วน Base-4 (4px, 8px, 12px, 16px, 24px, 32px) โดยมีระยะ Inset มาตรฐานของแผ่นกระจกการ์ดอยู่ที่ 24px (`1.5rem`) เพื่อให้ช่องไฟมีความสมดุลและเป็นระเบียบ

---

## Elevation & Depth

ระบบใช้ปรัชญา **Layered Glassmorphism with Ambient Telemetry**:
- ไม่ใช้เงาทึบหนักแบบกล่องลอย (Heavy Drop Shadows) แต่ใช้การซ้อนทับของแผ่นอะคริลิกกระจกฝ้า (Frosted Glass) ที่ยอมให้แสงสะท้อนและสีพื้นหลังทะลุผ่าน
- ใช้เส้นขอบไฮไลต์สีขาวบางพิเศษ (`border: 1px solid rgba(255, 255, 255, 0.08)`) ที่ขอบบนและด้านข้าง เพื่อสร้างขอบตัดคมชัดของวัตถุ

### Shadow Vocabulary
- **Card Ambient** (`box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)`): เงาลึกใต้การ์ดโมดอลเพื่อลอยเด่นเหนือพื้นหลัง
- **Cyan Glow** (`box-shadow: 0 0 15px rgba(6, 182, 212, 0.25)`): แสงเรืองสีฟ้าอมเขียวรอบปุ่ม Primary และตราสัญลักษณ์ระบบ
- **Emerald Pulse** (`box-shadow: 0 0 8px rgba(52, 211, 153, 0.8)`): จุดเรืองแสงสีเขียวของไฟสถานะ `R307 Online`
- **Amber Pulse** (`box-shadow: 0 0 8px rgba(251, 191, 36, 0.8)`): จุดเรืองแสงสีกระพริบเตือนของ `R307 Not Found`

---

## Shapes

- **มุมโค้งมนที่มั่นใจและนุ่มนวล:**
  - `rounded-lg` (8px - 12px): สำหรับปุ่มกด, ช่องกรอกข้อมูล (Inputs), และแท็บสลับห้อง
  - `rounded-xl` ถึง `rounded-2xl` (16px): สำหรับกล่องการ์ดเนื้อหา (Cards) และหน้าต่างป๊อปอัป (Modals)
  - `rounded-full` (9999px): สำหรับไฟจุดสถานะ (Status Dots) และป้ายกำกับวงรี (Pill Badges)
- **เส้นขอบ (Borders):**
  - ทุกคอนเทนเนอร์มีเส้นขอบบาง 1px สม่ำเสมอ ไม่ใช้การ์ดที่ไร้ขอบลอยเคว้ง เพื่อรักษาความรู้สึกของเครื่องมือช่างที่ประกอบขึ้นอย่างประณีต

---

## Components

### Buttons
- **Primary Action Button:**
  - พื้นหลังไล่เฉด `bg-gradient-to-r from-blue-600 to-cyan-500`
  - ขอบโค้งมน `rounded-xl` (12px), ข้อความสีขาวคมกริบ พร้อมเงาสี Cyan เรืองเบา ๆ (`shadow-cyan-500/25`)
  - โต้ตอบเมื่อชี้เมาส์ (Hover): สว่างขึ้นเล็กน้อยและยกตัวขึ้น 1px (`hover:from-blue-500 hover:to-cyan-400`)
- **Secondary / Ghost Button:**
  - พื้นหลังสีเทาเข้มโปร่งแสง `bg-slate-800` เส้นขอบ `border-slate-700` ตัวอักษรสีเทาสว่าง `text-slate-300` ขอบโค้งมน 8px - 12px
  - โต้ตอบเมื่อชี้เมาส์: เปลี่ยนสีพื้นหลังเป็น `hover:bg-slate-700` ตัวอักษรสีขาว `hover:text-white`

### Cards / Containers
- **Glass Card:** พื้นหลัง `rgba(30, 41, 59, 0.85)` พร้อมฟิลเตอร์ `backdrop-blur(16px)` และเส้นขอบกระจกบางเบา Inset สม่ำเสมอ 24px (`1.5rem`)
- **Live Feed Row Insertion:** แถวสแกนใหม่ล่าสุดมีแอนิเมชันแฟลชสีเขียวเรืองรอง (`.animate-new-row`) ขยายตัว 101% ใน 1.5 วินาทีก่อนคืนสู่ปกติ

### Inputs / Fields
- **Search & Text Input:**
  - พื้นผิว `bg-slate-900` เส้นขอบ `border-slate-700` ขอบโค้งมน `rounded-lg` (8px - 12px) ภายในมี Padding `10px 14px`
  - ตัวอักษรสีขาวสว่าง เคอร์เซอร์สีฟ้าไซแอน (`caret-color: #06b6d4`)
  - โฟกัส (Focus-Visible): วงแหวนสีฟ้าสว่างคมชัด `outline: 2px solid #06b6d4; outline-offset: 2px;`

### Navigation
- **Sidebar Nav Link:**
  - สถานะปกติ (Inactive): ข้อความและไอคอนสี `text-slate-400` โฮเวอร์เป็น `hover:text-cyan-300 hover:bg-slate-800/60`
  - สถานะเลือกอยู่ (Active): พื้นหลังไฮไลต์ไล่เฉดโปร่งแสง `bg-gradient-to-r from-cyan-500/15 to-transparent`, ข้อความสี `text-cyan-400` พร้อมแถบเน้นเรืองแสงสีไซแอนชิดขอบซ้าย

### Status Chips / Badges
- **Attendance Status Badges:**
  - 🟢 **ตรงเวลา (On-Time):** แคปซูลสีเขียวโปร่งแสง `bg-emerald-500/15` ขอบ `border-emerald-500/30` ข้อความ `text-emerald-400 font-mono`
  - 🟠 **มาสาย (Late):** แคปซูลสีส้มโปร่งแสง `bg-amber-500/15` ขอบ `border-amber-500/30` ข้อความ `text-amber-400 font-mono`
  - 🔴 **ขาดเรียน (Absent):** แคปซูลสีแดงโปร่งแสง `bg-rose-500/15` ขอบ `border-rose-500/30` ข้อความ `text-rose-400 font-mono`

### Hardware Telemetry Badge (Signature Component)
- **Sidebar Hardware Badge:** กล่องสถานะการเชื่อมต่อบอร์ด Arduino Uno Q และเซนเซอร์ R307
  - 🟢 **Online State:** จุดไฟสีเขียว `bg-emerald-400` เรืองแสงนิ่ง ข้อความ `R307 Online (Cloud Bridge (Active))`
  - 🟠 **Warning State:** จุดไฟสีส้ม `bg-amber-400` กระพริบ ข้อความ `R307 Not Found (Cloud Bridge (Active))`
  - 🔴 **Offline State:** จุดไฟสีแดง `bg-rose-400` ข้อความ `Offline (Cloud Bridge (Offline))`

### Tables
- หัวตารางสีพื้นเทาเข้ม ตัวอักษรเล็กกึ่งกลางหนา (`text-xs font-semibold text-slate-400`)
- แถวตารางมีเส้นคั่นบางเบา `border-slate-800/60` ตัวเลขจัดเรียงแบบ Monospace Tabular (`font-variant-numeric: tabular-nums`) พร้อมการไฮไลต์สีพื้นหลังเมื่อชี้เมาส์ (`hover:bg-slate-800/40`)

---

## Do's and Don'ts

### Do:
- **Do** ใช้ฟอนต์ `JetBrains Mono` สำหรับรหัสนักศึกษา, รหัสวิชา, หมายเลข Slot ลายนิ้วมือ และเวลาสแกนเสมอ
- **Do** แสดงสถานะฮาร์ดแวร์ด้วยทั้งจุดสีและข้อความระบุพอร์ต/สถานะที่ชัดเจน
- **Do** ใช้ปุ่มกดแบบ Gradient ฟ้า-ไซแอนเฉพาะกับการกระทำหลัก (Primary Actions เช่น สแกนนิ้ว, บันทึกตาราง, ส่งออก Excel)
- **Do** รักษาระดับความลึกของ Dark Theme ไว้อย่างมั่นคง เพื่อความสบายตาในการใช้งานระยะยาวในห้องเรียน
- **Do** จัดระยะ Padding ของการ์ดกระจกให้มีความกว้างสม่ำเสมอ 24px (`1.5rem`)

### Don't:
- **Don't** นำธีมสีสว่างพื้นขาวจ้า (Light Theme) มาใช้ปะปน ซึ่งจะทำลายเอกลักษณ์ Cyber-Physical Glassmorphism ของระบบ
- **Don't** ใส่เอฟเฟกต์สีรุ้งหรือแสงนีออนฟุ่มเฟือยแบบ Dashboard เกมมิ่ง ซึ่งจะลดทอนความน่าเชื่อถือทางวิชาการ
- **Don't** ซ่อนข้อผิดพลาดหรือรายงานสถานะออนไลน์ปลอมหากเซนเซอร์ไม่ได้เชื่อมต่อจริง
- **Don't** ใช้ฟอนต์ Serif หรือฟอนต์ลายมือที่ทำให้อ่านรหัสนักศึกษาและตารางเรียนยาก
- **Don't** ซ้อนการ์ดที่มีทั้งเส้นขอบ สีพื้นหลัง และมุมโค้งซ้ำซ้อนภายใน `.glass-card` เดียวกัน
