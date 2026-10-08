# Mastermind Online

A tiny two-player real-time Mastermind game built with Node.js, Express, and Socket.IO.

## Rules
- One player sets a 4-color secret code using 6 colors; repeats are allowed.
- The other player has 10 guesses.
- Black feedback peg = correct color in the correct position.
- White feedback peg = correct color in the wrong position.
- Roles swap every round.
- Match wins stay on the scoreboard across rounds.

## Gifts / power-ups
The code-maker may give the guesser **one gift per round**:
- **Redo Last Guess** — after a scored guess, the guesser can erase that most recent guess and try again without losing the attempt.
- **Position Hint** — immediately reveals one exact position and its color.

The gift is voluntary: you are helping your opponent.

## Run locally
1. Install Node.js 18+.
2. In this folder run:
   ```bash
   npm install
   npm start
   ```
3. Open `http://localhost:3000`.

## Play over the internet
Deploy this folder as a Node web service (for example Render, Railway, Fly.io, or another Node host). Use:
- Build command: `npm install`
- Start command: `npm start`

Then send your friend the deployed URL. One player creates a room and shares the 5-character room code.

## Note on persistence
Rooms and scores are stored in server memory. If the server restarts, active rooms and scores reset. That keeps this version simple and requires no database.
