# Agent Guidelines: Fingerprint

Workspace and domain rules are documented in `GEMINI.md`. All agents must follow them.

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical triage roles map 1:1 to issue status labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repository. See `docs/agents/domain.md`.

---

## ⚡ Quick Skill Cheat Sheet (คู่มือคำสั่งลัดที่ใช้บ่อย)

ถ้าจำชื่อคำสั่งไม่ได้ ให้จำแค่ **`ask-matt`** คำเดียว หรือใช้ตารางสรุปนี้:

| เมื่อคุณต้องการ... | คำสั่งสั้นๆ | หรือพิมพ์บอกเป็นภาษาไทยง่ายๆ |
| :--- | :--- | :--- |
| **จำคำสั่งไม่ได้ / ขอคำแนะนำ Flow** | `/ask-matt` | *"ถาม matt หน่อยว่าเริ่มยังไง"* |
| **เจอบั๊กแก้ยาก / บั๊กเรื้อรังหาสาเหตุไม่เจอ** | `/diagnosing-bugs` | *"เจอบั๊กแก้ยาก ช่วยไล่ตามขั้นตอนหน่อย"* |
| **มีไอเดียใหม่ อยากตีกรอบให้ชัดเจนก่อนเขียนโค้ด** | `/grill-with-docs` | *"ช่วยสัมภาษณ์ตีกรอบไอเดียนี้หน่อย"* |
| **เขียนโค้ดฟังก์ชันใหม่แบบมีเทสดักไว้** | `/tdd` | *"เขียนโค้ดฟังก์ชันนี้แบบ TDD"* |
| **ตรวจทานโค้ดก่อน commit / deploy** | `/code-review` | *"ช่วย review โค้ดส่วนนี้ให้หน่อย"* |
| **แก้ปัญหา Git Merge Conflict** | `/resolving-merge-conflicts` | *"ช่วยแก้ git conflict หน่อย"* |
