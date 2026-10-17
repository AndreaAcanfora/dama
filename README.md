# Dama

Italian draughts (dama italiana) in the browser:

- **against the computer**, from Principiante to Maestro, a neural network trained by self-play;
- **two players** on the same phone;
- **online with a friend**: send a link, each plays from their own device.

Installable as a PWA; everything except online play works offline. Italian and English.

**Play:** https://andreaacanfora.github.io/dama/

## Rules

This is the Italian variant, which differs from English checkers and international draughts:

- 8×8 board with a dark square in each player's bottom-right corner. White moves first.
- Men move and capture one square diagonally, forward only.
- **A man can never capture a king.**
- Kings move one square in any diagonal direction (no flying kings).
- Capturing is compulsory, with this precedence:
  1. take the greatest number of pieces;
  2. if equal, capture with a king rather than a man;
  3. if equal, take the greatest number of kings;
  4. if equal, take the king that comes first in the sequence.
- A man that reaches the far row during a capture is crowned and the move ends.
- A side with no legal move loses. The game is drawn on threefold repetition or after 40 moves each without a capture or a man move.

The draw rules follow common practice; open an issue if you have the FID regulation text and it says otherwise.

## Layout

```
packages/engine     rules: bitboard move generation, FEN, game status (no dependencies)
packages/ai         alpha-beta levels, neural MCTS for Maestro, the arena script
packages/protocol   message types shared by the web app and the online server
apps/web            Vite + React + SVG app, PWA, deployed to GitHub Pages
apps/server         online game server (Node + ws), deployed to a VPS
training            Python self-play training (AlphaZero-style) and ONNX export
fixtures            engine.json and encoding.json: what every rules and encoding implementation must reproduce
```

## The engine

Squares are indexed 0..31 from White's back rank and stored as 32-bit masks. Notation numbers run 1..32 from the top-left square seen from White, so White's men start on 21..32 and moves read like `22-18` or `22x13x6`.

Perft from the starting position:

| depth | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| leaves | 7 | 49 | 302 | 1,469 | 7,361 | 36,473 | 177,532 | 828,783 |

Up to depth 5 this matches English checkers, as it should: the only captures that early are single jumps of men by men. From depth 6 the Italian "take the most pieces" rule starts pruning choices.

## The computer

Negamax alpha-beta with iterative deepening, a Zobrist transposition table, and compulsory captures searched past the horizon (a natural quiescence search, since a side that can capture must). The weaker levels score every root move at a shallow depth, add noise and occasionally play a random move, so they lose in a human way instead of collapsing at random.

| level | search |
|---|---|
| Principiante | depth 1, heavy noise, 25% random moves |
| Facile | depth 2, noise, 10% random moves |
| Medio | depth 4, light noise, 3% random moves |
| Difficile | up to 400 ms |
| Esperto | up to 1.5 s |
| Maestro | neural network trained by self-play, 800 MCTS simulations or 1.5 s |

### Maestro

Maestro is a small residual network (about 490k parameters, 1.9 MB) trained from zero, with no human games, AlphaZero-style: it played itself with Monte Carlo tree search and learned from the results. It runs in the browser with onnxruntime-web, downloaded only when you pick it. The training code is in [`training/`](training/).

| | |
|---|---|
| Self-play games | 57,600 (150 iterations × 384) |
| Training positions | 7.7 million |
| Training time | 9.9 hours on a MacBook Pro M1 Pro |
| Search during self-play | 128 simulations per move |

Measured with `pnpm --filter @dama/ai arena`: 24 games per match, each pair of games from the same 4 random opening moves with colours swapped, because both players are otherwise deterministic and would repeat the same game.

| match | wins | draws | losses | score |
|---|---|---|---|---|
| Maestro (800 simulations, 1.5 s) vs Esperto | 12 | 6 | 6 | 62.5% |
| network after 150 iterations, 200 simulations, vs Esperto | 3 | 17 | 4 | 47.9% |
| network after 100 iterations, 200 simulations, vs Esperto | 6 | 11 | 7 | 47.9% |
| network after 150 iterations, 200 simulations, vs Difficile | 10 | 10 | 4 | 62.5% |

With the browser's search budget Maestro scores about 90 Elo above Esperto. Twenty-four games are a small sample, so read these as rough numbers.

One lesson from the first run: self-play collapsed to about 80% draws, all by threefold repetition and often with a large material lead. The search could not see that returning to a twice-seen position ends the game, so a winning side happily repeated itself. Counting the game history inside the tree fixed it (`training/dama/mcts.py`).

## Online play

`apps/server` is a small Node WebSocket server. Each game is a room with a six-character code (`#/play/ABC234` in the app); the first player gets White, the second Black. The server is authoritative: it checks every move with the same engine as the app, so a modified client cannot cheat. Players get a token that gives them their seat back after a refresh or a network change, and a rematch swaps colours. Limits per connection and per address, an origin allow-list and idle-room cleanup keep it small: it uses about 70 MB of memory.

The app finds the server through `VITE_WS_URL` at build time; a build without it hides online play.

## Development

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # unit tests in every package
pnpm typecheck
pnpm --filter @dama/web exec playwright test   # end-to-end, mobile and desktop
```

To try online play locally, start the server too: `pnpm --filter @dama/server dev` (the dev app connects to `ws://localhost:8787`).

`#pos=<FEN>` in the URL opens a two-player game from that position, for example
`#pos=W:W19,K30,25,K3:BK14,10,6,1`.

## CI and deployment

All in GitHub Actions:

| workflow | when | what |
|---|---|---|
| `ci.yml` | every push and pull request | type checks, unit tests, Playwright on mobile and desktop, and the Python rules checked against the engine fixtures |
| `pages.yml` | push to `main` | builds the app and publishes it to GitHub Pages |
| `deploy-server.yml` | push to `main` touching the server or the code it bundles | runs the server tests, then redeploys it on the VPS over SSH with a key that can only run `scripts/deploy-server.sh` |

`main` is protected: changes from contributors go through a pull request with green CI and a review.

## Contributing

Issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
