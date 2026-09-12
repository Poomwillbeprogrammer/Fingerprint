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
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log('⚡ [Supabase] กำลังเชื่อมต่อ Supabase Cloud Database:', SUPABASE_URL);

// Async Database Adapter (Compatible with existing server queries)
const dbAsync = {
  // Query Multiple Rows
  all: async (sql, params = []) => {
    const s = sql.trim().toUpperCase();

    // 1. SELECT * FROM users ORDER BY id ASC / SELECT id FROM users ORDER BY id ASC
    if (s.includes('FROM USERS') && !s.includes('WHERE')) {
      const { data, error } = await supabase.from('users').select('*').order('id', { ascending: true });
      if (error) throw error;
      return data || [];
    }

    // 2. Candidates for Tier 2: SELECT id, name, fingerprint_template FROM users WHERE (in_sensor = 0...)
    if (s.includes('FROM USERS') && s.includes('IN_SENSOR = 0')) {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, fingerprint_template, last_scanned_at, created_at')
        .or('in_sensor.eq.0,in_sensor.is.null')
        .not('fingerprint_template', 'is', null)
        .order('last_scanned_at', { ascending: false, nullsFirst: false })
        .limit(60);
      if (error) throw error;
      return (data || []).filter(u => u.fingerprint_template && u.fingerprint_template.length >= 512);
    }

    // 3. Users with template: SELECT id, fingerprint_template FROM users WHERE fingerprint_template IS NOT NULL...
    if (s.includes('FROM USERS') && s.includes('FINGERPRINT_TEMPLATE IS NOT NULL')) {
      const { data, error } = await supabase
        .from('users')
        .select('id, fingerprint_template')
        .not('fingerprint_template', 'is', null);
      if (error) throw error;
      return (data || []).filter(u => u.fingerprint_template && u.fingerprint_template.length >= 512);
    }

    // 4. Access logs: SELECT * FROM access_logs ORDER BY timestamp DESC LIMIT 50
    if (s.includes('FROM ACCESS_LOGS')) {
      const { data, error } = await supabase
        .from('access_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    }

    return [];
  },

  // Query Single Row
  get: async (sql, params = []) => {
    const s = sql.trim().toUpperCase();

    // 1. SELECT * FROM users WHERE id = ?
    if (s.includes('FROM USERS') && s.includes('WHERE ID = ?')) {
      const id = params[0];
      const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    }

    // 2. SELECT COUNT(*) as count FROM users WHERE in_sensor = 1
    if (s.includes('SELECT COUNT(*)') && s.includes('FROM USERS WHERE IN_SENSOR = 1')) {
      const { count, error } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('in_sensor', 1);
      if (error) throw error;
      return { count: count || 0 };
    }

    // 1.1 SELECT id, name FROM users WHERE student_id = ?
    if (s.includes('FROM USERS') && s.includes('STUDENT_ID = ?')) {
      const studentId = params[0];
      const { data, error } = await supabase.from('users').select('id, name').eq('student_id', studentId).maybeSingle();
      if (error) return null;
      return data;
    }

    // 3. SELECT COUNT(*) as count FROM users
    if (s.includes('SELECT COUNT(*)') && s.includes('FROM USERS')) {
      const { count, error } = await supabase.from('users').select('*', { count: 'exact', head: true });
      if (error) throw error;
      return { count: count || 0 };
    }

    // 4. LRU User: SELECT id, name FROM users WHERE in_sensor = 1 AND id != ? ORDER BY ... ASC LIMIT 1
    if (s.includes('FROM USERS') && s.includes('IN_SENSOR = 1 AND ID !=')) {
      const excludeId = params[0];
      const { data, error } = await supabase
        .from('users')
        .select('id, name')
        .eq('in_sensor', 1)
        .neq('id', excludeId)
        .order('last_scanned_at', { ascending: true, nullsFirst: true })
        .limit(1);
      if (error) throw error;
      return data && data[0] ? data[0] : null;
    }

    // 5. SELECT * FROM admins WHERE username = ?
    if (s.includes('FROM ADMINS') && s.includes('WHERE USERNAME = ?')) {
      const username = params[0];
      const { data, error } = await supabase.from('admins').select('*').eq('username', username).maybeSingle();
      if (error) throw error;
      return data;
    }

    // 6. SELECT * FROM admins WHERE id = ?
    if (s.includes('FROM ADMINS') && s.includes('WHERE ID = ?')) {
      const id = params[0];
      const { data, error } = await supabase.from('admins').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    }

    // 7. Access logs stats: SELECT COUNT(*) as count FROM access_logs
    if (s.includes('SELECT COUNT(*)') && s.includes('FROM ACCESS_LOGS')) {
      let query = supabase.from('access_logs').select('*', { count: 'exact', head: true });

      if (s.includes("STATUS = 'GRANTED'")) {
        query = query.eq('status', 'GRANTED');
      } else if (s.includes("STATUS = 'DENIED'")) {
        query = query.eq('status', 'DENIED');
      }

      if (s.includes('DATE(TIMESTAMP)')) {
        const now = new Date();
        const todayBangkok = new Date(now.getTime() + 7 * 3600 * 1000).toISOString().split('T')[0];
        const startOfDay = new Date(todayBangkok + 'T00:00:00+07:00').toISOString();
        query = query.gte('timestamp', startOfDay);
      }

      const { count, error } = await query;
      if (error) throw error;
      return { count: count || 0 };
    }

    return null;
  },

  // Run insert / update / delete
  run: async (sql, params = []) => {
    const s = sql.trim().toUpperCase();

    // 1. UPDATE users SET last_scanned_at = ... WHERE id = ?
    if (s.includes('UPDATE USERS') && s.includes('LAST_SCANNED_AT')) {
      const id = params[0];
      const { error } = await supabase.from('users').update({ last_scanned_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      return { changes: 1 };
    }

    // 2. UPDATE users SET in_sensor = 0 WHERE id = ?
    if (s.includes('UPDATE USERS') && s.includes('IN_SENSOR = 0')) {
      const id = params[0];
      const { error } = await supabase.from('users').update({ in_sensor: 0 }).eq('id', id);
      if (error) throw error;
      return { changes: 1 };
    }

    // 3. UPDATE users SET in_sensor = 1 WHERE id = ?
    if (s.includes('UPDATE USERS') && s.includes('IN_SENSOR = 1') && !s.includes('FINGERPRINT_TEMPLATE')) {
      const id = params[0];
      const { error } = await supabase.from('users').update({ in_sensor: 1 }).eq('id', id);
      if (error) throw error;
      return { changes: 1 };
    }

    // 4. UPDATE users SET fingerprint_template = ?, in_sensor = 1 WHERE id = ?
    if (s.includes('UPDATE USERS') && s.includes('FINGERPRINT_TEMPLATE = ?')) {
      const [template, id] = params;
      const cleanTemplate = (template || '').replace(/\s+/g, '');
      const { error } = await supabase.from('users').update({ fingerprint_template: cleanTemplate, in_sensor: 1 }).eq('id', id);
      if (error) throw error;
      return { changes: 1 };
    }

    // 5. UPDATE users SET name = ?, student_id = ? WHERE id = ?
    if (s.includes('UPDATE USERS SET NAME = ?')) {
      const [name, studentId, id] = params;
      const { error } = await supabase.from('users').update({ name, student_id: studentId }).eq('id', id);
      if (error) throw error;
      return { changes: 1 };
    }

    // 6. INSERT INTO users (id, student_id, name, created_at)
    if (s.includes('INSERT INTO USERS')) {
      let userObj = { in_sensor: 1 };
      if (params.length === 3) {
        userObj.id = params[0];
        userObj.student_id = params[1];
        userObj.name = params[2];
      } else if (params.length === 2) {
        userObj.id = params[0];
        userObj.name = params[1];
      }
      const { error } = await supabase.from('users').insert(userObj);
      if (error) throw error;
      return { lastID: userObj.id, changes: 1 };
    }

    // 7. DELETE FROM users WHERE id = ?
    if (s.includes('DELETE FROM USERS WHERE ID = ?')) {
      const id = params[0];
      const { error } = await supabase.from('users').delete().eq('id', id);
      if (error) throw error;
      return { changes: 1 };
    }

    // 8. INSERT INTO access_logs (user_id, student_id, user_name, fingerprint_id, status, score, timestamp)
    if (s.includes('INSERT INTO ACCESS_LOGS')) {
      let logObj = {};
      if (params.length >= 6) {
        const [userId, studentId, userName, fingerprintId, status, score, timestamp] = params;
        logObj = {
          user_id: userId,
          student_id: studentId,
          user_name: userName,
          fingerprint_id: fingerprintId,
          status: status,
          score: score
        };
        if (timestamp && typeof timestamp === 'string' && !timestamp.includes('now')) {
          logObj.timestamp = timestamp;
        }
      } else {
        const [userId, userName, fingerprintId, status, score, timestamp] = params;
        logObj = {
          user_id: userId,
          user_name: userName,
          fingerprint_id: fingerprintId,
          status: status,
          score: score
        };
        if (timestamp && typeof timestamp === 'string' && !timestamp.includes('now')) {
          logObj.timestamp = timestamp;
        }
      }
      const { data, error } = await supabase
        .from('access_logs')
        .insert(logObj)
        .select('id')
        .single();
      if (error) throw error;
      return { lastID: data ? data.id : 0, changes: 1 };
    }

    // 9. UPDATE admins SET password_hash = ? WHERE id = ?
    if (s.includes('UPDATE ADMINS SET PASSWORD_HASH = ? WHERE ID = ?')) {
      const [hash, id] = params;
      const { error } = await supabase.from('admins').update({ password_hash: hash }).eq('id', id);
      if (error) throw error;
      return { changes: 1 };
    }

    // 10. UPDATE admins SET password_hash = ? WHERE username = ?
    if (s.includes('UPDATE ADMINS SET PASSWORD_HASH = ? WHERE USERNAME = ?')) {
      const [hash, username] = params;
      const { error } = await supabase.from('admins').update({ password_hash: hash }).eq('username', username);
      if (error) throw error;
      return { changes: 1 };
    }

    // 11. DELETE FROM access_logs
    if (s.includes('DELETE FROM ACCESS_LOGS')) {
      const { error } = await supabase.from('access_logs').delete().neq('id', 0);
      if (error) throw error;
      return { changes: 1 };
    }

    return { changes: 0 };
  },

  exec: async () => {}
};

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

module.exports = { supabase, dbAsync, initDatabase };
