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

let allSchedules = [];
let activeScheduleInfo = null;
let currentViewingScheduleId = null;
let selectedDayFilter = 'all';

let roomsList = [];
let activeDeviceRoom = 'ทค.1-101';
let currentRoom = 'ทค.1-101';
let pendingImportFile = null;
let previewData = null;

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

// 2. โหลดรายการห้องเรียนทั้งหมด
async function loadRooms() {
  try {
    const res = await fetch('/api/rooms');
    if (!res.ok) throw new Error('Failed to fetch rooms');
    const data = await res.json();
    
    roomsList = data.rooms || [];
    activeDeviceRoom = data.active_device_room || (roomsList[0] ? roomsList[0].name : 'ทค.1-101');
    
    // หาก currentRoom ยังไม่ได้เลือก หรือห้องที่เลือกถูกลบไปแล้ว ให้ตั้งเป็น activeDeviceRoom หรือห้องแรก
    const roomExists = roomsList.some(r => r.name === currentRoom);
    if (!currentRoom || !roomExists) {
      currentRoom = activeDeviceRoom || (roomsList[0] ? roomsList[0].name : '');
    }

    renderRoomTabs();
    updateHeaderInfo();
  } catch (err) {
    console.error('Error loading rooms:', err);
  }
}

// 3. เรนเดอร์แท็บเลือกห้องเรียน (Room Tabs)
function renderRoomTabs() {
  const container = document.getElementById('roomTabsContainer');
  const actionsContainer = document.getElementById('roomActionsContainer');
  if (!container) return;

  if (roomsList.length === 0) {
    container.innerHTML = `
      <span class="text-xs text-stone-400 px-3 py-1.5 italic">ยังไม่มีข้อมูลห้องเรียน กรุณานำเข้าไฟล์ Excel</span>
    `;
    if (actionsContainer) actionsContainer.innerHTML = '';
    return;
  }

  // เรนเดอร์ปุ่มแท็บของแต่ละห้อง
  container.innerHTML = roomsList.map(r => {
    const isSelected = r.name === currentRoom;
    const isDeviceRoom = r.name === activeDeviceRoom;
    
    let baseClass = 'px-3.5 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition shrink-0 cursor-pointer ';
    if (isSelected) {
      baseClass += 'bg-amber-500 text-amber-950 font-semibold shadow-md shadow-amber-500/20';
    } else {
      baseClass += 'bg-stone-900 border border-stone-800 text-stone-400 hover:text-white hover:bg-stone-800';
    }

    const deviceIndicator = isDeviceRoom
      ? `<span class="w-2 h-2 rounded-full ${isSelected ? 'bg-stone-950' : 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]'} inline-block" title="เครื่องสแกน Uno Q ประจำห้องนี้"></span>`
      : '';

    const badgeClass = isSelected ? 'bg-stone-950/20 text-stone-950' : 'bg-stone-800 text-stone-400';

    return `
      <button onclick="switchRoom('${r.name}')" class="${baseClass}">
        ${deviceIndicator}
        <span>${r.name}</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded-full ${badgeClass}">${r.schedule_count}</span>
      </button>
    `;
  }).join('');

  // เรนเดอร์ปุ่มการจัดการห้องที่เลือก
  if (actionsContainer) {
    const isCurrentActiveDevice = currentRoom === activeDeviceRoom;
    const activeBadgeOrButton = isCurrentActiveDevice
      ? `<span class="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-medium flex items-center gap-1.5 shadow-sm">
           <span class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)] inline-block"></span>
           เครื่องสแกนประจำห้องนี้
         </span>`
      : `<button onclick="handleSetActiveRoom('${currentRoom}')" class="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-medium flex items-center gap-1.5 transition">
           <i class="fa-solid fa-microchip"></i>
           กำหนดให้เครื่องสแกนคุมห้องนี้
         </button>`;

    const deleteButton = `
      <button onclick="handleDeleteRoom('${currentRoom}')" class="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-medium flex items-center gap-1.5 transition" title="ลบห้องนี้และตารางเรียน">
        <i class="fa-regular fa-trash-can"></i>
        <span class="hidden sm:inline">ลบห้องนี้</span>
      </button>
    `;

    actionsContainer.innerHTML = `
      <div class="flex items-center gap-2">
        ${activeBadgeOrButton}
        ${deleteButton}
      </div>
    `;
  }
}

// 4. สลับห้องเรียนที่ต้องการดู
async function switchRoom(roomName) {
  if (currentRoom === roomName) return;
  currentRoom = roomName;
  renderRoomTabs();
  updateHeaderInfo();
  await loadSchedules();
  await loadActiveSchedule();
}

// 5. อัปเดตหัวข้อและข้อมูลชื่อห้องด้านบน
function updateHeaderInfo() {
  const currentObj = roomsList.find(r => r.name === currentRoom);
  const titleEl = document.getElementById('displayRoomTitle');
  const nameEl = document.getElementById('displayRoomName');
  const bldEl = document.getElementById('displayBuildingName');

  if (titleEl) titleEl.textContent = currentRoom || 'ยังไม่มีห้อง';
  if (nameEl) nameEl.textContent = currentRoom || '-';
  if (bldEl) bldEl.textContent = currentObj ? currentObj.building : 'อาคารเทคนิคคอมพิวเตอร์';
}

// 6. กำหนดให้บอร์ด Uno Q คุมห้องปัจจุบัน
async function handleSetActiveRoom(roomName) {
  if (!roomName) return;
  try {
    const res = await fetch('/api/rooms/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_name: roomName })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'ไม่สามารถเปลี่ยนห้องประจำเครื่องได้');

    activeDeviceRoom = data.active_device_room;
    renderRoomTabs();
    showToast(`✅ บอร์ด Uno Q ถูกกำหนดให้ดูแลห้อง "${roomName}" แล้ว`, 'success');
  } catch (err) {
    showToast(`❌ ${err.message}`, 'warning');
  }
}

// 7. ลบห้องเรียน (Full Purge)
async function handleDeleteRoom(roomName) {
  if (!roomName) return;
  const confirmed = confirm(`⚠️ ยืนยันการลบห้อง "${roomName}" หรือไม่?\n\nคำเตือน: ตารางเรียนทั้งหมดและประวัติการเข้าเรียนประจำคาบของห้องนี้จะถูกลบถาวร (Full Purge)`);
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(roomName)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'ไม่สามารถลบห้องเรียนได้');

    showToast(`🗑️ ลบห้อง "${roomName}" เรียบร้อยแล้ว`, 'info');
    currentRoom = '';
    await loadRooms();
    await loadSchedules();
    await loadActiveSchedule();
  } catch (err) {
    showToast(`❌ ${err.message}`, 'warning');
  }
}

// 8. โหลดตารางเรียนของห้องปัจจุบัน
async function loadSchedules() {
  try {
    const url = currentRoom ? `/api/schedules?room=${encodeURIComponent(currentRoom)}` : '/api/schedules';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch schedules');
    allSchedules = await res.json();

    // อัปเดตตัวเลขจำนวนคาบในปุ่มตัวกรอง "ทั้งหมด"
    const allFilterTab = document.querySelector('.day-tab[data-day="all"]');
    if (allFilterTab) {
      allFilterTab.textContent = `ทั้งหมด (${allSchedules.length} คาบ)`;
    }

    renderSchedulesGrid();
  } catch (err) {
    console.error('Error loading schedules:', err);
  }
}

// 9. โหลดข้อมูลคาบเรียนปัจจุบันของห้องปัจจุบัน
async function loadActiveSchedule() {
  try {
    const url = currentRoom ? `/api/schedules/current?room=${encodeURIComponent(currentRoom)}` : '/api/schedules/current';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch current schedule');
    activeScheduleInfo = await res.json();
    renderActiveBanner();
  } catch (err) {
    console.error('Error loading active schedule:', err);
  }
}

// 10. เรนเดอร์ Active Schedule Live Banner
function renderActiveBanner() {
  const banner = document.getElementById('activeBanner');
  if (!banner) return;

  const currentObj = roomsList.find(r => r.name === currentRoom);
  const buildingDisplay = currentObj ? currentObj.building : 'อาคารเทคนิคคอมพิวเตอร์';

  if (activeScheduleInfo && activeScheduleInfo.schedule) {
    const s = activeScheduleInfo.schedule;
    const isEarly = activeScheduleInfo.isEarly;

    const statusBadge = isEarly
      ? '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30"><span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span> เปิดให้สแกนล่วงหน้า (15 นาทีก่อนเริ่ม)</span>'
      : '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"><span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> กำลังเรียนอยู่ (Active Class)</span>';

    const typeBadge = s.class_type === 'P'
      ? '<span class="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">[P] ปฏิบัติ</span>'
      : '<span class="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">[T] ทฤษฎี</span>';

    banner.className = 'mb-6 p-5 rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-950/40 via-stone-900 to-stone-900 shadow-xl shadow-amber-950/20';
    banner.innerHTML = `
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div class="flex flex-wrap items-center gap-2 mb-2">
            ${statusBadge}
            ${typeBadge}
            <span class="text-xs text-stone-400 font-mono"><i class="fa-solid fa-clock"></i> ${s.time_display}</span>
            <span class="text-xs text-stone-400"><i class="fa-solid fa-location-dot"></i> ห้อง ${s.room_name} (${s.building})</span>
          </div>
          <h2 class="text-lg font-bold text-white flex items-center gap-2">
            <span class="text-amber-400 font-mono">${s.subject_code}</span>
            <span>${s.subject_name}</span>
          </h2>
          <p class="text-xs text-stone-300 mt-1 flex flex-wrap items-center gap-4">
            <span><i class="fa-solid fa-user-tie text-stone-400 mr-1"></i> ${s.instructor || '-'}</span>
            <span><i class="fa-solid fa-users-rectangle text-stone-400 mr-1"></i> ${s.section_group || '-'}</span>
            <span class="text-emerald-400 font-medium"><i class="fa-solid fa-hourglass-half mr-1"></i> อนุโลมสาย 15 นาที</span>
          </p>
        </div>
        <div class="flex items-center gap-3">
          <button onclick="openAttendanceModal(${s.id})" class="px-4 py-2.5 bg-gradient-to-r from-amber-700 via-amber-600 to-yellow-500 hover:from-amber-600 hover:to-yellow-400 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition">
            <i class="fa-solid fa-clipboard-check"></i> ดูใบเช็คชื่อคาบนี้
          </button>
        </div>
      </div>
    `;
  } else {
    banner.className = 'mb-6 p-4 rounded-2xl border border-stone-800 bg-stone-900/60';
    banner.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-stone-800 border border-stone-700 flex items-center justify-center text-stone-400">
          <i class="fa-solid fa-mug-hot text-lg"></i>
        </div>
        <div>
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-stone-800 text-stone-300 border border-stone-700">นอกเวลาเรียน (General Access)</span>
            <span class="text-xs text-stone-400">ห้อง ${currentRoom || '-'} (${buildingDisplay})</span>
          </div>
          <p class="text-xs text-stone-400 mt-1">ขณะนี้ไม่มีคาบเรียนตามตาราง การสแกนนิ้วจะถูกบันทึกเป็นประวัติการใช้งานทั่วไป</p>
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
        <div class="w-14 h-14 rounded-2xl bg-stone-900 border border-stone-800 flex items-center justify-center text-stone-500 mx-auto mb-3">
          <i class="fa-regular fa-calendar-xmark text-xl"></i>
        </div>
        <p class="text-base font-medium text-stone-300">ไม่มีคาบเรียนในหมวดนี้</p>
        <p class="text-xs text-stone-500 mt-1">เลือกดูวันอื่น หรือนำเข้าไฟล์ตารางเรียนใหม่</p>
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
      <div class="glass-card rounded-2xl p-5 border ${isCurrent ? 'border-amber-500/50 shadow-lg shadow-amber-950/20' : 'border-stone-800/80'} hover:border-stone-700 transition flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between gap-2 mb-3">
            <span class="text-xs font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
              <i class="fa-regular fa-calendar mr-1"></i> ${s.day_name}
            </span>
            <div class="flex items-center gap-1.5">
              ${currentBadge}
              ${typeBadge}
            </div>
          </div>

          <div class="flex items-center gap-1.5 text-xs text-stone-300 font-mono mb-2">
            <i class="fa-solid fa-clock text-stone-500 text-[11px]"></i>
            <span>${s.time_display}</span>
          </div>

          <div class="mb-3">
            <p class="text-xs text-stone-400 font-mono font-medium">${s.subject_code}</p>
            <h3 class="text-sm font-bold text-white mt-0.5 leading-snug line-clamp-2" title="${s.subject_name}">${s.subject_name}</h3>
          </div>

          <div class="space-y-1 text-[11px] text-stone-400 mb-4 pt-3 border-t border-stone-800/60">
            <p class="flex items-center gap-1.5 truncate">
              <i class="fa-solid fa-user-tie text-stone-500 w-3.5 text-center"></i>
              <span>${s.instructor || '-'}</span>
            </p>
            <p class="flex items-center gap-1.5 truncate">
              <i class="fa-solid fa-users text-stone-500 w-3.5 text-center"></i>
              <span>${s.section_group || '-'}</span>
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 pt-2 border-t border-stone-800/80">
          <button onclick="openAttendanceModal(${s.id})" class="flex-1 py-2 px-3 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition">
            <i class="fa-solid fa-list-check text-amber-400"></i> ใบเช็คชื่อ
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
        <tr class="hover:bg-stone-800/30 transition">
          <td class="py-3 text-center text-stone-400 font-mono">${idx + 1}</td>
          <td class="py-3 text-amber-400 font-mono font-medium">${att.student_id || '-'}</td>
          <td class="py-3 font-medium text-white">${att.user_name || '-'}</td>
          <td class="py-3 text-stone-300 font-mono">${att.time || '-'}</td>
          <td class="py-3">${statusBadge}</td>
          <td class="py-3 text-right text-stone-400 font-mono">${att.score || 0}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Error loading attendance sheet data:', err);
  }
}

// 14. Event Listeners Initialization
document.addEventListener('DOMContentLoaded', async () => {
  const isAuthed = await checkAuth();
  if (!isAuthed) return;

  await loadRooms();
  await loadSchedules();
  await loadActiveSchedule();

  // ตั้งเวลาอัปเดตสถานะคาบเรียนทุก 1 นาที
  setInterval(loadActiveSchedule, 60000);

  // Day Filter Tabs
  document.querySelectorAll('.day-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.day-tab').forEach(t => {
        t.className = 'day-tab px-4 py-2 rounded-xl text-xs font-medium bg-stone-900 border border-stone-800 text-stone-400 hover:text-white hover:bg-stone-800 transition';
      });
      tab.className = 'day-tab px-4 py-2 rounded-xl text-xs font-medium bg-amber-500 text-amber-950 font-semibold shadow-md shadow-amber-500/20';
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
    await loadRooms();
    await loadSchedules();
    await loadActiveSchedule();
    showToast('รีเฟรชข้อมูลเรียบร้อยแล้ว', 'info');
  });

  // ==========================================
  // 15. 2-Step Import Modal Handlers
  // ==========================================
  const importModal = document.getElementById('importModal');
  const openImportBtn = document.getElementById('openImportBtn');
  const closeImportModalBtn = document.getElementById('closeImportModalBtn');
  const cancelImportBtn = document.getElementById('cancelImportBtn');
  const excelFileInput = document.getElementById('excelFileInput');
  const uploadLabel = document.getElementById('uploadLabel');
  const submitImportBtn = document.getElementById('submitImportBtn');
  const importForm = document.getElementById('importForm');
  const importError = document.getElementById('importError');

  const importPreviewArea = document.getElementById('importPreviewArea');
  const previewAlertBox = document.getElementById('previewAlertBox');
  const importRoomName = document.getElementById('importRoomName');
  const importBuilding = document.getElementById('importBuilding');
  const previewCountBadge = document.getElementById('previewCountBadge');
  const previewItemsContainer = document.getElementById('previewItemsContainer');

  openImportBtn.addEventListener('click', () => {
    importModal.classList.remove('hidden');
    excelFileInput.value = '';
    pendingImportFile = null;
    previewData = null;
    uploadLabel.textContent = 'คลิกเพื่อเลือกไฟล์ .xlsx หรือลากไฟล์มาวางที่นี่';
    submitImportBtn.disabled = true;
    submitImportBtn.innerHTML = '<i class="fa-solid fa-upload"></i> อัปโหลดและบันทึก';
    importError.classList.add('hidden');
    importPreviewArea.classList.add('hidden');
  });

  const hideImportModal = () => {
    importModal.classList.add('hidden');
    pendingImportFile = null;
    previewData = null;
  };

  closeImportModalBtn.addEventListener('click', hideImportModal);
  cancelImportBtn.addEventListener('click', hideImportModal);

  // เมื่อผู้ใช้เลือกไฟล์ Excel -> ทำการ Preview อัตโนมัติ (Step 1 -> Step 2)
  excelFileInput.addEventListener('change', async (e) => {
    if (!e.target.files || !e.target.files[0]) return;

    const file = e.target.files[0];
    pendingImportFile = file;
    uploadLabel.innerHTML = `<i class="fa-solid fa-spinner animate-spin mr-1.5 text-amber-400"></i> กำลังตรวจสอบไฟล์ <b>${file.name}</b>...`;
    importError.classList.add('hidden');
    importPreviewArea.classList.add('hidden');
    submitImportBtn.disabled = true;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/schedules/preview-excel', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ไม่สามารถวิเคราะห์ไฟล์ Excel ได้');

      previewData = data;
      uploadLabel.innerHTML = `ไฟล์ที่เลือก: <b class="text-white">${file.name}</b> (${(file.size / 1024).toFixed(1)} KB)`;

      // เติมข้อมูลลงช่อง Input
      importRoomName.value = data.detected_room_name || '';
      importBuilding.value = data.detected_building || 'อาคารเทคนิคคอมพิวเตอร์';
      previewCountBadge.textContent = `${data.new_schedule_count} คาบ`;

      // แสดงการแจ้งเตือนตาม Action (REPLACE หรือ CREATE_NEW)
      if (data.action === 'REPLACE') {
        previewAlertBox.className = 'p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs leading-relaxed';
        previewAlertBox.innerHTML = `
          <div class="font-bold flex items-center gap-2 mb-1 text-amber-300">
            <i class="fa-solid fa-triangle-exclamation text-amber-400"></i>
            <span>ตรวจพบห้องเรียนเดิม (${data.detected_room_name})</span>
          </div>
          <p class="text-stone-300">
            การนำเข้าไฟล์นี้จะ <b>แทนที่ตารางเรียนเดิมทั้งหมด (${data.existing_schedule_count} คาบ)</b> ของห้องนี้ ด้วยตารางใหม่ (${data.new_schedule_count} คาบ)
          </p>
        `;
        submitImportBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate mr-1"></i> ยืนยันแทนที่ตารางเดิม (${data.new_schedule_count} คาบ)`;
        submitImportBtn.className = 'px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-stone-950 font-bold rounded-xl text-xs shadow-lg shadow-amber-500/20 transition';
      } else {
        previewAlertBox.className = 'p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-xs leading-relaxed';
        previewAlertBox.innerHTML = `
          <div class="font-bold flex items-center gap-2 mb-1 text-emerald-300">
            <i class="fa-solid fa-circle-plus text-emerald-400"></i>
            <span>ตรวจพบห้องเรียนใหม่ (${data.detected_room_name})</span>
          </div>
          <p class="text-stone-300">
            ระบบจะ <b>สร้าง Dashboard แยกห้องเรียนใหม่</b> ทันที พร้อมตารางเรียน ${data.new_schedule_count} คาบ
          </p>
        `;
        submitImportBtn.innerHTML = `<i class="fa-solid fa-plus mr-1"></i> ยืนยันสร้างห้องใหม่ (${data.new_schedule_count} คาบ)`;
        submitImportBtn.className = 'px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-500/20 transition';
      }

      // แสดงรายการตัวอย่างคาบเรียน
      if (data.preview && data.preview.length > 0) {
        previewItemsContainer.innerHTML = data.preview.map(p => `
          <div class="p-1.5 rounded-lg bg-stone-900/60 border border-stone-800 flex items-center justify-between gap-2">
            <div class="truncate">
              <span class="text-amber-400">${p.day_name}</span>
              <span class="text-stone-400">${p.time_display}</span>
              <span class="text-white ml-1 font-sans">${p.subject_name}</span>
            </div>
            <span class="px-1.5 py-0.5 rounded text-[10px] ${p.class_type === 'P' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'} shrink-0">[${p.class_type}]</span>
          </div>
        `).join('');
      } else {
        previewItemsContainer.innerHTML = '<p class="text-center text-stone-500 py-2">ไม่มีข้อมูลตัวอย่าง</p>';
      }

      importPreviewArea.classList.remove('hidden');
      submitImportBtn.disabled = false;

    } catch (err) {
      importError.textContent = err.message;
      importError.classList.remove('hidden');
      uploadLabel.textContent = 'เกิดข้อผิดพลาดในการอ่านไฟล์ กรุณาลองใหม่อีกครั้ง';
      submitImportBtn.disabled = true;
    }
  });

  // ส่งข้อมูลเพื่อบันทึกลงระบบจริง (Confirm Step)
  importForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pendingImportFile) return;

    submitImportBtn.disabled = true;
    submitImportBtn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> กำลังบันทึกข้อมูล...';
    importError.classList.add('hidden');

    try {
      const formData = new FormData();
      formData.append('file', pendingImportFile);
      formData.append('room_name', (importRoomName.value || '').trim());
      formData.append('building', (importBuilding.value || '').trim());

      const res = await fetch('/api/schedules/import-excel', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'นำเข้าไฟล์ล้มเหลว');

      hideImportModal();
      showToast(`✅ นำเข้าตารางห้อง "${data.room_name}" สำเร็จทั้งหมด ${data.count} คาบ!`, 'success');
      
      // สลับไปดูห้องที่เพิ่งนำเข้าทันที
      currentRoom = data.room_name;
      await loadRooms();
      await loadSchedules();
      await loadActiveSchedule();

    } catch (err) {
      importError.textContent = err.message;
      importError.classList.remove('hidden');
      submitImportBtn.disabled = false;
      submitImportBtn.innerHTML = '<i class="fa-solid fa-upload"></i> ลองใหม่อีกครั้ง';
    }
  });

  // ==========================================
  // 16. Change Password Modal Handlers
  // ==========================================
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

      showToast('✅ เปลี่ยนรหัสผ่านสำเร็จเรียบร้อยแล้ว', 'success');
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

// ==========================================
// 17. Socket.IO Real-time Events
// ==========================================
socket.on('serial_status', (data) => {
  const dot = document.getElementById('serialStatusDot');
  const text = document.getElementById('serialStatusText');
  if (dot && text) {
    const isBridge = Boolean(data && data.connected);
    const isR307 = Boolean(data && data.connected && data.r307_connected);

    if (isBridge && isR307) {
      dot.className = 'w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]';
      text.textContent = 'R307 Online';
      text.className = 'text-[11px] text-emerald-400 font-medium';
    } else if (isBridge && !isR307) {
      dot.className = 'w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse';
      text.textContent = 'R307 Not Found';
      text.className = 'text-[11px] text-amber-400 font-medium';
    } else {
      dot.className = 'w-2 h-2 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.6)]';
      text.textContent = 'Offline';
      text.className = 'text-[11px] text-rose-400 font-medium';
    }
  }
});

// เมื่อมีการสลับห้องประจำเครื่อง Uno Q จากเครื่องหรือแอดมินคนอื่น
socket.on('device_room_updated', (data) => {
  console.log('🔄 [Device Room Updated]', data);
  activeDeviceRoom = data.active_device_room;
  renderRoomTabs();
});

// เมื่อมีห้องถูกเพิ่ม หรือลบ หรืออัปเดต
socket.on('rooms_updated', (data) => {
  console.log('🔄 [Rooms Updated]', data);
  roomsList = data.rooms || [];
  activeDeviceRoom = data.active_device_room || activeDeviceRoom;
  renderRoomTabs();
  updateHeaderInfo();
});

// เมื่อมีการอัปเดตตารางเรียน
socket.on('schedules_updated', (data) => {
  console.log('📅 [Schedules Updated]', data);
  if (!data || !data.room_name || data.room_name === currentRoom) {
    loadSchedules();
    loadActiveSchedule();
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

// Toast notification helper
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  let bgClass = 'bg-stone-900/90 border-amber-500/50 text-amber-200';
  let icon = 'fa-circle-check';

  if (type === 'warning') {
    bgClass = 'bg-amber-950/90 border-amber-500/50 text-amber-200';
    icon = 'fa-triangle-exclamation';
  } else if (type === 'success') {
    bgClass = 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200';
    icon = 'fa-circle-check';
  }
  
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
