<!-- Copyright (C) 2026 Pelagic Games -->

# Word Quiz

Read a dictionary definition with the answer blanked out, then spell the word
from a tray of wooden letter tiles. The tray holds the answer's letters plus
four extra letters, chosen per puzzle so that a reload shows the same set.

## Playing

- Open `index.html` for the menu, or `puzzle.html` to start a random unsolved
  word. `puzzle.html?id=<id>` opens a particular puzzle, solved or not, which
  is the link used for sharing.
- Click a tile to place it in the leftmost empty space, drag it to a chosen
  space, or type its letter. Click or drag a placed tile to send it back;
  Backspace removes the last placed letter.
- The answer is checked automatically once every space is filled. Wrong
  answers flash and shake; correct ones are celebrated and recorded.
- "Ask for help" (unsolved) and "Challenge a friend" (solved) open a share
  overlay with a direct link. Instagram has no web share link, so its button
  copies the message instead; on phones the "Share…" button opens the
  system share sheet.

Solved puzzle IDs are kept in this browser's `localStorage` under
`wordquiz.solvedPuzzleIds`. "Next word" picks at random from the puzzles not
yet solved; when none remain the page says so. If the browser blocks storage,
the game still plays but solves are remembered only until the page is left, and
a focusable "Not saved" pill beside the tally and progress bar explains why.

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
