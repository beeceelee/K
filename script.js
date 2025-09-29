// script.js — Single-player Spanish-style checkers with AI (easy/medium/hard)

const SIZE = 8;
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const scoreEl = document.getElementById('score');
const restartBtn = document.getElementById('restart');
const difficultySel = document.getElementById('difficulty');

const moveSound = document.getElementById('moveSound');
const captureSound = document.getElementById('captureSound');
const winSound = document.getElementById('winSound');

let board = []; // [r][c] = { player: 'blue'|'red', king: bool } or null
let turn = 'blue'; // human = blue (bottom), AI = red (top)
let selected = null; // {r,c}
let legalTargets = []; // [{r,c,move}]
let gameRunning = true;
let mode = 'medium';

// Helper: deep clone board
const cloneBoard = b => b.map(row => row.map(cell => cell ? { player: cell.player, king: cell.king } : null));

// Helpers
const inside = (r,c) => r>=0 && r<SIZE && c>=0 && c<SIZE;
const tryPlay = (a) => { if(!a) return; try{ a.currentTime=0; a.play(); }catch(e){} };

// --- Move generation (Spanish rules) ---
// For a piece at (r,c), generate capture sequences (for men: forward-only captures; for kings: flying captures).
// Returns sequences: { landR, landC, captures:[{r,c,isKing,player}], length, kingsCaptured }
function generateCaptureSequences(r,c,b){
  const p = b[r][c];
  if(!p) return [];
  const color = p.player;
  const isKing = p.king;
  const seqs = [];

  if(!isKing){
    // men: forward capture only
    const dirs = color==='blue' ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
    function dfs(cr,cc,boardState,acc){
      let found=false;
      for(const [dr,dc] of dirs){
        const mr=cr+dr, mc=cc+dc, lr=cr+2*dr, lc=cc+2*dc;
        if(inside(lr,lc) && boardState[mr]?.[mc] && boardState[mr][mc].player!==color && !boardState[lr][lc]){
          const nb = cloneBoard(boardState);
          const capPiece = nb[mr][mc];
          nb[mr][mc] = null;
          nb[lr][lc] = nb[cr][cc];
          nb[cr][cc] = null;
          const newAcc = acc.concat([{r:mr,c:mc,isKing:capPiece.king,player:capPiece.player}]);
          const deeper = dfs(lr,lc,nb,newAcc);
          if(!deeper.length){
            seqs.push({landR:lr,landC:lc,captures:newAcc.slice(),length:newAcc.length,kingsCaptured:newAcc.filter(x=>x.isKing).length});
          }
          found=true;
        }
      }
      if(!found) return [];
      return [true];
    }
    dfs(r,c,b,[]);
    return seqs;
  } else {
    // king: flying captures any dir
    const dirs = [[1,1],[1,-1],[-1,1],[-1,-1]];
    function dfsK(cr,cc,boardState,acc){
      let found=false;
      for(const [dr,dc] of dirs){
        let mr=cr+dr, mc=cc+dc;
        while(inside(mr,mc) && !boardState[mr][mc]) { mr+=dr; mc+=dc; }
        if(inside(mr,mc) && boardState[mr][mc] && boardState[mr][mc].player!==color){
          let lr=mr+dr, lc=mc+dc;
          while(inside(lr,lc) && !boardState[lr][lc]){
            const nb = cloneBoard(boardState);
            const capPiece = nb[mr][mc];
            nb[mr][mc] = null;
            nb[lr][lc] = nb[cr][cc];
            nb[cr][cc] = null;
            const newAcc = acc.concat([{r:mr,c:mc,isKing:capPiece.king,player:capPiece.player}]);
            const deeper = dfsK(lr,lc,nb,newAcc);
            if(!deeper.length){
              seqs.push({landR:lr,landC:lc,captures:newAcc.slice(),length:newAcc.length,kingsCaptured:newAcc.filter(x=>x.isKing).length});
            }
            found=true;
            lr+=dr; lc+=dc;
          }
        }
      }
      if(!found) return [];
      return [true];
    }
    dfsK(r,c,b,[]);
    return seqs;
  }
}

// Non-capture moves for piece at r,c
function generateNonCaptureMoves(r,c,b){
  const p=b[r][c]; if(!p) return [];
  const res=[];
  if(!p.king){
    const dirs = p.player==='blue' ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
    for(const [dr,dc] of dirs){
      const nr=r+dr, nc=c+dc;
      if(inside(nr,nc) && !b[nr][nc]) res.push({r:nr,c:nc});
    }
  } else {
    const dirs = [[1,1],[1,-1],[-1,1],[-1,-1]];
    for(const [dr,dc] of dirs){
      let nr=r+dr,nc=c+dc;
      while(inside(nr,nc) && !b[nr][nc]){
        res.push({r:nr,c:nc});
        nr+=dr; nc+=dc;
      }
    }
  }
  return res;
}

// Collect all legal moves for a player with Spanish precedence (longest capture, then more kings)
function collectAllLegalMoves(player, b){
  const caps=[];
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){
    const p=b[r][c];
    if(p && p.player===player){
      const seq = generateCaptureSequences(r,c,b);
      for(const s of seq) caps.push({fromR:r,fromC:c,toR:s.landR,toC:s.landC,isCapture:true,captures:s.captures.slice(),length:s.length,kingsCaptured:s.kingsCaptured});
    }
  }
  if(caps.length>0){
    const maxLen = Math.max(...caps.map(x=>x.length));
    let cands = caps.filter(x=>x.length===maxLen);
    const maxK = Math.max(...cands.map(x=>x.kingsCaptured));
    cands = cands.filter(x=>x.kingsCaptured===maxK);
    return cands;
  }
  const normals=[];
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){
    const p=b[r][c];
    if(p && p.player===player){
      for(const m of generateNonCaptureMoves(r,c,b)) normals.push({fromR:r,fromC:c,toR:m.r,toC:m.c,isCapture:false,captures:[]});
    }
  }
  return normals;
}

// Apply move (mutates board), returns {capturedCount, promoted}
function applyMove(move,b){
  const p=b[move.fromR][move.fromC];
  b[move.fromR][move.fromC]=null;
  b[move.toR][move.toC]= { player: p.player, king: p.king };
  let captured=0;
  if(move.isCapture && move.captures && move.captures.length){
    for(const cap of move.captures){
      if(b[cap.r] && b[cap.r][cap.c]){ if(b[cap.r][cap.c].king){} b[cap.r][cap.c]=null; captured++; }
    }
  }
  // promotion
  if(!p.king){
    if(p.player==='blue' && move.toR===0) b[move.toR][move.toC].king=true;
    if(p.player==='red' && move.toR===SIZE-1) b[move.toR][move.toC].king=true;
  }
  return {captured, promoted: b[move.toR][move.toC].king && !p.king};
}

// --- UI render ---
function render(){
  boardEl.innerHTML='';
  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      const tile = document.createElement('div');
      tile.className = 'tile ' + ((r+c)%2 ? 'dark' : 'light');
      tile.dataset.r = r; tile.dataset.c = c;
      tile.addEventListener('click', ()=>onTileClick(r,c));
      // highlight
      if(legalTargets.some(t=>t.r===r && t.c===c)) tile.classList.add('highlight');
      const p = board[r][c];
      if(p){
        const pc = document.createElement('div');
        pc.className = 'piece ' + (p.player==='blue' ? 'blue' : 'red') + (p.king ? ' king' : '');
        pc.textContent = p.king ? '◈' : '';
        tile.appendChild(pc);
      }
      boardEl.appendChild(tile);
    }
  }
  updateScoreStatus();
}

// update score + status text
function updateScoreStatus(msg){
  const flat = board.flat();
  const blue = flat.filter(x=>x && x.player==='blue').length;
  const red = flat.filter(x=>x && x.player==='red').length;
  scoreEl.textContent = `Blue:${blue} • Red:${red}`;
  if(msg) statusEl.textContent = msg;
  else if(!gameRunning) statusEl.textContent = 'Game over';
  else statusEl.textContent = (turn==='blue') ? 'Your turn' : 'Computer thinking...';
}

// --- Game init ---
function initGame(){
  board = Array.from({length:SIZE}, ()=> Array(SIZE).fill(null));
  for(let r=0;r<3;r++) for(let c=0;c<SIZE;c++) if((r+c)%2===1) board[r][c]={player:'red', king:false};
  for(let r=SIZE-3;r<SIZE;r++) for(let c=0;c<SIZE;c++) if((r+c)%2===1) board[r][c]={player:'blue', king:false};
  turn='blue'; selected=null; legalTargets=[]; gameRunning=true;
  render();
}

// Tile click handler (human)
function onTileClick(r,c){
  if(!gameRunning || turn!=='blue') return;
  const p = board[r][c];
  const allLegal = collectAllLegalMoves('blue', board);
  const hasCapture = allLegal.some(m=>m.isCapture);

  if(p && p.player==='blue'){
    selected={r,c};
    // show only moves for this piece, respecting global capture precedence
    const myMoves = allLegal.filter(m=>m.fromR===r && m.fromC===c);
    legalTargets = myMoves.map(m=>({r:m.toR,c:m.toC,move:m}));
    render();
    return;
  }

  if(selected){
    const target = legalTargets.find(t=>t.r===r && t.c===c);
    if(target){
      const move = target.move;
      const meta = applyMove(move, board);
      tryPlay(move.isCapture ? captureSound : moveSound);

      // If capture, check forced continuations for the SAME piece
      if(move.isCapture){
        const cont = generateCaptureSequences(move.toR, move.toC, board);
        if(cont.length>0){
          // enforce longest/kings precedence on continuation
          let maxL = Math.max(...cont.map(s=>s.length));
          let cands = cont.filter(s=>s.length===maxL);
          let maxK = Math.max(...cands.map(s=>s.kingsCaptured));
          cands = cands.filter(s=>s.kingsCaptured===maxK);
          legalTargets = cands.map(s=>({r:s.landR,c:s.landC,move:{fromR:move.toR,fromC:move.toC,toR:s.landR,toC:s.landC,isCapture:true,captures:s.captures}}));
          selected={r:move.toR,c:move.toC};
          render();
          return; // player continues
        }
      }

      // end human move
      selected=null; legalTargets=[]; render();
      // switch to AI
      turn='red';
      updateScoreStatus();
      setTimeout(aiMove, 350);
    }
  }
}

// --- AI logic ---
// Easy: random; Medium: prefer captures; Hard: minimax depth 4
difficultySel.addEventListener('change', (e)=> mode = e.target.value);
restartBtn.addEventListener('click', ()=> initGame());

function aiMove(){
  if(!gameRunning) return;
  const legal = collectAllLegalMoves('red', board);
  if(legal.length===0){ gameRunning=false; updateScoreStatus('You win!'); tryPlay(winSound); return; }
  let choice;
  if(mode==='easy') choice = legal[Math.floor(Math.random()*legal.length)];
  else if(mode==='medium'){
    const caps = legal.filter(m=>m.isCapture);
    choice = caps.length>0 ? caps[Math.floor(Math.random()*caps.length)] : legal[Math.floor(Math.random()*legal.length)];
  } else {
    choice = minimaxRoot(board,4) || legal[Math.floor(Math.random()*legal.length)];
  }

  applyMove(choice, board);
  tryPlay(choice.isCapture ? captureSound : moveSound);

  // forced AI continuations
  if(choice.isCapture){
    let curR = choice.toR, curC = choice.toC;
    while(true){
      const cont = generateCaptureSequences(curR,curC,board);
      if(cont.length===0) break;
      let maxL = Math.max(...cont.map(s=>s.length));
      let cands = cont.filter(s=>s.length===maxL);
      let maxK = Math.max(...cands.map(s=>s.kingsCaptured));
      cands = cands.filter(s=>s.kingsCaptured===maxK);
      const pick = cands[Math.floor(Math.random()*cands.length)];
      const mv = { fromR: curR, fromC: curC, toR: pick.landR, toC: pick.landC, isCapture:true, captures: pick.captures.slice() };
      applyMove(mv, board);
      tryPlay(captureSound);
      curR = mv.toR; curC = mv.toC;
    }
  }

  // switch back to human
  turn='blue';
  updateScoreStatus();
  render();
}

// --- Minimax (Hard) ---
function evaluateBoard(b){
  let score=0;
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){
    const p=b[r][c];
    if(p) score += (p.player==='red' ? (p.king?6:3) : -(p.king?6:3));
  }
  return score;
}

function simulateApplyMove(move, b){
  const p = b[move.fromR][move.fromC];
  b[move.fromR][move.fromC] = null;
  b[move.toR][move.toC] = { player: p.player, king: p.king };
  if(move.isCapture && move.captures) for(const cap of move.captures) if(b[cap.r] && b[cap.r][cap.c]) b[cap.r][cap.c] = null;
  if(!p.king){
    if(p.player==='red' && move.toR===SIZE-1) b[move.toR][move.toC].king = true;
    if(p.player==='blue' && move.toR===0) b[move.toR][move.toC].king = true;
  }
}

function minimax(boardState, depth, alpha, beta, maximizing){
  if(depth===0) return evaluateBoard(boardState);
  const color = maximizing ? 'red' : 'blue';
  const moves = collectAllLegalMoves(color, boardState);
  if(moves.length===0) return evaluateBoard(boardState);
  if(maximizing){
    let maxEval=-Infinity;
    for(const mv of moves){
      const nb = cloneBoard(boardState);
      simulateApplyMove(mv, nb);
      if(mv.isCapture){
        let cr=mv.toR, cc=mv.toC;
        while(true){
          const cont = generateCaptureSequences(cr,cc,nb);
          if(cont.length===0) break;
          let maxL = Math.max(...cont.map(s=>s.length));
          let cands = cont.filter(s=>s.length===maxL);
          let maxK = Math.max(...cands.map(s=>s.kingsCaptured));
          cands = cands.filter(s=>s.kingsCaptured===maxK);
          const pick = cands[0];
          simulateApplyMove({fromR:cr,fromC:cc,toR:pick.landR,toC:pick.landC,isCapture:true,captures:pick.captures}, nb);
          cr = pick.landR; cc = pick.landC;
        }
      }
      const val = minimax(nb,depth-1,alpha,beta,false);
      maxEval = Math.max(maxEval,val);
      alpha = Math.max(alpha,val);
      if(beta<=alpha) break;
    }
    return maxEval;
  } else {
    let minEval=Infinity;
    for(const mv of moves){
      const nb = cloneBoard(boardState);
      simulateApplyMove(mv, nb);
      if(mv.isCapture){
        let cr=mv.toR, cc=mv.toC;
        while(true){
          const cont = generateCaptureSequences(cr,cc,nb);
          if(cont.length===0) break;
          let maxL = Math.max(...cont.map(s=>s.length));
          let cands = cont.filter(s=>s.length===maxL);
          let maxK = Math.max(...cands.map(s=>s.kingsCaptured));
          cands = cands.filter(s=>s.kingsCaptured===maxK);
          const pick = cands[0];
          simulateApplyMove({fromR:cr,fromC:cc,toR:pick.landR,toC:pick.landC,isCapture:true,captures:pick.captures}, nb);
          cr = pick.landR; cc = pick.landC;
        }
      }
      const val = minimax(nb,depth-1,alpha,beta,true);
      minEval = Math.min(minEval,val);
      beta = Math.min(beta,val);
      if(beta<=alpha) break;
    }
    return minEval;
  }
}

function minimaxRoot(boardState, depth){
  const moves = collectAllLegalMoves('red', boardState);
  if(moves.length===0) return null;
  let best = moves[0], bestScore=-Infinity;
  for(const mv of moves){
    const nb = cloneBoard(boardState);
    simulateApplyMove(mv, nb);
    if(mv.isCapture){
      let cr=mv.toR, cc=mv.toC;
      while(true){
        const cont = generateCaptureSequences(cr,cc,nb);
        if(cont.length===0) break;
        let maxL = Math.max(...cont.map(s=>s.length));
        let cands = cont.filter(s=>s.length===maxL);
        let maxK = Math.max(...cands.map(s=>s.kingsCaptured));
        cands = cands.filter(s=>s.kingsCaptured===maxK);
        const pick = cands[0];
        simulateApplyMove({fromR:cr,fromC:cc,toR:pick.landR,toC:pick.landC,isCapture:true,captures:pick.captures}, nb);
        cr = pick.landR; cc = pick.landC;
      }
    }
    const val = minimax(nb, depth-1, -Infinity, Infinity, false);
    if(val>bestScore){ bestScore=val; best=mv; }
  }
  return best;
}

// --- Start ---
difficultySel.value = 'medium';
difficultySel.addEventListener('change', e => mode = e.target.value);
restartBtn.addEventListener('click', ()=> initGame());

function initGame(){
  initGameInternal();
  initGameInternal = initGame; // no-op but keeps consistent naming
}
function initGameInternal(){
  // initialize and render
  board = Array.from({length:SIZE}, ()=> Array(SIZE).fill(null));
  for(let r=0;r<3;r++) for(let c=0;c<SIZE;c++) if((r+c)%2===1) board[r][c] = { player:'red', king:false };
  for(let r=SIZE-3;r<SIZE;r++) for(let c=0;c<SIZE;c++) if((r+c)%2===1) board[r][c] = { player:'blue', king:false };
  turn='blue'; selected=null; legalTargets=[]; gameRunning=true;
  render();
}

initGameInternal();
