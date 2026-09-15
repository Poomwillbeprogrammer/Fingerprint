const { supabase } = require('../database');

class AccessLogRepository {
  constructor(client) {
    this.client = client || supabase;
  }

  setClient(client) {
    this.client = client;
  }

  getClient() {
    return this.client || require('../database').supabase;
  }

  async getRecentLogs(limit = 50) {
    const { data, error } = await this.getClient()
      .from('access_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }

  async countTotal() {
    const { count, error } = await this.getClient()
      .from('access_logs')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count || 0;
  }

  async countGrantedToday() {
    const now = new Date();
    const todayBangkok = new Date(now.getTime() + 7 * 3600 * 1000).toISOString().split('T')[0];
    const startOfDay = new Date(todayBangkok + 'T00:00:00+07:00').toISOString();

    const { count, error } = await this.getClient()
      .from('access_logs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'GRANTED')
      .gte('timestamp', startOfDay);
    if (error) throw error;
    return count || 0;
  }

  async countDeniedToday() {
    const now = new Date();
    const todayBangkok = new Date(now.getTime() + 7 * 3600 * 1000).toISOString().split('T')[0];
    const startOfDay = new Date(todayBangkok + 'T00:00:00+07:00').toISOString();

    const { count, error } = await this.getClient()
      .from('access_logs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'DENIED')
      .gte('timestamp', startOfDay);
    if (error) throw error;
    return count || 0;
  }

  async insertLog({ userId, studentId, userName, fingerprintId, status, score, timestamp }) {
    const logObj = {
      user_id: userId,
      student_id: studentId || '-',
      user_name: userName || 'Unknown User',
      fingerprint_id: fingerprintId || 0,
      status: status || 'DENIED',
      score: score || 0
    };
    if (timestamp && typeof timestamp === 'string' && !timestamp.includes('now')) {
      logObj.timestamp = timestamp;
    }

    const { data, error } = await this.getClient()
      .from('access_logs')
      .insert(logObj)
      .select('id')
      .single();
    if (error) throw error;
    return { lastID: data ? data.id : 0, changes: 1 };
  }

  async deleteAll() {
    const { error } = await this.getClient()
      .from('access_logs')
      .delete()
      .neq('id', 0);
    if (error) throw error;
    return { changes: 1 };
  }
}

module.exports = new AccessLogRepository();
module.exports.AccessLogRepository = AccessLogRepository;
