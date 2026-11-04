# Neon Tide — rules for parallel work

The game is one HTML file built from modules in `src/js` (concatenated in file-name order inside one IIFE, so every
top-level `function`, `class`, `const` is visible to every module at runtime). `src/head.html` holds CSS,
`src/body.html` the DOM. three.js r149 (UMD global `THREE`, WebGL2, `ColorManagement.legacyMode = false`,
sRGB output, ACES tone mapping).

## Build and test
- `npm install` once inside `neon-tide-src` (node_modules is git-ignored; it brings three@0.149.0).
- Build to a scratch file, never commit the root `neon-tide.html`:
  `node build.js --out /tmp/<you>/neon-tide.html` (also writes `dist/`, which is ignored).
- `node tests/smoke.js /tmp/<you>/neon-tide.html` → must print `console errors: 0` and `OK`.
- `node tests/logic.js /tmp/<you>/neon-tide.html` → full gameplay run; must end with `console errors (0)`.
- Playwright and Chromium are preinstalled (`require('playwright')`, `chromium.launch()`); do not install browsers.
  Use launch args `['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']`.
  Software WebGL renders only ~2 fps in game and a screenshot takes ~20 s, so drive logic with
  `window.__neon.step(n, dt)` (runs `n` game updates without rendering) and take few, small screenshots.
  `window.__neon` exposes most globals (see the end of `08_main.js`). Look at your screenshots: they are the only
  way to judge visuals.
- Hard requirement: zero console errors and zero warnings, in menu, story play and creative play.

## Ownership — edit only your files
| Owner | Files |
| - | - |
| A camera & feel | `05_player.js`, `05a_camera.js`, new `05d_*.js` |
| B weapons | `05b_weapons.js`, new `05e_*.js` |
| C models & driving | `03_entities.js`, `03b_humans.js`, `03c_driving.js`, `06_audio.js`, new `03d_*.js` |
| D police & living city | `02_city.js`, `04_ai.js`, `05c_missions.js`, new `04b_*.js` |
| E creative & atmosphere | `01_core.js`, new `09_*.js` |
| Integrator (not you) | `07_hud.js`, `08_main.js`, `head.html`, `body.html`, `build.js`, `package.json`, existing tests |

You may add `tests/<your-area>.js`. If you need something from a file you don't own, call it behind a guard
(`typeof fn === 'function'`, optional chaining) and list the request in your final report. Inject your own CSS with
`HUD.addStyle(css)` and your own DOM from JS (e.g. into `#hud` or the pause panel `#pause .panel`).

## Shared APIs (already in place)
- `EV.on/off/emit` event bus. Events: `start {fresh, mode}`, `modeChange` (HUD mode), `enterCar` (car),
  `exitCar` (car), `gunshot {x,y,z,shooter}`, `bulletHit {type,target,x,y,z,shooter}`, `pedKilled {ped,by}`,
  `explosion {x,z,car}`, `playerDied`, `playerBusted`, `respawn`, `crime {amount,why}`. Add new ones freely; document them.
- `EXT.boot` (after city build, may be async), `EXT.update(dt)` (play logic, after missions), `EXT.lateUpdate(dt)`
  (after the camera moved: view models, aim UI), `EXT.visual(dt)` (every rendered frame, menu included),
  `EXT.glow(layer)` (`layer.add(x,y,z,r,g,b,size)` additive glow points).
- `GAME.state` ('loading'|'menu'|'play'|'pause'), `GAME.mode` ('story'|'creative'), `GAME.cheats {god, noPolice}`.
- HUD: `HUD.addButton({id,label,icon,modes,right,bottom,big,style,parent,onDown,onUp})`, `HUD.setMode(m)`,
  `HUD.mode`, `HUD.toast(text, 'cash'|'warn')`, `HUD.banner(sub,title,bad)`, `HUD.sms(from,text)`, `HUD.addStyle(css)`.
  Modes: 'foot', 'car', 'creative' (others allowed). Existing bottom-right slots in units of button size
  (right, bottom): foot — punch (0,0) big, jump (1.42,-0.05), sprint (1.5,1.25), enter car (0.12,1.55);
  car — gas (0,0) big, brake (1.46,-0.05), drift (1.55,1.2), exit (0.12,1.55), horn (2.75,0.55), nitro (0.2,2.85).
  Weapons may hide `#bPunch` while a gun is drawn and put Fire in its slot.
- Input: `input` object (`jx,jy` stick/WASD, `gas,brake,hand,nitro,sprint,jump,punch,horn`); add your own fields.
  Touch: left 45 % of the screen is the floating stick, the rest drags the camera (`cam.yaw`, `cam.pitch`).
  Keys in use: WASD/arrows, Space, F/Enter, E, Shift, H, M, C, Esc/P. Reserved: A — V (view), pointer lock and
  mouse look on desktop; B — LMB fire, RMB aim, R reload, 1–6 / Q weapons, G throw; E (creative) — its own keys,
  only while `GAME.mode === 'creative'`.
- Camera: `cam {yaw,pitch,zoom,fp,override}`; `cam.override = fn(dt)` replaces the camera (creative free fly);
  `getAim()` → `{x,y,z,dx,dy,dz}` from the camera; `shakeCam(a)`.
- Combat: `fireBullet({x,y,z,dx,dy,dz,range,damage,shooter,spread,minDist})` → `{type,target,x,y,z,dist}` (hits
  peds, cars, the player, buildings, ground; emits `gunshot`/`bulletHit`). `Ped.prototype.damage(amount, attacker, dx, dz)`,
  `car.damage(d, src)`, `hurtPlayer(d, why)`, `addCrime(amount, why)`, `setWanted(n)`, `attachGun(H, type)`.
- Characters: `buildHuman(look)` → `H {root, mesh, bones, ...}`, bones indexed by `HB`; `animHuman(H, a, dt)`.
  Animation fields every caller may set: `speed, t, mode('normal'|'down'|'getup'), getT, air, vy, punch, punchSide,
  hands, phone, turn, flinch` and the new combat fields `aim` (0..1), `aimYaw`, `aimPitch` (radians relative to the
  body), `weapon` ('none'|'pistol'|'twohand'|'melee'), `recoil` (0..1 impulse), `reload` (0..1 progress).
  Owner C implements the new fields; B sets them for the player, D for armed police.
- Cars: `new Car(type, color)`, `car.place(x,z,h)`, `car.physics(inp,dt)`, `car.eyeWorld(out)` (driver eye),
  `car.G.eye` (local), `car.kinematic/ai/driver/persistent`. Owner C may add `car.interior` and
  `car.setInteriorVisible(bool)` for first-person driving.
- World: `groundH(x,z)`, `collideCircle(x,z,r,y)`, `rayBoxes(...)`, `losClear(...)`, `addBoxCollider`,
  `addCircleCollider`, `cgRemove(c)`, `SPOT`, `blocks`, `buildings`, `roadC(i)`, `nodePos/laneSeg/nearestNode`.
- Audio: `AUD.tone(freq,dur,type,vol,slideTo,delay)`, `AUD.noise(dur,vol,freq,q,type,delay)`, `AUD.ctx`, `AUD.sfx`.

## Quality bar
- The target is phones (touch, landscape and portrait) first, desktop second. Keep 60 fps on a mid-range phone:
  no per-frame allocations in hot loops, share geometries and materials, prefer InstancedMesh / merged geometry,
  and respect the `Q` quality preset (`low`/`medium`/`high`).
- All UI text in Russian. Original content only: no real brands, games, characters, logos or music.
- Don't break what exists: story missions, driving, police, menus, pause, saves.

## When you finish
Commit your work on your branch with a clear message (do not push, do not commit the root `neon-tide.html`).
Report: branch name and commit hash, what you built, how you tested it (with numbers), known gaps, and any requests
for files you don't own.
