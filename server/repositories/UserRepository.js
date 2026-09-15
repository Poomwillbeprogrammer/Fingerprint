const { supabase } = require('../database');

class UserRepository {
  constructor(client) {
    this.client = client || supabase;
  }

  setClient(client) {
    this.client = client;
  }

  getClient() {
    return this.client || require('../database').supabase;
  }

  async findAllOrderById() {
    const { data, error } = await this.getClient()
      .from('users')
      .select('*')
      .order('id', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async findAllBasic() {
    const { data, error } = await this.getClient()
      .from('users')
      .select('id, name, student_id')
      .order('id', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async findById(id) {
    const { data, error } = await this.getClient()
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findByStudentId(studentId) {
    const { data, error } = await this.getClient()
      .from('users')
      .select('id, name')
      .eq('student_id', studentId)
      .maybeSingle();
    if (error) return null;
    return data;
  }

  async countAll() {
    const { count, error } = await this.getClient()
      .from('users')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count || 0;
  }

  async countInSensor() {
    const { count, error } = await this.getClient()
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('in_sensor', 1);
    if (error) throw error;
    return count || 0;
  }

  async findLruInSensor(excludeId) {
    const { data, error } = await this.getClient()
      .from('users')
      .select('id, name')
      .eq('in_sensor', 1)
      .neq('id', excludeId)
      .order('last_scanned_at', { ascending: true, nullsFirst: true })
      .limit(1);
    if (error) throw error;
    return data && data[0] ? data[0] : null;
  }

  async getTier2Candidates() {
    const { data, error } = await this.getClient()
      .from('users')
      .select('id, name, fingerprint_template, last_scanned_at, created_at')
      .or('in_sensor.eq.0,in_sensor.is.null')
      .not('fingerprint_template', 'is', null)
      .order('last_scanned_at', { ascending: false, nullsFirst: false })
      .limit(60);
    if (error) throw error;
    return (data || []).filter(u => u.fingerprint_template && u.fingerprint_template.length >= 512);
  }

  async getUsersWithTemplate() {
    const { data, error } = await this.getClient()
      .from('users')
      .select('id, fingerprint_template')
      .not('fingerprint_template', 'is', null);
    if (error) throw error;
    return (data || []).filter(u => u.fingerprint_template && u.fingerprint_template.length >= 512);
  }

  async insertUser({ id, studentId, name }) {
    const userObj = { id, student_id: studentId, name, in_sensor: 1 };
    const { error } = await this.getClient()
      .from('users')
      .insert(userObj);
    if (error) throw error;
    return { lastID: id, changes: 1 };
  }

  async deleteUser(id) {
    const { error } = await this.getClient()
      .from('users')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return { changes: 1 };
  }

  async updateLastScanned(id, timestamp = null) {
    const val = timestamp || new Date().toISOString();
    const { error } = await this.getClient()
      .from('users')
      .update({ last_scanned_at: val })
      .eq('id', id);
    if (error) throw error;
    return { changes: 1 };
  }

  async updateInSensor(id, inSensor) {
    const { error } = await this.getClient()
      .from('users')
      .update({ in_sensor: inSensor })
      .eq('id', id);
    if (error) throw error;
    return { changes: 1 };
  }

  async updateTemplateAndInSensor(id, template) {
    const cleanTemplate = (template || '').replace(/\s+/g, '');
    const { error } = await this.getClient()
      .from('users')
      .update({ fingerprint_template: cleanTemplate, in_sensor: 1 })
      .eq('id', id);
    if (error) throw error;
    return { changes: 1 };
  }
}

module.exports = new UserRepository();
module.exports.UserRepository = UserRepository;
