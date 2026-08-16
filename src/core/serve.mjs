// ./src/core/serve.mjs
/**
 * Optionally serve wcag-audit results over HTTP so a browser can open a
 * website view instead of HTML source in the editor.
 *
 * This is not a GUI application. Coding models should present the gate from
 * latest.json. Humans can open results.html if they want the page.
 *
 * Usage: wcagate serve [--cwd dir] [--port 4179] [--open]
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_RESULTS_PORT = 4179;
export const DEFAULT_DASHBOARD_PORT = DEFAULT_RESULTS_PORT;
export const DEFAULT_RESULTS_FILE = 'results.html';

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.sarif': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
});

export function isCiEnvironment(env = process.env) {
  return env.CI === 'true' || env.CI === '1';
}

/**
 * Serve after run only when explicitly requested and not in CI.
 */
export function shouldServeResults({ serve = false, noServe = false, env = process.env } = {}) {
  if (noServe || isCiEnvironment(env)) return false;
  return Boolean(serve);
}

export const shouldServeDashboard = shouldServeResults;

export function indexFileForDirectory(directory) {
  const root = path.resolve(directory);
  if (fs.existsSync(path.join(root, DEFAULT_RESULTS_FILE))) return DEFAULT_RESULTS_FILE;
  if (fs.existsSync(path.join(root, 'dashboard.html'))) return 'dashboard.html';
  return DEFAULT_RESULTS_FILE;
}

export function resultsUrl(port, file = DEFAULT_RESULTS_FILE) {
  return `http://127.0.0.1:${port}/${file.replace(/^\//, '')}`;
}

export const dashboardUrl = resultsUrl;

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function safeJoin(root, requestPath, indexFile) {
  const decoded = decodeURIComponent((requestPath || '/').split('?')[0]);
  const relative = decoded === '/' ? indexFile : decoded.replace(/^\/+/, '');
  const resolved = path.resolve(root, relative);
  const rootResolved = path.resolve(root);
  if (resolved !== rootResolved && !resolved.startsWith(`${rootResolved}${path.sep}`)) {
    return null;
  }
  return resolved;
}

export function createResultsServer(directory) {
  const root = path.resolve(directory);
  const server = http.createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end('Method Not Allowed');
      return;
    }
    const indexFile = indexFileForDirectory(root);
    const filePath = safeJoin(root, request.url ?? '/', indexFile);
    if (!filePath) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    fs.stat(filePath, (error, stats) => {
      if (error || !stats.isFile()) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Results not found. Run wcagate run first.');
        return;
      }
      const type = contentType(filePath);
      response.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      fs.createReadStream(filePath).pipe(response);
    });
  });
  return server;
}

export const createDashboardServer = createResultsServer;

export async function listenOnPort(server, preferredPort) {
  const start = Number.isInteger(preferredPort) && preferredPort > 0 ? preferredPort : DEFAULT_RESULTS_PORT;
  for (let port = start; port < start + 20; port += 1) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, '127.0.0.1');
      });
      return port;
    } catch (error) {
      if (error?.code !== 'EADDRINUSE') throw error;
    }
  }
  throw new Error(`No free loopback port from ${start} to ${start + 19}`);
}

export async function openInBrowser(url) {
  const platform = process.platform;
  const { spawn } = await import('node:child_process');
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
}

/**
 * Start serving an output directory. Caller must close the returned server.
 * @returns {Promise<{ server: import('node:http').Server, port: number, url: string }>}
 */
export async function startResultsServer({ directory, port = DEFAULT_RESULTS_PORT } = {}) {
  const server = createResultsServer(directory);
  const bound = await listenOnPort(server, port);
  return {
    server,
    port: bound,
    url: resultsUrl(bound, indexFileForDirectory(directory)),
    directory: path.resolve(directory)
  };
}

export const startDashboardServer = startResultsServer;

export function formatResultsOpenLine(url) {
  return `Results (optional view): ${url}`;
}

export const formatDashboardOpenLine = formatResultsOpenLine;

export { pathToFileURL };
