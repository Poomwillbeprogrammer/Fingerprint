const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// โหลด Environment Variables จาก .env หากทำงานในเครื่อง Local
const envPaths = [path.join(__dirname, '.env'), path.join(__dirname, '..', '.env')];
for (const ep of envPaths) {
  if (fs.existsSync(ep)) {
    try {
      const lines = fs.readFileSync(ep, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const k = trimmed.substring(0, eqIdx).trim();
          const v = trimmed.substring(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
          if (!process.env[k]) process.env[k] = v;
        }
      }
    } catch (e) {}
  }
}

// ตั้งค่า Supabase Cloud Database จาก Environment Variables (ห้าม Hardcode Secret)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ [Database Fatal Error] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY in environment variables.');
  console.error('👉 กรุณากำหนดตัวแปร SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY บน Server Environment');
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY in environment variables.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log('⚡ [Supabase] กำลังเชื่อมต่อ Supabase Cloud Database:', SUPABASE_URL);

// Asynchronous Initialization before server starts
async function initDatabase() {
  try {
    const { count, error } = await supabase.from('users').select('*', { count: 'exact', head: true });
    if (error) throw error;
    console.log(`✅ [Supabase] เชื่อมต่อสำเร็จ! จำนวนผู้ใช้ในระบบ Cloud: ${count} คน`);
  } catch (err) {
    console.error('❌ [Supabase] การเชื่อมต่อล้มเหลว:', err.message);
  }
}

module.exports = { supabase, initDatabase };
