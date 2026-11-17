// ./src/core/ports.mjs
/**
 * Free-port selection and listener lookup for the managed web server. A port a framework prefers (Astro 4321, Vite 5173) is
 * often the user's own dev server; WCAGate never adopts or stops a server it did not start.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';

function canBind(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (error) => resolve(error.code === 'EADDRNOTAVAIL' || error.code === 'EAFNOSUPPORT'));
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

/** True when something accepts a connection (a wildcard 0.0.0.0 / [::] listener answers on loopback too). */
function canConnect(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(800);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

/**
 * Free on IPv4 and IPv6 loopback: bindable and nothing answers. A bind test alone is not enough: macOS and Windows let a
 * second process bind 127.0.0.1:P while another listens on 0.0.0.0:P or [::]:P.
 */
export async function isPortFree(port) {
  if (!(await canBind(port, '127.0.0.1')) || !(await canBind(port, '::1'))) return false;
  return !(await canConnect(port, '127.0.0.1')) && !(await canConnect(port, '::1'));
}

/** The preferred port when free, otherwise one chosen by the OS. */
export async function findFreePort(preferred) {
  if (Number.isInteger(preferred) && preferred > 0 && (await isPortFree(preferred))) return { port: preferred, busy: false };
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const { port: assigned } = server.address();
        server.close(() => resolve(assigned));
      });
    });
    if (await isPortFree(port)) return { port, busy: Number.isInteger(preferred) };
  }
  throw new Error('Could not find a free local port after 20 attempts.');
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 8000, windowsHide: true });
  return result.status === 0 ? String(result.stdout || '') : '';
}

/** Who holds a port: { pid, command, cwd } or null. Best effort (ss, lsof, netstat); informational only. */
export function listenerInfo(port) {
  let pid = null;
  if (process.platform === 'win32') {
    // Rows cover IPv4 and IPv6. The state word is localized, so a listening row is recognised by its foreign address ":0".
    for (const line of run('netstat', ['-ano']).split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (/^TCP/i.test(parts[0] ?? '') && parts[1]?.endsWith(`:${port}`) && parts[2]?.endsWith(':0')) pid = Number(parts[parts.length - 1]);
    }
    return Number.isInteger(pid) && pid > 1 ? { pid, command: '', cwd: null } : null;
  }
  const match = /pid=(\d+)/.exec(run('ss', ['-ltnpH', `sport = :${port}`]));
  if (match) pid = Number(match[1]);
  if (!pid) {
    const line = run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp']).split('\n').find((entry) => entry.startsWith('p'));
    if (line) pid = Number(line.slice(1));
  }
  if (!pid) return null;
  let cwd = null;
  try {
    cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
  } catch {
    const line = run('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']).split('\n').find((entry) => entry.startsWith('n'));
    cwd = line ? line.slice(1) : null;
  }
  return { pid, command: run('ps', ['-o', 'args=', '-p', String(pid)]).trim(), cwd };
}

const LOCAL_HOST = '(?:localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[::1\\])';

/**
 * Replaces the port in `--port N`, `--port=N`, `-p N`, `{port}` placeholders and loopback `host:N` forms (`localhost:N`,
 * `127.0.0.1:N`, `http://localhost:N/`). Other hosts (a proxy target, an API backend) and longer numbers are never touched.
 */
export function replacePort(args, from, to) {
  const hostPort = new RegExp(`(${LOCAL_HOST}):${from}(?!\\d)`, 'gi');
  const out = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if ((arg === '--port' || arg === '-p') && args[index + 1] === String(from)) {
      out.push(arg, String(to));
      index += 1;
    } else if (arg === `--port=${from}`) out.push(`--port=${to}`);
    else out.push(arg.replaceAll('{port}', String(to)).replace(hostPort, `$1:${to}`));
  }
  return out;
}

/** Parent pid of a process (POSIX `ps`), or null when unknown. */
function parentPid(pid) {
  const value = Number(run('ps', ['-o', 'ppid=', '-p', String(pid)]).trim());
  return Number.isInteger(value) && value > 0 ? value : null;
}

/** Windows: parent pid and creation time (epoch ms) of a process through CIM; null when the process is gone. */
function winProcess(pid) {
  const script = `$p = Get-CimInstance Win32_Process -Filter 'ProcessId=${Number(pid)}'; if ($p) { '{0} {1}' -f $p.ParentProcessId, ([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds() }`;
  const [parent, created] = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]).trim().split(' ').map(Number);
  return Number.isFinite(created) ? { parent: Number.isInteger(parent) && parent > 0 ? parent : null, created } : null;
}

/**
 * Windows has no process groups, so ownership is the parent chain: reaching `rootPid` means ours. A listener older than `rootPid`
 * cannot be its descendant, so it is foreign (the dev server that was already on the port). Anything else is unknown (null),
 * never guessed: a parent that exited leaves a broken chain.
 */
function windowsListenerBelongsTo(port, rootPid) {
  const listener = listenerInfo(port);
  if (!listener) return null;
  if (listener.pid === rootPid) return true;
  const start = winProcess(listener.pid);
  if (!start) return null;
  let parent = start.parent;
  for (let depth = 0; depth < 25 && parent !== null; depth += 1) {
    if (parent === rootPid) return true;
    parent = winProcess(parent)?.parent ?? null;
  }
  const root = winProcess(rootPid);
  return root && start.created < root.created ? false : null;
}

/**
 * Whether the process listening on `port` is `rootPid` or one of its descendants: true, false, or null when it cannot be
 * told (no ss/lsof/ps, or an ambiguous Windows chain). Used to notice that a foreign server answered on the port before ours bound it.
 */
export function listenerBelongsTo(port, rootPid) {
  if (process.platform === 'win32') return windowsListenerBelongsTo(port, rootPid);
  const listener = listenerInfo(port);
  if (!listener) return null;
  if (listener.pid === rootPid) return true;
  const group = Number(run('ps', ['-o', 'pgid=', '-p', String(listener.pid)]).trim());
  if (group === rootPid) return true;
  let pid = listener.pid;
  for (let depth = 0; depth < 25; depth += 1) {
    pid = parentPid(pid);
    if (pid === null) return false;
    if (pid === rootPid) return true;
  }
  return false;
}
