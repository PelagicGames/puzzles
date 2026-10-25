<!-- Copyright (C) 2026 Pelagic Games -->

# Word Quiz

A quiz game where the player read a dictionary definition and has to work out
which word matches the definitions, using the letters provided.
There are some extra letters to make things a bit trickier.

I originally developed this game as a mobile app using
[Corona SDK](https://en.wikipedia.org/wiki/Solar2D) (now
[Solar2D](https://solar2d.com/)).
I never got around to publishing it, because I had not found an appropriate
source of definiions, and due to feature-creep with social sharing and
implementing a points system.

## Playing

- Open `index.html` for the menu, or `puzzle.html` to start a random unsolved
  word. `puzzle.html?id=<id>` opens a particular puzzle, solved or not, which
  is the link used for sharing.
- Click a tile to place it in the leftmost empty space, drag it to a chosen
  space, or type its letter. Click or drag a placed tile to send it back.
  Backspace removes the last placed letter.
- The answer is checked automatically once every space is filled, with success
  or failure indicated to the user.
- "Ask for help" (unsolved) and "Challenge a friend" (solved) open a share
  overlay with a direct link to various different social media sites/apps.
  On phones the "Share…" button opens the system share sheet.

Solved puzzle IDs are kept in this browser's `localStorage` under
`wordquiz.solvedPuzzleIds`. "Next word" picks at random from the puzzles not
yet solved;, if there are any.

## Files

| File | Purpose |
| --- | --- |
| `index.html`, `menu.js` | Menu with progress and rules |
| `puzzle.html`, `puzzle.js` | Play page: clue, spaces, tray, drag and keyboard input, feedback |
| `puzzle-bank.js` | Puzzle data: ID, part of speech, clue (`{}` marks a blank), tiles and answer check |
| `word-check.js` | Answer checking against the stored digest |
| `progress.js` | Solved-puzzle storage and random unsolved selection |
| `share.js` | Share messages, app links and the share overlay |
| `styles.css`, `assets/wordquiz.svg` | Presentation and matching wooden-tile logo |
| `assets/tiles/a.svg` … `z.svg` | Scalable wooden letter faces for tray, answer and drag tiles |
| `tiles.test.js` | Tile asset and SVG structure checks (`node wordquiz/tiles.test.js`) |
| `ATTRIBUTION.md` | Dictionary source and licence notice |

## Answers

The bank contains no answers. Each puzzle stores a PBKDF2-SHA-256 digest of
its upper-case answer, salted with the puzzle ID, and a guess is accepted
when it produces the same digest. This keeps answers out of the page source
and developer console, but it is not encryption: a script that tries
dictionary words against a digest can still find the answer.

Puzzle IDs are stable, so shared links and saved progress survive future
additions to the bank.

## Tests

```sh
node wordquiz/bank.test.js
node wordquiz/game-logic.test.js
```

## Attribution

Definitions are adapted from Open English WordNet (CC BY 4.0), which derives
from Princeton WordNet 3.1. See [ATTRIBUTION.md](./ATTRIBUTION.md).
