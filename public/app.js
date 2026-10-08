const socket = io();
const COLORS = ['red','orange','yellow','green','blue','purple'];
let state = null;
let currentPick = [];
let revealedSecret = null;
let toastTimer = null;

const $ = id => document.getElementById(id);
const lobby = $('lobby');
const game = $('game');

function toast(msg) {
  clearTimeout(toastTimer);
  $('toast').textContent = msg;
  $('toast').classList.remove('hidden');
  toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 2600);
}

function prettyColor(color) {
  return color ? color[0].toUpperCase() + color.slice(1) : '';
}

function renderSlots(id, picks) {
  const el = $(id); el.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'slot' + (picks[i] ? ' ' + picks[i] : '');
    d.setAttribute('aria-label', picks[i] ? `${prettyColor(picks[i])}, remove` : `Empty position ${i + 1}`);
    d.onclick = () => {
      if (i < currentPick.length) {
        currentPick.splice(i, 1);
        render();
      }
    };
    el.appendChild(d);
  }
}

function renderPalette(id) {
  const el = $(id); el.innerHTML = '';
  COLORS.forEach(c => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'color-btn ' + c;
    b.title = prettyColor(c);
    b.setAttribute('aria-label', `Add ${c}`);
    b.onclick = () => {
      if (currentPick.length < 4) {
        currentPick.push(c);
        render();
      }
    };
    el.appendChild(b);
  });
}

function renderBoard() {
  const board = $('board'); board.innerHTML = '';
  if (!state?.guesses?.length) return;
  const h = document.createElement('h2'); h.textContent = 'Guesses'; board.appendChild(h);
  state.guesses.forEach((g, idx) => {
    const row = document.createElement('div'); row.className = 'row';
    const n = document.createElement('div'); n.textContent = idx + 1;
    const pegs = document.createElement('div'); pegs.className = 'row-pegs';
    g.guess.forEach(c => {
      const p = document.createElement('div');
      p.className = 'peg ' + c;
      p.title = prettyColor(c);
      pegs.appendChild(p);
    });
    const fb = document.createElement('div'); fb.className = 'feedback';
    fb.title = `${g.exact} exact, ${g.colorOnly} right color wrong spot`;
    for (let i = 0; i < g.exact; i++) {
      const p = document.createElement('div'); p.className = 'pin black'; fb.appendChild(p);
    }
    for (let i = 0; i < g.colorOnly; i++) {
      const p = document.createElement('div'); p.className = 'pin white'; fb.appendChild(p);
    }
    row.append(n, pegs, fb); board.appendChild(row);
  });
}

function renderGift() {
  $('giftPanel').classList.add('hidden');
  $('giftStatus').classList.add('hidden');
  $('hintBox').classList.add('hidden');
  $('useRedo').classList.add('hidden');

  if (!state.guesserName || state.phase === 'finished' || state.phase === 'setting') return;

  if (state.gift.canGive) {
    $('giftPanel').classList.remove('hidden');
  } else if (state.myRole === 'setter' && state.gift.granted) {
    $('giftStatus').classList.remove('hidden');
    $('giftStatus').textContent = state.gift.granted === 'redo'
      ? (state.gift.used ? 'Your Redo gift was used.' : 'You gave a Redo. Your opponent can use it after a guess.')
      : 'You gave a Position Hint.';
  } else if (state.myRole === 'guesser' && state.gift.granted) {
    $('giftStatus').classList.remove('hidden');
    $('giftStatus').textContent = state.gift.granted === 'redo'
      ? (state.gift.used ? 'Your gifted Redo has been used.' : 'You were gifted a Redo!')
      : 'You were gifted a Position Hint!';
  }

  if (state.gift.hint) {
    const { position, color } = state.gift.hint;
    $('hintBox').classList.remove('hidden');
    $('hintBox').innerHTML = `<strong>Hint:</strong> Position ${position + 1} is <span class="mini-peg ${color}" aria-label="${prettyColor(color)}"></span> ${prettyColor(color)}.`;
  }

  if (state.gift.canUseRedo && state.myRole === 'guesser' && state.phase === 'playing') {
    $('useRedo').classList.remove('hidden');
  }
}

function renderScore() {
  $('roundNumber').textContent = state.roundNumber || 1;
  $('setterScoreName').textContent = state.setterName || 'Setter';
  $('guesserScoreName').textContent = state.guesserName || 'Waiting…';
  $('setterScore').textContent = state.scores?.setter ?? 0;
  $('guesserScore').textContent = state.scores?.guesser ?? 0;
}

function render() {
  if (!state) return;
  lobby.classList.add('hidden'); game.classList.remove('hidden');
  $('roomCode').textContent = state.code;
  $('players').textContent = `${state.setterName || 'Setter'} sets the code • ${state.guesserName || 'Waiting for player 2'} guesses`;
  $('setterPanel').classList.add('hidden');
  $('guesserPanel').classList.add('hidden');
  $('endPanel').classList.add('hidden');

  renderScore();

  if (!state.guesserName) $('status').textContent = 'Waiting for your friend to join…';
  else if (state.phase === 'setting') $('status').textContent = state.myRole === 'setter' ? 'Set a secret code.' : 'Your friend is choosing the secret code…';
  else if (state.phase === 'playing') $('status').textContent = state.myRole === 'guesser' ? `Guess the code. ${10 - state.guesses.length} guesses left.` : 'Your friend is guessing…';
  else if (state.phase === 'finished') $('status').textContent = 'Round finished.';

  if (state.myRole === 'setter' && !state.secretReady && state.guesserName) {
    $('setterPanel').classList.remove('hidden');
    renderSlots('secretSlots', currentPick);
    renderPalette('setterPalette');
  }
  if (state.myRole === 'guesser' && state.phase === 'playing') {
    $('guesserPanel').classList.remove('hidden');
    renderSlots('guessSlots', currentPick);
    renderPalette('guesserPalette');
  }

  renderGift();
  renderBoard();
  if (state.phase === 'finished') {
    $('endPanel').classList.remove('hidden');
    $('winnerText').textContent = `${state.winner} wins the round!`;
    if (revealedSecret) {
      $('secretReveal').innerHTML = '<p>Secret code:</p><div class="row-pegs">' + revealedSecret.map(c => `<div class="peg ${c}"></div>`).join('') + '</div>';
    }
  }
}

$('create').onclick = () => socket.emit('create-room', { name: $('name').value.trim() });
$('join').onclick = () => socket.emit('join-room', { code: $('roomInput').value, name: $('name').value.trim() });
$('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(state.code);
    toast('Room code copied');
  } catch {
    toast(`Room code: ${state.code}`);
  }
};
$('lockSecret').onclick = () => {
  if (currentPick.length !== 4) return toast('Choose 4 colors');
  socket.emit('set-secret', { code: state.code, secret: [...currentPick] });
  currentPick = [];
};
$('submitGuess').onclick = () => {
  if (currentPick.length !== 4) return toast('Choose 4 colors');
  socket.emit('submit-guess', { code: state.code, guess: [...currentPick] });
  currentPick = [];
};
$('giveRedo').onclick = () => socket.emit('give-gift', { code: state.code, type: 'redo' });
$('giveHint').onclick = () => socket.emit('give-gift', { code: state.code, type: 'hint' });
$('useRedo').onclick = () => socket.emit('use-redo', { code: state.code });
$('newRound').onclick = () => socket.emit('new-round', { code: state.code });

socket.on('room-created', s => { state = s; currentPick = []; revealedSecret = null; render(); });
socket.on('room-state', s => { state = s; currentPick = []; if (s.phase !== 'finished') revealedSecret = null; render(); });
socket.on('gift-received', ({ type }) => toast(type === 'redo' ? 'Your opponent gifted you a Redo!' : 'Your opponent gifted you a Position Hint!'));
socket.on('gift-used', () => toast('Your opponent used the Redo you gave them.'));
socket.on('game-over', data => { revealedSecret = data.secret; render(); });
socket.on('error-message', toast);
