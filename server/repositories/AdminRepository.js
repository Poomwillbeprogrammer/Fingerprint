const { supabase } = require('../database');

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

  async findByUsername(username) {
    const { data, error } = await this.getClient()
      .from('admins')
      .select('*')
      .eq('username', username)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findById(id) {
    const { data, error } = await this.getClient()
      .from('admins')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
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
