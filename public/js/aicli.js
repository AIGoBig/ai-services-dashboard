/* ============================================================
   AI CLI — AI CLI processes tab
   ============================================================ */

async function loadAiCli() {
  showSkeleton('aicli', 'aicli');
  const data = await Api.fetchAiCli();
  if (data) renderAiCli(data);
  document.getElementById('lastRefreshAiCli').textContent =
    '上次更新: ' + new Date().toLocaleTimeString('zh-CN');
}

function renderAiCli(data) {
  const container = document.getElementById('aicli');
  const processes = data.processes || [];
  const summary = data.summary || {};
  const error = data.error;

  if (error && processes.length === 0) {
    container.innerHTML = `<div class="empty-state"><svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg><div class="empty-state-title">检测失败</div><div class="empty-state-desc">${escapeHtml(error)}</div></div>`;
    return;
  }
  if (processes.length === 0) {
    container.innerHTML = '<div class="empty-state"><svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg><div class="empty-state-title">未检测到 AI CLI 进程</div><div class="empty-state-desc">当有 AI CLI 工具运行时将自动显示</div></div>';
    return;
  }

  let html = '';
  const statusCounts = { working: 0, thinking: 0, idle: 0, done: 0, error: 0, unknown: 0 };
  for (const p of processes) { const st = (p.session && p.session.status) || 'unknown'; statusCounts[st] = (statusCounts[st] || 0) + 1; }
  const statusLabels = { working: '工作中', thinking: '思考中', idle: '空闲', done: '已完成', error: '错误', unknown: '未知' };

  html += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">';
  for (const [st, count] of Object.entries(statusCounts)) { if (count > 0) html += `<span class="session-status session-${st}"><span class="session-dot"></span>${statusLabels[st]} ${count}</span>`; }
  html += '</div>';

  const toolNames = Object.keys(summary);
  if (toolNames.length > 0) {
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:24px;">';
    for (const [tool, s] of Object.entries(summary)) {
      html += `<div class="metric-box" style="padding:16px;text-align:left"><div style="font-size:14px;font-weight:600;margin-bottom:8px">${escapeHtml(tool)}</div><div style="display:flex;gap:16px;font-size:12px;color:var(--color-text-secondary)"><span>进程: <b style="color:var(--color-text-primary)">${s.count}</b></span><span>CPU: <b style="color:var(--color-status-warning)">${s.totalCpu.toFixed(1)}%</b></span><span>内存: <b style="color:var(--color-status-online)">${s.totalMemMB.toFixed(0)} MB</b></span></div></div>`;
    }
    html += '</div>';
  }

  html += `<div style="background:var(--color-bg-secondary);border:1px solid var(--color-border-default);border-radius:var(--radius-lg);overflow:hidden"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:var(--color-bg-tertiary);border-bottom:1px solid var(--color-border-default)"><th style="padding:8px 10px;text-align:left;color:var(--color-text-secondary);font-weight:500;width:30px"></th><th style="padding:8px 10px;text-align:left;color:var(--color-text-secondary);font-weight:500">工具</th><th style="padding:8px 10px;text-align:left;color:var(--color-text-secondary);font-weight:500">状态</th><th style="padding:8px 10px;text-align:left;color:var(--color-text-secondary);font-weight:500">当前任务</th><th style="padding:8px 10px;text-align:right;color:var(--color-text-secondary);font-weight:500">PID</th><th style="padding:8px 10px;text-align:right;color:var(--color-text-secondary);font-weight:500">CPU</th><th style="padding:8px 10px;text-align:right;color:var(--color-text-secondary);font-weight:500">MEM</th><th style="padding:8px 10px;text-align:left;color:var(--color-text-secondary);font-weight:500">Context</th><th style="padding:8px 10px;text-align:left;color:var(--color-text-secondary);font-weight:500">运行时间</th><th style="padding:8px 10px;text-align:left;color:var(--color-text-secondary);font-weight:500">项目</th></tr></thead><tbody>`;

  const statusOrder = { working: 0, thinking: 1, pending: 2, idle: 3, done: 4, error: 5, unknown: 6 };
  const sorted = [...processes].sort((a, b) => {
    const sa = statusOrder[(a.session && a.session.status) || 'unknown'] ?? 9;
    const sb = statusOrder[(b.session && b.session.status) || 'unknown'] ?? 9;
    if (sa !== sb) return sa - sb;
    return b.cpuPercent - a.cpuPercent;
  });

  for (const p of sorted) {
    const s = p.session || {};
    const status = s.status || 'unknown';
    const cpuColor = p.cpuPercent > 50 ? 'var(--color-status-offline)' : (p.cpuPercent > 10 ? 'var(--color-status-warning)' : 'var(--color-text-primary)');
    const memColor = p.memPercent > 10 ? 'var(--color-status-offline)' : (p.memPercent > 3 ? 'var(--color-status-warning)' : 'var(--color-text-primary)');
    const toolBadge = `<span class="svc-type-badge ${p.tool === 'QoderCLI' ? 'type-pm2' : (p.tool === 'Claude Code' ? 'type-launchagent' : 'type-pm2')}">${escapeHtml(p.tool)}</span>`;
    const statusBadge = `<span class="session-status session-${status}"><span class="session-dot"></span>${statusLabels[status] || status}</span>`;
    let taskHtml = '-';
    if (s.question) taskHtml = `<span class="qa-preview"><span class="qa-label">Q:</span>${escapeHtml(s.question.substring(0, 50))}</span>`;
    if (s.currentTool) taskHtml += `<span style="color:var(--color-status-orange);font-size:10px;margin-left:6px">${escapeHtml(s.currentTool)}</span>`;
    const ctx = s.contextPercent || 0;
    const ctxClass = ctx < 50 ? 'context-low' : (ctx < 80 ? 'context-mid' : 'context-high');
    const ctxHtml = ctx > 0 ? `<div style="font-size:10px;color:var(--color-text-secondary)">${ctx}%</div><div class="context-bar"><div class="context-bar-fill ${ctxClass}" style="width:${Math.min(ctx, 100)}%"></div></div>` : '<span style="color:var(--color-text-ghost);font-size:11px">-</span>';
    const rowId = `aicli-detail-${p.pid}`;
    html += `<tr style="border-bottom:1px solid var(--color-border-subtle);cursor:pointer" onclick="toggleAiCliRow('${rowId}')" title="${escapeHtml(p.cwd || p.cmdline)}"><td style="padding:8px 6px;text-align:center;color:var(--color-text-faint);font-size:10px">&#9656;</td><td style="padding:8px 10px">${toolBadge}${p.version ? `<span style="color:var(--color-text-faint);font-size:10px;margin-left:4px">v${escapeHtml(p.version)}</span>` : ''}</td><td style="padding:8px 10px">${statusBadge}</td><td style="padding:8px 10px">${taskHtml}</td><td style="padding:8px 10px;text-align:right;font-family:var(--font-mono);font-size:12px">${p.pid}</td><td style="padding:8px 10px;text-align:right;color:${cpuColor};font-weight:600">${p.cpuPercent}%</td><td style="padding:8px 10px;text-align:right;color:${memColor}">${p.memMB}MB</td><td style="padding:8px 10px;min-width:70px">${ctxHtml}</td><td style="padding:8px 10px;color:var(--color-text-secondary);font-size:12px">${escapeHtml(p.elapsedHuman)}</td><td style="padding:8px 10px;color:var(--color-status-info);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(p.project || '-')}</td></tr><tr class="row-detail" id="${rowId}"><td colspan="10" style="padding:0"><div style="padding:14px 18px;background:var(--color-bg-primary)"><div style="display:grid;grid-template-columns:1fr 1fr;gap:16px"><div><div style="color:var(--color-text-secondary);font-size:10px;font-weight:600;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">系统信息</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:12px"><div><span style="color:var(--color-text-faint)">PID:</span> <span style="color:var(--color-text-primary);font-family:var(--font-mono)">${p.pid}</span></div>${p.parentPid ? `<div><span style="color:var(--color-text-faint)">父进程:</span> <span style="color:var(--color-text-primary);font-family:var(--font-mono)">${p.parentPid}${p.parentName ? ' (' + escapeHtml(p.parentName) + ')' : ''}</span></div>` : ''}${p.threads ? `<div><span style="color:var(--color-text-faint)">线程:</span> <span style="color:var(--color-text-primary)">${p.threads}</span></div>` : ''}<div><span style="color:var(--color-text-faint)">CWD:</span> <span style="color:var(--color-status-info);font-family:var(--font-mono);font-size:11px;word-break:break-all">${escapeHtml(p.cwd || '-')}</span></div></div></div><div><div style="color:var(--color-text-secondary);font-size:10px;font-weight:600;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">会话信息</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:12px"><div><span style="color:var(--color-text-faint)">状态:</span> ${statusBadge}</div>${s.currentTool ? `<div><span style="color:var(--color-text-faint)">当前工具:</span> <span style="color:var(--color-status-orange);font-weight:600">${escapeHtml(s.currentTool)}</span></div>` : ''}${ctx > 0 ? `<div><span style="color:var(--color-text-faint)">Context:</span> <span style="color:var(--color-text-primary)">${ctx}%</span></div>` : ''}${s.model ? `<div style="grid-column:span 2"><span style="color:var(--color-text-faint)">模型:</span> <span style="color:var(--color-status-purple)">${escapeHtml(s.model)}</span></div>` : ''}</div></div></div>${p.cmdline ? `<div style="margin-top:10px;border-top:1px solid var(--color-border-subtle);padding-top:8px"><div style="color:var(--color-text-faint);font-size:10px;font-weight:600;margin-bottom:4px">命令行</div><div style="color:var(--color-text-faint);font-family:var(--font-mono);font-size:11px;word-break:break-all;background:var(--color-bg-recessed);padding:8px 10px;border-radius:6px">${escapeHtml(p.cmdline)}</div></div>` : ''}</div></td></tr>`;
  }
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function toggleAiCliRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) row.classList.toggle('show');
}
