const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();
const COLORS = ['red','orange','yellow','green','blue','purple'];

function makeCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function scoreGuess(secret, guess) {
  let exact = 0;
  const secretLeft = [];
  const guessLeft = [];
  for (let i = 0; i < 4; i++) {
    if (secret[i] === guess[i]) exact++;
    else {
      secretLeft.push(secret[i]);
      guessLeft.push(guess[i]);
    }
  }
  let colorOnly = 0;
  for (const c of guessLeft) {
    const idx = secretLeft.indexOf(c);
    if (idx !== -1) {
      colorOnly++;
      secretLeft.splice(idx, 1);
    }
  }
  return { exact, colorOnly };
}

function scoreFor(room, id) {
  return room.scores[id] || 0;
}

function publicState(room, viewerId) {
  const role = viewerId === room.setterId ? 'setter' : viewerId === room.guesserId ? 'guesser' : null;
  return {
    code: room.code,
    phase: room.phase,
    setterName: room.setterName,
    guesserName: room.guesserName,
    guesses: room.guesses,
    winner: room.winner,
    secretReady: !!room.secret,
    myRole: role,
    roundNumber: room.roundNumber,
    scores: {
      setter: scoreFor(room, room.setterId),
      guesser: scoreFor(room, room.guesserId)
    },
    gift: {
      granted: room.gift.type,
      used: room.gift.used,
      canGive: role === 'setter' && room.phase === 'playing' && !room.gift.type,
      canUseRedo: role === 'guesser' && room.gift.type === 'redo' && !room.gift.used && room.guesses.length > 0,
      hint: room.gift.hint
    }
  };
}

function emitState(room) {
  if (room.setterId) io.to(room.setterId).emit('room-state', publicState(room, room.setterId));
  if (room.guesserId) io.to(room.guesserId).emit('room-state', publicState(room, room.guesserId));
}

function resetRound(room) {
  room.secret = null;
  room.guesses = [];
  room.winner = null;
  room.phase = 'setting';
  room.gift = { type: null, used: false, hint: null };
  room.roundNumber += 1;
}

io.on('connection', (socket) => {
  socket.on('create-room', ({ name }) => {
    let code;
    do code = makeCode(); while (rooms.has(code));
    const room = {
      code,
      setterId: socket.id,
      setterName: (name || 'Player 1').slice(0, 30),
      guesserId: null,
      guesserName: null,
      secret: null,
      guesses: [],
      phase: 'waiting',
      winner: null,
      scores: { [socket.id]: 0 },
      roundNumber: 1,
      gift: { type: null, used: false, hint: null }
    };
    rooms.set(code, room);
    socket.join(code);
    socket.emit('room-created', publicState(room, socket.id));
  });

  socket.on('join-room', ({ code, name }) => {
    code = (code || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return socket.emit('error-message', 'Room not found.');
    if (room.guesserId) return socket.emit('error-message', 'That room already has two players.');
    room.guesserId = socket.id;
    room.guesserName = (name || 'Player 2').slice(0, 30);
    room.scores[socket.id] = 0;
    room.phase = room.secret ? 'playing' : 'setting';
    socket.join(code);
    emitState(room);
  });

  socket.on('set-secret', ({ code, secret }) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room || socket.id !== room.setterId) return;
    if (!Array.isArray(secret) || secret.length !== 4 || secret.some(c => !COLORS.includes(c))) return;
    room.secret = secret;
    room.phase = room.guesserId ? 'playing' : 'waiting';
    emitState(room);
  });

  socket.on('give-gift', ({ code, type }) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room || socket.id !== room.setterId || room.phase !== 'playing' || room.gift.type) return;
    if (!['redo', 'hint'].includes(type)) return;

    room.gift.type = type;
    room.gift.used = type === 'hint';
    if (type === 'hint') {
      const pos = Math.floor(Math.random() * 4);
      room.gift.hint = { position: pos, color: room.secret[pos] };
    }
    emitState(room);
    io.to(room.guesserId).emit('gift-received', { type });
  });

  socket.on('use-redo', ({ code }) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room || socket.id !== room.guesserId || room.phase !== 'playing') return;
    if (room.gift.type !== 'redo' || room.gift.used || room.guesses.length < 1) return;
    room.guesses.pop();
    room.gift.used = true;
    emitState(room);
    io.to(room.setterId).emit('gift-used', { type: 'redo' });
  });

  socket.on('submit-guess', ({ code, guess }) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room || socket.id !== room.guesserId || room.phase !== 'playing') return;
    if (!Array.isArray(guess) || guess.length !== 4 || guess.some(c => !COLORS.includes(c))) return;
    const result = scoreGuess(room.secret, guess);
    room.guesses.push({ guess, ...result });
    if (result.exact === 4) {
      room.phase = 'finished';
      room.winner = room.guesserName;
      room.scores[room.guesserId] = scoreFor(room, room.guesserId) + 1;
    } else if (room.guesses.length >= 10) {
      room.phase = 'finished';
      room.winner = room.setterName;
      room.scores[room.setterId] = scoreFor(room, room.setterId) + 1;
    }
    emitState(room);
    if (room.phase === 'finished') {
      io.to(room.code).emit('game-over', { winner: room.winner, secret: room.secret });
    }
  });

  socket.on('new-round', ({ code }) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room || room.phase !== 'finished' || (socket.id !== room.setterId && socket.id !== room.guesserId)) return;
    [room.setterId, room.guesserId] = [room.guesserId, room.setterId];
    [room.setterName, room.guesserName] = [room.guesserName, room.setterName];
    resetRound(room);
    emitState(room);
  });

  socket.on('disconnect', () => {
    for (const [code, room] of rooms.entries()) {
      if (room.setterId === socket.id || room.guesserId === socket.id) {
        io.to(code).emit('error-message', 'The other player disconnected. Refresh to start a new room.');
        rooms.delete(code);
      }
    }
  });
});

server.listen(PORT, () => console.log(`Mastermind running on port ${PORT}`));
