/* dist/dub.html → dist/dub-artifact.html: the same page without the document shell, for publishing as a Claude artifact. */
import fs from 'node:fs';
const src = fs.readFileSync('dist/dub.html', 'utf8');
const one = (re) => { const m = re.exec(src); if (!m) throw new Error('not found: ' + re); return m[0]; };
const title = one(/<title>[\s\S]*?<\/title>/), links = src.match(/<link [^>]*>/g) || [];
const script = one(/<script type="module"[^>]*>[\s\S]*?<\/script>/), style = one(/<style[^>]*>[\s\S]*?<\/style>/);
const body = /<body>([\s\S]*)<\/body>/.exec(src)[1].replace(/<script[\s\S]*?<\/script>/g, '').trim();
fs.writeFileSync('dist/dub-artifact.html', [title, '<meta name="claude:viewport-fit-sides" content="cover">', ...links, style, body, script, ''].join('\n'));
console.log('dist/dub-artifact.html', fs.statSync('dist/dub-artifact.html').size, 'bytes');
