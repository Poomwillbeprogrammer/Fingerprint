const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { dbAsync, initDatabase } = require('./database');


const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fingerprint_super_secret_key_2026';

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Authentication Middleware
function authRequired(req, res, next) {
  const token = req.cookies.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!token) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token หมดอายุหรือไม่ถูกต้อง' });
  }
}

// ==========================================
// 1. Authentication Routes
// ==========================================
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'กรุณากรอก Username และ Password' });
  }

  try {
    const admin = await dbAsync.get('SELECT * FROM admins WHERE username = ?', [username]);
    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
      return res.status(401).json({ error: 'Username หรือ Password ไม่ถูกต้อง' });
    }

    const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('token', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
    res.json({ success: true, message: 'เข้าสู่ระบบสำเร็จ', token, username: admin.username });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'ออกจากระบบเรียบร้อย' });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ username: req.admin.username });
});

// เปลี่ยนรหัสผ่าน Admin
app.post('/api/auth/change-password', authRequired, async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบทุกช่อง' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน' });
  }

  try {
    const admin = await dbAsync.get('SELECT * FROM admins WHERE id = ?', [req.admin.id]);
    if (!admin || !bcrypt.compareSync(currentPassword, admin.password_hash)) {
      return res.status(400).json({ error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
    }

    const salt = bcrypt.genSaltSync(10);
    const newHash = bcrypt.hashSync(newPassword, salt);

    await dbAsync.run('UPDATE admins SET password_hash = ? WHERE id = ?', [newHash, req.admin.id]);

    res.json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน' });
  }
});


// ==========================================
// 2. User Management Routes
// ==========================================
app.get('/api/users', authRequired, async (req, res) => {
  try {
    const users = await dbAsync.all('SELECT * FROM users ORDER BY id ASC');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', authRequired, async (req, res) => {
  const { id, name, department, role } = req.body;
  if (!id || !name) {
    return res.status(400).json({ error: 'กรุณาระบุหมายเลข ID และชื่อผู้ใช้' });
  }

  try {
    const existing = await dbAsync.get('SELECT * FROM users WHERE id = ?', [id]);
    if (existing) {
      return res.status(400).json({ error: `หมายเลข ID #${id} มีผู้ใช้งานในระบบแล้ว` });
    }

    await dbAsync.run(
      'INSERT INTO users (id, name, department, role) VALUES (?, ?, ?, ?)',
      [id, name, department || '', role || 'User']
    );

    io.emit('user_updated');
    res.json({ success: true, message: `เพิ่มผู้ใช้งาน ID #${id} เรียบร้อย` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await dbAsync.run('DELETE FROM users WHERE id = ?', [id]);
    // แจ้งเตือนบอร์ด Arduino ผ่าน WebSocket ให้ลบลายนิ้วมือออกจากเซนเซอร์ R307 ด้วย
    io.emit('cmd_delete_fingerprint', { id });
    io.emit('user_updated');
    res.json({ success: true, message: `ลบผู้ใช้งาน ID #${id} เรียบร้อยแล้ว` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. Access Logs & Analytics Routes
// ==========================================
app.get('/api/logs', authRequired, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const logs = await dbAsync.all(`
      SELECT 
        access_logs.id,
        access_logs.user_id,
        COALESCE(users.name, access_logs.user_name, 'Unknown User') AS user_name,
        users.department,
        users.role,
        access_logs.fingerprint_id,
        access_logs.status,
        access_logs.score,
        access_logs.timestamp
      FROM access_logs 
      LEFT JOIN users ON access_logs.fingerprint_id = users.id OR access_logs.user_id = users.id
      ORDER BY access_logs.timestamp DESC 
      LIMIT ?
    `, [limit]);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/stats', authRequired, async (req, res) => {
  try {
    const totalUsers = (await dbAsync.get('SELECT COUNT(*) as count FROM users')).count;
    const totalLogs = (await dbAsync.get('SELECT COUNT(*) as count FROM access_logs')).count;
    const grantedToday = (await dbAsync.get(`
      SELECT COUNT(*) as count FROM access_logs 
      WHERE status = 'GRANTED' AND date(timestamp, 'localtime') = date('now', 'localtime')
    `)).count;
    const deniedToday = (await dbAsync.get(`
      SELECT COUNT(*) as count FROM access_logs 
      WHERE status != 'GRANTED' AND date(timestamp, 'localtime') = date('now', 'localtime')
    `)).count;

    res.json({
      totalUsers,
      totalLogs,
      grantedToday,
      deniedToday
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. IoT Device Endpoints (สำหรับ Arduino UNO Q)
// ==========================================

// Endpoint เมื่อ Arduino สแกนลายนิ้วมือ
app.post('/api/device/scan-event', async (req, res) => {
  const { fingerprint_id, score, status } = req.body;
  console.log(`📡 [IoT Scan Event] ID: ${fingerprint_id}, Score: ${score}, Status: ${status}`);

  try {
    let userName = 'Unknown User';
    let userId = null;
    const isGranted = (status === 'GRANTED' || status === 'OK');

    if (fingerprint_id) {
      const user = await dbAsync.get('SELECT * FROM users WHERE id = ?', [fingerprint_id]);
      if (user) {
        userName = user.name;
        userId = user.id;
      }
    }

    // บันทึกลงฐานข้อมูล access_logs
    const insertResult = await dbAsync.run(`
      INSERT INTO access_logs (user_id, user_name, fingerprint_id, status, score)
      VALUES (?, ?, ?, ?, ?)
    `, [userId, userName, fingerprint_id || 0, isGranted ? 'GRANTED' : 'DENIED', score || 0]);

    const newLogEntry = {
      id: insertResult.lastID,
      user_id: userId,
      user_name: userName,
      fingerprint_id: fingerprint_id || 0,
      status: isGranted ? 'GRANTED' : 'DENIED',
      score: score || 0,
      timestamp: new Date().toISOString()
    };

    // ส่งข้อมูล Real-time ไปยังทุกหน้า Dashboard ผ่าน WebSocket ทันที!
    io.emit('new_log', newLogEntry);

    res.json({ success: true, user_name: userName, status: isGranted ? 'GRANTED' : 'DENIED' });
  } catch (err) {
    console.error('Error saving scan log:', err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint แจ้งเตือนสถานะขั้นตอนลงทะเบียนลายนิ้วมือ (Enrollment Guide)
app.post('/api/device/enroll-status', async (req, res) => {
  const { step, status, id, message } = req.body;
  console.log(`🖐️ [Enroll Status] Step: ${step}, Status: ${status}, ID: ${id}`);
  
  // ส่งสถานะขั้นตอนไปยัง Web Admin แบบ Real-time
  io.emit('enroll_step_update', { step, status, id, message });
  res.json({ success: true });
});

// ==========================================
// 5. Socket.io Real-time Event Handlers
// ==========================================
io.on('connection', (socket) => {
  console.log('💻 Web Client / Device Connected:', socket.id);

  // คำสั่งเริ่มลงทะเบียนจากหน้าเว็บ
  socket.on('start_enroll', (data) => {
    console.log('🚀 สั่งเริ่มลงทะเบียนนิ้ว ID:', data.id, 'Name:', data.name);
    // ส่งคำสั่งไปยังบอร์ด Arduino ผ่าน WebSocket
    io.emit('cmd_start_enroll', data);
  });

  socket.on('disconnect', () => {
    console.log('Web Client Disconnected:', socket.id);
  });
});

// Start Server
async function start() {
  await initDatabase();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🚀 Fingerprint Admin Server running on: http://localhost:${PORT}`);
    console.log(`📊 Dashboard UI ready at: http://localhost:${PORT}/index.html`);
    console.log(`🔑 Login Page ready at: http://localhost:${PORT}/login.html`);
    console.log(`====================================================`);
  });
}

start();

