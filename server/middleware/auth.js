const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const JWT_SECRET = process.env.JWT_SECRET;

// Rate Limiter สำหรับป้องกัน Brute Force บนหน้าล็อกอิน
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 นาที
  max: 5, // สูงสุด 5 ครั้งต่อนาทีต่อ IP
  message: { error: 'ลองเข้าสู่ระบบถี่เกินไป กรุณารอ 1 นาทีแล้วลองใหม่อีกครั้ง' },
  standardHeaders: true,
  legacyHeaders: false,
});

function authRequired(req, res, next) {
  const token = req.cookies.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!token) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
  }
  try {
    const secret = process.env.JWT_SECRET;
    const decoded = jwt.verify(token, secret);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token หมดอายุหรือไม่ถูกต้อง' });
  }
}

module.exports = {
  authRequired,
  loginLimiter
};
