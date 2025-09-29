const boardElement = document.getElementById("board");
const statusElement = document.getElementById("status");
const restartBtn = document.getElementById("restart");
const difficultySelect = document.getElementById("difficulty");

let board = [];
let currentPlayer = "player";
let selectedPiece = null;
let difficulty = "easy";

const SIZE = 8;

/* Initialize Board */
function initBoard() {
  board = [];
  for (let r = 0; r < SIZE; r++) {
    let row = [];
    for (let c = 0; c < SIZE; c++) {
      if ((r + c) % 2 === 1 && r < 3) {
        row.push({ owner: "ai", king: false });
      } else if ((r + c) % 2 === 1 && r > 4) {
        row.push({ owner: "player", king: false });
      } else {
        row.push(null);
      }
    }
    board.push(row);
  }
}

/* Render Board */
function renderBoard() {
  boardElement.innerHTML = "";
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const square = document.createElement("div");
      square.className = "square " + ((r + c) % 2 === 0 ? "light" : "dark");
      square.dataset.row = r;
      square.dataset.col = c;

      const piece = board[r][c];
      if (piece) {
        const div = document.createElement("div");
        div.className = `piece ${piece.owner}` + (piece.king ? " king" : "");
        square.appendChild(div);
      }

      square.addEventListener("click", () => handleClick(r, c));
      boardElement.appendChild(square);
    }
  }
  statusElement.textContent = currentPlayer === "player" ? "Your Turn" : "AI Thinking...";
}

/* Highlight Moves */
function highlightMoves(moves) {
  clearHighlights();
  moves.forEach(move => {
    const targetSquare = document.querySelector(
      `.square[data-row='${move.to[0]}'][data-col='${move.to[1]}']`
    );
    if (targetSquare) {
      targetSquare.classList.add("highlight");
    }
  });
}

function clearHighlights() {
  document.querySelectorAll(".highlight").forEach(sq => {
    sq.classList.remove("highlight");
  });
}

/* Handle Click */
function handleClick(r, c) {
  if (currentPlayer !== "player") return;

  const piece = board[r][c];
  if (piece && piece.owner === "player") {
    selectedPiece = { row: r, col: c };
    const moves = getValidMoves(r, c, piece);
    highlightMoves(moves);
    return;
  }

  if (selectedPiece) {
    const moves = getValidMoves(selectedPiece.row, selectedPiece.col, board[selectedPiece.row][selectedPiece.col]);
    const chosenMove = moves.find(m => m.to[0] === r && m.to[1] === c);
    if (chosenMove) {
      makeMove(selectedPiece.row, selectedPiece.col, r, c, chosenMove.capture);
      selectedPiece = null;
      clearHighlights();
      switchTurn();
    }
  }
}

/* Get Valid Moves (simplified Spanish rules: no backward captures for pawns) */
function getValidMoves(r, c, piece) {
  let moves = [];
  const directions = piece.king
    ? [[1,1], [1,-1], [-1,1], [-1,-1]]
    : piece.owner === "player"
      ? [[-1,1], [-1,-1]]
      : [[1,1], [1,-1]];

  directions.forEach(([dr, dc]) => {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) {
      if (!board[nr][nc]) {
        moves.push({ to: [nr, nc], capture: null });
      } else if (board[nr][nc].owner !== piece.owner) {
        const jr = nr + dr, jc = nc + dc;
        if (jr >= 0 && jr < SIZE && jc >= 0 && jc < SIZE && !board[jr][jc]) {
          moves.push({ to: [jr, jc], capture: [nr, nc] });
        }
      }
    }
  });

  return moves;
}

/* Make Move */
function makeMove(fr, fc, tr, tc, capture) {
  board[tr][tc] = board[fr][fc];
  board[fr][fc] = null;
  if (capture) {
    board[capture[0]][capture[1]] = null;
  }
  if ((board[tr][tc].owner === "player" && tr === 0) ||
      (board[tr][tc].owner === "ai" && tr === SIZE - 1)) {
    board[tr][tc].king = true;
  }
  renderBoard();
}

/* Switch Turn */
function switchTurn() {
  currentPlayer = currentPlayer === "player" ? "ai" : "player";
  renderBoard();
  if (currentPlayer === "ai") {
    setTimeout(aiMove, 600);
  }
}

/* AI Move */
function aiMove() {
  let allMoves = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const piece = board[r][c];
      if (piece && piece.owner === "ai") {
        const moves = getValidMoves(r, c, piece);
        moves.forEach(m => allMoves.push({ from: [r, c], ...m }));
      }
    }
  }
  if (allMoves.length === 0) {
    statusElement.textContent = "You Win!";
    return;
  }
  const move = allMoves[Math.floor(Math.random() * allMoves.length)];
  makeMove(move.from[0], move.from[1], move.to[0], move.to[1], move.capture);
  currentPlayer = "player";
  renderBoard();
}

/* Restart */
restartBtn.addEventListener("click", () => {
  initBoard();
  currentPlayer = "player";
  renderBoard();
});

/* Difficulty */
difficultySelect.addEventListener("change", (e) => {
  difficulty = e.target.value;
});

/* Start Game */
initBoard();
renderBoard();
