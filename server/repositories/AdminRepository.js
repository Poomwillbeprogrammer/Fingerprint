const bcrypt = require('bcryptjs');
const { supabase } = require('../database');

function formatAccount(acc) {
  if (!acc) return null;
  return {
    id: acc.id,
    username: acc.username,
    role: acc.role || 'super_admin',
    instructor_name: acc.instructor_name || '',
    assigned_subjects: Array.isArray(acc.assigned_subjects) ? acc.assigned_subjects : [],
    created_at: acc.created_at || null
  };
}

class AdminRepository {
  constructor(client) {
    this.client = client || supabase;
  }

  setClient(client) {
    this.client = client;
  }

  getClient() {
    return this.client || require('../database').supabase;
  }

  async findAll() {
    const { data, error } = await this.getClient()
      .from('admins')
      .select('id, username, role, instructor_name, assigned_subjects, created_at')
      .order('id', { ascending: true });
    if (error) throw error;
    return (data || []).map(formatAccount);
  }

  async findByUsername(username) {
    const { data, error } = await this.getClient()
      .from('admins')
      .select('*')
      .eq('username', username)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      ...data,
      role: data.role || 'super_admin',
      instructor_name: data.instructor_name || '',
      assigned_subjects: Array.isArray(data.assigned_subjects) ? data.assigned_subjects : []
    };
  }

  async findById(id) {
    const { data, error } = await this.getClient()
      .from('admins')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      ...data,
      role: data.role || 'super_admin',
      instructor_name: data.instructor_name || '',
      assigned_subjects: Array.isArray(data.assigned_subjects) ? data.assigned_subjects : []
    };
  }

  async countSuperAdmins() {
    const { data, error } = await this.getClient()
      .from('admins')
      .select('id, role');
    if (error) throw error;
    if (!data) return 0;
    return data.filter(a => !a.role || a.role === 'super_admin').length;
  }

  async createAccount({ username, password, role, instructor_name, assigned_subjects }) {
    if (!username || !username.trim()) {
      throw new Error('กรุณาระบุชื่อผู้ใช้งาน (Username)');
    }
    if (!password || password.trim().length < 6) {
      throw new Error('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
    }

    const cleanUsername = username.trim();
    const existing = await this.findByUsername(cleanUsername);
    if (existing) {
      throw new Error('ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น');
    }

    const hash = bcrypt.hashSync(password.trim(), 10);
    const newAccount = {
      username: cleanUsername,
      password_hash: hash,
      role: role || 'teacher',
      instructor_name: (instructor_name || '').trim(),
      assigned_subjects: Array.isArray(assigned_subjects) ? assigned_subjects : []
    };

    const { data, error } = await this.getClient()
      .from('admins')
      .insert([newAccount])
      .select('id, username, role, instructor_name, assigned_subjects, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น');
      }
      throw error;
    }
    return formatAccount(data || newAccount);
  }

  async updateAccount(id, { username, password, role, instructor_name, assigned_subjects }, currentAdminId) {
    const target = await this.findById(id);
    if (!target) {
      throw new Error('ไม่พบบัญชีผู้ใช้งานที่ต้องการแก้ไข');
    }
    const targetRole = target.role || 'super_admin';

    if (Number(id) === Number(currentAdminId) && role && role !== targetRole) {
      throw new Error('ไม่สามารถเปลี่ยนบทบาทของบัญชีตนเองได้');
    }

    if (targetRole === 'super_admin' && role === 'teacher') {
      const superAdminCount = await this.countSuperAdmins();
      if (superAdminCount <= 1) {
        throw new Error('ไม่สามารถลดระดับผู้ดูแลระบบ (Super Admin) บัญชีสุดท้ายของระบบได้');
      }
    }

    const payload = {};
    if (username && username.trim() !== target.username) {
      payload.username = username.trim();
    }
    if (password && password.trim()) {
      if (password.trim().length < 6) {
        throw new Error('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
      }
      payload.password_hash = bcrypt.hashSync(password.trim(), 10);
    }
    if (role) payload.role = role;
    if (instructor_name !== undefined) payload.instructor_name = (instructor_name || '').trim();
    if (assigned_subjects !== undefined) {
      payload.assigned_subjects = Array.isArray(assigned_subjects) ? assigned_subjects : [];
    }

    if (Object.keys(payload).length === 0) {
      return formatAccount(target);
    }

    const { data, error } = await this.getClient()
      .from('admins')
      .update(payload)
      .eq('id', id)
      .select('id, username, role, instructor_name, assigned_subjects, created_at')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        throw new Error('ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น');
      }
      throw error;
    }
    return formatAccount(data || { ...target, ...payload });
  }

  async deleteAccount(id, currentAdminId) {
    if (Number(id) === Number(currentAdminId)) {
      throw new Error('ไม่สามารถลบบัญชีของตนเองได้');
    }
    const target = await this.findById(id);
    if (!target) {
      throw new Error('ไม่พบบัญชีผู้ใช้งานที่ต้องการลบ');
    }
    const targetRole = target.role || 'super_admin';
    if (targetRole === 'super_admin') {
      const superAdminCount = await this.countSuperAdmins();
      if (superAdminCount <= 1) {
        throw new Error('ไม่สามารถลบผู้ดูแลระบบ (Super Admin) บัญชีสุดท้ายของระบบได้');
      }
    }
    const { error } = await this.getClient()
      .from('admins')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return { success: true };
  }

  async updatePasswordHash(id, hash) {
    const { error } = await this.getClient()
      .from('admins')
      .update({ password_hash: hash })
      .eq('id', id);
    if (error) throw error;
    return { changes: 1 };
  }

  async updatePasswordHashByUsername(username, hash) {
    const { error } = await this.getClient()
      .from('admins')
      .update({ password_hash: hash })
      .eq('username', username);
    if (error) throw error;
    return { changes: 1 };
  }
}

module.exports = new AdminRepository();
module.exports.AdminRepository = AdminRepository;
