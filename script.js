const game = document.getElementById("game");
let board = [];
let selected = null;
let currentPlayer = "red"; // red starts

// Build 8x8 board
function createBoard() {
  game.innerHTML = "";
  board = [];

  for (let row = 0; row < 8; row++) {
    let rowArray = [];
    for (let col = 0; col < 8; col++) {
      const square = document.createElement("div");
      square.classList.add("square", (row + col) % 2 === 0 ? "light" : "dark");
      square.dataset.row = row;
      square.dataset.col = col;
      game.appendChild(square);

      // Place pieces
      let piece = null;
      if (row < 3 && (row + col) % 2 !== 0) {
        piece = { color: "black", king: false };
      } else if (row > 4 && (row + col) % 2 !== 0) {
        piece = { color: "red", king: false };
      }

      rowArray.push(piece);
      if (piece) renderPiece(square, piece);

      // Add click
      square.addEventListener("click", () => handleClick(row, col));
    }
    board.push(rowArray);
  }
}

function renderPiece(square, piece) {
  const div = document.createElement("div");
  div.classList.add("piece", piece.color);
  if (piece.king) div.classList.add("king");
  square.appendChild(div);
}

// Handle click
function handleClick(row, col) {
  const piece = board[row][col];

  if (selected) {
    const moves = getValidMoves(selected.row, selected.col);
    const move = moves.find(m => m.row === row && m.col === col);
    if (move) {
      makeMove(selected.row, selected.col, row, col);
      currentPlayer = currentPlayer === "red" ? "black" : "red";
    }
    clearHighlights();
    selected = null;
  } else if (piece && piece.color === currentPlayer) {
    selected = { row, col };
    const moves = getValidMoves(row, col);
    highlightMoves(moves);
  }
}

function getValidMoves(row, col) {
  const piece = board[row][col];
  if (!piece) return [];

  let moves = [];
  let dir = piece.color === "red" ? -1 : 1; // red goes up, black goes down

  [[dir, -1], [dir, 1]].forEach(([dr, dc]) => {
    const newRow = row + dr, newCol = col + dc;
    if (isInBounds(newRow, newCol) && !board[newRow][newCol]) {
      moves.push({ row: newRow, col: newCol });
    }
  });

  return moves;
}

function makeMove(fromRow, fromCol, toRow, toCol) {
  const piece = board[fromRow][fromCol];
  board[toRow][toCol] = piece;
  board[fromRow][fromCol] = null;
  createBoard();
}

function isInBounds(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

// Highlight
function highlightMoves(moves) {
  clearHighlights();
  moves.forEach(move => {
    const square = document.querySelector(
      `.square[data-row='${move.row}'][data-col='${move.col}']`
    );
    if (square) square.classList.add("highlight");
  });
}

function clearHighlights() {
  document.querySelectorAll(".highlight").forEach(sq => {
    sq.classList.remove("highlight");
  });
}

createBoard();
