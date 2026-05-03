#!/usr/bin/env python3
"""
AI CLI Process Monitor
Detects and reports resource usage + session state for AI coding assistants:
  - QoderCLI (qodercli-*) — session state from /tmp/qoder-cmux/
  - Claude Code (claude *) — session state from ~/.claude/projects/
  - OpenAI Codex (codex *)
  - Aider (aider)
  - Cline (cline)

Output modes:
  --json   : JSON array (default, for API consumption)
  --table  : Formatted table (for PM2 log / terminal)

Requires: psutil (pip install psutil)
Fallback: uses subprocess + ps if psutil unavailable (limited info)
"""

import json
import os
import re
import subprocess
import sys
import time
from datetime import timedelta

# --- Config ---
INTERVAL = int(os.environ.get('AI_CLI_MONITOR_INTERVAL', '5'))
QODER_CMUX_DIR = '/tmp/qoder-cmux'
CLAUDE_DIR = os.path.expanduser('~/.claude')
CC_AGENTS_FILE = '/tmp/.cc-agents'

# AI CLI tool definitions: (name, process_pattern, version_extract_fn)
# Order matters: more specific patterns first to avoid false matches
TOOL_PATTERNS = [
    # QoderCLI: process name like "qodercli-0.2.6" or binary path with qodercli
    ('QoderCLI', re.compile(r'\bqodercli[\-\d.]*\b'), lambda cmd: (m.group(1) if (m := re.search(r'qodercli-([\d.]+)', cmd)) else '')),
    # Claude Code: standalone "claude" command (not in paths/env)
    ('Claude Code', re.compile(r'(?:^|\s)/.*\bclaude\b(?:\s|$)'), lambda cmd: ''),
    # OpenAI Codex CLI: "codex" as standalone binary
    ('Codex', re.compile(r'(?:^|\s)/.*\bcodex\b(?:\s|$)'), lambda cmd: ''),
    # Aider: "aider" in python command
    ('Aider', re.compile(r'(?:^|\s)\bpython[^\s]*\s.*\baider\b'), lambda cmd: ''),
    # Cline: usually a VS Code extension, check for node process with cline
    ('Cline', re.compile(r'\bcline\b'), lambda cmd: ''),
]

ANSI_RE = re.compile(rb'\x1b\[[^m]*m')


def get_project_from_cwd(cwd):
    """Extract project name from working directory."""
    if not cwd:
        return ''
    return os.path.basename(cwd.rstrip('/'))


# ========== Session State Collectors ==========

def collect_qoder_sessions():
    """Scan /tmp/qoder-cmux/ for QoderCLI session state.
    Returns dict: pid -> session_info
    """
    sessions = {}
    if not os.path.isdir(QODER_CMUX_DIR):
        return sessions

    try:
        files = os.listdir(QODER_CMUX_DIR)
    except OSError:
        return sessions

    # 1. Build pid → UUID mapping from session-token files
    pid_to_uuid = {}
    for f in files:
        if f.startswith('session-token-') and f.endswith('.txt'):
            uuid = f[len('session-token-'):-len('.txt')]
            try:
                content = open(os.path.join(QODER_CMUX_DIR, f)).read().strip()
                pid_str = content.split('_')[0]
                pid = int(pid_str)
                pid_to_uuid[pid] = uuid
            except (ValueError, IndexError, OSError):
                continue

    # 2. For each UUID, read session state files
    uuids = set(pid_to_uuid.values())
    # Also find UUIDs from tmux-status files (some may not have session-token)
    for f in files:
        if f.startswith('tmux-status-') and f.endswith('.txt') and len(f) > 20:
            uuid = f[len('tmux-status-'):-len('.txt')]
            uuids.add(uuid)

    uuid_sessions = {}
    for uuid in uuids:
        info = {'status': 'unknown', 'question': '', 'answer': '', 'currentTool': '', 'messageCount': 0, 'contextPercent': 0, 'workspacePath': ''}

        # Read tmux-status (state/timestamp/Q/A, SOH-separated with ANSI codes)
        status_file = os.path.join(QODER_CMUX_DIR, f'tmux-status-{uuid}.txt')
        if os.path.isfile(status_file):
            try:
                raw = open(status_file, 'rb').read()
                clean = ANSI_RE.sub(b'', raw).decode('utf-8', errors='replace').strip()
                fields = clean.split('\x01')
                if len(fields) >= 1:
                    state = fields[0].strip()
                    # Normalize states
                    state_map = {'working': 'working', 'thinking': 'thinking', 'done': 'done',
                                 'error': 'error', 'idle': 'idle', 'pending': 'pending'}
                    info['status'] = state_map.get(state, state)
                if len(fields) >= 3:
                    info['question'] = fields[2].strip()[:200]
                if len(fields) >= 4:
                    info['answer'] = fields[3].strip()[:200]
            except OSError:
                pass

        # Read question file for full text
        q_file = os.path.join(QODER_CMUX_DIR, f'question-{uuid}.txt')
        if os.path.isfile(q_file):
            try:
                info['question'] = open(q_file).read().strip()[:200]
            except OSError:
                pass

        # Read message count
        count_file = os.path.join(QODER_CMUX_DIR, f'question-{uuid}.txt.count')
        if os.path.isfile(count_file):
            try:
                info['messageCount'] = int(open(count_file).read().strip())
            except (ValueError, OSError):
                pass

        # Read pending tool action
        pending_file = os.path.join(QODER_CMUX_DIR, f'pending-{uuid}.txt')
        if os.path.isfile(pending_file):
            try:
                content = open(pending_file).read().strip()
                parts = content.split('|')
                if len(parts) >= 2:
                    info['currentTool'] = parts[1].strip()
            except OSError:
                pass

        # Read workspace path
        path_file = os.path.join(QODER_CMUX_DIR, f'path-{uuid}.txt')
        if os.path.isfile(path_file):
            try:
                content = open(path_file).read().strip()
                # Remove emoji prefix like 📁
                info['workspacePath'] = re.sub(r'^[\U0001F300-\U0001F9FF]\s*', '', content)
            except OSError:
                pass

        uuid_sessions[uuid] = info

    # 3. Map pid → session via pid_to_uuid
    for pid, uuid in pid_to_uuid.items():
        if uuid in uuid_sessions:
            sessions[pid] = uuid_sessions[uuid]

    # 4. Also map by matching workspacePath to cwd for sessions without PID mapping
    # (for processes whose PID we find via psutil but not in session-token)
    sessions['_uuid_sessions'] = uuid_sessions  # for later cwd matching
    return sessions


def collect_claude_sessions():
    """Scan ~/.claude/projects/ for Claude Code session state.
    Only scans the 3 most recently modified projects for performance.
    Returns dict: cwd_path -> session_info
    """
    sessions = {}
    projects_dir = os.path.join(CLAUDE_DIR, 'projects')
    if not os.path.isdir(projects_dir):
        return sessions

    try:
        # Get project dirs sorted by modification time (most recent first)
        proj_dirs = []
        for d in os.listdir(projects_dir):
            dp = os.path.join(projects_dir, d)
            if os.path.isdir(dp):
                try:
                    proj_dirs.append((d, dp, os.path.getmtime(dp)))
                except OSError:
                    continue
        proj_dirs.sort(key=lambda x: x[2], reverse=True)

        # Only scan top 3 most recently modified projects
        for proj_dir_name, proj_path, _ in proj_dirs[:3]:
            # Decode project path from directory name
            decoded_path = '/' + proj_dir_name.lstrip('-').replace('-', '/')

            # Find the most recently modified .jsonl session file
            jsonl_files = []
            try:
                for f in os.listdir(proj_path):
                    if f.endswith('.jsonl'):
                        fpath = os.path.join(proj_path, f)
                        try:
                            jsonl_files.append((fpath, os.path.getmtime(fpath)))
                        except OSError:
                            continue
            except OSError:
                continue

            if not jsonl_files:
                continue

            # Sort by modification time, get the most recent
            jsonl_files.sort(key=lambda x: x[1], reverse=True)
            latest_file = jsonl_files[0][0]

            info = {'status': 'unknown', 'question': '', 'answer': '', 'currentTool': '', 'messageCount': 0, 'contextPercent': 0, 'workspacePath': ''}

            try:
                # Read last few lines of the JSONL file
                result = subprocess.run(
                    ['tail', '-20', latest_file],
                    capture_output=True, text=True, timeout=3
                )
                lines = result.stdout.strip().splitlines()

                # Parse from end to find last user message and last assistant message
                last_user_msg = ''
                last_assistant_msg = ''
                tool_name = ''
                total_input_tokens = 0
                total_output_tokens = 0

                for line in reversed(lines):
                    try:
                        entry = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    msg_type = entry.get('type', '')

                    if msg_type == 'user' and not last_user_msg:
                        content = entry.get('message', {}).get('content', '')
                        if isinstance(content, list):
                            for block in content:
                                if isinstance(block, dict) and block.get('type') == 'text':
                                    last_user_msg = block.get('text', '')[:200]
                                    break
                        elif isinstance(content, str):
                            last_user_msg = content[:200]

                    elif msg_type == 'assistant' and not last_assistant_msg:
                        content = entry.get('message', {}).get('content', [])
                        if isinstance(content, list):
                            for block in content:
                                if isinstance(block, dict):
                                    if block.get('type') == 'text' and not last_assistant_msg:
                                        last_assistant_msg = block.get('text', '')[:200]
                                    elif block.get('type') == 'tool_use' and not tool_name:
                                        tool_name = block.get('name', '')

                        # Token usage
                        usage = entry.get('message', {}).get('usage', {})
                        total_input_tokens += usage.get('input_tokens', 0)
                        total_output_tokens += usage.get('output_tokens', 0)

                info['question'] = last_user_msg
                info['answer'] = last_assistant_msg
                info['currentTool'] = tool_name
                info['messageCount'] = len(lines)
                info['workspacePath'] = decoded_path

                # Determine status from last activity
                if last_assistant_msg and not last_user_msg:
                    info['status'] = 'idle'  # assistant responded, no new user input
                elif last_user_msg and last_assistant_msg:
                    info['status'] = 'idle'
                elif last_user_msg:
                    info['status'] = 'working'

                # Context usage estimation (200k context window typical)
                if total_input_tokens > 0:
                    info['contextPercent'] = min(round(total_input_tokens / 200000 * 100), 100)

            except (subprocess.TimeoutExpired, OSError):
                continue

            sessions[decoded_path] = info

    except OSError:
        pass

    return sessions


def collect_cc_agents_state():
    """Read /tmp/.cc-agents for aggregated agent state.
    Format: state\\tcontext%\\tweb(0/1)\\ttool_name\\tprocess_command
    Returns dict: process_command_fragment -> {status, contextPercent, currentTool}
    """
    result = {}
    if not os.path.isfile(CC_AGENTS_FILE):
        return result

    try:
        # Check file age (15s cache)
        mtime = os.path.getmtime(CC_AGENTS_FILE)
        if time.time() - mtime > 30:
            return result  # stale data

        content = open(CC_AGENTS_FILE).read().strip()
        for line in content.splitlines():
            parts = line.split('\t')
            if len(parts) >= 5:
                state, ctx_str, web_str, tool, cmd = parts[0], parts[1], parts[2], parts[3], parts[4]
                # Normalize state
                state_map = {'working': 'working', 'ready': 'idle', 'idle': 'idle', 'error': 'error'}
                normalized = state_map.get(state, state)
                ctx_pct = 0
                try:
                    ctx_pct = int(ctx_str)
                except ValueError:
                    pass
                result[cmd] = {
                    'status': normalized,
                    'contextPercent': ctx_pct,
                    'currentTool': tool,
                }
    except OSError:
        pass

    return result


# ========== Process Scanners ==========

def scan_with_psutil():
    """Scan processes using psutil (preferred, rich info)."""
    try:
        import psutil
    except ImportError:
        return None

    results = []
    for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'cpu_percent', 'memory_percent', 'create_time', 'cwd', 'num_threads']):
        try:
            info = proc.info
            cmdline = ' '.join(info['cmdline'] or [])
            proc_name = info['name'] or ''

            for tool_name, pattern, ver_fn in TOOL_PATTERNS:
                search_str = f"{proc_name} {cmdline}"
                if pattern.search(search_str):
                    if 'ai-cli-monitor' in cmdline:
                        continue

                    version = ver_fn(cmdline or proc_name)
                    try:
                        cpu = proc.cpu_percent(interval=0)
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        cpu = 0.0

                    try:
                        mem = proc.memory_info()
                        mem_mb = mem.rss / (1024 * 1024)
                        mem_pct = proc.memory_percent()
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        mem_mb = 0.0
                        mem_pct = 0.0

                    try:
                        cwd = proc.cwd()
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        cwd = ''

                    try:
                        create_time = proc.create_time()
                        elapsed = time.time() - create_time
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        elapsed = 0

                    results.append({
                        'tool': tool_name,
                        'pid': info['pid'],
                        'version': version,
                        'cpuPercent': round(cpu, 1),
                        'memPercent': round(mem_pct, 1),
                        'memMB': round(mem_mb, 1),
                        'elapsed': round(elapsed),
                        'elapsedHuman': format_elapsed(elapsed),
                        'project': get_project_from_cwd(cwd),
                        'cwd': cwd,
                        'cmdline': cmdline[:200],
                        'threads': info.get('num_threads', 0),
                        'session': {'status': 'unknown', 'question': '', 'answer': '', 'currentTool': '', 'messageCount': 0, 'contextPercent': 0, 'workspacePath': ''},
                    })
                    break
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue

    return results


def scan_with_ps():
    """Fallback: scan processes using ps command. Uses batch lsof for cwd."""
    try:
        output = subprocess.check_output(
            ['ps', 'eo', 'pid,pcpu,pmem,rss,etime,args'],
            text=True,
            timeout=5
        )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return []

    # First pass: collect AI CLI processes
    ai_procs = []
    for line in output.splitlines()[1:]:
        line = line.strip()
        if not line:
            continue
        parts = line.split(None, 5)
        if len(parts) < 6:
            continue
        pid_str, cpu_str, mem_str, rss_str, etime_str, command = parts

        for tool_name, pattern, ver_fn in TOOL_PATTERNS:
            if pattern.search(command):
                if 'ai-cli-monitor' in command:
                    continue
                version = ver_fn(command)
                try:
                    pid = int(pid_str)
                except ValueError:
                    continue
                ai_procs.append((pid, cpu_str, mem_str, rss_str, etime_str, command, tool_name, version))
                break

    if not ai_procs:
        return []

    # Batch lsof for all AI CLI PIDs at once (much faster than per-process)
    pid_cwd_map = {}
    pids_str = ','.join(str(p[0]) for p in ai_procs)
    try:
        lsof_out = subprocess.check_output(
            ['lsof', '-p', pids_str, '-Fn'],
            text=True, timeout=3, stderr=subprocess.DEVNULL
        )
        current_pid = None
        for line in lsof_out.splitlines():
            if line.startswith('p'):
                try:
                    current_pid = int(line[1:])
                except ValueError:
                    current_pid = None
            elif line.startswith('n/') and current_pid and current_pid not in pid_cwd_map:
                pid_cwd_map[current_pid] = line[1:]
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError, OSError):
        pass

    # Second pass: build results
    results = []
    for pid, cpu_str, mem_str, rss_str, etime_str, command, tool_name, version in ai_procs:
        mem_mb = 0.0
        try:
            mem_mb = round(int(rss_str) / 1024, 1)
        except ValueError:
            pass

        elapsed = 0
        elapsed_human = etime_str if etime_str else '-'
        try:
            elapsed = parse_etime(etime_str)
        except Exception:
            pass

        cwd = pid_cwd_map.get(pid, '')

        results.append({
            'tool': tool_name,
            'pid': pid,
            'version': version,
            'cpuPercent': round(float(cpu_str), 1),
            'memPercent': round(float(mem_str), 1),
            'memMB': mem_mb,
            'elapsed': elapsed,
            'elapsedHuman': elapsed_human,
            'project': get_project_from_cwd(cwd),
            'cwd': cwd,
            'cmdline': command[:200],
            'threads': 0,
            'session': {'status': 'unknown', 'question': '', 'answer': '', 'currentTool': '', 'messageCount': 0, 'contextPercent': 0, 'workspacePath': ''},
        })

    return results


# ========== Helpers ==========

def parse_etime(etime_str):
    """Parse ps etime format to seconds."""
    s = etime_str.strip()
    days = 0
    if '-' in s:
        day_part, s = s.split('-', 1)
        days = int(day_part)
    parts = s.split(':')
    if len(parts) == 3:
        h, m, sec = int(parts[0]), int(parts[1]), int(parts[2])
    elif len(parts) == 2:
        h, m, sec = 0, int(parts[0]), int(parts[1])
    else:
        h, m, sec = 0, 0, int(parts[0])
    return days * 86400 + h * 3600 + m * 60 + sec


def format_elapsed(seconds):
    """Format elapsed seconds to human readable."""
    try:
        td = timedelta(seconds=int(seconds))
        days = td.days
        hrs, remainder = divmod(td.seconds, 3600)
        mins, secs = divmod(remainder, 60)
        if days > 0:
            return f"{days}d {hrs}h {mins}m"
        elif hrs > 0:
            return f"{hrs}h {mins}m"
        elif mins > 0:
            return f"{mins}m {secs}s"
        else:
            return f"{secs}s"
    except Exception:
        return '-'


def enrich_with_sessions(processes):
    """Enrich process list with session state data."""
    # Collect all session sources
    qoder_sessions = collect_qoder_sessions()
    claude_sessions = collect_claude_sessions()
    cc_agents = collect_cc_agents_state()

    # Remove internal data before matching
    uuid_sessions = qoder_sessions.pop('_uuid_sessions', {})

    for p in processes:
        session = p.get('session', {})

        # 1. Try QoderCLI PID matching
        if p['pid'] in qoder_sessions:
            qoder_info = qoder_sessions[p['pid']]
            session.update({k: v for k, v in qoder_info.items() if v})
        # Also try matching by cwd to uuid session workspacePath
        elif p['tool'] == 'QoderCLI' and p.get('cwd'):
            for uuid, info in uuid_sessions.items():
                ws = info.get('workspacePath', '')
                if ws and p['cwd'].endswith(ws):
                    session.update({k: v for k, v in info.items() if v})
                    break

        # 2. Try Claude Code cwd matching
        if p['tool'] == 'Claude Code' and p.get('cwd'):
            for path, info in claude_sessions.items():
                if p['cwd'].startswith(path) or path.startswith(p['cwd']):
                    session.update({k: v for k, v in info.items() if v})
                    break

        # 3. Try cc-agents matching by process command
        if session.get('status') == 'unknown':
            for cmd, info in cc_agents.items():
                # Match qodercli version in command
                if p['tool'] == 'QoderCLI' and 'qodercli' in cmd:
                    if re.search(r'qodercli-[\d.]+', cmd) and re.search(r'qodercli[\-\d.]*', p.get('cmdline', '')):
                        if info.get('status', 'unknown') != 'unknown':
                            session['status'] = info['status']
                        if info.get('contextPercent', 0) > 0:
                            session['contextPercent'] = info['contextPercent']
                        if info.get('currentTool', ''):
                            session['currentTool'] = info['currentTool']
                        break

        # Normalize pending → working for display
        if session.get('status') == 'pending':
            session['status'] = 'working'

        p['session'] = session

    return processes


def print_table(processes):
    """Print formatted table for PM2 log output."""
    if not processes:
        print("0 AI CLI processes found")
        return

    header = f"  {'PID':>6} | {'TOOL':<14} | {'VERSION':>8} | {'STATUS':<10} | {'CPU%':>6} | {'MEM%':>6} | {'ELAPSED':<12} | PROJECT"
    sep = "  " + "-" * (len(header) - 2)
    print(header)
    print(sep)
    for p in processes:
        s = p.get('session', {})
        status = s.get('status', 'unknown') if s else 'unknown'
        print(f"  {p['pid']:>6} | {p['tool']:<14} | {p['version']:>8} | {status:<10} | {p['cpuPercent']:>5.1f}% | {p['memPercent']:>5.1f}% | {p['elapsedHuman']:<12} | {p['project'] or '-'}")


def main():
    mode = '--table' if '--table' in sys.argv else '--json'

    # Try psutil first, fallback to ps
    processes = scan_with_psutil()
    if processes is None:
        processes = scan_with_ps()

    # Enrich with session state
    processes = enrich_with_sessions(processes)

    if mode == '--json':
        print(json.dumps(processes, ensure_ascii=False))
    else:
        print_table(processes)


if __name__ == '__main__':
    main()
