// ========================================================
// Account Management Modal & RBAC UI Controller
// ========================================================

(function () {
  let accountsList = [];
  let availableInstructors = [];
  let availableSubjects = [];
  let currentEditingAccountId = null;

  // Render modal HTML container dynamically into body if not present
  function ensureModalContainers() {
    if (document.getElementById('accountsModal')) return;

    const modalHtml = `
      <!-- Main Accounts Modal -->
      <div id="accountsModal" class="fixed inset-0 bg-stone-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
        <div class="glass w-full max-w-4xl p-6 rounded-2xl border border-stone-800 shadow-2xl max-h-[90vh] flex flex-col">
          <div class="flex items-center justify-between pb-4 border-b border-stone-800 mb-4 gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <i class="fa-solid fa-user-shield text-lg"></i>
              </div>
              <div class="min-w-0">
                <h3 class="text-base font-bold text-white">จัดการบัญชีผู้ใช้งานระบบ</h3>
                <p class="text-xs text-stone-400">กำหนดสิทธิ์ผู้ดูแลระบบ (Super Admin) และอาจารย์ผู้สอน (Teacher)</p>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button id="btnOpenCreateAccount" class="px-3.5 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition">
                <i class="fa-solid fa-plus text-[11px]"></i> เพิ่มบัญชีใหม่
              </button>
              <button id="closeAccountsModalBtn" class="text-stone-400 hover:text-white p-2 rounded-xl hover:bg-stone-800 transition" title="ปิดหน้าต่าง">
                <i class="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>
          </div>

          <!-- Alert Box -->
          <div id="accountModalAlert" class="hidden mb-3 p-3 rounded-xl text-xs flex items-center gap-2 border"></div>

          <!-- Accounts Table -->
          <div class="overflow-y-auto flex-1 pr-1">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="border-b border-stone-800 text-stone-400 font-medium">
                  <th class="py-2.5 px-3">#</th>
                  <th class="py-2.5 px-3">ชื่อผู้ใช้ (Username)</th>
                  <th class="py-2.5 px-3">บทบาท (Role)</th>
                  <th class="py-2.5 px-3">ผู้สอนที่ผูก (Instructor)</th>
                  <th class="py-2.5 px-3">วิชาที่มอบหมายเสริม</th>
                  <th class="py-2.5 px-3 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody id="accountsTableBody" class="divide-y divide-stone-800/60">
                <tr>
                  <td colspan="6" class="py-8 text-center text-stone-500">กำลังโหลดข้อมูล...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Create / Edit Account Modal -->
      <div id="accountFormModal" class="fixed inset-0 bg-stone-950/85 backdrop-blur-md z-[60] flex items-center justify-center p-4 hidden">
        <div class="glass w-full max-w-lg p-6 rounded-2xl border border-stone-700 shadow-2xl relative max-h-[90vh] overflow-y-auto">
          <button id="closeAccountFormModalBtn" class="absolute top-4 right-4 text-stone-400 hover:text-white p-1.5 rounded-lg hover:bg-stone-800 transition">
            <i class="fa-solid fa-xmark text-lg"></i>
          </button>

          <h3 id="accountFormTitle" class="text-base font-bold text-white mb-1">สร้างบัญชีผู้ใช้งาน</h3>
          <p class="text-xs text-stone-400 mb-4">กรอกข้อมูลบัญชีเพื่อเข้าใช้งานระบบ Web Dashboard</p>

          <form id="accountForm" class="space-y-4">
            <div>
              <label class="block text-xs text-stone-300 font-medium mb-1">ชื่อผู้ใช้งาน (Username) <span class="text-rose-400">*</span></label>
              <input type="text" id="accInputUsername" required placeholder="เช่น aj_jakpob" class="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500">
            </div>

            <div>
              <label class="block text-xs text-stone-300 font-medium mb-1">รหัสผ่าน (Password) <span id="pwdRequiredStar" class="text-rose-400">*</span></label>
              <input type="password" id="accInputPassword" placeholder="อย่างน้อย 6 ตัวอักษร" class="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500">
              <p id="pwdHelpText" class="text-[10px] text-stone-500 mt-1">กรณีแก้ไข: หากไม่ต้องการเปลี่ยนรหัสผ่าน ให้เว้นว่างไว้</p>
            </div>

            <div>
              <label class="block text-xs text-stone-300 font-medium mb-1">บทบาทหน้าที่ (Role) <span class="text-rose-400">*</span></label>
              <select id="accSelectRole" class="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500">
                <option value="teacher">อาจารย์ผู้สอน (Teacher) - ดู/เช็คชื่อเฉพาะวิชาที่สอน</option>
                <option value="super_admin">ผู้ดูแลระบบ (Super Admin) - ควบคุมฮาร์ดแวร์และทุกรายวิชา</option>
              </select>
            </div>

            <!-- Teacher Options Box -->
            <div id="teacherOptionsContainer" class="p-3.5 rounded-xl bg-stone-900/90 border border-stone-800 space-y-3">
              <div>
                <label class="block text-xs text-amber-400 font-medium mb-1">
                  <i class="fa-solid fa-chalkboard-user mr-1"></i> ผูกกับชื่ออาจารย์ในตารางสอน
                </label>
                <select id="accSelectInstructor" class="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500">
                  <option value="">-- เลือกอาจารย์ผู้สอนจากตารางเรียน --</option>
                </select>
                <p class="text-[10px] text-stone-400 mt-1">ระบบจะดึงรายวิชาที่มีชื่อผู้สอนตรงกับที่เลือกมาให้อาจารย์โดยอัตโนมัติ</p>
              </div>

              <div>
                <label class="block text-xs text-amber-400 font-medium mb-1.5">
                  <i class="fa-solid fa-book-open mr-1"></i> มอบหมายวิชาเพิ่มเติม (ถ้ามี)
                </label>
                <div id="assignedSubjectsCheckboxList" class="max-h-36 overflow-y-auto space-y-1.5 p-2 bg-stone-950 rounded-xl border border-stone-800 text-xs">
                  <span class="text-stone-500 text-[11px]">กำลังโหลดรายวิชา...</span>
                </div>
              </div>
            </div>

            <div id="accountFormAlert" class="hidden p-2.5 rounded-xl text-xs border"></div>

            <div class="flex items-center justify-end gap-2 pt-2 border-t border-stone-800">
              <button type="button" id="btnCancelAccountForm" class="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs rounded-xl transition">ยกเลิก</button>
              <button type="submit" id="btnSaveAccount" class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition">
                <i class="fa-solid fa-floppy-disk mr-1"></i> บันทึกข้อมูล
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    bindEvents();
  }

  // Bind Event Listeners
  function bindEvents() {
    const closeMain = document.getElementById('closeAccountsModalBtn');
    if (closeMain) {
      closeMain.addEventListener('click', () => {
        document.getElementById('accountsModal').classList.add('hidden');
      });
    }

    const btnOpenCreate = document.getElementById('btnOpenCreateAccount');
    if (btnOpenCreate) {
      btnOpenCreate.addEventListener('click', () => openAccountForm(null));
    }

    const closeForm = document.getElementById('closeAccountFormModalBtn');
    const cancelForm = document.getElementById('btnCancelAccountForm');
    const closeFormAction = () => document.getElementById('accountFormModal').classList.add('hidden');
    if (closeForm) closeForm.addEventListener('click', closeFormAction);
    if (cancelForm) cancelForm.addEventListener('click', closeFormAction);

    const roleSelect = document.getElementById('accSelectRole');
    if (roleSelect) {
      roleSelect.addEventListener('change', () => {
        const teacherBox = document.getElementById('teacherOptionsContainer');
        if (roleSelect.value === 'teacher') {
          teacherBox.classList.remove('hidden');
        } else {
          teacherBox.classList.add('hidden');
        }
      });
    }

    const form = document.getElementById('accountForm');
    if (form) {
      form.addEventListener('submit', handleAccountSubmit);
    }
  }

  // Load Metadata (Instructors & Subjects)
  async function loadMetadata() {
    try {
      const [instRes, subjRes] = await Promise.all([
        fetch('/api/schedules/meta/instructors'),
        fetch('/api/schedules/meta/subjects')
      ]);
      if (instRes.ok) availableInstructors = await instRes.json();
      if (subjRes.ok) availableSubjects = await subjRes.json();
    } catch (e) {
      console.warn('Failed to load instructors/subjects metadata:', e);
    }
  }

  // Fetch and Render Accounts List
  async function loadAccounts() {
    const tbody = document.getElementById('accountsTableBody');
    if (!tbody) return;

    try {
      const res = await fetch('/api/accounts');
      if (!res.ok) {
        throw new Error('ไม่สามารถดึงข้อมูลบัญชีผู้ใช้ได้');
      }
      accountsList = await res.json();

      if (accountsList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-stone-500">ไม่พบบัญชีผู้ใช้ในระบบ</td></tr>';
        return;
      }

      tbody.innerHTML = accountsList.map((acc, idx) => {
        const isSuper = acc.role === 'super_admin';
        const roleBadge = isSuper
          ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30"><i class="fa-solid fa-shield-halved"></i> Super Admin</span>'
          : '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30"><i class="fa-solid fa-graduation-cap"></i> อาจารย์ผู้สอน</span>';

        const assignedList = (acc.assigned_subjects || []).join(', ') || '-';
        const isSelf = window.currentUser && window.currentUser.id === acc.id;

        return `
          <tr class="hover:bg-stone-900/50 transition">
            <td class="py-3 px-3 text-stone-400 font-mono">${idx + 1}</td>
            <td class="py-3 px-3 font-semibold text-white">
              ${acc.username}
              ${isSelf ? '<span class="ml-1 text-[10px] text-amber-400/80 font-normal">(คุณ)</span>' : ''}
            </td>
            <td class="py-3 px-3">${roleBadge}</td>
            <td class="py-3 px-3 text-stone-300">${acc.instructor_name || '-'}</td>
            <td class="py-3 px-3 text-stone-400 font-mono text-[11px] max-w-[150px] truncate" title="${assignedList}">
              ${assignedList}
            </td>
            <td class="py-3 px-3 text-right">
              <div class="flex items-center justify-end gap-1.5">
                <button onclick="window.AccountsModal.editAccount(${acc.id})" class="px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-xs transition">
                  <i class="fa-solid fa-pen-to-square"></i> แก้ไข
                </button>
                <button onclick="window.AccountsModal.deleteAccount(${acc.id})" ${isSelf ? 'disabled title="ไม่สามารถลบบัญชีของตนเองได้"' : ''} class="px-2.5 py-1 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 rounded-lg text-xs transition disabled:opacity-30 disabled:cursor-not-allowed">
                  <i class="fa-solid fa-trash-can"></i> ลบ
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-rose-400">${err.message}</td></tr>`;
    }
  }

  // Open Form Modal
  function openAccountForm(account) {
    currentEditingAccountId = account ? account.id : null;
    const formModal = document.getElementById('accountFormModal');
    const formTitle = document.getElementById('accountFormTitle');
    const usernameInput = document.getElementById('accInputUsername');
    const passwordInput = document.getElementById('accInputPassword');
    const roleSelect = document.getElementById('accSelectRole');
    const instructorSelect = document.getElementById('accSelectInstructor');
    const teacherBox = document.getElementById('teacherOptionsContainer');
    const alertBox = document.getElementById('accountFormAlert');

    alertBox.classList.add('hidden');
    passwordInput.value = '';

    // Populate Instructors Dropdown
    instructorSelect.innerHTML = '<option value="">-- เลือกอาจารย์ผู้สอนจากตารางเรียน --</option>' +
      availableInstructors.map(name => `<option value="${name}">${name}</option>`).join('');

    // Populate Subjects Checkbox list
    const subjectsBox = document.getElementById('assignedSubjectsCheckboxList');
    if (availableSubjects.length === 0) {
      subjectsBox.innerHTML = '<span class="text-stone-500 text-[11px]">ไม่พบรายวิชาในระบบ</span>';
    } else {
      const assignedSet = new Set(account ? (account.assigned_subjects || []) : []);
      subjectsBox.innerHTML = availableSubjects.map(sub => `
        <label class="flex items-center gap-2 py-0.5 hover:text-white text-stone-300 cursor-pointer">
          <input type="checkbox" value="${sub.subject_code}" ${assignedSet.has(sub.subject_code) ? 'checked' : ''} class="rounded bg-stone-900 border-stone-700 text-amber-500 focus:ring-0">
          <span class="font-mono text-amber-400 text-[11px]">${sub.subject_code}</span>
          <span class="truncate">${sub.subject_name}</span>
        </label>
      `).join('');
    }

    if (account) {
      formTitle.textContent = `แก้ไขบัญชีผู้ใช้ (${account.username})`;
      usernameInput.value = account.username;
      roleSelect.value = account.role || 'teacher';
      instructorSelect.value = account.instructor_name || '';
      document.getElementById('pwdRequiredStar').classList.add('hidden');
      document.getElementById('pwdHelpText').classList.remove('hidden');
    } else {
      formTitle.textContent = 'สร้างบัญชีผู้ใช้งานใหม่';
      usernameInput.value = '';
      roleSelect.value = 'teacher';
      instructorSelect.value = '';
      document.getElementById('pwdRequiredStar').classList.remove('hidden');
      document.getElementById('pwdHelpText').classList.add('hidden');
    }

    if (roleSelect.value === 'teacher') {
      teacherBox.classList.remove('hidden');
    } else {
      teacherBox.classList.add('hidden');
    }

    formModal.classList.remove('hidden');
  }

  // Handle Form Submit
  async function handleAccountSubmit(e) {
    e.preventDefault();
    const alertBox = document.getElementById('accountFormAlert');
    const username = document.getElementById('accInputUsername').value.trim();
    const password = document.getElementById('accInputPassword').value.trim();
    const role = document.getElementById('accSelectRole').value;
    const instructor_name = document.getElementById('accSelectInstructor').value.trim();

    const checkedSubjects = Array.from(
      document.querySelectorAll('#assignedSubjectsCheckboxList input[type="checkbox"]:checked')
    ).map(cb => cb.value);

    const payload = {
      username,
      role,
      instructor_name: role === 'teacher' ? instructor_name : '',
      assigned_subjects: role === 'teacher' ? checkedSubjects : []
    };

    if (password) {
      payload.password = password;
    }

    try {
      const url = currentEditingAccountId ? `/api/accounts/${currentEditingAccountId}` : '/api/accounts';
      const method = currentEditingAccountId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
      }

      document.getElementById('accountFormModal').classList.add('hidden');
      await loadAccounts();
    } catch (err) {
      alertBox.textContent = err.message;
      alertBox.className = 'p-2.5 rounded-xl text-xs border bg-rose-500/10 text-rose-400 border-rose-500/20 block';
    }
  }

  // Delete Account Action
  async function deleteAccountAction(id) {
    const acc = accountsList.find(a => a.id === id);
    const name = acc ? acc.username : `#${id}`;
    if (!confirm(`คุณต้องการลบบัญชี "${name}" ออกจากระบบหรือไม่?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'ไม่สามารถลบบัญชีได้');
      }
      await loadAccounts();
    } catch (err) {
      alert(err.message);
    }
  }

  // Global open function
  async function openAccountsModal() {
    ensureModalContainers();
    await loadMetadata();
    document.getElementById('accountsModal').classList.remove('hidden');
    await loadAccounts();
  }

  // Expose API globally
  window.AccountsModal = {
    open: openAccountsModal,
    editAccount: (id) => {
      const acc = accountsList.find(a => a.id === id);
      if (acc) openAccountForm(acc);
    },
    deleteAccount: deleteAccountAction
  };

  // Wire buttons when DOM is loaded
  document.addEventListener('DOMContentLoaded', () => {
    ensureModalContainers();
    const btns = document.querySelectorAll('.open-accounts-modal-btn, #openAccountsModalBtn');
    btns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openAccountsModal();
      });
    });
  });
})();
