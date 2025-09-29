const boardSize = 8;
let board = [];
let currentPlayer = 'red'; // red starts
let selectedPiece = null;
let highlightedSquares = [];
let difficulty = "medium"; // easy | medium | hard

// Initialize the board
function initBoard() {
  board = Array(boardSize).fill(null).map(() => Array(boardSize).fill(null));

  // Place red (top side)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < boardSize; c++) {
      if ((r + c) % 2 === 1) {
        board[r][c] = { color: "red", king: false };
      }
    }
  }

  // Place black (bottom side)
  for (let r = 5; r < 8; r++) {
    for (let c = 0; c < boardSize; c++) {
      if ((r + c) % 2 === 1) {
        board[r][c] = { color: "black", king: false };
      }
    }
  }
}

// Render the board
function renderBoard() {
  const gameDiv = document.getElementById("game");
  gameDiv.innerHTML = "";

  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      const square = document.createElement("div");
      square.className = "square " + ((r + c) % 2 === 0 ? "light" : "dark");
      square.dataset.row = r;
      square.dataset.col = c;

      const piece = board[r][c];
      if (piece) {
        const pieceDiv = document.createElement("div");
        pieceDiv.className = `piece ${piece.color}`;
        if (piece.king) pieceDiv.classList.add("king");
        square.appendChild(pieceDiv);
      }

      if (highlightedSquares.some(h => h[0] === r && h[1] === c)) {
        square.classList.add("highlight");
      }

      square.addEventListener("click", () => handleClick(r, c));
      gameDiv.appendChild(square);
    }
  }
}

// Get valid moves for a piece
function getMoves(r, c) {
  const piece = board[r][c];
  if (!piece) return { captures: [], normalMoves: [] };

  const directions = [];
  if (piece.king) {
    // King can move all diagonals
    directions.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
  } else {
    // Pawn: only forward
    const dir = piece.color === "red" ? 1 : -1;
    directions.push([dir, -1], [dir, 1]);
  }

  let captures = [];
  let normalMoves = [];

  for (let [dr, dc] of directions) {
    const nr = r + dr, nc = c + dc;
    const jumpR = r + dr * 2, jumpC = c + dc * 2;

    // Capture
    if (isInside(nr, nc) && isInside(jumpR, jumpC)) {
      const target = board[nr][nc];
      if (target && target.color !== piece.color && !board[jumpR][jumpC]) {
        captures.push([jumpR, jumpC, nr, nc]); // (end row, end col, captured row, captured col)
      }
    }

    // Normal move (only allowed if no captures available anywhere)
    if (isInside(nr, nc) && !board[nr][nc]) {
      normalMoves.push([nr, nc]);
    }
  }

  return { captures, normalMoves };
}

// Check board bounds
function isInside(r, c) {
  return r >= 0 && r < boardSize && c >= 0 && c < boardSize;
}

// Handle click
function handleClick(r, c) {
  const piece = board[r][c];

  if (piece && piece.color === currentPlayer) {
    selectedPiece = [r, c];
    const moves = getMoves(r, c);
    highlightedSquares = [];

    // Highlight only captures if available
    if (anyCapturesAvailable()) {
      highlightedSquares = moves.captures.map(m => [m[0], m[1]]);
    } else {
      highlightedSquares = moves.normalMoves;
    }
  } else if (selectedPiece) {
    tryMove(selectedPiece[0], selectedPiece[1], r, c);
  }

  renderBoard();
}

// Try moving or capturing
function tryMove(r, c, nr, nc) {
  const moves = getMoves(r, c);
  const piece = board[r][c];

  let captureMove = moves.captures.find(m => m[0] === nr && m[1] === nc);
  let normalMove = moves.normalMoves.find(m => m[0] === nr && m[1] === nc);

  if (captureMove) {
    // Capture
    board[nr][nc] = piece;
    board[r][c] = null;
    board[captureMove[2]][captureMove[3]] = null;

    // Promote to king if reaching last row
    if (!piece.king && ((piece.color === "red" && nr === boardSize - 1) || (piece.color === "black" && nr === 0))) {
      piece.king = true;
    }

    // Continue capturing if possible
    selectedPiece = [nr, nc];
    const nextMoves = getMoves(nr, nc);
    if (nextMoves.captures.length > 0) {
      highlightedSquares = nextMoves.captures.map(m => [m[0], m[1]]);
      renderBoard();
      return;
    }
  } else if (!anyCapturesAvailable() && normalMove) {
    // Normal move
    board[nr][nc] = piece;
    board[r][c] = null;

    if (!piece.king && ((piece.color === "red" && nr === boardSize - 1) || (piece.color === "black" && nr === 0))) {
      piece.king = true;
    }
  } else {
    return; // invalid move
  }

  // Switch turn
  currentPlayer = currentPlayer === "red" ? "black" : "red";
  selectedPiece = null;
  highlightedSquares = [];
  renderBoard();
}

// Check if any captures exist
function anyCapturesAvailable() {
  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      const piece = board[r][c];
      if (piece && piece.color === currentPlayer) {
        if (getMoves(r, c).captures.length > 0) return true;
      }
    }
  }
  return false;
}

// Restart button
document.getElementById("restart").addEventListener("click", () => {
  initBoard();
  currentPlayer = "red";
  selectedPiece = null;
  highlightedSquares = [];
  renderBoard();
});

// Difficulty selector (AI not yet implemented)
document.getElementById("difficulty").addEventListener("change", (e) => {
  difficulty = e.target.value;
  console.log("Difficulty set to:", difficulty);
});

// Start the game
initBoard();
renderBoard();
