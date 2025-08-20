// Four-in-a-Row — Local + Online (Firebase Realtime DB)
// Names restricted to Jay and Tiana; lifetime stats stored in DB under /stats/{name}

(function () {
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // ---------- UI Elements ----------
    const modeModal = $("#modeModal");
    const setupModal = $("#setupModal");
    const modeBtns = $$(".mode-btn");
    const modeContinueBtn = $("#modeContinueBtn");

    const localSetup = $("#localSetup");
    const onlineSetup = $("#onlineSetup");

    const player1Input = $("#player1Input");
    const player2Input = $("#player2Input");
    const startLocalBtn = $("#startLocalBtn");

    const createRoomRadio = $("#createRoom");
    const joinRoomRadio = $("#joinRoom");
    const createRoomBtn = $("#createRoomBtn");
    const creatorNameSel = $("#creatorName");
    const joinerNameSel = $("#joinerName");
    const joinCodeInput = $("#joinCode");
    const roomCodeRow = $("#roomCodeRow");
    const roomCodeEl = $("#roomCode");
    const copyCodeBtn = $("#copyCodeBtn");

    const gameInfo = $("#gameInfo");
    const boardWrapper = $("#boardWrapper");
    const boardEl = $("#board");
    const errorEl = $("#errorMessage");
    const p1Card = $("#player1Card");
    const p2Card = $("#player2Card");
    const p1NameEl = $("#player1Name");
    const p2NameEl = $("#player2Name");
    const p1WinsEl = $("#p1Wins");
    const p1GamesEl = $("#p1Games");
    const p2WinsEl = $("#p2Wins");
    const p2GamesEl = $("#p2Games");
    const winMessage = $("#winMessage");
    const winText = $("#winText");
    const rematchBtn = $("#rematchBtn");
    const newGameBtn = $("#newGameBtn");
    const onlineModeBtn = $("#onlineMode");
    const localModeBtn = $("#localMode");

    // ---------- State ----------
    let gameMode = "local";
    let board = [];
    let currentPlayer = 1; // 1 = Jay/P1 (pink), 2 = Tiana/P2 (cyan)
    let gameActive = false;
    let player1Name = "";
    let player2Name = "";
    let myName = ""; // for online
    let roomCode = "";
    let db = null;
    let roomRef = null;
    let roomUnsub = null;
    const validNames = ["jay", "tiana"];

    // ---------- Helpers ----------
    function setError(msg) { errorEl.textContent = msg; errorEl.classList.add("show"); }
    function clearError() { errorEl.textContent = ""; errorEl.classList.remove("show"); }
    function capName(s) { return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }
    function validatePlayers(p1, p2) {
        p1 = (p1 || "").trim().toLowerCase();
        p2 = (p2 || "").trim().toLowerCase();
        if (!p1 || !p2) return { valid: false, message: "Please enter both player names" };
        if (!validNames.includes(p1) || !validNames.includes(p2)) return { valid: false, message: "Only Jay and Tiana can play!" };
        if (p1 === p2) return { valid: false, message: "Players must be different (Jay vs Tiana)" };
        return { valid: true };
    }
    function genRoomCode() {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // avoid similar chars
        let c = "";
        for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
        return c;
    }
    function initBoard() {
        board = Array.from({ length: 6 }, () => Array(7).fill(0));
        boardEl.innerHTML = "";
        for (let r = 0; r < 6; r++) {
            for (let c = 0; c < 7; c++) {
                const cell = document.createElement("div");
                cell.className = "cell";
                cell.dataset.row = r;
                cell.dataset.col = c;
                cell.addEventListener("click", () => handleColumnClick(c));
                boardEl.appendChild(cell);
            }
        }
    }
    function updateTurnIndicator() {
        if (currentPlayer === 1) { p1Card.classList.add("active"); p2Card.classList.remove("active"); }
        else { p1Card.classList.remove("active"); p2Card.classList.add("active"); }
    }
    function placeDisc(col) {
        for (let row = 5; row >= 0; row--) {
            if (board[row][col] === 0) {
                board[row][col] = currentPlayer;
                const idx = row * 7 + col;
                const cell = boardEl.children[idx];
                cell.classList.add("filled", `player${currentPlayer}`);
                return { row, col };
            }
        }
        return null;
    }
    function checkDirection(row, col, dr, dc, player) {
        let count = 1;
        const winCells = [[row, col]];
        for (let i = 1; i < 4; i++) {
            const r = row + dr * i, c = col + dc * i;
            if (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === player) { count++; winCells.push([r, c]); } else break;
        }
        for (let i = 1; i < 4; i++) {
            const r = row - dr * i, c = col - dc * i;
            if (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === player) { count++; winCells.push([r, c]); } else break;
        }
        return count >= 4 ? winCells : null;
    }
    function highlightWin(cells) {
        cells.forEach(([r, c]) => {
            const idx = r * 7 + c;
            boardEl.children[idx].classList.add("winner");
        });
    }
    function checkWinAt(row, col) {
        const pl = board[row][col];
        return (
            checkDirection(row, col, 0, 1, pl) ||
            checkDirection(row, col, 1, 0, pl) ||
            checkDirection(row, col, 1, 1, pl) ||
            checkDirection(row, col, 1, -1, pl)
        );
    }
    function isDraw() { return board.every(r => r.every(v => v !== 0)); }

    function endGame(winner) {
        gameActive = false;
        if (winner === 0) winText.textContent = "It's a Draw!";
        else winText.textContent = `${winner === 1 ? player1Name : player2Name} Wins!`;
        winMessage.classList.add("show");
    }

    function resetForRematch() {
        winMessage.classList.remove("show");
        initBoard();
        currentPlayer = 1;
        gameActive = true;
        updateTurnIndicator();
    }

    // ---------- Local Game ----------
    function startLocalGame() {
        const p1 = player1Input.value;
        const p2 = player2Input.value;
        const ok = validatePlayers(p1, p2);
        if (!ok.valid) { setError(ok.message); return; }
        clearError();
        player1Name = capName(p1);
        player2Name = capName(p2);
        p1NameEl.textContent = player1Name;
        p2NameEl.textContent = player2Name;
        // reset tallies (no DB in local, show zeros)
        p1WinsEl.textContent = "0"; p1GamesEl.textContent = "0";
        p2WinsEl.textContent = "0"; p2GamesEl.textContent = "0";
        setupModal.classList.remove("active");
        gameInfo.classList.add("active");
        boardWrapper.classList.add("active");
        initBoard();
        currentPlayer = 1;
        gameActive = true;
        updateTurnIndicator();
    }

    function handleColumnClick(col) {
        if (!gameActive) return;
        if (gameMode === "online") {
            // only allow move if it's my turn
            const iAm = (myName.toLowerCase() === "jay") ? 1 : 2;
            if (iAm !== currentPlayer) return;
            // optimistic check if column has space
            let hasSpace = false;
            for (let r = 5; r >= 0; r--) { if (board[r][col] === 0) { hasSpace = true; break; } }
            if (!hasSpace) return;
            pushMoveOnline(col);
            return;
        }
        // local
        const spot = placeDisc(col);
        if (!spot) return;
        const winCells = checkWinAt(spot.row, spot.col);
        if (winCells) { highlightWin(winCells); endGame(currentPlayer); return; }
        if (isDraw()) { endGame(0); return; }
        currentPlayer = currentPlayer === 1 ? 2 : 1;
        updateTurnIndicator();
    }

    // ---------- Online (Firebase) ----------
    function needFirebase() {
        if (!window.firebaseConfig) { setError("Missing Firebase config. Edit firebase-config.js."); return true; }
        return false;
    }
    function initFirebaseIfNeeded() {
        if (db) return;
        if (needFirebase()) return;
        try {
            const app = firebase.initializeApp(window.firebaseConfig);
            db = firebase.database();
        } catch (e) {
            // already initialized?
            db = firebase.database();
        }
    }

    async function createRoom() {
        initFirebaseIfNeeded(); if (!db) return;
        const me = creatorNameSel.value; myName = me;
        roomCode = genRoomCode();
        roomRef = db.ref(`rooms/${roomCode}`);
        const other = (me === "Jay") ? "Tiana" : "Jay";
        const now = Date.now();
        await roomRef.set({
            createdAt: now,
            status: "waiting",
            players: { [me.toLowerCase()]: true, [other.toLowerCase()]: false },
            names: { p1: me === "Jay" ? "Jay" : "Tiana", p2: me === "Jay" ? "Tiana" : "Jay" },
            board: Array.from({ length: 6 }, () => Array(7).fill(0)),
            currentPlayer: 1,
            finalized: false,
            winner: 0
        });
        roomCodeEl.textContent = roomCode;
        roomCodeRow.hidden = false;
        listenRoom();
        // fetch stats
        loadStats();
    }

    async function joinRoom() {
        initFirebaseIfNeeded(); if (!db) return;
        const code = (joinCodeInput.value || "").toUpperCase().trim();
        if (code.length !== 6) { setError("Enter a valid 6-char code"); return; }
        roomRef = db.ref(`rooms/${code}`);
        const snap = await roomRef.get();
        if (!snap.exists()) { setError("Room not found"); return; }
        const data = snap.val();
        if (data.status !== "waiting" && data.status !== "playing") { setError("Room is not available"); return; }
        const me = joinerNameSel.value; myName = me;
        const key = me.toLowerCase();
        const otherKey = key === "jay" ? "tiana" : "jay";
        if (data.players[key]) { setError(`${me} is already in room`); return; }
        if (data.players[otherKey] === false) {
            // good to join
            await roomRef.child("players").update({ [key]: true });
            if (data.status === "waiting") {
                await roomRef.update({ status: "playing" });
            }
            roomCode = code;
            listenRoom();
            loadStats();
        } else {
            setError("Both seats taken");
        }
    }

    function listenRoom() {
        if (roomUnsub) roomUnsub();
        roomUnsub = roomRef.on("value", (snap) => {
            const data = snap.val(); if (!data) return;
            // Update UI based on data
            player1Name = data.names.p1;
            player2Name = data.names.p2;
            p1NameEl.textContent = player1Name;
            p2NameEl.textContent = player2Name;
            if (setupModal.classList.contains("active")) {
                setupModal.classList.remove("active");
                gameInfo.classList.add("active");
                boardWrapper.classList.add("active");
            }
            // sync board
            board = data.board;
            currentPlayer = data.currentPlayer;
            gameActive = (data.status === "playing");
            renderBoardFromState();
            updateTurnIndicator();
            if (data.status === "finished") {
                if (data.winner === 0) winText.textContent = "It's a Draw!";
                else winText.textContent = `${data.winner === 1 ? player1Name : player2Name} Wins!`;
                winMessage.classList.add("show");
            }
        });
    }

    function renderBoardFromState() {
        // rebuild DOM classes to match board
        for (let r = 0; r < 6; r++) {
            for (let c = 0; c < 7; c++) {
                const idx = r * 7 + c;
                const cell = boardEl.children[idx];
                cell.className = "cell";
                const v = board[r][c];
                if (v !== 0) cell.classList.add("filled", `player${v}`);
            }
        }
    }

    async function pushMoveOnline(col) {
        // Use transaction to apply a move safely
        await roomRef.transaction(room => {
            if (!room || room.status !== "playing") return room;
            const iAm = (myName.toLowerCase() === "jay") ? 1 : 2;
            if (room.currentPlayer !== iAm) return room; // not my turn
            // find lowest empty row
            let placed = null;
            for (let r = 5; r >= 0; r--) {
                if (room.board[r][col] === 0) { room.board[r][col] = iAm; placed = { row: r, col: col }; break; }
            }
            if (!placed) return room; // column full
            // check win/draw on the server state copy
            const winCells = _checkWinServer(room.board, placed.row, placed.col);
            if (winCells) {
                room.status = "finished";
                room.winner = iAm;
                // finalize stats only once
                if (!room.finalized) room.finalized = "pending";
            } else if (_isDrawServer(room.board)) {
                room.status = "finished";
                room.winner = 0;
                if (!room.finalized) room.finalized = "pending";
            } else {
                room.currentPlayer = (iAm === 1) ? 2 : 1;
            }
            return room;
        });

        // If just finished, do stats finalize via a separate transaction
        const snap = await roomRef.get();
        const data = snap.val();
        if (data && data.status === "finished" && data.finalized === "pending") {
            await finalizeStats(data.winner);
        }
    }

    function _isDrawServer(b) {
        return b.every(row => row.every(v => v !== 0));
    }
    function _checkDir(b, row, col, dr, dc, pl) {
        let c = 1;
        for (let i = 1; i < 4; i++) {
            const r = row + dr * i, cc = col + dc * i;
            if (r >= 0 && r < 6 && cc >= 0 && cc < 7 && b[r][cc] === pl) c++; else break;
        }
        for (let i = 1; i < 4; i++) {
            const r = row - dr * i, cc = col - dc * i;
            if (r >= 0 && r < 6 && cc >= 0 && cc < 7 && b[r][cc] === pl) c++; else break;
        }
        return c >= 4;
    }
    function _checkWinServer(b, row, col) {
        const pl = b[row][col];
        if (_checkDir(b, row, col, 0, 1, pl)) return true;
        if (_checkDir(b, row, col, 1, 0, pl)) return true;
        if (_checkDir(b, row, col, 1, 1, pl)) return true;
        if (_checkDir(b, row, col, 1, -1, pl)) return true;
        return false;
    }

    async function finalizeStats(winner) {
        // Atomically increment stats once and mark finalized=true to prevent double counting
        await db.ref(`rooms/${roomCode}`).transaction(room => {
            if (!room || room.finalized === true) return room;
            // increment in separate refs with server-side transaction
            const updates = [];
            const incr = (name, won) => {
                const ref = db.ref(`stats/${name.toLowerCase()}`);
                updates.push(ref.transaction(s => {
                    s = s || { wins: 0, games: 0 };
                    s.games = (s.games || 0) + 1;
                    if (won) s.wins = (s.wins || 0) + 1;
                    return s;
                }));
            };
            incr("jay", winner === 1 && room.names.p1 === "Jay" || winner === 2 && room.names.p2 === "Jay");
            incr("tiana", winner === 1 && room.names.p1 === "Tiana" || winner === 2 && room.names.p2 === "Tiana");
            room.finalized = true;
            return room;
        });
        // refresh tallies
        loadStats();
    }

    async function loadStats() {
        if (!db) return;
        const [jaySnap, tianaSnap] = await Promise.all([
            db.ref("stats/jay").get(),
            db.ref("stats/tiana").get()
        ]);
        const jay = jaySnap.val() || { wins: 0, games: 0 };
        const ti = tianaSnap.val() || { wins: 0, games: 0 };
        // Map to left/right depending on names
        if (player1Name === "Jay") {
            p1WinsEl.textContent = jay.wins || 0; p1GamesEl.textContent = jay.games || 0;
            p2WinsEl.textContent = ti.wins || 0; p2GamesEl.textContent = ti.games || 0;
        } else {
            p1WinsEl.textContent = ti.wins || 0; p1GamesEl.textContent = ti.games || 0;
            p2WinsEl.textContent = jay.wins || 0; p2GamesEl.textContent = jay.games || 0;
        }
    }

    // ---------- Events ----------
    // mode toggle
    modeBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            modeBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            gameMode = btn.dataset.mode;
        });
    });
    modeContinueBtn.addEventListener("click", () => {
        modeModal.classList.remove("active");
        clearError();
        if (gameMode === "online") {
            onlineSetup.hidden = false; localSetup.hidden = true;
            setupModal.classList.add("active");
        } else {
            onlineSetup.hidden = true; localSetup.hidden = false;
            setupModal.classList.add("active");
        }
    });

    // radio switcher for create/join
    createRoomRadio.addEventListener("change", () => {
        if (createRoomRadio.checked) { $("#createBox").hidden = false; $("#joinBox").hidden = true; }
    });
    joinRoomRadio.addEventListener("change", () => {
        if (joinRoomRadio.checked) { $("#createBox").hidden = true; $("#joinBox").hidden = false; }
    });

    startLocalBtn.addEventListener("click", startLocalGame);

    createRoomBtn.addEventListener("click", async () => {
        clearError();
        await createRoom();
        setupModal.classList.add("active"); // stay to show code
    });

    copyCodeBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(roomCode).catch(() => { });
        copyCodeBtn.textContent = "Copied!";
        setTimeout(() => copyCodeBtn.textContent = "Copy Code", 1200);
    });

    joinRoomBtn.addEventListener("click", async () => {
        clearError();
        await joinRoom();
    });

    rematchBtn.addEventListener("click", async () => {
        if (gameMode === "online") {
            await roomRef.transaction(room => {
                if (!room) return room;
                room.board = Array.from({ length: 6 }, () => Array(7).fill(0));
                room.currentPlayer = 1;
                room.status = "playing";
                room.winner = 0;
                return room;
            });
            winMessage.classList.remove("show");
            return;
        }
        resetForRematch();
    });

    newGameBtn.addEventListener("click", () => {
        winMessage.classList.remove("show");
        gameInfo.classList.remove("active");
        boardWrapper.classList.remove("active");
        setupModal.classList.add("active");
        if (gameMode === "online") {
            // keep connected; allow new rematch via same room
            // nothing else
        } else {
            player1Input.value = "";
            player2Input.value = "";
            clearError();
            initBoard();
        }
    });

    // Initialize board grid once
    initBoard();
})();
