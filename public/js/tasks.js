/* ============================================================
   Tasks — Scheduled tasks tab
   ============================================================ */

async function loadTasks() {
  showSkeleton('tasks', 'tasks');
  const data = await Api.fetchTasks();
  if (data) renderTasks(data);
  document.getElementById('lastRefreshTasks').textContent =
    '上次更新: ' + new Date().toLocaleTimeString('zh-CN');
}

function renderTasks(tasks) {
  const container = document.getElementById('tasks');
  if (tasks.length === 0) {
    container.innerHTML = '<div class="empty-state"><svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><div class="empty-state-title">暂无定时任务</div><div class="empty-state-desc">在 config/tasks.json 中添加定时任务</div></div>';
    return;
  }
  container.innerHTML = tasks.map(t => `
    <div class="task-card">
      <div class="task-header">
        <div class="task-name">${escapeHtml(t.name)}</div>
        <div class="task-status">
          <div class="status-dot ${t.enabled ? 'active' : 'inactive'}"></div>
          <span>${t.enabled ? '运行中' : '已暂停'}</span>
        </div>
      </div>
      <div class="task-meta">
        <div class="meta-item"><div class="meta-label">调度规则</div><div class="meta-value">${escapeHtml(t.schedule)}</div></div>
        <div class="meta-item"><div class="meta-label">下次执行</div><div class="meta-value">${t.nextRun ? new Date(t.nextRun).toLocaleString('zh-CN') : '无'}</div></div>
        <div class="meta-item"><div class="meta-label">上次执行</div><div class="meta-value">${t.lastRun ? new Date(t.lastRun.time).toLocaleString('zh-CN') + ' · ' + statusText(t.lastRun.status) : '从未执行'}</div></div>
        <div class="meta-item"><div class="meta-label">描述</div><div class="meta-value">${escapeHtml(t.description)}</div></div>
        <div class="meta-item"><div class="meta-label">执行次数</div><div class="meta-value">${t.historyCount || 0}</div></div>
      </div>
      <div class="task-actions">
        <button class="btn-primary" onclick="runTask('${t.id}')">立即执行</button>
        <button class="btn-secondary" onclick="toggleTask('${t.id}')">${t.enabled ? '暂停' : '启用'}</button>
        <button class="btn-ghost" onclick="toggleLogs('${t.id}')">查看日志</button>
        <button class="btn-ghost" onclick="toggleHistory('${t.id}')">执行历史</button>
      </div>
      <div class="logs-panel" id="logs-${t.id}"></div>
      <div class="history-panel" id="history-${t.id}"></div>
    </div>
  `).join('');
}

async function runTask(id) {
  try {
    await Api.runTask(id);
    showToast('任务已触发', 'info');
  } catch (e) { showToast('触发失败: ' + e.message, 'error'); }
  setTimeout(loadTasks, 500);
}

async function toggleTask(id) {
  await Api.toggleTask(id);
  loadTasks();
}

async function toggleLogs(id) {
  const panel = document.getElementById(`logs-${id}`);
  const isShow = panel.classList.contains('show');
  if (isShow) { panel.classList.remove('show'); return; }
  const data = await Api.fetchTaskLogs(id);
  if (data) {
    panel.textContent = data.logs || '暂无日志';
  } else {
    panel.textContent = '加载日志失败';
  }
  panel.classList.add('show');
}

async function toggleHistory(id) {
  const panel = document.getElementById(`history-${id}`);
  const isShow = panel.classList.contains('show');
  if (isShow) { panel.classList.remove('show'); return; }
  const data = await Api.fetchTaskHistory(id);
  if (!data) { panel.innerHTML = '<div style="color:var(--color-text-muted);padding:8px;">加载历史失败</div>'; panel.classList.add('show'); return; }
  panel.innerHTML = data.length === 0
    ? '<div style="color:var(--color-text-muted);padding:8px;">暂无记录</div>'
    : data.map(h => `<div class="history-item"><span>${new Date(h.time).toLocaleString('zh-CN')} · ${h.type === 'manual' ? '手动' : '定时'}</span><span class="badge badge-${h.status}">${statusText(h.status)}</span></div>`).join('');
  panel.classList.add('show');
}
