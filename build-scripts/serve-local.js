/**
 * Serves the built app for local testing.
 *
 * Exists instead of a bare `npx http-server dist/...` line in package.json for
 * two reasons:
 *
 *   1. The directory is resolved from this file's location, so the server does
 *      not depend on which directory the command was started from. A relative
 *      path that misses just produces "Cannot GET /" with a 200-OK-looking
 *      server, which is a confusing way to find out the build is missing.
 *   2. It checks the build output up front and says plainly what to run if it
 *      is not there.
 *
 * Usage: node build-scripts/serve-local.js [port]
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const SERVE_DIR = path.join(ROOT, 'dist', 'zzz.optimizer', 'browser');
const PORT = Number(process.argv[2]) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

if (!fs.existsSync(path.join(SERVE_DIR, 'index.html'))) {
  console.error('\n  No build found at:');
  console.error(`    ${SERVE_DIR}\n`);
  console.error('  Build it first:');
  console.error('    npm run build:local\n');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  // Strip the query string; ?ngsw-bypass=true and cache-busting params are not
  // part of the file path.
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  // Neutralise the service worker for local testing.
  //
  // Once registered, ngsw serves the app entirely from its own cache and
  // ignores new builds until it decides to update - so a rebuild appears to
  // change nothing, and the Network tab shows no requests at all. That is a
  // fine production trait and a terrible testing one. Returning a worker that
  // unregisters itself and clears the caches means a reload always shows the
  // build actually on disk.
  if (urlPath === '/ngsw-worker.js') {
    res.writeHead(200, {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.end(
      `self.addEventListener('install', () => self.skipWaiting());\n` +
      `self.addEventListener('activate', async () => {\n` +
      `  const keys = await caches.keys();\n` +
      `  await Promise.all(keys.map(k => caches.delete(k)));\n` +
      `  await self.registration.unregister();\n` +
      `  const clients = await self.clients.matchAll({ type: 'window' });\n` +
      `  clients.forEach(c => c.navigate(c.url));\n` +
      `});\n`
    );
    return;
  }

  // Resolve inside SERVE_DIR only - refuse anything that escapes it.
  const requested = path.join(SERVE_DIR, urlPath);
  const resolved = path.resolve(requested);
  if (!resolved.startsWith(path.resolve(SERVE_DIR))) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  let filePath = resolved;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  // Unknown paths fall back to index.html so Angular's router can handle the
  // route on the client (deep links, refreshes on /characters, etc).
  if (!fs.existsSync(filePath)) {
    filePath = path.join(SERVE_DIR, 'index.html');
  }

  const contentType = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  const fileSize = fs.statSync(filePath).size;
  // Stale assets during testing hide the very changes being tested.
  const cacheControl = 'no-cache, no-store, must-revalidate';

  // Honour range requests.
  //
  // Browsers fetch media in ranges and expect 206 responses. Answering a range
  // request with a full 200 body makes the player re-request repeatedly and
  // stall, which looks exactly like a pathologically slow asset - a multi-
  // minute "download" for a file that is merely large. That is a defect in
  // this test server, not in the app, so it has to be handled here or every
  // video measurement taken against it is meaningless.
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` }).end();
        return;
      }

      res.writeHead(206, {
        'Content-Type': contentType,
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Cache-Control': cacheControl,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }
  }

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': fileSize,
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheControl,
  });
  // Streamed rather than buffered: a 9 MB readFileSync blocks the event loop
  // and delays every other request the page is making.
  fs.createReadStream(filePath).pipe(res);
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use.`);
    console.error(`  Close the other server, or pick another port:`);
    console.error(`    node build-scripts/serve-local.js 8081\n`);
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, () => {
  console.log(`\n  Serving ${path.relative(ROOT, SERVE_DIR)}`);
  console.log(`\n  →  http://localhost:${PORT}\n`);
  console.log('  Ctrl+C to stop.\n');
});
