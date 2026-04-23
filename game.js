/**
 * Komunikační Spojovatel PEF — game.js
 * Pure vanilla JS, ES module, no external dependencies.
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const LOCAL_PB_KEY     = 'pef_game_local_pb';
const LOCAL_SCORES_KEY = 'pef_game_local_scores';
const GRID_SIZE    = 10;
const SECRET       = 'PEF_SECRET_2024';

const isFileProtocol = location.protocol === 'file:';
const API_BASE       = isFileProtocol ? 'http://localhost:8080/api/' : 'api/';

const SVG_NS   = 'http://www.w3.org/2000/svg';
const VIEWBOX  = 84;
const MID      = VIEWBOX / 2; // 42 — midpoint of each edge / center

// ─── Tile logic ────────────────────────────────────────────────────────────────

/**
 * Returns a Set of open port directions for a given tile type + rotation.
 * Rotations 0–3 represent 0°/90°/180°/270° clockwise.
 * @param {'straight'|'elbow'|'cross'} type
 * @param {0|1|2|3} rotation
 * @returns {Set<'N'|'E'|'S'|'W'>}
 */
function getOpenPorts(type, rotation) {
  const DIRS = ['N', 'E', 'S', 'W'];
  const rotatePorts = (ports, steps) =>
    new Set([...ports].map(p => DIRS[(DIRS.indexOf(p) + steps) % 4]));

  switch (type) {
    case 'straight': return rotatePorts(new Set(['N', 'S']), rotation);
    case 'elbow':    return rotatePorts(new Set(['N', 'E']), rotation);
    case 'cross':    return new Set(['N', 'E', 'S', 'W']);
    default:         return new Set();
  }
}

/**
 * BFS: returns true if [0][0] is connected to [4][4] through matching ports.
 * @param {Array<Array<{type:string,rotation:number}>>} grid
 * @returns {boolean}
 */
function checkConnection(grid) {
  const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };
  const DELTA    = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };
  const visited  = Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill(false));
  const queue    = [[0, 0]];
  visited[0][0]  = true;

  while (queue.length) {
    const [r, c] = queue.shift();
    if (r === GRID_SIZE - 1 && c === GRID_SIZE - 1) return true;

    for (const dir of getOpenPorts(grid[r][c].type, grid[r][c].rotation)) {
      const [dr, dc] = DELTA[dir];
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      if (visited[nr][nc]) continue;
      if (getOpenPorts(grid[nr][nc].type, grid[nr][nc].rotation).has(OPPOSITE[dir])) {
        visited[nr][nc] = true;
        queue.push([nr, nc]);
      }
    }
  }
  return false;
}

/**
 * BFS: returns a Set of "r,c" keys reachable from [0][0] via matching ports.
 * Used to highlight all tiles on the connected component.
 * @param {Array<Array<{type:string,rotation:number}>>} grid
 * @returns {Set<string>}
 */
function getConnectedCells(grid) {
  const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };
  const DELTA    = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };
  const visited  = Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill(false));
  const queue    = [[0, 0]];
  const cells    = new Set(['0,0']);
  visited[0][0]  = true;

  while (queue.length) {
    const [r, c] = queue.shift();
    for (const dir of getOpenPorts(grid[r][c].type, grid[r][c].rotation)) {
      const [dr, dc] = DELTA[dir];
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      if (visited[nr][nc]) continue;
      if (getOpenPorts(grid[nr][nc].type, grid[nr][nc].rotation).has(OPPOSITE[dir])) {
        visited[nr][nc] = true;
        cells.add(`${nr},${nc}`);
        queue.push([nr, nc]);
      }
    }
  }
  return cells;
}

// ─── Tile SVG rendering ────────────────────────────────────────────────────────

/**
 * Creates an SVG element depicting a tile type at rotation 0.
 * CSS transforms on the wrapper handle visual rotation.
 * @param {'straight'|'elbow'|'cross'} type
 * @returns {SVGSVGElement}
 */
function createTileSVG(type) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VIEWBOX} ${VIEWBOX}`);
  svg.setAttribute('xmlns', SVG_NS);
  svg.classList.add('tile-svg');

  const STROKE       = 'var(--color-tile)';
  const STROKE_WIDTH = '8';
  const CAP          = 'round';

  function line(x1, y1, x2, y2) {
    const el = document.createElementNS(SVG_NS, 'line');
    el.setAttribute('x1', x1);   el.setAttribute('y1', y1);
    el.setAttribute('x2', x2);   el.setAttribute('y2', y2);
    el.setAttribute('stroke', STROKE);
    el.setAttribute('stroke-width', STROKE_WIDTH);
    el.setAttribute('stroke-linecap', CAP);
    return el;
  }

  function path(d) {
    const el = document.createElementNS(SVG_NS, 'path');
    el.setAttribute('d', d);
    el.setAttribute('stroke', STROKE);
    el.setAttribute('stroke-width', STROKE_WIDTH);
    el.setAttribute('stroke-linecap', CAP);
    el.setAttribute('fill', 'none');
    return el;
  }

  function dot() {
    const el = document.createElementNS(SVG_NS, 'circle');
    el.setAttribute('cx', MID);
    el.setAttribute('cy', MID);
    el.setAttribute('r', '5');
    el.setAttribute('fill', STROKE);
    return el;
  }

  switch (type) {
    case 'straight':
      // Vertical line from top-center to bottom-center (rotation 0 → N+S)
      svg.appendChild(line(MID, 0, MID, VIEWBOX));
      svg.appendChild(dot());
      break;

    case 'elbow':
      // At rotation 0: N+E open → curve from top-center to right-center
      // Cubic bezier: start at top-mid, end at right-mid, pulled through center quadrant
      svg.appendChild(path(`M ${MID} 0 C ${MID} ${MID}, ${MID} ${MID}, ${VIEWBOX} ${MID}`));
      svg.appendChild(dot());
      break;

    case 'cross':
      // Both vertical and horizontal lines through center
      svg.appendChild(line(MID, 0, MID, VIEWBOX));
      svg.appendChild(line(0, MID, VIEWBOX, MID));
      svg.appendChild(dot());
      break;
  }

  return svg;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m        = Math.floor(totalSec / 60);
  const s        = totalSec % 60;
  const msRem    = ms % 1000;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(msRem).padStart(3, '0')}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const VALID_TYPES = new Set(['straight', 'elbow', 'cross']);

function normalizeLayout(layout) {
  return layout.map(row =>
    row.map(cell => {
      const type     = cell.type || cell.tile_type || 'straight';
      const rotation = Number(cell.rotation ?? cell.rot ?? 0) % 4;
      return { type: VALID_TYPES.has(type) ? type : 'straight', rotation };
    })
  );
}

// ─── Crypto hash ──────────────────────────────────────────────────────────────

async function computeHash(instanceId, finalTime) {
  const msg = String(instanceId) + String(finalTime) + SECRET;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Local best time ──────────────────────────────────────────────────────────

function getLocalPB() {
  try {
    const raw = localStorage.getItem(LOCAL_PB_KEY);
    return raw !== null ? parseInt(raw, 10) : null;
  } catch { return null; }
}

/** Saves ms if it's a new best. Returns true if new record was set. */
function maybeSetLocalPB(ms) {
  try {
    const cur = getLocalPB();
    if (cur === null || ms < cur) {
      localStorage.setItem(LOCAL_PB_KEY, String(ms));
      return true;
    }
    return false;
  } catch { return false; }
}

function getLocalScores() {
  try {
    const raw = localStorage.getItem(LOCAL_SCORES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLocalScore(playerName, ms) {
  try {
    const scores = getLocalScores();
    scores.push({ player_name: playerName, final_time: ms, created_at: new Date().toISOString() });
    scores.sort((a, b) => a.final_time - b.final_time);
    localStorage.setItem(LOCAL_SCORES_KEY, JSON.stringify(scores.slice(0, 50)));
  } catch { /* storage unavailable */ }
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function apiInitGame(playerName) {
  const res = await fetch(API_BASE + 'init_game.php', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ player_name: playerName }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiSaveScore(instanceId, finalTime, playerName, verificationHash) {
  const res = await fetch(API_BASE + 'save_score.php', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      instance_id:       instanceId,
      final_time:        finalTime,
      player_name:       playerName,
      verification_hash: verificationHash,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiLeaderboard() {
  const res = await fetch(API_BASE + 'leaderboard.php');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const el = id => document.getElementById(id);

const screenIntro        = el('screen-intro');
const screenGame         = el('screen-game');
const overlayWin         = el('overlay-win');
const overlayLeaderboard = el('overlay-leaderboard');
const overlayError       = el('overlay-error');  // kept for future use

const playerNameInput    = el('player-name');
const btnStart           = el('btn-start');
const introError         = el('intro-error');
const localPbIntro       = el('local-pb-intro');

const timerDisplay       = el('timer-display');
const localPbHeader      = el('local-pb-header');
const btnNewGameHeader   = el('btn-new-game-header');

const gridEl             = el('grid');

const winTimeDisplay     = el('win-time-display');
const winNewPb           = el('win-new-pb');
const btnSubmitScore     = el('btn-submit-score');
const submitError        = el('submit-error');
const btnNewGameWin      = el('btn-new-game-win');

const lbBody             = el('lb-body');
const lbEmpty            = el('lb-empty');
const lbOffline          = el('lb-offline');
const lbYourPosition     = el('lb-your-position');
const lbLocalSection     = el('lb-local-section');
const lbServerLabel      = el('lb-server-label');
const btnNewGameLb       = el('btn-new-game-lb');
const btnShowLb          = el('btn-show-lb');

const errMessage         = el('err-message');
const btnErrRetry        = el('btn-err-retry');
const btnErrNew          = el('btn-err-new');

// ─── Game state ───────────────────────────────────────────────────────────────

const state = {
  playerName:  '',
  instanceId:  null,
  grid:        null,
  cellEls:     null,
  timerStart:  null,
  timerRaf:    null,
  finalTimeMs: null,
  won:         false,
  offline:     false,
};

// ─── Screen / overlay management ──────────────────────────────────────────────

function showScreen(screen) {
  [screenIntro, screenGame].forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

function showOverlay(overlay) {
  [overlayWin, overlayLeaderboard, overlayError].forEach(o => o.classList.add('hidden'));
  overlay.classList.remove('hidden');
}

function hideAllOverlays() {
  [overlayWin, overlayLeaderboard, overlayError].forEach(o => o.classList.add('hidden'));
}

// ─── Timer ────────────────────────────────────────────────────────────────────

function timerTick() {
  if (!state.timerStart || state.won) return;
  timerDisplay.textContent = formatTime(Date.now() - state.timerStart);
  state.timerRaf = requestAnimationFrame(timerTick);
}

function startTimer() {
  if (state.timerRaf) cancelAnimationFrame(state.timerRaf);
  state.timerStart = Date.now();
  state.won        = false;
  timerDisplay.textContent = '00:00.000';
  state.timerRaf   = requestAnimationFrame(timerTick);
}

function stopTimer() {
  if (state.timerRaf) { cancelAnimationFrame(state.timerRaf); state.timerRaf = null; }
  const elapsed    = Date.now() - state.timerStart;
  state.finalTimeMs = elapsed;
  timerDisplay.textContent = formatTime(elapsed);
  return elapsed;
}

// ─── Grid rendering ────────────────────────────────────────────────────────────

function renderGrid() {
  gridEl.innerHTML = '';
  state.cellEls = Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE));

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const cell = document.createElement('div');
      cell.classList.add('cell');
      cell.setAttribute('role', 'button');
      cell.setAttribute('tabindex', '0');
      cell.setAttribute('aria-label', `Dlaždice řada ${r + 1}, sloupec ${c + 1}`);
      cell.dataset.r = r;
      cell.dataset.c = c;

      // Special corner cells
      if (r === 0 && c === 0) {
        cell.classList.add('cell-start');
        const lbl = document.createElement('span');
        lbl.classList.add('cell-label');
        lbl.textContent = 'START';
        cell.appendChild(lbl);
      } else if (r === GRID_SIZE - 1 && c === GRID_SIZE - 1) {
        cell.classList.add('cell-goal');
        const lbl = document.createElement('span');
        lbl.classList.add('cell-label');
        lbl.textContent = 'CÍL';
        cell.appendChild(lbl);
      }

      // Tile SVG wrapper — rotation applied via CSS data-rotation attribute
      const wrap = document.createElement('div');
      wrap.classList.add('tile-svg-wrap');
      wrap.dataset.rotation = state.grid[r][c].rotation;
      wrap.appendChild(createTileSVG(state.grid[r][c].type));
      cell.appendChild(wrap);

      cell.addEventListener('click', () => onCellClick(r, c));
      cell.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCellClick(r, c); }
      });

      gridEl.appendChild(cell);
      state.cellEls[r][c] = cell;
    }
  }

  updateConnectedHighlight();
}

function updateConnectedHighlight() {
  const connected = getConnectedCells(state.grid);
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      state.cellEls[r][c].classList.toggle('cell-connected', connected.has(`${r},${c}`));
    }
  }
}

// ─── Cell click ───────────────────────────────────────────────────────────────

function onCellClick(r, c) {
  if (state.won) return;
  // Start and goal are fixed — no rotation needed
  if ((r === 0 && c === 0) || (r === GRID_SIZE - 1 && c === GRID_SIZE - 1)) return;
  const tile     = state.grid[r][c];
  tile.rotation  = (tile.rotation + 1) % 4;

  const wrap = state.cellEls[r][c].querySelector('.tile-svg-wrap');
  wrap.dataset.rotation = tile.rotation;

  updateConnectedHighlight();

  if (checkConnection(state.grid)) onWin();
}

// ─── Win ──────────────────────────────────────────────────────────────────────

function onWin() {
  state.won = true;
  const elapsed = stopTimer();

  winTimeDisplay.textContent = formatTime(elapsed);
  submitError.classList.add('hidden');
  winNewPb.classList.add('hidden');

  saveLocalScore(state.playerName, elapsed);
  const isNewPb = maybeSetLocalPB(elapsed);
  if (isNewPb) {
    winNewPb.classList.remove('hidden');
    updateLocalPbUI();
  }

  const offlineNote = el('win-offline-note');
  if (state.offline) {
    btnSubmitScore.disabled = true;
    btnSubmitScore.innerHTML = 'Odeslat skóre';
    offlineNote.classList.remove('hidden');
  } else {
    btnSubmitScore.disabled = false;
    btnSubmitScore.innerHTML = 'Odeslat skóre';
    offlineNote.classList.add('hidden');
  }
  showOverlay(overlayWin);
}

// ─── Submit score ──────────────────────────────────────────────────────────────

async function handleSubmitScore() {
  if (btnSubmitScore.disabled) return;
  btnSubmitScore.disabled = true;
  btnSubmitScore.innerHTML = '<span class="spinner"></span>Odesílám…';
  submitError.classList.add('hidden');

  try {
    const hash   = await computeHash(state.instanceId, state.finalTimeMs);
    const result = await apiSaveScore(
      state.instanceId, state.finalTimeMs, state.playerName, hash
    );
    await showLeaderboard(result, false);
  } catch (err) {
    console.warn('Save score failed:', err);
    // Offline fallback: still show leaderboard screen (offline notice)
    await showLeaderboard(null, true);
  }
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

async function showLeaderboard(saveResult, offline) {
  lbEmpty.classList.add('hidden');
  lbOffline.classList.add('hidden');
  lbYourPosition.classList.add('hidden');
  lbLocalSection.classList.add('hidden');
  lbServerLabel.classList.add('hidden');
  lbBody.innerHTML = '';
  showOverlay(overlayLeaderboard);

  // Show all local scores
  const localScores = getLocalScores();
  lbLocalSection.innerHTML = '';
  if (localScores.length > 0) {
    const header = document.createElement('div');
    header.className = 'lb-local-header';
    header.textContent = 'Lokální výsledky';
    lbLocalSection.appendChild(header);

    localScores.forEach((row, idx) => {
      const entry = document.createElement('div');
      entry.className = 'lb-local-row';
      const date = new Date(row.created_at).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
      entry.innerHTML = `
        <span class="lb-local-rank">${idx + 1}.</span>
        <span class="lb-local-badge">Lokální</span>
        <span class="lb-local-name">${escapeHtml(row.player_name)}</span>
        <span class="lb-local-time">${formatTime(row.final_time)}</span>
        <span class="lb-local-date">${escapeHtml(date)}</span>`;
      lbLocalSection.appendChild(entry);
    });
    lbLocalSection.classList.remove('hidden');
  }

  if (offline) {
    lbOffline.classList.remove('hidden');
    return;
  }

  lbServerLabel.classList.remove('hidden');

  try {
    const data = await apiLeaderboard();
    // Accept various server response shapes
    const rows = Array.isArray(data)
      ? data
      : (data.rows || data.leaderboard || data.scores || []);

    if (rows.length === 0) {
      lbEmpty.classList.remove('hidden');
      return;
    }

    const MEDALS = ['', '🥇', '🥈', '🥉'];

    rows.slice(0, 10).forEach((row, idx) => {
      const rank = idx + 1;
      const tr   = document.createElement('tr');

      if (rank <= 3) tr.classList.add(`rank-${rank}`);

      // Highlight the row belonging to the current submission
      const isYou = saveResult && (
        (saveResult.instance_id != null && row.instance_id == saveResult.instance_id) ||
        (saveResult.rank != null && rank === saveResult.rank)
      );
      if (isYou) {
        tr.classList.add('lb-highlight');
        lbYourPosition.textContent = `Vaše umístění: #${rank}`;
        lbYourPosition.classList.remove('hidden');
      }

      const medal = MEDALS[rank] || '';
      const rawDate = row.created_at || row.date || null;
      const date  = rawDate
        ? new Date(rawDate).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '—';
      const timeMs = row.final_time ?? row.time_ms ?? null;

      tr.innerHTML = `
        <td><span class="lb-rank-medal">${medal}</span>${rank}.</td>
        <td>${escapeHtml(row.player_name || row.name || '—')}</td>
        <td style="font-family:var(--font-mono)">${timeMs !== null ? formatTime(Number(timeMs)) : '—'}</td>
        <td>${escapeHtml(date)}</td>
      `;
      lbBody.appendChild(tr);
    });
  } catch (err) {
    console.warn('Leaderboard failed:', err);
    lbOffline.classList.remove('hidden');
  }
}

// ─── Local PB UI ──────────────────────────────────────────────────────────────

function updateLocalPbUI() {
  const pb = getLocalPB();
  if (pb !== null) {
    const fmt = formatTime(pb);
    localPbIntro.textContent = `Váš nejlepší čas (lokálně): ${fmt}`;
    localPbIntro.classList.remove('hidden');
    localPbHeader.textContent = `PB: ${fmt}`;
    localPbHeader.classList.remove('hidden');
  } else {
    localPbIntro.classList.add('hidden');
    localPbHeader.classList.add('hidden');
  }
}

// ─── Local puzzle generator ───────────────────────────────────────────────────

function generateLocalLayout() {
  const TILE_TYPES = ['straight', 'elbow', 'cross'];
  const DIRS = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] };
  const goal = [GRID_SIZE - 1, GRID_SIZE - 1];

  function dfs(path, visited) {
    const [r, c] = path[path.length - 1];
    if (r === goal[0] && c === goal[1]) return true;

    const dirs = ['N', 'E', 'S', 'W'].sort(() => Math.random() - 0.5);
    dirs.sort((a, b) => {
      const [dra, dca] = DIRS[a], [drb, dcb] = DIRS[b];
      return (Math.abs(r + dra - goal[0]) + Math.abs(c + dca - goal[1]))
           - (Math.abs(r + drb - goal[0]) + Math.abs(c + dcb - goal[1]));
    });

    for (const dir of dirs) {
      const [dr, dc] = DIRS[dir];
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      const key = `${nr},${nc}`;
      if (visited.has(key)) continue;
      visited.add(key);
      path.push([nr, nc]);
      if (dfs(path, visited)) return true;
      path.pop();
      visited.delete(key);
    }
    return false;
  }

  let path = [[0, 0]];
  for (let attempt = 0; attempt < 200; attempt++) {
    path = [[0, 0]];
    const visited = new Set(['0,0']);
    if (dfs(path, visited)) break;
  }

  // Build index: "r,c" → position in path
  const pathIndex = new Map();
  path.forEach(([r, c], i) => pathIndex.set(`${r},${c}`, i));

  // Collect open ports for each path cell
  const pathPorts = new Map();
  path.forEach(([r, c], i) => {
    const ports = [];
    for (const [dir, [dr, dc]] of Object.entries(DIRS)) {
      const key = `${r + dr},${c + dc}`;
      if (pathIndex.has(key)) {
        const ni = pathIndex.get(key);
        if (ni === i - 1 || ni === i + 1) ports.push(dir);
      }
    }
    pathPorts.set(`${r},${c}`, ports);
  });

  function tileForPorts(ports) {
    if (ports.length >= 3) return { type: 'cross', rotation: 0 };
    if (ports.length === 2) {
      const s = [...ports].sort().join('+');
      if (s === 'N+S') return { type: 'straight', rotation: 0 };
      if (s === 'E+W') return { type: 'straight', rotation: 1 };
      if (s === 'E+N') return { type: 'elbow',    rotation: 0 };
      if (s === 'E+S') return { type: 'elbow',    rotation: 1 };
      if (s === 'S+W') return { type: 'elbow',    rotation: 2 };
      if (s === 'N+W') return { type: 'elbow',    rotation: 3 };
    }
    // 1 port — start / end cell
    const map = { N: 3, E: 0, S: 1, W: 2 };
    return { type: 'elbow', rotation: map[ports[0]] ?? 0 };
  }

  const grid = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    const row = [];
    for (let c = 0; c < GRID_SIZE; c++) {
      const isEndpoint = (r === 0 && c === 0) || (r === GRID_SIZE - 1 && c === GRID_SIZE - 1);
      if (isEndpoint) {
        row.push({ type: 'cross', rotation: 0 });
        continue;
      }
      const key = `${r},${c}`;
      let type, correctRotation;
      if (pathIndex.has(key)) {
        ({ type, rotation: correctRotation } = tileForPorts(pathPorts.get(key)));
      } else {
        type = TILE_TYPES[Math.floor(Math.random() * TILE_TYPES.length)];
        correctRotation = Math.floor(Math.random() * 4);
      }
      const rotation = (correctRotation + Math.floor(Math.random() * 4)) % 4;
      row.push({ type, rotation });
    }
    grid.push(row);
  }

  return grid;
}

// ─── Start game ────────────────────────────────────────────────────────────────

async function startGame() {
  const name = playerNameInput.value.trim();
  if (!name) return;

  state.playerName = name;
  btnStart.disabled = true;
  btnStart.innerHTML = '<span class="spinner"></span>Připojuji…';
  introError.classList.add('hidden');

  try {
    // Pokus o serverovou hru
    try {
      const data = await apiInitGame(name);
      if (!data || !data.layout || data.instance_id == null) {
        throw new Error('Neplatná odpověď serveru.');
      }
      state.instanceId = data.instance_id;
      state.grid       = normalizeLayout(data.layout);
      state.offline    = false;
    } catch {
      // Server nedostupný → offline generátor
      state.instanceId = null;
      state.grid       = generateLocalLayout();
      state.offline    = true;
    }

    state.won         = false;
    state.finalTimeMs = null;
    showScreen(screenGame);
    el('offline-banner').classList.toggle('hidden', !state.offline);
    renderGrid();
    updateLocalPbUI();
    startTimer();
  } catch (err) {
    // Kritická chyba (např. v generateLocalLayout nebo renderGrid)
    console.error('Nepodařilo se spustit hru:', err);
    btnStart.disabled = false;
    btnStart.innerHTML = 'Spustit hru';
    introError.textContent = 'Hru se nepodařilo spustit. Zkuste to znovu.';
    introError.classList.remove('hidden');
  }
}

// ─── New game / reset ─────────────────────────────────────────────────────────

function resetToIntro() {
  if (state.timerRaf) { cancelAnimationFrame(state.timerRaf); state.timerRaf = null; }
  state.won        = false;
  state.grid       = null;
  state.instanceId = null;
  state.finalTimeMs= null;
  state.offline    = false;

  hideAllOverlays();
  gridEl.innerHTML = '';
  timerDisplay.textContent = '00:00.000';
  playerNameInput.value    = '';
  btnStart.disabled        = true;
  btnStart.innerHTML       = 'Spustit hru';
  introError.classList.add('hidden');
  submitError.classList.add('hidden');

  updateLocalPbUI();
  showScreen(screenIntro);
  playerNameInput.focus();
}

// ─── Event listeners ──────────────────────────────────────────────────────────

playerNameInput.addEventListener('input', () => {
  btnStart.disabled = playerNameInput.value.trim().length === 0;
});
playerNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !btnStart.disabled) startGame();
});
btnStart.addEventListener('click', startGame);

btnNewGameHeader.addEventListener('click', resetToIntro);

btnSubmitScore.addEventListener('click', handleSubmitScore);
btnNewGameWin.addEventListener('click', resetToIntro);

btnNewGameLb.addEventListener('click', resetToIntro);

btnShowLb.addEventListener('click', () => showLeaderboard(null, false));

btnErrRetry.addEventListener('click', () => {
  hideAllOverlays();
  if (state.finalTimeMs !== null) handleSubmitScore();
});
btnErrNew.addEventListener('click', resetToIntro);

// ─── Boot ─────────────────────────────────────────────────────────────────────

updateLocalPbUI();
playerNameInput.focus();
