const express = require('express');
const adminRepository = require('../repositories/AdminRepository');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();

// ทุก Endpoint ใน /api/accounts ต้องเป็น Super Admin เท่านั้น
router.use(authRequired, requireRole('super_admin'));

// ดึงรายการบัญชีผู้ใช้ทั้งหมด
router.get('/', async (req, res) => {
  try {
    const accounts = await adminRepository.findAll();
    res.json(accounts);
  } catch (err) {
    console.error('Fetch accounts error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลบัญชีผู้ใช้' });
  }
});

// สร้างบัญชีผู้ใช้ใหม่
router.post('/', async (req, res) => {
  const { username, password, role, instructor_name, assigned_subjects } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'กรุณากรอก Username และ Password' });
  }

  try {
    const newAccount = await adminRepository.createAccount({
      username,
      password,
      role,
      instructor_name,
      assigned_subjects
    });
    res.status(201).json({
      success: true,
      message: 'สร้างบัญชีผู้ใช้สำเร็จ',
      account: newAccount
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'เกิดข้อผิดพลาดในการสร้างบัญชี' });
  }
});

// แก้ไขบัญชีผู้ใช้
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'รหัสบัญชีไม่ถูกต้อง' });
  }

  const { username, password, role, instructor_name, assigned_subjects } = req.body;

  try {
    const updated = await adminRepository.updateAccount(
      id,
      { username, password, role, instructor_name, assigned_subjects },
      req.admin.id
    );
    res.json({
      success: true,
      message: 'อัปเดตบัญชีผู้ใช้สำเร็จ',
      account: updated
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'เกิดข้อผิดพลาดในการอัปเดตบัญชี' });
  }
});

// ลบบัญชีผู้ใช้
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'รหัสบัญชีไม่ถูกต้อง' });
  }

  try {
    await adminRepository.deleteAccount(id, req.admin.id);
    res.json({
      success: true,
      message: 'ลบบัญชีผู้ใช้สำเร็จ'
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'เกิดข้อผิดพลาดในการลบบัญชี' });
  }
});

module.exports = router;
