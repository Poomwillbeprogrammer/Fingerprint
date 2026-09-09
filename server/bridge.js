// bridge.js - รันบนคอมพิวเตอร์ของคุณเพื่อเชื่อมสาย USB เข้ากับ Render Cloud
const { io } = require('socket.io-client');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

// URL ของ Render (ส่งผ่าน argument ได้ เช่น: node bridge.js https://my-app.onrender.com)
const RENDER_URL = process.argv[2] || process.env.CLOUD_URL || 'http://localhost:3000';
const COM_PORT = process.env.SERIAL_PORT || 'COM12';
const BAUD_RATE = 115200;

console.log('====================================================');
console.log('🚀 กำลังเริ่มระบบ Hardware Bridge สำหรับ Arduino UNO Q');
console.log(`🔌 พอร์ต Serial ในเครื่อง: ${COM_PORT}`);
console.log(`🌐 เชื่อมต่อไปยัง Server: ${RENDER_URL}`);
console.log('====================================================');

const socket = io(RENDER_URL, {
  reconnection: true,
  reconnectionDelay: 2000
});

let serialPort = null;
let serialParser = null;

function initSerial() {
  if (serialPort && serialPort.isOpen) return;

  try {
    serialPort = new SerialPort({
      path: COM_PORT,
      baudRate: BAUD_RATE,
      autoOpen: false
    });

    serialParser = serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    serialPort.open((err) => {
      if (err) {
        console.warn(`⚠️ [Serial] ไม่สามารถเปิด ${COM_PORT}: ${err.message} (จะลองใหม่ใน 4 วิ...)`);
        setTimeout(initSerial, 4000);
        return;
      }
      console.log(`✅ [Serial] เชื่อมต่อสาย USB Arduino บน ${COM_PORT} สำเร็จ!`);
    });

    serialParser.on('data', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      console.log(`📥 [Arduino -> Cloud] ${trimmed}`);
      socket.emit('bridge_serial_data', trimmed);
    });

    serialPort.on('error', (err) => {
      console.error(`❌ [Serial Error] ${err.message}`);
      setTimeout(initSerial, 4000);
    });

    serialPort.on('close', () => {
      console.warn(`🔌 [Serial] สาย USB หลุด กำลังเชื่อมต่อใหม่...`);
      setTimeout(initSerial, 4000);
    });
  } catch (err) {
    console.error(`❌ [Serial Exception] ${err.message}`);
    setTimeout(initSerial, 4000);
  }
}

// เมื่อเชื่อมต่อกับ Server สำเร็จ
socket.on('connect', () => {
  console.log(`☁️ [Cloud] เชื่อมต่อกับ Server สำเร็จ! (Socket ID: ${socket.id})`);
  socket.emit('register_bridge');
});

socket.on('disconnect', () => {
  console.warn(`⚠️ [Cloud] หลุดการเชื่อมต่อจาก Server กำลังรอเชื่อมต่อใหม่...`);
});

// รับคำสั่งจาก Cloud ส่งลงบอร์ด Arduino
socket.on('bridge_command', (cmd) => {
  console.log(`📤 [Cloud -> Arduino] ${cmd}`);
  if (serialPort && serialPort.isOpen) {
    const fullCmd = cmd + '\n';
    if (fullCmd.length > 60) {
      let offset = 0;
      const writeSlice = () => {
        if (offset < fullCmd.length) {
          const slice = fullCmd.substring(offset, offset + 48);
          offset += 48;
          serialPort.write(slice, (err) => {
            if (!err) setTimeout(writeSlice, 10);
          });
        }
      };
      writeSlice();
    } else {
      serialPort.write(fullCmd);
    }
  }
});

// เริ่มเชื่อมต่อ
initSerial();
