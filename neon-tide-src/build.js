// Сборка Neon Tide из исходников в один HTML-файл.
//   node build.js            → ../neon-tide.html (three.js встроен, работает офлайн)
//                              dist/neon-tide.cdn.html (three.js с CDN, для публикации как артефакт)
const fs = require('fs'), path = require('path');
const ROOT = __dirname;
const head = fs.readFileSync(path.join(ROOT, 'src/head.html'), 'utf8');
const body = fs.readFileSync(path.join(ROOT, 'src/body.html'), 'utf8');
const jsDir = path.join(ROOT, 'src/js');
const js = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js')).sort().map((f) => fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n');
const game = "(function () {\n'use strict';\n" + js + '\n})();\n';
if (/<\/script/i.test(game)) throw new Error('game code contains </script');
const threePath = path.join(ROOT, 'node_modules/three/build/three.min.js');
if (!fs.existsSync(threePath)) throw new Error('three.js not found: run `npm install` in neon-tide-src first');
const three = fs.readFileSync(threePath, 'utf8');
const offline = '<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">\n<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n'
  + head + '\n</head>\n<body>\n' + body + '\n<!-- three.js r149 (MIT License, Copyright 2010-2023 Three.js Authors) -->\n<script>\n' + three + '\n</script>\n<script>\n' + game + '</script>\n</body>\n</html>\n';
const oi = process.argv.indexOf('--out');
const outOffline = oi > 0 ? path.resolve(process.argv[oi + 1]) : path.join(ROOT, '..', 'neon-tide.html');
fs.writeFileSync(outOffline, offline);
const cdn = head + '\n' + body + '\n<script src="https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js"></script>\n<script>\n' + game + '</script>\n';
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist/neon-tide.cdn.html'), cdn);
console.log('built', path.relative(process.cwd(), outOffline), (offline.length / 1024).toFixed(0) + ' KB;', 'dist/neon-tide.cdn.html', (cdn.length / 1024).toFixed(0) + ' KB');
