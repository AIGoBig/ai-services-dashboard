/* ============================================================
   Services — Unified services tab
   ============================================================ */

async function loadUnifiedServices() {
  showSkeleton('services', 'services');
  const data = await Api.fetchUnifiedServices();
  if (data) {
    renderUnifiedServices(data);
  }
  document.getElementById('lastRefreshServices').textContent =
    '上次更新: ' + new Date().toLocaleTimeString('zh-CN');
}

function renderUnifiedServices(data) {
  const services = data.services || [];
  const categories = data.categories || {};

  const svcFilter = Store.get('svcFilter');
  const filterContainer = document.getElementById('svc-cat-filter');
  const allCats = [...new Set(services.map(s => s.category).filter(Boolean))];
  let filterHtml = `<button class="cat-filter-btn ${svcFilter === '' ? 'active' : ''}" onclick="Store.set('svcFilter','');loadUnifiedServices()">全部</button>`;
  for (const catId of allCats) {
    const c = categories[catId] || {};
    const active = svcFilter === catId ? 'active' : '';
    filterHtml += `<button class="cat-filter-btn ${active}" style="${active ? 'border-color:' + c.color + ';color:' + c.color : ''}" onclick="Store.set('svcFilter','${catId}');loadUnifiedServices()">${escapeHtml(c.label || catId)}</button>`;
  }
  filterContainer.innerHTML = filterHtml;

  const filtered = svcFilter ? services.filter(s => s.category === svcFilter) : services;
  const container = document.getElementById('services');

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1"/><circle cx="6" cy="18" r="1"/></svg><div class="empty-state-title">无匹配服务</div><div class="empty-state-desc">尝试切换分类过滤或添加新服务</div></div>';
    return;
  }

  const sorted = [...filtered].sort((a, b) => {
    const aOff = a.status !== 'online' ? 0 : 1;
    const bOff = b.status !== 'online' ? 0 : 1;
    if (aOff !== bOff) return aOff - bOff;
    return (a.name || '').localeCompare(b.name || '');
  });

  container.innerHTML = sorted.map(s => renderUnifiedServiceCard(s)).join('');

  const openLogs = Store.get('openLogs');
  const openDetails = Store.get('openDetails');
  for (const id of Object.keys(openLogs)) {
    if (openLogs[id]) loadUnifiedSvcLogs(id, openLogs[id]);
  }
  for (const id of Object.keys(openDetails)) {
    if (openDetails[id]) loadUnifiedSvcDetail(id);
  }
}

function renderUnifiedServiceCard(s) {
  const statusClass = s.status === 'online' ? 'svc-online' : (s.status === 'stopped' ? 'svc-offline' : 'svc-restarting');
  const isOnline = s.status === 'online';
  const memMB = s.memory ? (s.memory / 1024 / 1024).toFixed(1) : 0;
  const memPercent = Math.min((memMB / 500) * 100, 100);
  const memBarClass = memPercent < 30 ? 'low' : (memPercent < 70 ? 'mid' : 'high');
  const managerBadge = s.manager === 'pm2'
    ? '<span class="svc-type-badge type-pm2">PM2</span>'
    : '<span class="svc-type-badge type-launchagent">LaunchAgent</span>';

  let healthHtml = '';
  if (s.healthCheck) {
    const hcType = s.healthCheck.type;
    if (hcType === 'http') {
      healthHtml = `<span class="health-indicator"><span class="health-dot ${s.healthy ? 'ok' : 'fail'}"></span>${s.healthy ? 'HTTP 正常' : 'HTTP 异常'}</span>`;
    } else if (hcType === 'port' && s.port) {
      healthHtml = `<span class="health-indicator"><span class="health-dot ${s.healthy ? 'ok' : 'fail'}"></span>${s.healthy ? '端口正常' : '端口不通'} :${s.port}</span>`;
    } else if (hcType === 'process' || hcType === 'launchagent') {
      healthHtml = `<span class="health-indicator"><span class="health-dot ${s.healthy ? 'ok' : 'fail'}"></span>${s.healthy ? '进程正常' : '进程异常'}</span>`;
    }
  } else if (s.port) {
    healthHtml = `<span class="health-indicator"><span class="health-dot ${s.healthy ? 'ok' : 'fail'}"></span>:${s.port}</span>`;
  }

  let extraPortsHtml = '';
  if (s.extraPortStatus) {
    extraPortsHtml = Object.entries(s.extraPortStatus).map(([p, ok]) =>
      `<span class="health-indicator"><span class="health-dot ${ok ? 'ok' : 'fail'}"></span>:${p}</span>`
    ).join('');
  }

  const wvBtn = s.webview
    ? `<button class="btn-ghost" style="font-size:11px;padding:4px 10px" onclick="switchTab('webviews')">看板</button>`
    : '';

  const restartBtn = `<button class="btn-primary" style="font-size:11px;padding:4px 12px" onclick="unifiedSvcAction('${s.id}','restart')">重启</button>`;
  const stopBtn = isOnline ? `<button class="btn-secondary" style="font-size:11px;padding:4px 12px" onclick="unifiedSvcAction('${s.id}','stop')">停止</button>` : '';
  const startBtn = !isOnline ? `<button class="btn-primary" style="font-size:11px;padding:4px 12px" onclick="unifiedSvcAction('${s.id}','start')">启动</button>` : '';

  const restartWarn = s.restarts >= 3 ? `<span style="color:var(--color-status-offline);font-weight:600"> (${s.restarts}次!)</span>` : '';

  const metricsHtml = s.manager === 'pm2' ? `
    <div class="service-metrics">
      <div class="metric-box"><div class="metric-value">${s.pid || '-'}</div><div class="metric-label">PID</div></div>
      <div class="metric-box"><div class="metric-value">${formatUptime(s.uptime ? Date.now() - s.uptime : 0)}</div><div class="metric-label">运行时间</div></div>
      <div class="metric-box"><div class="metric-value">${s.cpu || 0}%</div><div class="metric-label">CPU</div></div>
      <div class="metric-box"><div class="metric-value">${memMB} MB</div><div class="metric-label">内存</div><div class="mem-bar-container"><div class="mem-bar-fill ${memBarClass}" style="width:${memPercent}%"></div></div></div>
      <div class="metric-box"><div class="metric-value">${s.restarts || 0}${restartWarn}</div><div class="metric-label">重启</div></div>
    </div>` : `
    <div class="service-metrics">
      <div class="metric-box"><div class="metric-value">${s.pid || '-'}</div><div class="metric-label">PID</div></div>
      <div class="metric-box"><div class="metric-value">${(s.cpu || 0).toFixed(1)}%</div><div class="metric-label">CPU</div></div>
      <div class="metric-box"><div class="metric-value">${memMB} MB</div><div class="metric-label">内存</div><div class="mem-bar-container"><div class="mem-bar-fill ${memBarClass}" style="width:${memPercent}%"></div></div></div>
      <div class="metric-box"><div class="metric-value">${s.port || '-'}</div><div class="metric-label">端口</div></div>
    </div>`;

  return `
    <div class="service-card" id="svc-card-${s.id}">
      <div class="service-card-header">
        <div class="service-name">
          ${escapeHtml(s.name)}
          ${managerBadge}
          ${catBadge(s.category)}
          <span class="svc-status-badge ${statusClass}">
            <span class="status-dot ${isOnline ? 'active' : 'inactive'}"></span>
            ${statusText(s.status)}
          </span>
          ${healthHtml}${extraPortsHtml}
        </div>
      </div>
      ${s.description ? `<div style="color:var(--color-text-secondary);font-size:13px;margin-bottom:12px">${escapeHtml(s.description)}</div>` : ''}
      ${metricsHtml}
      <div class="service-actions">
        ${startBtn}${restartBtn}${stopBtn}
        <button class="btn-ghost" onclick="toggleUnifiedSvcLogs('${s.id}')">日志</button>
        <button class="btn-ghost" onclick="toggleUnifiedSvcDetail('${s.id}')">详情</button>
        ${wvBtn}
      </div>
      <div class="log-panel" id="svc-logs-${s.id}"></div>
      <div class="detail-panel" id="svc-detail-${s.id}"></div>
    </div>`;
}

async function unifiedSvcAction(id, action) {
  if (action === 'stop' && !confirm('确定停止此服务吗？')) return;
  try {
    await Api.svcAction(id, action);
    showToast(`${id} ${statusText(action === 'restart' ? '重启中' : action === 'stop' ? '停止' : '启动中')}`, 'success');
    // Flash success on card
    const card = document.getElementById(`svc-card-${id}`);
    if (card) { card.classList.add('action-success'); setTimeout(() => card.classList.remove('action-success'), 1500); }
  } catch (e) {
    showToast(`操作失败: ${e.message}`, 'error');
  }
  setTimeout(() => { loadUnifiedServices(); loadOverview(); }, 1000);
}

async function toggleUnifiedSvcLogs(id) {
  const panel = document.getElementById(`svc-logs-${id}`);
  if (!panel) return;
  const isShow = panel.classList.contains('show');
  const openLogs = Store.get('openLogs');
  if (isShow) { panel.classList.remove('show'); Store.set('openLogs', { ...openLogs, [id]: null }); return; }
  Store.set('openLogs', { ...openLogs, [id]: 'out' });
  await loadUnifiedSvcLogs(id, 'out');
}

async function loadUnifiedSvcLogs(id, type) {
  const panel = document.getElementById(`svc-logs-${id}`);
  if (!panel) return;
  const data = await Api.fetchSvcLogs(id, type);
  if (!data) { panel.innerHTML = '<div class="log-empty">加载日志失败</div>'; panel.classList.add('show'); return; }
  panel.innerHTML = `
    <div class="log-toolbar">
      <button class="log-tab ${type === 'out' ? 'active' : ''}" onclick="switchUnifiedLogType('${id}', 'out')">stdout</button>
      <button class="log-tab ${type === 'err' ? 'active' : ''}" onclick="switchUnifiedLogType('${id}', 'err')">stderr</button>
      <span style="color:var(--color-text-faint);font-size:11px;margin-left:auto">${data.exists ? data.totalLines + ' 行' : '无日志'}</span>
    </div>
    <div class="log-content">${data.exists ? escapeHtml(data.logs) : '<div class="log-empty">暂无日志</div>'}</div>
  `;
  panel.classList.add('show');
}

async function switchUnifiedLogType(id, type) {
  const openLogs = Store.get('openLogs');
  Store.set('openLogs', { ...openLogs, [id]: type });
  await loadUnifiedSvcLogs(id, type);
}

async function toggleUnifiedSvcDetail(id) {
  const panel = document.getElementById(`svc-detail-${id}`);
  if (!panel) return;
  const isShow = panel.classList.contains('show');
  const openDetails = Store.get('openDetails');
  if (isShow) { panel.classList.remove('show'); Store.set('openDetails', { ...openDetails, [id]: false }); return; }
  Store.set('openDetails', { ...openDetails, [id]: true });
  await loadUnifiedSvcDetail(id);
}

async function loadUnifiedSvcDetail(id) {
  const panel = document.getElementById(`svc-detail-${id}`);
  if (!panel) return;
  const data = await Api.fetchSvcDetails(id);
  if (!data) { panel.innerHTML = '<div style="color:var(--color-status-offline)">加载详情失败</div>'; panel.classList.add('show'); return; }
  if (data.error) { panel.innerHTML = `<div style="color:var(--color-status-offline)">${data.error}</div>`; panel.classList.add('show'); return; }

  const rows = [
    ['管理方式', data.manager === 'pm2' ? 'PM2' : 'LaunchAgent'],
    ['状态', statusText(data.status)],
    ['PID', data.pid || '-'],
  ];
  if (data.execPath) rows.push(['启动命令', data.execPath, 'path']);
  if (data.cwd) rows.push(['工作目录', data.cwd, 'path']);
  if (data.nodeVersion) rows.push(['Node 版本', data.nodeVersion]);
  if (data.uptime) rows.push(['启动时间', new Date(data.uptime).toLocaleString('zh-CN')]);
  if (data.restarts != null) rows.push(['重启次数', data.restarts]);
  if (data.outLogPath) rows.push(['Stdout 日志', data.outLogPath, 'path']);
  if (data.errLogPath) rows.push(['Stderr 日志', data.errLogPath, 'path']);
  if (data.launchagentLabel) rows.push(['LaunchAgent', data.launchagentLabel]);
  if (data.note) rows.push(['备注', data.note]);

  panel.innerHTML = `
    <div class="detail-grid">
      ${rows.map(([k, v, cls]) => `
        <div class="detail-row">
          <span class="detail-key">${k}</span>
          <span class="detail-val ${cls || ''}">${escapeHtml(String(v || '-'))}</span>
        </div>
      `).join('')}
    </div>
  `;
  panel.classList.add('show');
}
