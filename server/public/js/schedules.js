const socket = io();

let allSchedules = [];
let activeScheduleInfo = null;
let currentViewingScheduleId = null;
let selectedDayFilter = 'all';

// Thai day names
const DAY_NAMES = ['', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์', 'วันอาทิตย์'];

// 1. ตรวจสอบการเข้าสู่ระบบ (Authentication)
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.href = '/login.html';
      return false;
    }
    const data = await res.json();
    document.getElementById('navUsername').textContent = data.username || 'Admin';
    return true;
  } catch (err) {
    window.location.href = '/login.html';
    return false;
  }
}

// 2. โหลดตารางเรียนทั้งหมด
async function loadSchedules() {
  try {
    const res = await fetch('/api/schedules');
    if (!res.ok) throw new Error('Failed to fetch schedules');
    allSchedules = await res.json();
    renderSchedulesGrid();
  } catch (err) {
    console.error('Error loading schedules:', err);
  }
}

// 3. โหลดข้อมูลคาบเรียนปัจจุบัน
async function loadActiveSchedule() {
  try {
    const res = await fetch('/api/schedules/current');
    if (!res.ok) throw new Error('Failed to fetch current schedule');
    activeScheduleInfo = await res.json();
    renderActiveBanner();
  } catch (err) {
    console.error('Error loading active schedule:', err);
  }
}

// 4. เรนเดอร์ Active Schedule Live Banner
function renderActiveBanner() {
  const banner = document.getElementById('activeBanner');
  if (!banner) return;

  if (activeScheduleInfo && activeScheduleInfo.schedule) {
    const s = activeScheduleInfo.schedule;
    const isEarly = activeScheduleInfo.isEarly;
    const isLate = activeScheduleInfo.attendanceStatus === 'LATE';

    const statusBadge = isEarly
      ? '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"><span class="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span> เปิดให้สแกนล่วงหน้า (15 นาทีก่อนเริ่ม)</span>'
      : '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"><span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> กำลังเรียนอยู่ (Active Class)</span>';

    const typeBadge = s.class_type === 'P'
      ? '<span class="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">[P] ปฏิบัติ</span>'
      : '<span class="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">[T] ทฤษฎี</span>';

    banner.className = 'mb-6 p-5 rounded-2xl border border-cyan-500/40 bg-gradient-to-r from-cyan-950/40 via-slate-900 to-slate-900 shadow-xl shadow-cyan-950/20';
    banner.innerHTML = `
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div class="flex flex-wrap items-center gap-2 mb-2">
            ${statusBadge}
            ${typeBadge}
            <span class="text-xs text-slate-400 font-mono"><i class="fa-solid fa-clock"></i> ${s.time_display}</span>
            <span class="text-xs text-slate-400"><i class="fa-solid fa-location-dot"></i> ${s.room_name} (${s.building})</span>
          </div>
          <h2 class="text-lg font-bold text-white flex items-center gap-2">
            <span class="text-cyan-400 font-mono">${s.subject_code}</span>
            <span>${s.subject_name}</span>
          </h2>
          <p class="text-xs text-slate-300 mt-1 flex flex-wrap items-center gap-4">
            <span><i class="fa-solid fa-user-tie text-slate-400 mr-1"></i> ${s.instructor || '-'}</span>
            <span><i class="fa-solid fa-users-rectangle text-slate-400 mr-1"></i> ${s.section_group || '-'}</span>
            <span class="text-emerald-400 font-medium"><i class="fa-solid fa-hourglass-half mr-1"></i> อนุโลมสาย 15 นาที</span>
          </p>
        </div>
        <div class="flex items-center gap-3">
          <button onclick="openAttendanceModal(${s.id})" class="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition">
            <i class="fa-solid fa-clipboard-check"></i> ดูใบเช็คชื่อคาบนี้
          </button>
        </div>
      </div>
    `;
  } else {
    banner.className = 'mb-6 p-4 rounded-2xl border border-slate-800 bg-slate-900/60';
    banner.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
          <i class="fa-solid fa-mug-hot text-lg"></i>
        </div>
        <div>
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">นอกเวลาเรียน (General Access)</span>
            <span class="text-xs text-slate-400">ห้อง ทค.1-101 อาคารเทคนิคคอมพิวเตอร์</span>
          </div>
          <p class="text-xs text-slate-400 mt-1">ขณะนี้ไม่มีคาบเรียนตามตาราง การสแกนนิ้วจะถูกบันทึกเป็นประวัติการใช้งานทั่วไป</p>
        </div>
      </div>
    `;
  }
}

// 5. เรนเดอร์การ์ดตารางเรียนแยกตามวัน
function renderSchedulesGrid() {
  const grid = document.getElementById('schedulesGrid');
  if (!grid) return;

  const filtered = selectedDayFilter === 'all'
    ? allSchedules
    : allSchedules.filter(s => s.day_of_week === parseInt(selectedDayFilter));

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-16 text-center">
        <div class="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mx-auto mb-3">
          <i class="fa-regular fa-calendar-xmark text-xl"></i>
        </div>
        <p class="text-base font-medium text-slate-300">ไม่มีคาบเรียนในหมวดนี้</p>
        <p class="text-xs text-slate-500 mt-1">เลือกดูวันอื่น หรือนำเข้าไฟล์ตารางเรียนใหม่</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(s => {
    const isCurrent = activeScheduleInfo && activeScheduleInfo.schedule && activeScheduleInfo.schedule.id === s.id;
    const typeBadge = s.class_type === 'P'
      ? '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">[P] ปฏิบัติ</span>'
      : '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">[T] ทฤษฎี</span>';

    const currentBadge = isCurrent
      ? '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> ตอนนี้</span>'
      : '';

    return `
      <div class="glass-card rounded-2xl p-5 border ${isCurrent ? 'border-cyan-500/50 shadow-lg shadow-cyan-950/20' : 'border-slate-800/80'} hover:border-slate-700 transition flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between gap-2 mb-3">
            <span class="text-xs font-semibold text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-lg border border-cyan-500/20">
              <i class="fa-regular fa-calendar mr-1"></i> ${s.day_name}
            </span>
            <div class="flex items-center gap-1.5">
              ${currentBadge}
              ${typeBadge}
            </div>
          </div>

          <div class="flex items-center gap-1.5 text-xs text-slate-300 font-mono mb-2">
            <i class="fa-solid fa-clock text-slate-500 text-[11px]"></i>
            <span>${s.time_display}</span>
          </div>

          <div class="mb-3">
            <p class="text-xs text-slate-400 font-mono font-medium">${s.subject_code}</p>
            <h3 class="text-sm font-bold text-white mt-0.5 leading-snug line-clamp-2" title="${s.subject_name}">${s.subject_name}</h3>
          </div>

          <div class="space-y-1 text-[11px] text-slate-400 mb-4 pt-3 border-t border-slate-800/60">
            <p class="flex items-center gap-1.5 truncate">
              <i class="fa-solid fa-user-tie text-slate-500 w-3.5 text-center"></i>
              <span>${s.instructor || '-'}</span>
            </p>
            <p class="flex items-center gap-1.5 truncate">
              <i class="fa-solid fa-users text-slate-500 w-3.5 text-center"></i>
              <span>${s.section_group || '-'}</span>
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 pt-2 border-t border-slate-800/80">
          <button onclick="openAttendanceModal(${s.id})" class="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition">
            <i class="fa-solid fa-list-check text-cyan-400"></i> ใบเช็คชื่อ
          </button>
          <a href="/api/schedules/${s.id}/export-excel" download title="ดาวน์โหลด Excel" class="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs transition">
            <i class="fa-solid fa-file-excel"></i>
          </a>
        </div>
      </div>
    `;
  }).join('');
}

// 6. หน้าต่างใบเช็คชื่อประจำคาบ (Attendance Sheet Modal)
async function openAttendanceModal(scheduleId) {
  currentViewingScheduleId = scheduleId;
  const schedule = allSchedules.find(s => s.id === parseInt(scheduleId));
  if (!schedule) return;

  // ตั้งค่าวันที่เริ่มต้นเป็นวันนี้ (UTC+7 Bangkok)
  const nowUtc = new Date().getTime() + new Date().getTimezoneOffset() * 60000;
  const thaiNow = new Date(nowUtc + 7 * 3600000);
  const todayStr = thaiNow.toISOString().split('T')[0];

  const filterDateInput = document.getElementById('filterDate');
  if (filterDateInput && !filterDateInput.value) {
    filterDateInput.value = todayStr;
  }

  // Header ข้อมูลวิชา
  document.getElementById('modalSubjectCode').textContent = schedule.subject_code;
  document.getElementById('modalSubjectName').textContent = schedule.subject_name;
  document.getElementById('modalDayTime').textContent = `${schedule.day_name} ${schedule.time_display}`;
  document.getElementById('modalInstructorGroup').textContent = `อาจารย์ผู้สอน: ${schedule.instructor || '-'} | แผนก/ชั้นปี: ${schedule.section_group || '-'} | ห้อง: ${schedule.room_name}`;

  const modalTypeBadge = document.getElementById('modalTypeBadge');
  if (schedule.class_type === 'P') {
    modalTypeBadge.className = 'px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30';
    modalTypeBadge.textContent = '[P] ปฏิบัติ';
  } else {
    modalTypeBadge.className = 'px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30';
    modalTypeBadge.textContent = '[T] ทฤษฎี';
  }

  document.getElementById('attendanceModal').classList.remove('hidden');
  await loadAttendanceSheetData(scheduleId, filterDateInput.value);
}

// โหลดข้อมูลนักศึกษาที่สแกนเข้าเรียนในคาบนี้
async function loadAttendanceSheetData(scheduleId, dateStr) {
  try {
    const url = `/api/schedules/${scheduleId}/attendance${dateStr ? '?date=' + dateStr : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch attendance');
    const data = await res.json();

    // 3 Metric Counters (Option 1: Only Scanned Attendees)
    document.getElementById('metricTotal').textContent = data.totalAttendees || 0;
    document.getElementById('metricOnTime').textContent = data.onTimeCount || 0;
    document.getElementById('metricLate').textContent = data.lateCount || 0;

    const tbody = document.getElementById('attendeesTableBody');
    const emptyState = document.getElementById('emptyAttendeesState');

    if (!data.attendees || data.attendees.length === 0) {
      tbody.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    tbody.innerHTML = data.attendees.map((att, idx) => {
      const isOnTime = att.attendance_status === 'ON_TIME';
      const statusBadge = isOnTime
        ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><i class="fa-solid fa-check"></i> ทันเวลา</span>'
        : '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20"><i class="fa-solid fa-clock"></i> มาสาย</span>';

      return `
        <tr class="hover:bg-slate-800/30 transition">
          <td class="py-3 text-center text-slate-400 font-mono">${idx + 1}</td>
          <td class="py-3 text-cyan-400 font-mono font-medium">${att.student_id || '-'}</td>
          <td class="py-3 font-medium text-white">${att.user_name || '-'}</td>
          <td class="py-3 text-slate-300 font-mono">${att.time || '-'}</td>
          <td class="py-3">${statusBadge}</td>
          <td class="py-3 text-right text-slate-400 font-mono">${att.score || 0}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Error loading attendance sheet data:', err);
  }
}

// 7. จัดการ Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
  const isAuthed = await checkAuth();
  if (!isAuthed) return;

  await loadSchedules();
  await loadActiveSchedule();

  // ตั้งเวลาอัปเดตสถานะคาบเรียนทุก 1 นาที
  setInterval(loadActiveSchedule, 60000);

  // Day Filter Tabs
  document.querySelectorAll('.day-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.day-tab').forEach(t => {
        t.className = 'day-tab px-4 py-2 rounded-xl text-xs font-medium bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition';
      });
      tab.className = 'day-tab px-4 py-2 rounded-xl text-xs font-medium bg-cyan-500 text-slate-950 font-semibold shadow-md shadow-cyan-500/20';
      selectedDayFilter = tab.dataset.day;
      renderSchedulesGrid();
    });
  });

  // Modal Close
  document.getElementById('closeModalBtn').addEventListener('click', () => {
    document.getElementById('attendanceModal').classList.add('hidden');
    currentViewingScheduleId = null;
  });

  // Date Change in Modal
  document.getElementById('filterDate').addEventListener('change', (e) => {
    if (currentViewingScheduleId) {
      loadAttendanceSheetData(currentViewingScheduleId, e.target.value);
    }
  });

  // Export Excel in Modal
  document.getElementById('exportExcelBtn').addEventListener('click', () => {
    if (currentViewingScheduleId) {
      const dateVal = document.getElementById('filterDate').value;
      window.location.href = `/api/schedules/${currentViewingScheduleId}/export-excel${dateVal ? '?date=' + dateVal : ''}`;
    }
  });

  // Refresh Button
  document.getElementById('refreshBtn').addEventListener('click', async () => {
    await loadSchedules();
    await loadActiveSchedule();
  });

  // Import Modal Handlers
  const importModal = document.getElementById('importModal');
  const openImportBtn = document.getElementById('openImportBtn');
  const closeImportModalBtn = document.getElementById('closeImportModalBtn');
  const cancelImportBtn = document.getElementById('cancelImportBtn');
  const excelFileInput = document.getElementById('excelFileInput');
  const uploadLabel = document.getElementById('uploadLabel');
  const submitImportBtn = document.getElementById('submitImportBtn');
  const importForm = document.getElementById('importForm');
  const importError = document.getElementById('importError');

  openImportBtn.addEventListener('click', () => {
    importModal.classList.remove('hidden');
    excelFileInput.value = '';
    uploadLabel.textContent = 'คลิกเพื่อเลือกไฟล์ .xlsx หรือลากไฟล์มาวางที่นี่';
    submitImportBtn.disabled = true;
    importError.classList.add('hidden');
  });

  closeImportModalBtn.addEventListener('click', () => importModal.classList.add('hidden'));
  cancelImportBtn.addEventListener('click', () => importModal.classList.add('hidden'));

  excelFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      uploadLabel.textContent = `ไฟล์ที่เลือก: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      submitImportBtn.disabled = false;
      importError.classList.add('hidden');
    }
  });

  importForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!excelFileInput.files || !excelFileInput.files[0]) return;

    submitImportBtn.disabled = true;
    submitImportBtn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> กำลังนำเข้า...';
    importError.classList.add('hidden');

    try {
      const formData = new FormData();
      formData.append('file', excelFileInput.files[0]);

      const res = await fetch('/api/schedules/import-excel', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'นำเข้าไฟล์ล้มเหลว');

      importModal.classList.add('hidden');
      alert(`✅ นำเข้าตารางเรียนสำเร็จทั้งหมด ${data.count} คาบ!`);
      await loadSchedules();
      await loadActiveSchedule();
    } catch (err) {
      importError.textContent = err.message;
      importError.classList.remove('hidden');
    } finally {
      submitImportBtn.disabled = false;
      submitImportBtn.innerHTML = '<i class="fa-solid fa-upload"></i> อัปโหลดและบันทึก';
    }
  });

  // Change Password Modal Handlers
  const changePasswordModal = document.getElementById('changePasswordModal');
  const openChangePasswordBtn = document.getElementById('openChangePasswordBtn');
  const closePasswordModalBtn = document.getElementById('closePasswordModalBtn');
  const cancelPasswordBtn = document.getElementById('cancelPasswordBtn');
  const changePasswordForm = document.getElementById('changePasswordForm');
  const passwordError = document.getElementById('passwordError');

  openChangePasswordBtn.addEventListener('click', () => {
    changePasswordModal.classList.remove('hidden');
    changePasswordForm.reset();
    passwordError.classList.add('hidden');
  });

  closePasswordModalBtn.addEventListener('click', () => changePasswordModal.classList.add('hidden'));
  cancelPasswordBtn.addEventListener('click', () => changePasswordModal.classList.add('hidden'));

  changePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
      passwordError.textContent = 'รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน';
      passwordError.classList.remove('hidden');
      return;
    }

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ไม่สามารถเปลี่ยนรหัสผ่านได้');

      alert('✅ เปลี่ยนรหัสผ่านสำเร็จเรียบร้อยแล้ว');
      changePasswordModal.classList.add('hidden');
    } catch (err) {
      passwordError.textContent = err.message;
      passwordError.classList.remove('hidden');
    }
  });

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    if (confirm('คุณต้องการออกจากระบบหรือไม่?')) {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login.html';
    }
  });
});

// 8. Socket.IO Real-time Events
socket.on('serial_status', (data) => {
  const dot = document.getElementById('serialStatusDot');
  const text = document.getElementById('serialStatusText');
  if (dot && text) {
    if (data.connected) {
      dot.className = 'w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-500/50';
      text.textContent = data.port.includes('Cloud') ? 'Cloud Bridge' : 'R307 Online';
      text.className = 'text-[11px] text-emerald-400 font-medium';
    } else {
      dot.className = 'w-2 h-2 rounded-full bg-rose-500';
      text.textContent = 'R307 Offline';
      text.className = 'text-[11px] text-rose-400 font-medium';
    }
  }
});

// เมื่อมีการสแกนและบันทึกเวลาเรียนประจำคาบสำเร็จ
socket.on('session_attendance_update', (record) => {
  console.log('⚡ [Live Session Attendance]', record);
  
  // ถ้ากำลังเปิด Modal ของคาบนี้อยู่ ให้รีเฟรชข้อมูลในตารางทันที
  if (currentViewingScheduleId && parseInt(currentViewingScheduleId) === record.schedule_id) {
    const filterDateInput = document.getElementById('filterDate');
    loadAttendanceSheetData(currentViewingScheduleId, filterDateInput ? filterDateInput.value : '');
  }

  // แสดง Toast แจ้งเตือนสั้นๆ มุมขวาล่าง
  showToast(`${record.user_name} ลงเวลาคาบ ${record.short_name || record.subject_code} [${record.attendance_status === 'ON_TIME' ? 'ทันเวลา' : 'มาสาย'}]`, 'success');
});

// เมื่อตรวจพบว่าผู้ใช้ลงเวลาคาบนี้ไปแล้ว (Duplicate Warning)
socket.on('already_checked_in', (data) => {
  console.warn('⚠️ [Duplicate Warning]', data);
  showToast(`${data.user_name} ได้ลงเวลาในคาบ "${data.schedule.short_name || data.schedule.subject_name}" ไปแล้ว (ไม่บันทึกซ้ำ)`, 'warning');
});

// เมื่อมีการอัปเดตตารางเรียน
socket.on('schedules_updated', () => {
  loadSchedules();
  loadActiveSchedule();
});

// Toast notification helper
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  const bgClass = type === 'warning' ? 'bg-amber-950/90 border-amber-500/50 text-amber-200' : 'bg-slate-900/90 border-cyan-500/50 text-cyan-200';
  const icon = type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-check';
  
  toast.className = `fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md text-xs flex items-center gap-2.5 transition-all duration-300 transform translate-y-4 opacity-0 ${bgClass}`;
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('translate-y-4', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('translate-y-4', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
