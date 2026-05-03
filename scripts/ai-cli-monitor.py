#!/usr/bin/env python3
"""
AI CLI Process Monitor
Detects and reports resource usage for AI coding assistants:
  - QoderCLI (qodercli-*)
  - Claude Code (claude *)
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

def get_project_from_cwd(cwd):
    """Extract project name from working directory."""
    if not cwd:
        return ''
    return os.path.basename(cwd.rstrip('/'))


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
                    # Skip grep/this-script itself
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
                    })
                    break  # matched one pattern, skip remaining
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue

    return results


def scan_with_ps():
    """Fallback: scan processes using ps command (limited info)."""
    try:
        output = subprocess.check_output(
            ['ps', 'eo', 'pid,pcpu,pmem,rss,etime,args'],
            text=True,
            timeout=5
        )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return []

    results = []
    for line in output.splitlines()[1:]:
        line = line.strip()
        if not line:
            continue
        # Format: PID  %CPU  %MEM   RSS  ELARGS  COMMAND
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

                # Try to get cwd via lsof (best-effort, suppress errors)
                cwd = ''
                try:
                    cwd_out = subprocess.check_output(
                        ['lsof', '-p', str(pid), '-Fn'],
                        text=True, timeout=2, stderr=subprocess.DEVNULL
                    )
                    for l in cwd_out.splitlines():
                        if l.startswith('n/') and not cwd:
                            cwd = l[1:]
                except Exception:
                    pass

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
                })
                break

    return results


def parse_etime(etime_str):
    """Parse ps etime format to seconds. Examples: 3, 1:30, 17:30:00, 3-1:00:00."""
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


def print_table(processes):
    """Print formatted table for PM2 log output."""
    if not processes:
        print(f"{len(processes)} AI CLI processes found")
        return

    header = f"  {'PID':>6} | {'TOOL':<14} | {'VERSION':>8} | {'CPU%':>6} | {'MEM%':>6} | {'MEM MB':>7} | {'ELAPSED':<12} | PROJECT"
    sep = "  " + "-" * (len(header) - 2)
    print(header)
    print(sep)
    for p in processes:
        print(f"  {p['pid']:>6} | {p['tool']:<14} | {p['version']:>8} | {p['cpuPercent']:>5.1f}% | {p['memPercent']:>5.1f}% | {p['memMB']:>6.1f} | {p['elapsedHuman']:<12} | {p['project'] or '-'}")


def main():
    mode = '--table' if '--table' in sys.argv else '--json'

    # Try psutil first, fallback to ps
    processes = scan_with_psutil()
    if processes is None:
        processes = scan_with_ps()

    if mode == '--json':
        print(json.dumps(processes, ensure_ascii=False))
    else:
        print_table(processes)


if __name__ == '__main__':
    main()
