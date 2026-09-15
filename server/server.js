const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');

const { dbAsync, initDatabase } = require('./database');
const schedulesManager = require('./schedules_manager');
const { createSerialController } = require('./controllers/serial_controller');

const authRouter = require('./routes/auth');
const createUsersRouter = require('./routes/users');
const logsRouter = require('./routes/logs');
const createSchedulesRouter = require('./routes/schedules');
const createDeviceRouter = require('./routes/device');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST']
  }
});
const upload = multer({ storage: multer.memoryStorage() });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ [Security Fatal Error] Missing JWT_SECRET in environment variables.');
  process.exit(1);
}
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || 'fingerprint_unoq_bridge_secure_token_2026';
const TARGET_PORT = process.env.SERIAL_PORT || 'COM12';
const SERIAL_ENABLED = process.env.SERIAL_ENABLED !== 'false';
const BAUD_RATE = 115200;

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Hardware / Serial Controller
const serialController = createSerialController({
  io,
  dbAsync,
  schedulesManager,
  targetPort: TARGET_PORT,
  baudRate: BAUD_RATE,
  serialEnabled: SERIAL_ENABLED,
  bridgeToken: BRIDGE_TOKEN
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/users', createUsersRouter({ serialController, io }));
app.use('/api', logsRouter);
app.use('/api', createSchedulesRouter({ upload, io }));
app.use('/api/device', createDeviceRouter({ serialController }));

// Socket.io Authentication Middleware & Event Handlers
io.use((socket, next) => {
  try {
    const authHeader = socket.handshake.headers?.authorization;
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    const customHeaderToken = socket.handshake.headers?.['x-bridge-token'];
    const queryToken = socket.handshake.query?.token;
    const authToken = socket.handshake.auth?.token || bearerToken || customHeaderToken || queryToken;
    
    let cookieToken = null;
    if (socket.handshake.headers?.cookie) {
      const parsedCookies = socket.handshake.headers.cookie.split(';').reduce((acc, c) => {
        const [key, val] = c.trim().split('=');
        if (key && val) acc[key] = decodeURIComponent(val);
        return acc;
      }, {});
      cookieToken = parsedCookies.token;
    }

    const token = authToken || cookieToken;

    // ก. กรณีเป็น Hardware Bridge (บอร์ด Uno Q ส่ง BRIDGE_TOKEN)
    if (token && token === BRIDGE_TOKEN) {
      socket.role = 'bridge';
      socket.isBridge = true;
      return next();
    }

    // ข. กรณีเป็น Admin Web Dashboard (ส่ง JWT token ผ่าน auth หรือ cookie)
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.role = 'admin';
        socket.admin = decoded;
        return next();
      } catch (jwtErr) {
        return next(new Error('Authentication error: Invalid JWT token'));
      }
    }

    return next(new Error('Authentication error: Authentication required'));
  } catch (err) {
    return next(new Error('Authentication error: ' + err.message));
  }
});

io.on('connection', (socket) => {
  serialController.handleSocketConnection(socket);
});

// Start Server
async function start() {
  try {
    await initDatabase();
    await schedulesManager.syncFromSupabase();
    
    if (SERIAL_ENABLED) {
      serialController.initSerial();
    } else {
      console.log('☁️ [Cloud Mode] ปิดการต่อ SerialPort ตรงบนเซิร์ฟเวอร์ (พร้อมรับการเชื่อมต่อจาก bridge.js)');
    }

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`====================================================`);
      console.log(`🚀 Fingerprint Admin Server running on: http://localhost:${PORT}`);
      console.log(`📊 Dashboard UI ready at: http://localhost:${PORT}/index.html`);
      console.log(`🔑 Login Page ready at: http://localhost:${PORT}/login.html`);
      if (SERIAL_ENABLED) {
        console.log(`🔌 Serial Target Port: ${TARGET_PORT} (Baud: ${BAUD_RATE})`);
      } else {
        console.log(`☁️ Cloud Deployment Mode: Active (Waiting for bridge.js)`);
      }
      console.log(`====================================================`);
    });
  } catch (err) {
    console.error('❌ [Server Startup Error]', err.message);
    process.exit(1);
  }
}

start();
