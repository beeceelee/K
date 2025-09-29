// script.js — Spanish Checkers full engine + UI + AI

const SIZE = 8;
const boardEl = document.getElementById('board');
const modeSel = document.getElementById('mode');
const restartBtn = document.getElementById('restartBtn');
const statusEl = document.getElementById('status');
const scoreEl = document.getElementById('score');

const moveSound = document.getElementById('moveSound');
const captureSound = document.getElementById('captureSound');
const winSound = document.getElementById('winSound');

let board = []; // 2D array
let turn = 'blue'; // 'blue' (human bottom) or 'red' (AI/top or second player)
let mode = 'easy';
let selected = null;
let legalTargets = [];
let running = true;

// create tile elements with dataset coordinates
function createTiles(){
  boardEl.innerHTML = '';
  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      const tile = document.createElement('div');
      tile.className = 'tile ' + (((r+c)%2) ? 'dark' : 'light');
      tile.dataset.r = r; tile.dataset.c = c;
      boardEl.appendChild(tile);
    }
  }
}

// deep clone
function cloneBoard(b){ return b.map(row => row.map(cell => cell ? { player: cell.player, king: cell.king } : null)); }
function inside(r,c){ return r>=0 && r<SIZE && c>=0 && c<SIZE; }

//
// MOVE GENERATION — Spanish rules
//

// generate capture sequences for piece at (r,c) on board b
function generateCaptureSequences(r,c,b){
  const p = b[r][c]; if(!p) return [];
  const color = p.player;
  const isKing = p.king;
  const sequences = [];

  if(!isKing){
    const dirs = (color==='blue') ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
    function dfs(cr,cc,boardState,acc){
      let found=false;
      for(const [dr,dc] of dirs){
        const mr = cr+dr, mc = cc+dc, lr = cr+2*dr, lc = cc+2*dc;
        if(inside(lr,lc) && boardState[mr]?.[mc] && boardState[mr][mc].player !== color && !boardState[lr][lc]){
          const nb = cloneBoard(boardState);
          const capPiece = nb[mr][mc];
          nb[mr][mc] = null;
          nb[lr][lc] = nb[cr][cc];
          nb[cr][cc] = null;
          const newAcc = acc.concat([{r:mr,c:mc,isKing:capPiece.king}]);
          const deeper = dfs(lr,lc,nb,newAcc);
          if(!deeper.length){
            sequences.push({landR:lr,landC:lc,captures:newAcc.slice(),length:newAcc.length,kingsCaptured:newAcc.filter(x=>x.isKing).length});
          }
          found=true;
        }
      }
      if(!found) return [];
      return [true];
    }
    dfs(r,c,b,[]);
    return sequences;
  } else {
    const dirs = [[1,1],[1,-1],[-1,1],[-1,-1]];
    function dfsk(cr,cc,boardState,acc){
      let found=false;
      for(const [dr,dc] of dirs){
        let mr = cr+dr, mc=cc+dc;
        while(inside(mr,mc) && !boardState[mr][mc]) { mr+=dr; mc+=dc; }
        if(inside(mr,mc) && boardState[mr][mc] && boardState[mr][mc].player !== color){
          let lr = mr+dr, lc = mc+dc;
          while(inside(lr,lc) && !boardState[lr][lc]){
            const nb = cloneBoard(boardState);
            const capPiece = nb[mr][mc];
            nb[mr][mc] = null;
            nb[lr][lc] = nb[cr][cc];
            nb[cr][cc] = null;
            const newAcc = acc.concat([{r:mr,c:mc,isKing:capPiece.king}]);
            const deeper = dfsk(lr,lc,nb,newAcc);
            if(!deeper.length){
              sequences.push({landR:lr,landC:lc,captures:newAcc.slice(),length:newAcc.length,kingsCaptured:newAcc.filter(x=>x.isKing).length});
            }
            found=true;
            lr+=dr; lc+=dc;
          }
        }
      }
      if(!found) return [];
      return [true];
    }
    dfsk(r,c,b,[]);
    return sequences;
  }
}

// non-capture moves
function generateNonCaptureMoves(r,c,b){
  const p = b[r][c]; if(!p) return [];
  const res=[];
  if(!p.king){
    const dirs = (p.player==='blue') ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
    for(const [dr,dc] of dirs){
      const nr=r+dr,nc=c+dc;
      if(inside(nr,nc) && !b[nr][nc]) res.push({landR:nr,landC:nc});
    }
  } else {
    const dirs = [[1,1],[1,-1],[-1,1],[-1,-1]];
    for(const [dr,dc] of dirs){
      let nr=r+dr,nc=c+dc;
      while(inside(nr,nc) && !b[nr][nc]){ res.push({landR:nr,landC:nc}); nr+=dr; nc+=dc; }
    }
  }
  return res;
}

// collect all legal moves for color with Spanish precedence
function collectAllLegalMoves(color,b){
  const seqs=[];
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){
    const p=b[r][c];
    if(p && p.player===color){
      const caps = generateCaptureSequences(r,c,b);
      for(const s of caps){
        seqs.push({fromR:r,fromC:c,toR:s.landR,toC:s.landC,isCapture:true,captures:s.captures.slice(),length:s.length,kingsCaptured:s.kingsCaptured});
      }
    }
  }
  if(seqs.length>0){
    const maxLen = Math.max(...seqs.map(x=>x.length));
    let cands = seqs.filter(x=>x.length===maxLen);
    const maxK = Math.max(...cands.map(x=>x.kingsCaptured));
    cands = cands.filter(x=>x.kingsCaptured===maxK);
    return cands;
  }
  const normals=[];
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){
    const p=b[r][c];
    if(p && p.player===color){
      const nm = generateNonCaptureMoves(r,c,b);
      for(const m of nm) normals.push({fromR:r,fromC:c,toR:m.landR,toC:m.landC,isCapture:false,captures:[]});
    }
  }
  return normals;
}

// apply move (mutates board)
function applyMove(move,b){
  const p = b[move.fromR][move.fromC];
  b[move.fromR][move.fromC] = null;
  b[move.toR][move.toC] = { player: p.player, king: p.king };
  let captured = 0;
  if(move.isCapture && move.captures && move.captures.length){
    for(const cap of move.captures){
      if(b[cap.r] && b[cap.r][cap.c]) { b[cap.r][cap.c] = null; captured++; }
    }
  }
  // promotion
  if(!p.king){
    if(p.player==='blue' && move.toR===0) b[move.toR][move.toC].king = true;
    if(p.player==='red' && move.toR===SIZE-1) b[move.toR][move.toC].king = true;
  }
  return captured;
}

// render UI
function render(){
  const tiles = boardEl.querySelectorAll('.tile');
  tiles.forEach(t=> t.innerHTML = '');
  tiles.forEach(t => t.classList.remove('highlight'));
  // highlight legal targets
  for(const lt of legalTargets){
    const idx = lt.r * SIZE + lt.c;
    tiles[idx].classList.add('highlight');
  }
  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      const p = board[r][c];
      const idx = r * SIZE + c;
      const tile = tiles[idx];
      if(p){
        const el = document.createElement('div');
        el.className = 'piece ' + (p.player==='blue' ? 'blue' : 'red') + (p.king ? ' king' : '');
        el.textContent = p.king ? '👑' : '';
        tile.appendChild(el);
      }
    }
  }
  updateScoreAndStatus();
}

// update score and status
function updateScoreAndStatus(){
  const flat = board.flat();
  const blueCount = flat.filter(p=>p && p.player==='blue').length;
  const redCount = flat.filter(p=>p && p.player==='red').length;
  scoreEl.textContent = `Blue:${blueCount}  Red:${redCount}`;
  if(!running) return;
  if(turn==='blue') statusEl.textContent = 'Blue to move';
  else statusEl.textContent = (mode==='pvp') ? 'Red to move' : 'Computer thinking...';
}

// play sounds safely
function playSound(el){
  if(!el) return;
  try{ el.currentTime = 0; el.play(); }catch(e){}
}

// initialize game board
function initGame(){
  createTiles();
  board = Array.from({length:SIZE},()=>Array(SIZE).fill(null));
  for(let r=0;r<3;r++) for(let c=0;c<SIZE;c++) if((r+c)%2===1) board[r][c] = { player:'red', king:false };
  for(let r=SIZE-3;r<SIZE;r++) for(let c=0;c<SIZE;c++) if((r+c)%2===1) board[r][c] = { player:'blue', king:false };
  turn='blue'; running=true; selected=null; legalTargets=[];
  render();
  if(mode!=='pvp' && turn==='red') setTimeout(aiTurn,350);
}

// click handling (delegation)
boardEl.addEventListener('click', (ev) => {
  const tile = ev.target.closest('.tile');
  if(!tile) return;
  const r = parseInt(tile.dataset.r,10), c = parseInt(tile.dataset.c,10);
  onTileClick(r,c);
});

// handle tile click
function onTileClick(r,c){
  if(!running) return;
  // allow both players in pvp
  if(turn!=='blue' && !(mode==='pvp' && turn==='red')) return;

  const allLegal = collectAllLegalMoves(turn, board);
  const hasCapture = allLegal.some(m => m.isCapture);

  const piece = board[r][c];
  if(piece && ((turn==='blue' && piece.player==='blue') || (turn==='red' && piece.player==='red'))){
    // select piece and show its legal moves (enforcing global precedence)
    selected = { r,c };
    const myMoves = allLegal.filter(m => m.fromR===r && m.fromC===c);
    legalTargets = myMoves.map(m => ({ r:m.toR, c:m.toC, move:m }));
    render();
    return;
  }

  // if clicked a highlighted target execute move
  const target = legalTargets.find(t => t.r===r && t.c===c);
  if(target){
    const move = target.move;
    const captured = applyMove(move, board);
    if(move.isCapture) playSound(captureSound); else playSound(moveSound);

    // after capture: check continuations from landing square
    if(move.isCapture){
      const cont = generateCaptureSequences(move.toR, move.toC, board);
      if(cont.length>0){
        // limit continuations to longest/kings precedence
        let maxL = Math.max(...cont.map(s=>s.length));
        let cands = cont.filter(s=>s.length===maxL);
        let maxK = Math.max(...cands.map(s=>s.kingsCaptured));
        cands = cands.filter(s=>s.kingsCaptured===maxK);
        legalTargets = cands.map(s=>({ r:s.landR, c:s.landC, move:{
          fromR: move.toR, fromC: move.toC, toR: s.landR, toC:s.landC, isCapture:true, captures:s.captures.slice()
        }}));
        selected = { r: move.toR, c: move.toC };
        render();
        updateScoreAndEnd();
        return; // player must continue
      }
    }

    // otherwise end turn
    selected = null; legalTargets = [];
    render();
    updateScoreAndEnd();

    // switch turn
    turn = (turn==='blue') ? 'red' : 'blue';
    if(running && mode!=='pvp' && turn==='red') setTimeout(aiTurn, 350);
    return;
  }

  // clicked elsewhere -> deselect
  selected = null; legalTargets = [];
  render();
}

// update score and check end
function updateScoreAndEnd(){
  const humanMoves = collectAllLegalMoves('blue', board);
  const aiMoves = collectAllLegalMoves('red', board);
  const bluePieces = board.flat().filter(p=>p && p.player==='blue').length;
  const redPieces = board.flat().filter(p=>p && p.player==='red').length;
  if(bluePieces===0 || humanMoves.length===0){
    running=false; statusEl.textContent = 'Red wins!'; playSound(winSound); return;
  }
  if(redPieces===0 || aiMoves.length===0){
    running=false; statusEl.textContent = 'Blue wins!'; playSound(winSound); return;
  }
}

// AI
function aiTurn(){
  if(!running) return;
  const legal = collectAllLegalMoves('red', board);
  if(legal.length===0){ running=false; statusEl.textContent='Blue wins!'; playSound(winSound); return; }
  let choice;
  if(mode==='easy') choice = legal[Math.floor(Math.random()*legal.length)];
  else if(mode==='medium'){
    const caps = legal.filter(m=>m.isCapture);
    choice = caps.length>0 ? caps[Math.floor(Math.random()*caps.length)] : legal[Math.floor(Math.random()*legal.length)];
  } else {
    choice = minimaxRoot(board, 4) || legal[Math.floor(Math.random()*legal.length)];
  }
  applyMove(choice, board);
  if(choice.isCapture) playSound(captureSound); else playSound(moveSound);

  // handle forced AI continuation
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
      playSound(captureSound);
      curR = mv.toR; curC = mv.toC;
    }
  }

  updateScoreAndEnd();
  turn = 'blue';
  render();
}

// Minimax (hard)
function evaluateBoard(b){
  let score = 0;
  for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
    const p = b[r][c];
    if(p) score += (p.player==='red' ? (p.king?6:3) : -(p.king?6:3));
  }
  return score;
}
function simulateApplyMove(move,b){
  if(!move) return;
  const p = b[move.fromR][move.fromC];
  b[move.fromR][move.fromC] = null;
  b[move.toR][move.toC] = { player: p.player, king: p.king };
  if(move.isCapture && move.captures) for(const cap of move.captures) if(b[cap.r] && b[cap.r][cap.c]) b[cap.r][cap.c] = null;
  if(!p.king){
    if(p.player==='red' && move.toR===SIZE-1) b[move.toR][move.toC].king=true;
    if(p.player==='blue' && move.toR===0) b[move.toR][move.toC].king=true;
  }
}
function minimax(boardState, depth, alpha, beta, maximizing){
  if(depth===0) return evaluateBoard(boardState);
  const color = maximizing ? 'red' : 'blue';
  const moves = collectAllLegalMoves(color, boardState);
  if(moves.length===0) return evaluateBoard(boardState);
  if(maximizing){
    let maxEval = -Infinity;
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
      const val = minimax(nb, depth-1, alpha, beta, false);
      maxEval = Math.max(maxEval, val); alpha = Math.max(alpha,val);
      if(beta<=alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
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
      const val = minimax(nb, depth-1, alpha, beta, true);
      minEval = Math.min(minEval, val); beta = Math.min(beta,val);
      if(beta<=alpha) break;
    }
    return minEval;
  }
}
function minimaxRoot(boardState, depth){
  const moves = collectAllLegalMoves('red', boardState);
  if(moves.length===0) return null;
  let best = moves[0], bestScore = -Infinity;
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

// controls
modeSel.addEventListener('change', (e)=>{ mode = e.target.value; });
restartBtn.addEventListener('click', ()=>{ initGame(); });

// init
createTiles();
initGame();

function initGame(){
  board = Array.from({length:SIZE},()=>Array(SIZE).fill(null));
  for(let r=0;r<3;r++) for(let c=0;c<SIZE;c++) if((r+c)%2===1) board[r][c] = { player:'red', king:false };
  for(let r=SIZE-3;r<SIZE;r++) for(let c=0;c<SIZE;c++) if((r+c)%2===1) board[r][c] = { player:'blue', king:false };
  turn = 'blue';
  selected = null; legalTargets = []; running = true;
  render();
  if(mode!=='pvp' && turn==='red') setTimeout(aiTurn,350);
}
