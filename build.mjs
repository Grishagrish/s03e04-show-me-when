import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const assets = {};
for (const [file, type] of Object.entries({ 'index.html': 'text/html; charset=utf-8', 'app.js': 'text/javascript; charset=utf-8', 'api.js': 'text/javascript; charset=utf-8', 'style.css': 'text/css; charset=utf-8' })) {
  assets[`/${file}`] = { type, body: fs.readFileSync(path.join('app', file), 'utf8').replaceAll('BUILD_SHA', sha) };
}
assets['/config.js'] = { type: 'text/javascript; charset=utf-8', body: "export const API = location.origin + '/challenges/show-me-when/api';\nexport const SESSION = '';\n" };
fs.mkdirSync('dist/server', { recursive: true });
fs.writeFileSync('dist/server/index.js', fs.readFileSync('server/worker.js', 'utf8') + '\nconst assets = ' + JSON.stringify(assets) + ';\nexport default createWorker(assets);\n');
console.log('Built server bundle for ' + sha);
