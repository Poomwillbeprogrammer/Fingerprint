const { GlobalFonts, createCanvas } = require('@napi-rs/canvas');
const path = require('path');

// ลงทะเบียนฟอนต์ภาษาไทยแท้
try {
  GlobalFonts.registerFromPath(path.join(__dirname, 'fonts', 'tahoma.ttf'), 'ThaiFont');
} catch (err) {
  console.warn('⚠️ [Card Renderer] ไม่สามารถโหลดฟอนต์ tahoma.ttf ได้:', err.message);
}

function bufferToChunks(oledBuf) {
  const chunks = [];
  for (let part = 0; part < 4; part++) {
    const chunk = oledBuf.subarray(part * 256, (part + 1) * 256);
    chunks.push(chunk.toString('hex').toUpperCase());
  }
  return chunks;
}

function bufferToPages(oledBuf) {
  const pages = [];
  for (let page = 0; page < 8; page++) {
    const pageBuf = oledBuf.subarray(page * 128, (page + 1) * 128);
    pages.push(pageBuf.toString('hex').toUpperCase());
  }
  return pages;
}

function canvasToOledBuffer(ctx) {
  const img = ctx.getImageData(0, 0, 128, 64).data;
  const oledBuf = Buffer.alloc(1024, 0);

  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 128; x++) {
      const idx = (y * 128 + x) * 4;
      if (img[idx] > 100 || img[idx + 1] > 100 || img[idx + 2] > 100) {
        const page = y >> 3;
        const bit = y & 7;
        oledBuf[x + page * 128] |= (1 << bit);
      }
    }
  }
  return oledBuf;
}

function renderUserCard(studentId, name) {
  const canvas = createCanvas(128, 64);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 128, 64);

  // กรอบนอก
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, 127, 63);

  // แถบหัวข้อยินดีต้อนรับ (Inverted Bar)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 14);
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 10px ThaiFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ยินดีต้อนรับ (GRANTED)', 64, 11);

  // รหัสนักศึกษา
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.font = 'bold 10px ThaiFont, sans-serif';
  ctx.fillText('ID: ' + (studentId || '-'), 6, 26);

  // ชื่อ-นามสกุล ภาษาไทย (ปรับขนาดฟอนต์อัตโนมัติตามความยาวชื่อ)
  const displayName = name || 'Unknown Student';
  let nameSize = 11;
  if (displayName.length > 22) nameSize = 9;
  else if (displayName.length > 17) nameSize = 10;

  ctx.font = 'bold ' + nameSize + 'px ThaiFont, sans-serif';
  ctx.fillText(displayName, 6, 42);

  // เส้นคั่น
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(4, 48);
  ctx.lineTo(124, 48);
  ctx.stroke();

  // สถานะด้านล่าง
  ctx.font = '9px ThaiFont, sans-serif';
  ctx.fillText('บันทึกเวลาสำเร็จ OK', 6, 58);

  return canvasToOledBuffer(ctx);
}

function renderIdleScreen() {
  const canvas = createCanvas(128, 64);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 128, 64);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, 127, 63);

  // หัวข้อ
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 14);
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 10px ThaiFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ระบบลงเวลาสแกนนิ้ว', 64, 11);

  // คำแนะนำตรงกลาง
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 11px ThaiFont, sans-serif';
  ctx.fillText('กรุณาวางนิ้วเพื่อสแกน', 64, 34);

  // เส้นคั่น
  ctx.beginPath();
  ctx.moveTo(4, 46);
  ctx.lineTo(124, 46);
  ctx.stroke();

  // สถานะ
  ctx.font = '9px ThaiFont, sans-serif';
  ctx.fillText('สถานะ: พร้อมใช้งาน', 64, 57);

  return canvasToOledBuffer(ctx);
}

function renderDeniedScreen() {
  const canvas = createCanvas(128, 64);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 128, 64);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, 127, 63);

  // หัวข้อ
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 14);
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 10px ThaiFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ACCESS DENIED', 64, 11);

  // คำเตือน
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 11px ThaiFont, sans-serif';
  ctx.fillText('ไม่พบลายนิ้วมือในระบบ', 64, 34);

  // เส้นคั่น
  ctx.beginPath();
  ctx.moveTo(4, 46);
  ctx.lineTo(124, 46);
  ctx.stroke();

  // สถานะ
  ctx.font = '9px ThaiFont, sans-serif';
  ctx.fillText('ไม่มีสิทธิ์เข้าถึง (UNAUTHORIZED)', 64, 57);

  return canvasToOledBuffer(ctx);
}

module.exports = {
  renderUserCard,
  renderIdleScreen,
  renderDeniedScreen,
  bufferToChunks,
  bufferToPages
};
