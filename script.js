// script.js
// Full Spanish Checkers logic (Damas) + AI + UI glue
// Assumes index.html contains:
//  - #board (grid of tiles created by initBoard)
//  - #difficulty (select), #restart (button), #human-score, #ai-score
//  - <audio id="move-sound">, <audio id="capture-sound">, <audio id="win-sound">

const SIZE = 8;
const boardEl = document.getElementById('board');
const difficultySel = document.getElementById('difficulty');
const restartBtn = document.getElementById('restart');
const humanScoreEl = document.getElementById('human-score');
const aiScoreEl = document.getElementById('ai-score');

const moveSound = document.getElementById('move-sound');
const captureSound = document.getElementById('capture-sound');
const winSound = document.getElementById('win-sound');

let board = []; // 2D array [r][c] = null or { player: 'human'|'ai', king: bool }
let turn = 'human'; // 'human' or 'ai'
let mode = 'easy'; // difficulty
let selected = null; // {r,c}
let legalTargets = []; // [{r,c,move}] move is full move object
let gameRunning = true;

// UI init: create tile elements once
function createTiles() {
  boardEl.innerHTML = '';
  boardEl.style.gridTemplateColumns = `repeat(${SIZE},1fr)`;
  boardEl.style.gridTemplateRows = `repeat(${SIZE},1fr)`;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const tile = document.createElement('div');
      tile.className = 'tile ' + (((r + c) % 2 === 0) ? 'light' : 'dark');
      tile.dataset.r = r;
      tile.dataset.c = c;
      boardEl.appendChild(tile);
    }
  }
}

// Helper: deep clone board
function cloneBoard(b) {
  return b.map(row => row.map(cell => cell ? { player: cell.player, king: cell.king } : null));
}

// Helpers
function inside(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }

// --- Move generation per Spanish rules ---
// For a given piece at r,c, generate all capture sequences.
// Return array of sequences: { landR, landC, captures: [{r,c,color,isKing}], length, kingsCaptured }
function generateCaptureSequences(r, c, b) {
  const p = b[r][c];
  if (!p) return [];
  const color = p.player;
  const isKing = p.king;
  const sequences = [];

  if (!isKing) {
    // Men: capture forward only (Spanish)
    const dirs = (color === 'human') ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];

    function dfs_m(cr, cc, boardState, accCapt) {
      let foundAny = false;
      for (const [dr, dc] of dirs) {
        const mr = cr + dr, mc = cc + dc;
        const lr = cr + 2 * dr, lc = cc + 2 * dc;
        if (inside(lr, lc)
          && boardState[mr] && boardState[mr][mc]
          && boardState[mr][mc].player !== color
          && !boardState[lr][lc]) {
          // simulate capture (remove captured piece for continuation)
          const nb = cloneBoard(boardState);
          const capturedPiece = nb[mr][mc];
          nb[mr][mc] = null;
          nb[lr][lc] = nb[cr][cc];
          nb[cr][cc] = null;
          const newAcc = accCapt.concat([{ r: mr, c: mc, color: capturedPiece.player, isKing: capturedPiece.king }]);
          const deeper = dfs_m(lr, lc, nb, newAcc);
          if (!deeper.length) {
            sequences.push({
              landR: lr,
              landC: lc,
              captures: newAcc.slice(),
              length: newAcc.length,
              kingsCaptured: newAcc.filter(x => x.isKing).length
            });
          }
          foundAny = true;
        }
      }
      if (!foundAny) return [];
      return [true];
    }

    dfs_m(r, c, b, []);
    return sequences;
  } else {
    // King: flying captures in all directions
    const dirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    function dfs_k(cr, cc, boardState, accCapt) {
      let foundAny = false;
      for (const [dr, dc] of dirs) {
        // Move along diagonal to find opponent piece
        let mr = cr + dr, mc = cc + dc;
        while (inside(mr, mc) && !boardState[mr][mc]) { mr += dr; mc += dc; }
        if (inside(mr, mc) && boardState[mr][mc] && boardState[mr][mc].player !== color) {
          // landing squares beyond (any empty square)
          let lr = mr + dr, lc = mc + dc;
          while (inside(lr, lc) && !boardState[lr][lc]) {
            const nb = cloneBoard(boardState);
            const capturedPiece = nb[mr][mc];
            nb[mr][mc] = null;
            nb[lr][lc] = nb[cr][cc];
            nb[cr][cc] = null;
            const newAcc = accCapt.concat([{ r: mr, c: mc, color: capturedPiece.player, isKing: capturedPiece.king }]);
            const deeper = dfs_k(lr, lc, nb, newAcc);
            if (!deeper.length) {
              sequences.push({
                landR: lr,
                landC: lc,
                captures: newAcc.slice(),
                length: newAcc.length,
                kingsCaptured: newAcc.filter(x => x.isKing).length
              });
            }
            foundAny = true;
            lr += dr; lc += dc;
          }
        }
      }
      if (!foundAny) return [];
      return [true];
    }
    dfs_k(r, c, b, []);
    return sequences;
  }
}

// Non-capture moves for a piece
function generateNonCaptureMoves(r, c, b) {
  const p = b[r][c]; if (!p) return [];
  const res = [];
  if (!p.king) {
    const dirs = (p.player === 'human') ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (inside(nr, nc) && !b[nr][nc]) res.push({ landR: nr, landC: nc });
    }
  } else {
    const dirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [dr, dc] of dirs) {
      let nr = r + dr, nc = c + dc;
      while (inside(nr, nc) && !b[nr][nc]) {
        res.push({ landR: nr, landC: nc });
        nr += dr; nc += dc;
      }
    }
  }
  return res;
}

// Collect ALL legal moves for a color with Spanish precedence
// returns array of move objects:
// { fromR, fromC, toR, toC, isCapture:bool, captures:[{r,c,color,isKing}], length, kingsCaptured }
function collectAllLegalMoves(color, b) {
  const seqs = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const p = b[r][c];
    if (p && p.player === color) {
      const caps = generateCaptureSequences(r, c, b);
      for (const s of caps) {
        seqs.push({
          fromR: r, fromC: c,
          toR: s.landR, toC: s.landC,
          isCapture: true, captures: s.captures.slice(),
          length: s.length, kingsCaptured: s.kingsCaptured
        });
      }
    }
  }
  if (seqs.length > 0) {
    // enforce longest capture, tie-break by kingsCaptured
    const maxLen = Math.max(...seqs.map(x => x.length));
    let cands = seqs.filter(x => x.length === maxLen);
    const maxKings = Math.max(...cands.map(x => x.kingsCaptured));
    cands = cands.filter(x => x.kingsCaptured === maxKings);
    return cands;
  }
  // no captures -> gather normal moves
  const normals = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const p = b[r][c];
    if (p && p.player === color) {
      const nm = generateNonCaptureMoves(r, c, b);
      for (const m of nm) normals.push({
        fromR: r, fromC: c, toR: m.landR, toC: m.landC, isCapture: false, captures: []
      });
    }
  }
  return normals;
}

// Apply a move to a board (in place). Returns metadata { capturedCount, kingsCaptured, promoted }
function applyMove(move, b) {
  const p = b[move.fromR][move.fromC];
  b[move.fromR][move.fromC] = null;
  b[move.toR][move.toC] = { player: p.player, king: p.king };
  let capturedCount = 0, kingsCaptured = 0;
  if (move.isCapture && move.captures && move.captures.length) {
    for (const cap of move.captures) {
      if (b[cap.r] && b[cap.r][cap.c]) {
        // remove if still present
        if (b[cap.r][cap.c].king) kingsCaptured++;
        b[cap.r][cap.c] = null;
        capturedCount++;
      }
    }
  }
  // Promotion on landing
  const promoted = (!p.king) && ((p.player === 'human' && move.toR === 0) || (p.player === 'ai' && move.toR === SIZE - 1));
  if (promoted) b[move.toR][move.toC].king = true;
  return { capturedCount, kingsCaptured, promoted };
}

// UI render
function render() {
  // update tiles
  const tiles = boardEl.querySelectorAll('.tile');
  tiles.forEach(tile => tile.innerHTML = '');
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const idx = r * SIZE + c;
      const tile = tiles[idx];
      tile.classList.toggle('highlight', legalTargets.some(t => t.r === r && t.c === c));
      const p = board[r][c];
      if (p) {
        const piece = document.createElement('div');
        piece.className = 'piece ' + (p.player === 'human' ? 'human' : 'ai') + (p.king ? ' king' : '');
        piece.textContent = p.king ? '👑' : '';
        tile.appendChild(piece);
      }
    }
  }
  updateScore();
  updateStatus();
}

// Update score display
function updateScore() {
  let humanCount = 0, aiCount = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const p = board[r][c];
    if (p) {
      if (p.player === 'human') humanCount++; else aiCount++;
    }
  }
  humanScoreEl.textContent = `You: ${humanCount}`;
  aiScoreEl.textContent = `AI: ${aiCount}`;
}

// Update status text
function updateStatus(msg) {
  const statusEl = document.getElementById('status');
  if (msg) statusEl.textContent = msg;
  else {
    if (!gameRunning) statusEl.textContent = 'Game over';
    else if (turn === 'human') statusEl.textContent = 'Your turn';
    else statusEl.textContent = (mode === 'pvp') ? 'Red to move' : 'Computer thinking...';
  }
}

// Setup initial board state
function initGame() {
  // create empty board
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  // place red (ai) on top 3 rows on dark squares
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < SIZE; c++) {
      if ((r + c) % 2 === 1) board[r][c] = { player: 'ai', king: false };
    }
  }
  // place human on bottom 3 rows
  for (let r = SIZE - 3; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if ((r + c) % 2 === 1) board[r][c] = { player: 'human', king: false };
    }
  }
  turn = 'human';
  selected = null;
  legalTargets = [];
  gameRunning = true;
  render();
  if (mode !== 'pvp' && turn === 'ai') setTimeout(aiTurn, 300);
}

// Event delegation for board clicks
boardEl.addEventListener('click', (ev) => {
  const tile = ev.target.closest('.tile');
  if (!tile) return;
  const r = parseInt(tile.dataset.r, 10), c = parseInt(tile.dataset.c, 10);
  onTileClick(r, c);
});

// Handle tile click (human interaction)
function onTileClick(r, c) {
  if (!gameRunning) return;
  // If PvP and it's red's turn, allow selecting red too; else only human
  if (turn !== 'human' && !(mode === 'pvp' && turn === 'ai')) return;

  const piece = board[r][c];

  // Compute global legal moves for current player
  const allLegal = collectAllLegalMoves(turn, board);
  const hasCapture = allLegal.some(m => m.isCapture);

  // If clicked own piece -> select and show only its moves (and enforce capture requirement)
  if (piece && piece.player === turn) {
    selected = { r, c };
    // filter allLegal for moves from this piece
    const myMoves = allLegal.filter(m => m.fromR === r && m.fromC === c);
    legalTargets = myMoves.map(m => ({ r: m.toR, c: m.toC, move: m }));
    render();
    return;
  }

  // If clicked a legal target tile -> perform that move
  const target = legalTargets.find(t => t.r === r && t.c === c);
  if (target) {
    // play sound when applied below
    const move = target.move;
    // apply move on the real board
    const meta = applyMove(move, board);
    if (move.isCapture) { tryPlay(captureSound); } else { tryPlay(moveSound); }

    // After capture, check for continuation for same piece (must continue if possible)
    if (move.isCapture) {
      // sequences from landing square on current board
      const cont = generateCaptureSequences(move.toR, move.toC, board);
      if (cont.length > 0) {
        // Only allow continuations from the same piece; enforce longest/kings tie-break among those continuations
        // Convert cont to moves
        let contMoves = cont.map(s => ({
          fromR: move.toR, fromC: move.toC, toR: s.landR, toC: s.landC,
          isCapture: true, captures: s.captures.slice(), length: s.length, kingsCaptured: s.kingsCaptured
        }));
        // longest then kings tie-break
        const maxLen = Math.max(...contMoves.map(x => x.length));
        contMoves = contMoves.filter(x => x.length === maxLen);
        const maxK = Math.max(...contMoves.map(x => x.kingsCaptured));
        contMoves = contMoves.filter(x => x.kingsCaptured === maxK);

        // set selected to landing square and show legal continuation targets
        selected = { r: move.toR, c: move.toC };
        legalTargets = contMoves.map(m => ({ r: m.toR, c: m.toC, move: m }));
        render();
        updateScoreAndCheckEnd();
        return; // player must continue
      }
    }

    // No continuation: end player's move
    selected = null; legalTargets = [];
    render();
    updateScoreAndCheckEnd();

    // switch turns
    turn = (turn === 'human') ? 'ai' : 'human';
    updateStatus();

    if (gameRunning && mode !== 'pvp' && turn === 'ai') {
      setTimeout(aiTurn, 350);
    }

    return;
  }

  // clicked elsewhere -> clear selection
  selected = null; legalTargets = [];
  render();
}

// Update score and check end conditions
function updateScoreAndCheckEnd() {
  updateScore();
  // check win/loss: if player has no pieces or no legal moves, they lose
  const humanMoves = collectAllLegalMoves('human', board);
  const aiMoves = collectAllLegalMoves('ai', board);
  const humanPieces = board.flat().filter(p => p && p.player === 'human').length;
  const aiPieces = board.flat().filter(p => p && p.player === 'ai').length;
  if (humanPieces === 0 || humanMoves.length === 0) { gameRunning = false; updateStatus('AI wins!'); tryPlay(winSound); return; }
  if (aiPieces === 0 || aiMoves.length === 0) { gameRunning = false; updateStatus('You win!'); tryPlay(winSound); return; }
}

// Try play sound safely
function tryPlay(audioEl) {
  if (!audioEl) return;
  try { audioEl.currentTime = 0; audioEl.play(); } catch (e) { /* ignore autoplay errors */ }
}

// --- AI logic ---
// Mode easy: random; medium: prefer captures; hard: minimax depth=4
function aiTurn() {
  if (!gameRunning) return;
  updateStatus();
  const legal = collectAllLegalMoves('ai', board);
  if (!legal.length) { gameRunning = false; updateStatus('You win!'); tryPlay(winSound); return; }
  let choice = null;

  if (mode === 'easy') {
    choice = legal[Math.floor(Math.random() * legal.length)];
  } else if (mode === 'medium') {
    const caps = legal.filter(m => m.isCapture);
    if (caps.length > 0) choice = caps[Math.floor(Math.random() * caps.length)];
    else choice = legal[Math.floor(Math.random() * legal.length)];
  } else { // hard
    // minimax root (depth 4)
    const root = minimaxRoot(board, 4);
    choice = root || legal[Math.floor(Math.random() * legal.length)];
  }

  // Apply chosen move
  applyMove(choice, board);
  if (choice.isCapture) tryPlay(captureSound); else tryPlay(moveSound);

  // If capture, AI must continue capturing with same piece until done
  if (choice.isCapture) {
    let curR = choice.toR, curC = choice.toC;
    while (true) {
      const cont = generateCaptureSequences(curR, curC, board);
      if (cont.length === 0) break;
      // choose best continuation: longest then kings tie-break, random among equals
      let maxL = Math.max(...cont.map(s => s.length));
      let cands = cont.filter(s => s.length === maxL);
      let maxK = Math.max(...cands.map(s => s.kingsCaptured));
      cands = cands.filter(s => s.kingsCaptured === maxK);
      const pick = cands[Math.floor(Math.random() * cands.length)];
      const mv = { fromR: curR, fromC: curC, toR: pick.landR, toC: pick.landC, isCapture: true, captures: pick.captures.slice() };
      applyMove(mv, board);
      tryPlay(captureSound);
      curR = mv.toR; curC = mv.toC;
    }
  }

  updateScoreAndCheckEnd();

  // switch back to human
  if (gameRunning) {
    turn = 'human';
    updateStatus();
    render();
  }
  render();
}

// --- Minimax with alpha-beta (used for hard) ---
// Simple evaluation: pawn=3, king=6
function evaluateBoard(b) {
  let score = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const p = b[r][c];
    if (p) {
      const val = p.king ? 6 : 3;
      score += (p.player === 'ai') ? val : -val;
    }
  }
  return score;
}

// Simulate applying move on a cloned board (mutates b)
function simulateApplyMove(move, b) {
  // move might be missing captures field for normals
  if (!move) return;
  // apply
  const p = b[move.fromR][move.fromC];
  b[move.fromR][move.fromC] = null;
  b[move.toR][move.toC] = { player: p.player, king: p.king };
  if (move.isCapture && move.captures) {
    for (const cap of move.captures) {
      if (b[cap.r] && b[cap.r][cap.c]) b[cap.r][cap.c] = null;
    }
  }
  // promotion
  if (!p.king) {
    if (p.player === 'ai' && move.toR === SIZE - 1) b[move.toR][move.toC].king = true;
    if (p.player === 'human' && move.toR === 0) b[move.toR][move.toC].king = true;
  }
}

// Minimax with alpha-beta pruning (maximizing for AI)
function minimax(boardState, depth, alpha, beta, maximizingPlayer) {
  if (depth === 0) return evaluateBoard(boardState);

  const color = maximizingPlayer ? 'ai' : 'human';
  const moves = collectAllLegalMoves(color, boardState);
  if (moves.length === 0) return evaluateBoard(boardState);

  if (maximizingPlayer) {
    let maxEval = -Infinity;
    for (const mv of moves) {
      const nb = cloneBoard(boardState);
      simulateApplyMove(mv, nb);
      // If mv is capture, greedily simulate forced continuations for the same piece (simulate opponent won't change until finish)
      if (mv.isCapture) {
        let curR = mv.toR, curC = mv.toC;
        while (true) {
          const cont = generateCaptureSequences(curR, curC, nb);
          if (cont.length === 0) break;
          // pick one greedy continuation (longest/kings tie-break)
          let maxL = Math.max(...cont.map(s => s.length));
          let cands = cont.filter(s => s.length === maxL);
          let maxK = Math.max(...cands.map(s => s.kingsCaptured));
          cands = cands.filter(s => s.kingsCaptured === maxK);
          const pick = cands[0];
          simulateApplyMove({ fromR: curR, fromC: curC, toR: pick.landR, toC: pick.landC, isCapture: true, captures: pick.captures }, nb);
          curR = pick.landR; curC = pick.landC;
        }
      }
      const evalScore = minimax(nb, depth - 1, alpha, beta, false);
      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const mv of moves) {
      const nb = cloneBoard(boardState);
      simulateApplyMove(mv, nb);
      if (mv.isCapture) {
        let curR = mv.toR, curC = mv.toC;
        while (true) {
          const cont = generateCaptureSequences(curR, curC, nb);
          if (cont.length === 0) break;
          let maxL = Math.max(...cont.map(s => s.length));
          let cands = cont.filter(s => s.length === maxL);
          let maxK = Math.max(...cands.map(s => s.kingsCaptured));
          cands = cands.filter(s => s.kingsCaptured === maxK);
          const pick = cands[0];
          simulateApplyMove({ fromR: curR, fromC: curC, toR: pick.landR, toC: pick.landC, isCapture: true, captures: pick.captures }, nb);
          curR = pick.landR; curC = pick.landC;
        }
      }
      const evalScore = minimax(nb, depth - 1, alpha, beta, true);
      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

// Root wrapper to choose best AI move
function minimaxRoot(boardState, depth) {
  const moves = collectAllLegalMoves('ai', boardState);
  if (moves.length === 0) return null;
  let best = moves[0];
  let bestScore = -Infinity;
  for (const mv of moves) {
    const nb = cloneBoard(boardState);
    simulateApplyMove(mv, nb);
    if (mv.isCapture) {
      let curR = mv.toR, curC = mv.toC;
      while (true) {
        const cont = generateCaptureSequences(curR, curC, nb);
        if (cont.length === 0) break;
        let maxL = Math.max(...cont.map(s => s.length));
        let cands = cont.filter(s => s.length === maxL);
        let maxK = Math.max(...cands.map(s => s.kingsCaptured));
        cands = cands.filter(s => s.kingsCaptured === maxK);
        const pick = cands[0];
        simulateApplyMove({ fromR: curR, fromC: curC, toR: pick.landR, toC: pick.landC, isCapture: true, captures: pick.captures }, nb);
        curR = pick.landR; curC = pick.landC;
      }
    }
    const score = minimax(nb, depth - 1, -Infinity, Infinity, false);
    if (score > bestScore) { bestScore = score; best = mv; }
  }
  return best;
}

// Bind controls
difficultySel.addEventListener('change', (e) => { mode = e.target.value; });
restartBtn.addEventListener('click', () => { initGame(); });

// Create tiles and start
createTiles();
initGame();

// Initial render done by initGame
