const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const adminRepository = require('../repositories/AdminRepository');

// Rate Limiter สำหรับป้องกัน Brute Force บนหน้าล็อกอิน
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 นาที
  max: 5, // สูงสุด 5 ครั้งต่อนาทีต่อ IP
  message: { error: 'ลองเข้าสู่ระบบถี่เกินไป กรุณารอ 1 นาทีแล้วลองใหม่อีกครั้ง' },
  standardHeaders: true,
  legacyHeaders: false,
});

async function authRequired(req, res, next) {
  const token = req.cookies.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!token) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
  }
  try {
    const secret = process.env.JWT_SECRET;
    const decoded = jwt.verify(token, secret);

    // ตรวจสอบข้อมูลสดจาก DB: ป้องกัน token ค้างกรณีบัญชีถูกลบ (Row หาย = 401 ทันที)
    const admin = await adminRepository.findById(decoded.id);
    if (!admin) {
      return res.status(401).json({ error: 'บัญชีผู้ใช้งานนี้ไม่มีอยู่ในระบบหรือถูกลบแล้ว' });
    }

    // Fallback เป็น super_admin เฉพาะเมื่อพบบัญชีใน DB แต่ role เป็น NULL (ช่วง migration)
    const currentRole = admin.role || 'super_admin';
    req.admin = {
      id: admin.id,
      username: admin.username,
      role: currentRole,
      instructor_name: admin.instructor_name || '',
      assigned_subjects: Array.isArray(admin.assigned_subjects) ? admin.assigned_subjects : []
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token หมดอายุหรือไม่ถูกต้อง' });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
    }
    const role = req.admin.role || 'super_admin';
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ (สิทธิ์ไม่เพียงพอ)' });
    }
    next();
  };
}

module.exports = {
  authRequired,
  requireRole,
  loginLimiter
};
