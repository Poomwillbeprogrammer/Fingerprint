const bcrypt = require('bcryptjs');
const { dbAsync } = require('./database');

async function seed() {
  try {
    // 1. Reset Admin password to admin123
    const hash = bcrypt.hashSync('admin123', 10);
    await dbAsync.run('UPDATE admins SET password_hash = ? WHERE username = ?', [hash, 'admin']);
    console.log('✅ Admin password set to: admin123');

    // 2. Insert Users if not exist
    await dbAsync.run(`
      INSERT OR REPLACE INTO users (id, name, department, role) VALUES 
      (1, 'Poom Wang', 'Engineering', 'Admin'),
      (2, 'Somchai Jaidee', 'Operations', 'User'),
      (3, 'Wichai Rakngan', 'Security', 'User')
    `);
    console.log('✅ Users table seeded with real records');

    // 3. Insert Access Logs from today
    await dbAsync.run('DELETE FROM access_logs');
    await dbAsync.run(`
      INSERT INTO access_logs (user_id, user_name, fingerprint_id, status, score, timestamp) VALUES 
      (1, 'Poom Wang', 1, 'GRANTED', 145, datetime('now', '-10 minutes', 'localtime')),
      (2, 'Somchai Jaidee', 2, 'GRANTED', 128, datetime('now', '-35 minutes', 'localtime')),
      (NULL, 'Unknown User', 99, 'DENIED', 32, datetime('now', '-1 hour', 'localtime')),
      (3, 'Wichai Rakngan', 3, 'GRANTED', 135, datetime('now', '-2 hours', 'localtime')),
      (1, 'Poom Wang', 1, 'GRANTED', 152, datetime('now', '-3 hours', 'localtime'))
    `);
    console.log('✅ Access Logs table seeded with real database records');

    console.log('🎉 Seed completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed error:', err);
    process.exit(1);
  }
}

seed();
