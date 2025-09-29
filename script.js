const boardElement = document.getElementById("board");
const moveSound = document.getElementById("move-sound");
const captureSound = document.getElementById("capture-sound");
const winSound = document.getElementById("win-sound");
const humanScoreElement = document.getElementById("human-score");
const aiScoreElement = document.getElementById("ai-score");
const restartButton = document.getElementById("restart");
const difficultySelect = document.getElementById("difficulty");

const SIZE = 8;
let board = [];
let turn = "human";
let selected = null;
let humanPieces = 12;
let aiPieces = 12;
let difficulty = "easy";

// Init board
function initBoard() {
  board = [];
  boardElement.innerHTML = "";
  humanPieces = 12;
  aiPieces = 12;
  turn = "human";

  for (let row = 0; row < SIZE; row++) {
    const rowArr = [];
    for (let col = 0; col < SIZE; col++) {
      let piece = null;
      if ((row + col) % 2 === 1) {
        if (row < 3) piece = { player: "ai", king: false };
        if (row > 4) piece = { player: "human", king: false };
      }
      rowArr.push(piece);
      const tile = document.createElement("div");
      tile.classList.add("tile", (row + col) % 2 === 0 ? "light" : "dark");
      tile.dataset.row = row;
      tile.dataset.col = col;
      boardElement.appendChild(tile);
    }
    board.push(rowArr);
  }
  updateUI();
}

// Update UI
function updateUI() {
  document.querySelectorAll(".tile").forEach(tile => {
    tile.innerHTML = "";
    const row = +tile.dataset.row;
    const col = +tile.dataset.col;
    const piece = board[row][col];
    if (piece) {
      const div = document.createElement("div");
      div.classList.add("piece", piece.player);
      if (piece.king) div.classList.add("king");
      div.textContent = piece.king ? "👑" : "";
      div.addEventListener("click", () => onPieceClick(row, col));
      tile.appendChild(div);
    } else {
      tile.addEventListener("click", () => onTileClick(row, col));
    }
  });
  humanScoreElement.textContent = `You: ${humanPieces}`;
  aiScoreElement.textContent = `AI: ${aiPieces}`;
}

// Piece click
function onPieceClick(row, col) {
  if (turn !== "human") return;
  const piece = board[row][col];
  if (!piece || piece.player !== "human") return;
  selected = { row, col };
}

// Tile click
function onTileClick(row, col) {
  if (!selected) return;
  // TODO: implement full Spanish rules (mandatory captures, longest sequence)
  // For now, allow simple forward move
  const s = selected;
  const piece = board[s.row][s.col];
  if (!piece) return;
  if (isValidMove(s.row, s.col, row, col, piece)) {
    board[row][col] = piece;
    board[s.row][s.col] = null;
    moveSound.play();
    // Promotion
    if (piece.player === "human" && row === 0) piece.king = true;
    endTurn();
  }
  selected = null;
  updateUI();
}

// Check valid move (simplified for now)
function isValidMove(sr, sc, dr, dc, piece) {
  const drDiff = dr - sr;
  const dcDiff = dc - sc;
  if ((dr + dc) % 2 === 0) return false;
  if (board[dr][dc]) return false;

  if (piece.player === "human" && !piece.king) {
    if (drDiff === -1 && Math.abs(dcDiff) === 1) return true;
  }
  return false;
}

// End turn
function endTurn() {
  turn = turn === "human" ? "ai" : "human";
  if (turn === "ai") setTimeout(aiMove, 500);
}

// AI move
function aiMove() {
  const moves = generateAllMoves("ai");
  if (moves.length === 0) {
    winSound.play();
    alert("You win!");
    return;
  }
  let move;
  if (difficulty === "easy") {
    move = moves[Math.floor(Math.random() * moves.length)];
  } else {
    move = moves[0]; // placeholder
  }
  // Execute move
  const { from, to } = move;
  const piece = board[from.row][from.col];
  board[to.row][to.col] = piece;
  board[from.row][from.col] = null;
  if (piece.player === "ai" && to.row === SIZE - 1) piece.king = true;
  moveSound.play();
  endTurn();
  updateUI();
}

// Generate all moves (placeholder, no captures yet)
function generateAllMoves(player) {
  const moves = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const piece = board[r][c];
      if (piece && piece.player === player) {
        const dirs = piece.king ? [[1,1],[1,-1],[-1,1],[-1,-1]] : player === "human" ? [[-1,1],[-1,-1]] : [[1,1],[1,-1]];
        for (const [dr, dc] of dirs) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && !board[nr][nc]) {
            moves.push({ from: {row:r,col:c}, to: {row:nr,col:nc} });
          }
        }
      }
    }
  }
  return moves;
}

// Restart
restartButton.addEventListener("click", initBoard);
difficultySelect.addEventListener("change", e => difficulty = e.target.value);

initBoard();
