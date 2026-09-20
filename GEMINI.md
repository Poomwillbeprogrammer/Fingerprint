# 🏛️ Workspace Rules: IoT Biometric Attendance System (Fingerprint)

Welcome to the **IoT Biometric Attendance System (Arduino UNO Q + Node.js + Supabase)** repository.
All AI agents operating within this workspace must strictly abide by the following operational rules and domain invariants:

---

## 1. Cloud & Execution Environment (Render-First Workflow)
- **Render Production Only:** The web backend and Socket.IO server run exclusively on Render Cloud. **NEVER** start `node server.js` locally or attempt to test endpoints via `localhost:3000`.
- **Static Syntax Verification:** Always verify code and syntax changes statically using:
  ```bash
  node -c server/server.js
  node -c server/schedules_manager.js
  ```
- **Git MCP Tools Required:** Due to Windows sandbox limitations on terminal write access to `.git/index.lock`, always execute version control operations using the Git MCP tools (`git_add`, `git_commit`, `git_push`) rather than terminal git CLI commands.
- **Deployment Branch:** Push all approved changes to `origin/website`. Render automatically deploys from this branch upon push.

---

## 2. Academic Attendance Domain Rules
- **Course-Scoped Attendees Only:** Each subject/schedule belongs to a specific group of students. **NEVER** query the global `users` table (`SELECT * FROM users`) for course-level attendance summaries or Excel exports. Only include students who have recorded attendance in that specific subject/schedule (`schedRecords`).
- **Non-Punitive Attendance Records:** Because students are not enrolled across all courses simultaneously, **NEVER** label unrecorded students or weeks as "ขาด" (absent) or calculate absence penalties/percentages. Report only positive factual attendance metrics:
  - `รวมมาตรงเวลา (ครั้ง)` (On-Time Attendance Count)
  - `รวมมาสาย (ครั้ง)` (Late Attendance Count)
  - `รวมเข้าเรียนทั้งหมด (ครั้ง)` (Total Attended Count)
- **Weekly Isolation (ISO-8601):** Duplicate scan prevention operates strictly on an ISO calendar week basis (`year_week`, e.g., `2026-W37`). Students are permitted 1 scan per week per subject. As soon as a new week begins, students can scan into the subject again immediately without conflict.

---

## 3. Mandatory Documentation Maintenance Invariant
- **Synchronize Markdown Documentation on New Features:** Whenever a new feature, architecture change, bug fix, or user requirement is introduced or modified, **ALWAYS** update the relevant `.md` documentation files in the repository:
  1. `PROJECT_STATE.md`: Update "สิ่งที่ทำเสร็จแล้ว" (Completed Work), "โครงสร้างไฟล์" (Architecture Structure), and "สิ่งที่จะทำต่อไป" (Roadmap).
  2. `DECISIONS.md`: Record new Architecture Decision Records (ADR) under approved decisions or failed approaches to avoid recurring mistakes.
  3. `README.md` / `PRODUCT.md` / `DESIGN.md`: Update API contracts, product requirements, or design tokens if UI/UX or specs were affected.
