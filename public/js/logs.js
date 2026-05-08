/* ============================================================
   Logs — Dashboard logs tab
   ============================================================ */

const logSourceLabels = { system: '系统', service: '服务', 'ext-service': '外部服务', task: '定时任务', 'ai-cli': 'AI CLI' };
const logTypeColors = { info: 'var(--color-status-online)', warn: 'var(--color-status-warning)', error: 'var(--color-status-offline)' };

async function loadDashLogs() {
  showSkeleton('dashlogs', 'logs');
  const source = document.getElementById('logSourceFilter').value;
  const type = document.getElementById('logTypeFilter').value;
  const data = await Api.fetchDashLogs(source, type);
  if (data) renderDashLogs(data);
  document.getElementById('lastRefreshLogs').textContent =
    '上次更新: ' + new Date().toLocaleTimeString('zh-CN');
}

function renderDashLogs(logs) {
  const container = document.getElementById('dashlogs');
  if (logs.length === 0) {
    container.innerHTML = '<div class="empty-state"><svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><div class="empty-state-title">暂无日志记录</div><div class="empty-state-desc">系统事件将自动记录在此</div></div>';
    return;
  }
  let html = `<div style="background:var(--color-bg-secondary);border:1px solid var(--color-border-default);border-radius:var(--radius-lg);overflow:hidden"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:var(--color-bg-tertiary);border-bottom:1px solid var(--color-border-default)"><th style="padding:10px 14px;text-align:left;color:var(--color-text-secondary);font-weight:500;width:160px">时间</th><th style="padding:10px 14px;text-align:left;color:var(--color-text-secondary);font-weight:500;width:70px">类型</th><th style="padding:10px 14px;text-align:left;color:var(--color-text-secondary);font-weight:500;width:90px">来源</th><th style="padding:10px 14px;text-align:left;color:var(--color-text-secondary);font-weight:500">消息</th><th style="padding:10px 14px;text-align:left;color:var(--color-text-secondary);font-weight:500;width:auto">详情</th></tr></thead><tbody>`;
  for (const l of logs) {
    const typeColor = logTypeColors[l.type] || 'var(--color-text-secondary)';
    const typeLabel = { info: 'INFO', warn: 'WARN', error: 'ERROR' }[l.type] || l.type.toUpperCase();
    const srcLabel = logSourceLabels[l.source] || l.source;
    html += `<tr style="border-bottom:1px solid var(--color-border-subtle)"><td style="padding:8px 14px;color:var(--color-text-secondary);font-family:var(--font-mono);font-size:11px;white-space:nowrap">${new Date(l.time).toLocaleString('zh-CN')}</td><td style="padding:8px 14px"><span style="color:${typeColor};font-weight:600;font-size:11px">${typeLabel}</span></td><td style="padding:8px 14px"><span style="background:color-mix(in srgb, ${typeColor} 10%, transparent);color:${typeColor};padding:2px 8px;border-radius:4px;font-size:11px">${srcLabel}</span></td><td style="padding:8px 14px;color:var(--color-text-primary)">${escapeHtml(l.message)}</td><td style="padding:8px 14px;color:var(--color-text-muted);font-size:11px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(l.detail)}">${escapeHtml(l.detail)}</td></tr>`;
  }
  html += '</tbody></table></div>';
  container.innerHTML = html;
}
