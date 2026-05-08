/* ============================================================
   API — Centralized API calls with error handling
   ============================================================ */
const Api = {
  async _fetch(url, options) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      console.error(`[Api] ${url} failed:`, e);
      throw e;
    }
  },

  async fetchOverview() {
    Store.set('loading', { ...Store.get('loading'), overview: true });
    try {
      const data = await this._fetch('/api/overview');
      Store.set('overview', data);
      Store.set('errors', { ...Store.get('errors'), overview: null });
      return data;
    } catch (e) {
      Store.set('errors', { ...Store.get('errors'), overview: e.message });
      return null;
    } finally {
      Store.set('loading', { ...Store.get('loading'), overview: false });
    }
  },

  async fetchUnifiedServices() {
    Store.set('loading', { ...Store.get('loading'), services: true });
    try {
      const data = await this._fetch('/api/unified-services');
      Store.set('services', data.services || []);
      Store.set('categories', data.categories || {});
      Store.set('errors', { ...Store.get('errors'), services: null });
      return data;
    } catch (e) {
      Store.set('errors', { ...Store.get('errors'), services: e.message });
      return null;
    } finally {
      Store.set('loading', { ...Store.get('loading'), services: false });
    }
  },

  async fetchTasks() {
    Store.set('loading', { ...Store.get('loading'), tasks: true });
    try {
      const data = await this._fetch('/api/tasks');
      Store.set('tasks', data);
      Store.set('errors', { ...Store.get('errors'), tasks: null });
      return data;
    } catch (e) {
      Store.set('errors', { ...Store.get('errors'), tasks: e.message });
      return null;
    } finally {
      Store.set('loading', { ...Store.get('loading'), tasks: false });
    }
  },

  async fetchAiCli() {
    Store.set('loading', { ...Store.get('loading'), aicli: true });
    try {
      const data = await this._fetch('/api/ai-cli-processes');
      Store.set('aiCliData', data);
      Store.set('errors', { ...Store.get('errors'), aicli: null });
      return data;
    } catch (e) {
      Store.set('errors', { ...Store.get('errors'), aicli: e.message });
      return null;
    } finally {
      Store.set('loading', { ...Store.get('loading'), aicli: false });
    }
  },

  async fetchDashLogs(source, type) {
    Store.set('loading', { ...Store.get('loading'), logs: true });
    try {
      let url = '/api/dashboard-logs?limit=200';
      if (source) url += `&source=${source}`;
      if (type) url += `&type=${type}`;
      const data = await this._fetch(url);
      Store.set('dashLogs', data);
      Store.set('errors', { ...Store.get('errors'), logs: null });
      return data;
    } catch (e) {
      Store.set('errors', { ...Store.get('errors'), logs: e.message });
      return null;
    } finally {
      Store.set('loading', { ...Store.get('loading'), logs: false });
    }
  },

  async fetchWebViews() {
    Store.set('loading', { ...Store.get('loading'), webviews: true });
    try {
      const [svcRes, wvRes] = await Promise.all([
        fetch('/api/unified-services').catch(() => ({ json: () => ({ services: [], categories: {} }) })),
        fetch('/api/webviews').catch(() => ({ json: () => [] }))
      ]);
      const svcData = await svcRes.json();
      const wvData = await wvRes.json();
      Store.set('categories', svcData.categories || {});
      Store.set('errors', { ...Store.get('errors'), webviews: null });
      return { services: svcData.services || [], webviews: wvData };
    } catch (e) {
      Store.set('errors', { ...Store.get('errors'), webviews: e.message });
      return null;
    } finally {
      Store.set('loading', { ...Store.get('loading'), webviews: false });
    }
  },

  async svcAction(id, action) {
    try {
      const data = await this._fetch(`/api/unified-services/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      return data;
    } catch (e) {
      throw e;
    }
  },

  async fetchSvcLogs(id, type) {
    try {
      return await this._fetch(`/api/unified-services/${id}/logs?type=${type}&lines=100`);
    } catch (e) {
      return null;
    }
  },

  async fetchSvcDetails(id) {
    try {
      return await this._fetch(`/api/unified-services/${id}/details`);
    } catch (e) {
      return null;
    }
  },

  async runTask(id) {
    try {
      return await this._fetch(`/api/tasks/${id}/run`, { method: 'POST' });
    } catch (e) {
      throw e;
    }
  },

  async toggleTask(id) {
    try {
      return await this._fetch(`/api/tasks/${id}/toggle`, { method: 'POST' });
    } catch (e) {
      throw e;
    }
  },

  async fetchTaskLogs(id) {
    try {
      return await this._fetch(`/api/tasks/${id}/logs`);
    } catch (e) {
      return null;
    }
  },

  async fetchTaskHistory(id) {
    try {
      return await this._fetch(`/api/tasks/${id}/history`);
    } catch (e) {
      return null;
    }
  }
};
