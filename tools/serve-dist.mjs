import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', 'dist');
const portArgIndex = process.argv.indexOf('--port');
const port = portArgIndex >= 0 ? Number(process.argv[portArgIndex + 1]) : 4173;

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
  ['.wav', 'audio/wav'],
]);

function resolveRequestPath(url) {
  const parsed = new URL(url, 'http://127.0.0.1');
  const decoded = decodeURIComponent(parsed.pathname);
  const pathname = decoded === '/' ? '/index.html' : decoded;
  const target = path.resolve(root, `.${pathname}`);
  if (!target.startsWith(root)) {
    return null;
  }
  return target;
}

async function fileExists(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end('Bad request');
    return;
  }

  let filePath = resolveRequestPath(req.url);
  if (!filePath) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  if (!(await fileExists(filePath))) {
    const ext = path.extname(filePath);
    filePath = ext ? null : path.join(root, 'index.html');
  }

  if (!filePath || !(await fileExists(filePath))) {
    res.writeHead(404).end('Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes.get(ext) ?? 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
  });
  createReadStream(filePath).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving ${root} at http://127.0.0.1:${port}/`);
});
