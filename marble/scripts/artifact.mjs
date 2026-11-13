// Turns dist/index.html into the body-only form an artifact is published from (the publisher adds its own skeleton).
import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const head = src.slice(src.indexOf('<head>') + 6, src.indexOf('</head>')).replace(/<meta[^>]*>\s*/g, '');
const body = src.slice(src.indexOf('<body>') + 6, src.lastIndexOf('</body>'));
const out = process.argv[2] || new URL('../dist/marble-artifact.html', import.meta.url);
writeFileSync(out, head.trim() + '\n' + body.trim() + '\n');
console.log('wrote', String(out), (head.length + body.length) + ' bytes');
