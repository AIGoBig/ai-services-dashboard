/* ============================================================
   App — Bootstrap, auto-refresh, SSE real-time updates
   ============================================================ */

// Initial load
loadOverview();

// Auto-refresh every 60s based on current tab (SSE provides real-time, this is fallback)
setInterval(function() {
  const currentTab = Store.get('currentTab');
  if (currentTab === 'overview') loadOverview();
  if (currentTab === 'services') loadUnifiedServices();
  if (currentTab === 'tasks') loadTasks();
  if (currentTab === 'aicli') loadAiCli();
  if (currentTab === 'logs') loadDashLogs();
  if (currentTab === 'webviews') loadWebViews();
}, 60000);

// SSE (Server-Sent Events) real-time updates
let sseConnected = false;
let sseReconnectTimer = null;

(function initSSE() {
  if (typeof EventSource === 'undefined') return;

  function connect() {
    try {
      const es = new EventSource('/api/events');

      es.addEventListener('connected', function() {
        if (!sseConnected) {
          sseConnected = true;
          showToast('实时连接已建立', 'success', 2000);
        }
      });

      es.addEventListener('service-action', function(e) {
        try {
          const data = JSON.parse(e.data);
          const currentTab = Store.get('currentTab');
          if (currentTab === 'overview') loadOverview();
          if (currentTab === 'services' || currentTab === 'webviews') {
            if (currentTab === 'services') loadUnifiedServices();
            if (currentTab === 'webviews') loadWebViews();
          }
        } catch (_) {}
      });

      es.addEventListener('status-change', function(e) {
        try {
          const data = JSON.parse(e.data);
          const currentTab = Store.get('currentTab');
          if (currentTab === 'overview') loadOverview();
          if (currentTab === 'services') loadUnifiedServices();
          if (currentTab === 'webviews') loadWebViews();
        } catch (_) {}
      });

      es.addEventListener('task-run', function() {
        const currentTab = Store.get('currentTab');
        if (currentTab === 'tasks') loadTasks();
      });

      es.addEventListener('task-toggle', function() {
        const currentTab = Store.get('currentTab');
        if (currentTab === 'tasks') loadTasks();
      });

      es.addEventListener('task-complete', function(e) {
        try {
          const data = JSON.parse(e.data);
          showToast(`任务 ${data.id || ''} 执行完成: ${data.status || 'done'}`, data.status === 'success' ? 'success' : 'warning', 5000);
          const currentTab = Store.get('currentTab');
          if (currentTab === 'tasks') loadTasks();
          if (currentTab === 'overview') loadOverview();
        } catch (_) {}
      });

      es.addEventListener('log-entry', function() {
        const currentTab = Store.get('currentTab');
        if (currentTab === 'logs') loadDashLogs();
      });

      es.addEventListener('config-reload', function() {
        showToast('服务配置已热更新', 'info', 3000);
        const currentTab = Store.get('currentTab');
        if (currentTab === 'overview') loadOverview();
        if (currentTab === 'services') loadUnifiedServices();
        if (currentTab === 'webviews') loadWebViews();
      });

      es.onerror = function() {
        if (sseConnected) {
          sseConnected = false;
          showToast('实时连接断开，使用轮询模式', 'warning', 4000);
        }
        es.close();
        // Auto-reconnect after 30s
        if (sseReconnectTimer) clearTimeout(sseReconnectTimer);
        sseReconnectTimer = setTimeout(connect, 30000);
      };
    } catch (e) {
      // SSE not available, polling handles it
    }
  }

  connect();
})();

// Theme toggle
(function initTheme() {
  const saved = localStorage.getItem('dashboard-theme');
  if (saved === 'light') document.documentElement.classList.add('theme-light');

  window.toggleTheme = function() {
    document.documentElement.classList.toggle('theme-light');
    const isLight = document.documentElement.classList.contains('theme-light');
    localStorage.setItem('dashboard-theme', isLight ? 'light' : 'dark');
    showToast(isLight ? '已切换到浅色主题' : '已切换到深色主题', 'info', 2000);
  };
})();
