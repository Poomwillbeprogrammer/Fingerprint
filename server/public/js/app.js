// ==========================================
// Fingerprint Admin Dashboard Client Logic
// ==========================================

const socket = io();

// Toggle Mobile Sidebar Menu
document.addEventListener('DOMContentLoaded', () => {
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const sidebarMenu = document.getElementById('sidebarMenu');
  if (mobileMenuBtn && sidebarMenu) {
    mobileMenuBtn.addEventListener('click', () => {
      sidebarMenu.classList.toggle('hidden');
    });
  }
});

// Web Audio Beep Notifications
function playSound(type = 'granted') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'granted') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15); // E6 note
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.setValueAtTime(160, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch (e) {
    // Audio context not allowed before user interaction
  }
}

let isR307Online = false;
let isBridgeConnected = false;

// Hardware Serial Connection Status Listener
socket.on('serial_status', (data) => {
  const dot = document.getElementById('serialStatusDot');
  const text = document.getElementById('serialStatusText');
  isBridgeConnected = Boolean(data && data.connected);
  isR307Online = Boolean(data && data.connected && data.r307_connected);

  if (!dot || !text) return;

  if (isBridgeConnected && isR307Online) {
    dot.className = 'w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]';
    text.innerText = `R307 Online (${data.port})`;
    text.className = 'text-[11px] text-emerald-400 font-medium';
  } else if (isBridgeConnected && !isR307Online) {
    dot.className = 'w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] animate-pulse';
    text.innerText = `R307 Not Found (${data.port})`;
    text.className = 'text-[11px] text-amber-400 font-medium';
  } else {
    dot.className = 'w-2 h-2 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.6)]';
    text.innerText = `Offline (${data.port || 'Disconnected'})`;
    text.className = 'text-[11px] text-rose-400 font-medium';
  }
});

// Check Authentication
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.href = '/login.html';
    } else {
      const data = await res.json();
      const userEl = document.getElementById('navUsername');
      if (userEl) userEl.innerText = data.username || 'Admin';
    }
  } catch (e) {
    window.location.href = '/login.html';
  }
}

// Logout Handler
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('admin_user');
    window.location.href = '/login.html';
  });
}

// Change Password Modal Handler
const passwordModal = document.getElementById('passwordModal');
const openPasswordModalBtn = document.getElementById('openChangePasswordBtn');
const closePasswordModalBtn = document.getElementById('closePasswordModalBtn');
const cancelPasswordBtn = document.getElementById('cancelPasswordBtn');
const changePasswordForm = document.getElementById('changePasswordForm');
const pwdAlert = document.getElementById('pwdAlert');

if (openPasswordModalBtn && passwordModal) {
  openPasswordModalBtn.addEventListener('click', () => {
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    pwdAlert.className = 'hidden mb-4 p-3 rounded-xl text-xs flex items-center gap-2';
    pwdAlert.innerHTML = '';
    passwordModal.classList.remove('hidden');
  });

  function closePasswordModal() {
    passwordModal.classList.add('hidden');
  }

  if (closePasswordModalBtn) closePasswordModalBtn.addEventListener('click', closePasswordModal);
  if (cancelPasswordBtn) cancelPasswordBtn.addEventListener('click', closePasswordModal);

  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = document.getElementById('currentPassword').value;
      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      const submitBtn = document.getElementById('submitPasswordBtn');

      if (newPassword !== confirmPassword) {
        pwdAlert.className = 'mb-4 p-3 rounded-xl text-xs bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center gap-2';
        pwdAlert.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';

      try {
        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
        });
        const data = await res.json();

        if (res.ok) {
          pwdAlert.className = 'mb-4 p-3 rounded-xl text-xs bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center gap-2';
          pwdAlert.innerHTML = '<i class="fa-solid fa-circle-check"></i> ' + (data.message || 'เปลี่ยนรหัสผ่านสำเร็จ');
          setTimeout(() => {
            closePasswordModal();
          }, 1500);
        } else {
          pwdAlert.className = 'mb-4 p-3 rounded-xl text-xs bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center gap-2';
          pwdAlert.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> ' + (data.error || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
        }
      } catch (err) {
        pwdAlert.className = 'mb-4 p-3 rounded-xl text-xs bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center gap-2';
        pwdAlert.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> เกิดข้อผิดพลาดในการเชื่อมต่อ';
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> <span>บันทึกรหัสผ่าน</span>';
      }
    });
  }
}


// Format Date & Time (เวลาไทย Asia/Bangkok UTC+7)
function formatDateTime(str) {
  if (!str) return '-';
  let d;
  if (typeof str === 'string' && str.includes(' ') && !str.includes('T') && !str.includes('Z')) {
    // กรณีเป็นสตริงจาก SQLite เช่น "2026-09-02 09:15:30" (ซึ่งเป็นเวลาไทยแล้ว)
    d = new Date(str.replace(' ', 'T') + '+07:00');
  } else {
    d = new Date(str);
  }

  if (isNaN(d.getTime())) return str;

  return d.toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

// ==========================================
// 1. Dashboard Page Logic (index.html)
// ==========================================
if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
  checkAuth();

  async function loadStats() {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        document.getElementById('statTotalUsers').innerText = data.totalUsers;
        document.getElementById('statTodayScans').innerText = data.grantedToday + data.deniedToday;
        document.getElementById('statGrantedToday').innerText = data.grantedToday;
        document.getElementById('statDeniedToday').innerText = data.deniedToday;
      }
    } catch (e) {
      console.error('Error loading stats:', e);
    }
  }

  async function loadLogs() {
    const tbody = document.getElementById('logsTableBody');
    try {
      const res = await fetch('/api/logs?limit=50');
      if (res.ok) {
        const logs = await res.json();
        if (!tbody) return;
        tbody.innerHTML = '';

        if (logs.length === 0) {
          tbody.innerHTML = `<tr><td colspan="5" class="px-5 py-8 text-center text-slate-500">ยังไม่มีประวัติการสแกน</td></tr>`;
          return;
        }

        logs.forEach(log => appendLogRow(log, false));
      } else {
        if (tbody) {
          tbody.innerHTML = `
            <tr>
              <td colspan="5" class="px-5 py-8 text-center text-rose-400">
                <i class="fa-solid fa-triangle-exclamation mr-2"></i>ไม่สามารถโหลดประวัติการสแกนได้ (รหัส ${res.status})
                <button onclick="window.loadLogs()" class="ml-3 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition">
                  <i class="fa-solid fa-rotate-right mr-1"></i>ลองใหม่
                </button>
              </td>
            </tr>`;
        }
      }
    } catch (e) {
      console.error('Error loading logs:', e);
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="px-5 py-8 text-center text-rose-400">
              <i class="fa-solid fa-circle-exclamation mr-2"></i>ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อโหลดประวัติได้
              <button onclick="window.loadLogs()" class="ml-3 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition">
                <i class="fa-solid fa-rotate-right mr-1"></i>ลองใหม่
              </button>
            </td>
          </tr>`;
      }
    }
  }
  window.loadLogs = loadLogs;

  function appendLogRow(log, isLive = true) {
    const tbody = document.getElementById('logsTableBody');
    const isGranted = (log.status === 'GRANTED' || log.status === 'OK');
    const tr = document.createElement('tr');
    tr.className = `border-b border-slate-800/60 hover:bg-slate-800/40 transition ${isLive ? 'animate-new-row' : ''}`;

    const isOffline = log.is_offline || (log.tier && log.tier.includes('Offline'));
    const offlineBadge = isOffline ? `
      <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 ml-1.5" title="สแกนตอนเครือข่ายออฟไลน์">
        <i class="fa-solid fa-wifi-slash text-[8px]"></i>ซิงก์ออฟไลน์
      </span>
    ` : '';

    tr.innerHTML = `
      <td class="px-5 py-3.5 font-mono text-xs text-slate-400">${formatDateTime(log.timestamp)}</td>
      <td class="px-5 py-3.5 font-mono text-xs text-cyan-300 font-semibold">${log.student_id || '-'}</td>
      <td class="px-5 py-3.5 font-medium text-white flex items-center gap-2">
        <div class="w-7 h-7 rounded-full ${isGranted ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'} flex items-center justify-center text-xs">
          <i class="fa-solid ${isGranted ? 'fa-user-check' : 'fa-user-xmark'}"></i>
        </div>
        <div>
          <div class="flex items-center">${log.user_name || 'Unknown User'}${offlineBadge}</div>
          ${log.schedule ? `<div class="text-[10px] text-cyan-400 font-mono mt-0.5 flex items-center gap-1"><i class="fa-solid fa-chalkboard-user text-[9px]"></i><span>${log.schedule.short_name || log.schedule.subject_name} [${log.schedule.class_type || 'T'}]</span><span class="${log.attendance_status === 'ON_TIME' ? 'text-emerald-400' : 'text-amber-400'} font-semibold">(${log.attendance_status === 'ON_TIME' ? 'ทันเวลา' : 'มาสาย'})</span></div>` : ''}
        </div>
      </td>
      <td class="px-5 py-3.5 font-mono text-xs text-cyan-400 font-semibold">${log.fingerprint_id > 0 ? '#' + log.fingerprint_id : '-'}</td>
      <td class="px-5 py-3.5">
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${isGranted ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'}">
          <i class="fa-solid ${isGranted ? 'fa-check' : 'fa-xmark'} text-[10px]"></i>
          ${isGranted ? 'ผ่าน (Granted)' : 'ปฏิเสธ (Denied)'}
        </span>
      </td>
      <td class="px-5 py-3.5 font-mono text-xs text-slate-400">${log.score || 0}</td>
      <td class="px-5 py-3.5 text-xs font-medium text-slate-300">${isOffline ? '<span class="text-amber-400">Tier 1 (Offline)</span>' : (log.tier || (log.fingerprint_id > 0 ? 'Tier 1' : '-'))}</td>
    `;

    if (isLive) {
      // เอาแถวเปล่าออกถ้ามี
      if (tbody.children.length === 1 && tbody.children[0].innerText.includes('ยังไม่มีประวัติ')) {
        tbody.innerHTML = '';
      }
      tbody.insertBefore(tr, tbody.firstChild);
      // จำกัด 50 แถว
      if (tbody.children.length > 50) {
        tbody.removeChild(tbody.lastChild);
      }
    } else {
      tbody.appendChild(tr);
    }
  }

  // Socket.io: รับ Event การสแกนนิ้วสดทันทีที่เซนเซอร์แตะ!
  socket.on('new_log', (log) => {
    appendLogRow(log, true);
    playSound(log.status === 'GRANTED' ? 'granted' : 'denied');
    loadStats();
  });

  // Socket.io: รับแจ้งเตือนเมื่อระบบซิงก์ข้อมูลออฟไลน์ย้อนหลังเสร็จสิ้น
  socket.on('offline_sync_completed', (data) => {
    console.log(`📡 [Offline Sync] ซิงก์ข้อมูลออฟไลน์ย้อนหลังสำเร็จ ${data.count} รายการ`);
    loadStats();
    loadLogs();
  });

  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadStats();
      loadLogs();
    });
  }

  // Initial Load
  loadStats();
  loadLogs();
}

// ==========================================
// 2. Users Page Logic (users.html)
// ==========================================
if (window.location.pathname.endsWith('users.html')) {
  checkAuth();

  let allUsers = [];

  async function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        allUsers = await res.json();
        renderUserTable(allUsers);
      } else {
        if (tbody) {
          tbody.innerHTML = `
            <tr>
              <td colspan="7" class="px-5 py-8 text-center text-rose-400">
                <i class="fa-solid fa-triangle-exclamation mr-2"></i>ไม่สามารถโหลดรายชื่อผู้ใช้ได้ (รหัส ${res.status})
                <button onclick="window.loadUsers()" class="ml-3 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition">
                  <i class="fa-solid fa-rotate-right mr-1"></i>ลองใหม่
                </button>
              </td>
            </tr>`;
        }
      }
    } catch (e) {
      console.error('Error loading users:', e);
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="px-5 py-8 text-center text-rose-400">
              <i class="fa-solid fa-circle-exclamation mr-2"></i>ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อโหลดรายชื่อผู้ใช้ได้
              <button onclick="window.loadUsers()" class="ml-3 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition">
                <i class="fa-solid fa-rotate-right mr-1"></i>ลองใหม่
              </button>
            </td>
          </tr>`;
      }
    }
  }
  window.loadUsers = loadUsers;

  function renderUserTable(users) {
    const tbody = document.getElementById('usersTableBody');
    const countEl = document.getElementById('userCount');
    countEl.innerText = users.length;
    tbody.innerHTML = '';

    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-5 py-8 text-center text-slate-500">ไม่พบรายชื่อผู้ใช้งาน</td></tr>`;
      return;
    }

    users.forEach(user => {
      const hasTemplate = user.fingerprint_template && user.fingerprint_template.length >= 512;
      const inSensor = user.in_sensor !== 0; // default true/1
      
      let tierBadge = '';
      if (hasTemplate && inSensor) {
        tierBadge = `
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 shadow-sm" title="บันทึกใน Flash ของ R307 สแกนผ่านเร็ว < 0.2 วินาที">
            <i class="fa-solid fa-bolt text-[10px] text-amber-300"></i> Tier 1 (ในเซนเซอร์)
          </span>`;
      } else if (hasTemplate && !inSensor) {
        tierBadge = `
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/25 shadow-sm" title="จัดเก็บใน Database สแกนตรวจอัตโนมัติ">
            <i class="fa-solid fa-cloud text-[10px]"></i> Tier 2 (ในคลาวด์)
          </span>`;
      } else {
        tierBadge = `
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/25">
            <i class="fa-solid fa-fingerprint text-[10px]"></i> ยังไม่ลงทะเบียน
          </span>`;
      }

      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-800/60 hover:bg-slate-800/40 transition';
      tr.innerHTML = `
        <td class="px-5 py-3.5 font-mono text-sm font-bold text-cyan-400">#${user.id}</td>
        <td class="px-5 py-3.5 font-mono text-xs text-cyan-300 font-semibold tracking-wider">${user.student_id || '-'}</td>
        <td class="px-5 py-3.5 font-medium text-white">${user.name}</td>
        <td class="px-5 py-3.5">${tierBadge}</td>
        <td class="px-5 py-3.5 font-mono text-xs text-slate-400">${formatDateTime(user.created_at)}</td>
        <td class="px-5 py-3.5 text-right">
          <div class="flex items-center justify-end gap-1.5">
            <button onclick="deleteUser(${user.id}, '${user.name}')" title="ลบผู้ใช้และลายนิ้วมือ" class="px-2.5 py-1.5 text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg text-xs font-medium transition flex items-center gap-1">
              <i class="fa-regular fa-trash-can"></i> ลบ
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Search Filter
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const filtered = allUsers.filter(u => 
        u.name.toLowerCase().includes(q) || 
        (u.student_id && u.student_id.toLowerCase().includes(q)) || 
        u.id.toString().includes(q)
      );
      renderUserTable(filtered);
    });
  }

  // Delete User
  window.deleteUser = async function(id, name) {
    if (!confirm(`คุณต้องการลบผู้ใช้งาน ID #${id} (${name}) ใช่หรือไม่?\n(ระบบจะสั่งลบลายนิ้วมือออกจากเซนเซอร์ R307 ให้อัตโนมัติ)`)) {
      return;
    }
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadUsers();
      } else {
        const data = await res.json();
        alert(data.error || 'ลบไม่สำเร็จ');
      }
    } catch (e) {
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  };

  // ดึงลายนิ้วมือจากเซนเซอร์ R307 มาเก็บสำรองใน Database ทีละคน
  window.backupUser = async function(id) {
    try {
      const res = await fetch(`/api/device/backup/${id}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        // แจ้งเตือนผู้ใช้
        alert(`กำลังดึงข้อมูลลายนิ้วมือ ID #${id} จากเซนเซอร์ R307 กรุณารอสักครู่...`);
      } else {
        alert(data.error || 'ไม่สามารถส่งคำสั่งดึงข้อมูลได้');
      }
    } catch (e) {
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  };

  // กู้คืนลายนิ้วมือจาก Database ลงเซนเซอร์ R307 ทีละคน
  window.restoreUser = async function(id) {
    if (!confirm(`ต้องการกู้คืนลายนิ้วมือของ ID #${id} ลงในเซนเซอร์ R307 ใช่หรือไม่?`)) return;
    try {
      const res = await fetch(`/api/device/restore/${id}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(`กำลังเขียนลายนิ้วมือ ID #${id} ลงเซนเซอร์ R307...`);
      } else {
        alert(data.error || 'กู้คืนไม่สำเร็จ');
      }
    } catch (e) {
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  };

  // ปุ่มสำรองข้อมูลทั้งหมดจาก R307 เข้า Database
  const backupAllBtn = document.getElementById('backupAllBtn');
  if (backupAllBtn) {
    backupAllBtn.addEventListener('click', async () => {
      if (!confirm('คุณต้องการดึงข้อมูลลายนิ้วมือทั้งหมดที่มีในเซนเซอร์ R307 มาบันทึกสำรองใน Database ใช่หรือไม่?')) return;
      try {
        const res = await fetch('/api/device/backup-all', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          alert(data.message || 'กำลังเริ่มสำรองข้อมูลลายนิ้วมือทั้งหมด...');
        } else {
          alert(data.error || 'ดำเนินการไม่สำเร็จ');
        }
      } catch (e) {
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
      }
    });
  }

  // ปุ่มกู้คืนลายนิ้วมือทั้งหมดจาก Database ลงเซนเซอร์ R307 (เหมาะสำหรับเปลี่ยนเซนเซอร์ใหม่)
  const restoreAllBtn = document.getElementById('restoreAllBtn');
  if (restoreAllBtn) {
    restoreAllBtn.addEventListener('click', async () => {
      if (!confirm('คุณต้องการกู้คืนลายนิ้วมือทั้งหมดจาก Database ลงในเซนเซอร์ R307 ใช่หรือไม่?\n(แนะนำเมื่อเพิ่งเปลี่ยนเซนเซอร์ R307 ตัวใหม่ หรือข้อมูลในเซนเซอร์หาย)')) return;
      try {
        const res = await fetch('/api/device/restore-all', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          alert(data.message || 'กำลังเริ่มกู้คืนข้อมูลลายนิ้วมือลงเซนเซอร์...');
        } else {
          alert(data.error || 'ดำเนินการไม่สำเร็จ');
        }
      } catch (e) {
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
      }
    });
  }

  // Modal Handlers
  const modal = document.getElementById('enrollModal');
  const openModalBtn = document.getElementById('openEnrollModalBtn');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const cancelEnrollBtn = document.getElementById('cancelEnrollBtn');
  const enrollForm = document.getElementById('enrollForm');

  let isEnrolling = false;
  let createdUserId = null;

  openModalBtn.addEventListener('click', () => {
    isEnrolling = false;
    createdUserId = null;
    document.getElementById('submitEnrollBtn').disabled = false;

    // คำนวณหา Slot ID ที่ว่างอันดับแรกสุด (Auto-Fill Gaps เช่น หากลบ #3 จะนำ #3 มาใช้ใหม่ทันที)
    const usedIds = new Set(allUsers.map(u => u.id));
    let nextId = 1;
    while (usedIds.has(nextId) && nextId <= 300) nextId++;

    document.getElementById('enrollSlotId').value = nextId;
    const badge = document.getElementById('enrollSlotIdBadge');
    if (badge) {
      const s1 = (nextId - 1) * 3 + 1;
      const s2 = (nextId - 1) * 3 + 2;
      const s3 = (nextId - 1) * 3 + 3;
      badge.innerText = `User #${nextId} (Slots #${s1}, #${s2}, #${s3})`;
    }

    document.getElementById('enrollStudentId').value = '';
    document.getElementById('enrollName').value = '';
    updateGuidance('ready', 'พร้อมลงทะเบียน', 'กรอกรหัสนักศึกษาและชื่อ แล้วกดปุ่ม "บันทึกข้อมูล" ด้านล่าง');
    modal.classList.remove('hidden');
    setTimeout(() => {
      document.getElementById('enrollStudentId').focus();
    }, 100);
  });

  function handleCancelOrClose() {
    const id = createdUserId || parseInt(document.getElementById('enrollSlotId').value);
    if (isEnrolling || createdUserId) {
      socket.emit('cancel_enroll', { id });
      isEnrolling = false;
      createdUserId = null;
    }
    modal.classList.add('hidden');
    document.getElementById('submitEnrollBtn').disabled = false;
    loadUsers();
  }

  closeModalBtn.addEventListener('click', handleCancelOrClose);
  cancelEnrollBtn.addEventListener('click', handleCancelOrClose);

  function updateGuidance(state, title, desc) {
    const icon = document.getElementById('stepIcon');
    const titleEl = document.getElementById('stepTitle');
    const descEl = document.getElementById('stepDesc');

    titleEl.innerText = title;
    descEl.innerText = desc;

    if (state === 'step1') {
      icon.innerHTML = '<i class="fa-solid fa-fingerprint animate-bounce text-cyan-400"></i>';
      icon.className = 'w-12 h-12 mx-auto mb-2 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-xl';
    } else if (state === 'remove') {
      icon.innerHTML = '<i class="fa-solid fa-hand text-amber-400 animate-pulse"></i>';
      icon.className = 'w-12 h-12 mx-auto mb-2 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-xl';
    } else if (state === 'success') {
      icon.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-400"></i>';
      icon.className = 'w-12 h-12 mx-auto mb-2 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-xl';
    } else if (state === 'failed') {
      icon.innerHTML = '<i class="fa-solid fa-circle-xmark text-rose-400"></i>';
      icon.className = 'w-12 h-12 mx-auto mb-2 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-xl';
    } else {
      icon.innerHTML = '<i class="fa-solid fa-hand-pointer text-slate-400"></i>';
      icon.className = 'w-12 h-12 mx-auto mb-2 rounded-full bg-slate-800 flex items-center justify-center text-xl';
    }
  }

  // Submit Enroll Form
  enrollForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = parseInt(document.getElementById('enrollSlotId').value);
    const student_id = document.getElementById('enrollStudentId').value.trim();
    const name = document.getElementById('enrollName').value.trim();

    if (!student_id || !name) {
      alert('กรุณากรอกรหัสนักศึกษาและชื่อ-นามสกุลให้ครบถ้วน');
      return;
    }

    if (!isR307Online) {
      alert('⚠️ ไม่สามารถเริ่มลงทะเบียนได้ เนื่องจากไม่พบเซนเซอร์ R307\n\nกรุณาตรวจสอบว่าเซนเซอร์ลายนิ้วมือเสียบอยู่กับบอร์ด (Pin 0/1) หรือไม่');
      return;
    }

    const submitBtn = document.getElementById('submitEnrollBtn');
    submitBtn.disabled = true;

    // 1. บันทึกลง Cloud Database
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, student_id, name })
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'บันทึกไม่สำเร็จ');
        submitBtn.disabled = false;
        return;
      }

      isEnrolling = true;
      const assignedId = data.id || id;
      createdUserId = assignedId;
      // 2. ส่งคำสั่งให้ Arduino เริ่มขั้นตอนสแกนนิ้วสด
      updateGuidance('step1', 'ขั้นตอนที่ 1: วางนิ้วบนเซนเซอร์', `กรุณาวางนิ้วบนเซนเซอร์ R307 เพื่อบันทึก Slot #${assignedId}`);
      socket.emit('start_enroll', { id: assignedId, name });

    } catch (err) {
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
      submitBtn.disabled = false;
    }
  });

  // Socket.io: รับสถานะขั้นตอนสแกนสดจาก Arduino (รองรับ 3 นิ้วต่อคน)
  let currentFingerNum = 1;

  socket.on('enroll_step_update', (data) => {
    if (data.fingerNum) {
      currentFingerNum = data.fingerNum;
    }
    const fPrefix = `[นิ้วที่ ${currentFingerNum}/3] `;

    if (data.status === 'FINGER_START') {
      updateGuidance('step1', `${fPrefix}วางนิ้วบนเซนเซอร์`, `กรุณาวางนิ้วที่ ${currentFingerNum} (Slot #${data.slotId})`);
    } else if (data.status === 'STEP1_WAIT') {
      updateGuidance('step1', `${fPrefix}ขั้นตอนที่ 1: วางนิ้วบนเซนเซอร์`, `วางนิ้วที่ ${currentFingerNum} ที่ต้องการบันทึก`);
    } else if (data.status === 'REMOVE_FINGER') {
      updateGuidance('remove', `${fPrefix}ขั้นตอนที่ 2: กรุณายกนิ้วออก`, 'ยกนิ้วออกจากเซนเซอร์สักครู่');
    } else if (data.status === 'STEP2_WAIT') {
      updateGuidance('step1', `${fPrefix}ขั้นตอนที่ 3: วางนิ้วเดิมซ้ำอีกครั้ง`, `วางนิ้วที่ ${currentFingerNum} อีกครั้งเพื่อยืนยัน`);
    } else if (data.status === 'FINGER_DONE') {
      updateGuidance('success', `บันทึกนิ้วที่ ${data.fingerNum}/3 สำเร็จ!`, 'กำลังเตรียมพร้อมสำหรับนิ้วถัดไป...');
      playSound('granted');
    } else if (data.status === 'SUCCESS') {
      isEnrolling = false;
      createdUserId = null;
      updateGuidance('success', '🎉 บันทึกลายนิ้วมือครบ 3 นิ้วสำเร็จ!', `บันทึก User ID #${data.id} (3 นิ้ว) เรียบร้อยแล้ว`);
      playSound('granted');
      setTimeout(() => {
        modal.classList.add('hidden');
        loadUsers();
        document.getElementById('submitEnrollBtn').disabled = false;
      }, 2000);
    } else if (data.status === 'CANCELLED') {
      isEnrolling = false;
      createdUserId = null;
      updateGuidance('failed', 'ยกเลิกแล้ว', data.message || 'ยกเลิกการลงทะเบียนเรียบร้อย');
      document.getElementById('submitEnrollBtn').disabled = false;
      setTimeout(() => {
        modal.classList.add('hidden');
        loadUsers();
      }, 1200);
    } else if (data.status === 'FAILED') {
      isEnrolling = false;
      createdUserId = null;
      const isDuplicate = (data.code === 'DUPLICATE');
      updateGuidance('failed', isDuplicate ? '⚠️ ลายนิ้วมือซ้ำในระบบ' : 'การลงทะเบียนไม่สำเร็จ', data.message || 'กรุณาลองใหม่อีกครั้ง');
      playSound('denied');
      document.getElementById('submitEnrollBtn').disabled = false;
      loadUsers();
    }
  });

  // Socket.io: รับสถานะการสำรองและกู้คืนลายนิ้วมือ
  socket.on('template_saved', (data) => {
    playSound('granted');
    loadUsers();
  });

  socket.on('restore_progress', (data) => {
    if (data.status === 'SUCCESS') {
      playSound('granted');
      alert(`✅ กู้คืนลายนิ้วมือ ID #${data.id} ลงในเซนเซอร์ R307 เรียบร้อยแล้ว!`);
      loadUsers();
    } else if (data.status === 'ALL_COMPLETED') {
      playSound('granted');
      alert(`🎉 กู้คืนข้อมูลลายนิ้วมือทั้งหมด (${data.total} คน) ลงเซนเซอร์ R307 เรียบร้อยแล้ว!`);
      loadUsers();
    } else if (data.status === 'FAILED') {
      playSound('denied');
      alert(`❌ ${data.message || 'กู้คืนไม่สำเร็จ'}`);
    }
  });

  socket.on('backup_progress', (data) => {
    if (data.status === 'ALL_COMPLETED') {
      playSound('granted');
      alert('🎉 ดึงข้อมูลสำรองลายนิ้วมือจากเซนเซอร์ R307 ครบถ้วนแล้ว!');
      loadUsers();
    } else if (data.status === 'FAILED') {
      playSound('denied');
      alert(`⚠️ ${data.message || 'สำรองข้อมูลไม่สำเร็จ'}`);
    }
  });

  socket.on('user_updated', () => {
    loadUsers();
  });

  // Initial Load
  loadUsers();
}
