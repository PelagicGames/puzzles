<!-- Copyright (C) 2026 Pelagic Games -->

# Crowded-mode calibration

## Result

The crowded-mode difficulty boundaries implemented in [solver.js](./solver.js) are:

| Band | Normal-mode score | Crowded-mode score | Sample puzzles | Sample share | Strongest reasoning |
|------|-------------------|--------------------|----------------|--------------|---------------------|
| Very easy | 0-9 | 0-5 | 396,737 | 40.02% | 100% singles |
| Easy | 10-39 | 6-22 | 162,993 | 16.44% | 95.91% singles |
| Medium | 40-119 | 23-66 | 178,136 | 17.97% | 90.01% singles |
| Hard | 120-299 | 67-196 | 127,533 | 12.86% | 80.44% elimination; 17.58% singles; 1.97% trial placements |
| Very hard | 300+ | 197+ | 126,033 | 12.71% | 93.32% trial placements; 6.68% elimination |

The sample, share and reasoning columns describe this crowded-mode sample only. Normal-mode boundaries are unchanged; they come from the earlier normal-mode calibration described in [README.md](./README.md), so the two score columns were set by different methods. Published levels and the playable UI are unchanged. Crowded mode must be requested explicitly in the analysis APIs.

These are empirical difficulty estimates, not guarantees about which technique a person must use. In particular, "very hard" in this calibration is not synonymous with needing a trial placement.

## Metric and rules

**Crowdedness** counts orthogonally adjacent occupied-cell pairs with neither path connecting across their shared edge. Each shared edge counts once, even when a cell participates in several such pairs. Diagonal contact does not count. A crossroads is one occupied square for this metric.

A valid normal-mode board has crowdedness zero. Crowded mode permits positive crowdedness but still requires:

- both halves of every actual connection to match;
- exactly two boundary exits, including any marked ends;
- one continuous route visiting every path element;
- straight traversal of crossroads, with both axes visited;
- all fixed placements to be respected.

Crowdedness is measured on the unique solved arrangement, not on a partially placed board or a guessed arrangement. It is a separate metric, **not a multiplier or replacement for the difficulty score**.

The existing distractor-weighted scoring model is replayed using crowded-mode compatibility at every step, including elimination trials. Uniqueness is also recomputed under crowded rules; a normal-mode solution is never assumed to remain unique.

## Sample

The reproducible run used seed **20261103**, five workers with seeds **20261103, 20269022, 20276941, 20284860, 20292779**, and:

- **50,000 distinct solved-board canonical forms in each of the five crowdedness strata** (250,000 total), deduplicated under rotation and reflection;
- **991,432 unique crowded-mode puzzles**, including clue variants of those boards;
- observed crowdedness **0-59**;
- no duplicate canonical boards in the oversampled candidate pool.

Each worker generated 10,025 boards per stratum (50,125 in total); seed batches were then interleaved before trimming to the exact global quotas. Canonical identity is the full canonical board's 81 cell masks, not an unordered tile set or an approximate similarity threshold.

Boards are generated as bounded, seeded random walks, with perpendicular crossings allowed. The zero-crowdedness stratum is generated with the normal adjacency restriction, but its puzzles are made unique and scored under **crowded** rules. Positive-crowdedness candidates use wider path-length targets, 26-75 path units, and are accepted by their measured stratum rather than presumed crowdedness.

For each board, tiles are shuffled, clues are added until the crowded solver finds exactly one solution, and redundant clues are removed. A quarter of families deliberately retain both marked ends. The first variant is the reduced-clue puzzle; subsequent variants add randomly selected fixed tiles, recording about half the additions, up to six fixed tiles. Every recorded variant is separately checked for uniqueness and agreement with the generated solution.

The full sample was subsequently re-read and **all 991,432 puzzles were solved again**. Verification checked unique solutions, identical solved boards within families, canonical keys, crowdedness, fixed/marker counts, replay scores and techniques, difficulty labels, exact stratum quotas, and recalculated aggregate bands.

## Crowdedness coverage

All scores below are computed with crowded-mode rules, including the zero stratum.

| Crowdedness stratum | Sample boards | Unique puzzles | Median score | 90th percentile | Highest score |
|---------------------|---------------|----------------|--------------|-----------------|---------------|
| 0 | 50,000 | 196,661 | 17 | 401 | 899 |
| 1-9 | 50,000 | 197,956 | 16 | 381 | 865 |
| 10-19 | 50,000 | 197,817 | 14 | 329 | 833 |
| 20-39 | 50,000 | 199,225 | 12 | 190 | 680 |
| 40+ | 50,000 | 199,773 | 10 | 161 | 677 |

More crowded boards are **not necessarily harder**. In this generator's sample, the higher-crowdedness strata had lower median scores and fewer trial placements. Crowdedness alone therefore cannot determine a difficulty band.

## Boundary calculation and validation

The existing score is retained: distractors are weighted by 1 for singles, 2 for elimination, and `3 + log2(options)` for trial placements.

The first four seeds supplied **792,652 training puzzles**. The fifth seed, including all its board families, was held out, giving **198,780 validation puzzles**.

Boundaries were chosen as follows:

1. **Hard:** find the integer threshold minimizing the mean of the false-positive and false-negative rates for distinguishing singles-only puzzles from puzzles needing elimination or a trial.
2. **Very hard:** apply the same criterion to trial-placement versus non-trial puzzles, constrained to be above the hard boundary.
3. **Easy and medium:** split positive singles-only scores below the hard boundary into thirds. Zero-score puzzles stay very easy.

The lower two cuts are distribution-based subdivisions of singles reasoning, not natural changes in solving technique. Balanced error prevents the much more common singles puzzles from dominating the technique-boundary objective.

| Technique boundary | Score | Training balanced error | Held-out balanced error |
|--------------------|-------|-------------------------|-------------------------|
| Elimination or trial versus singles | 67 | 6.31% | 6.32% |
| Trial versus no trial | 197 | 1.97% | 1.94% |

Fitting all five seeds gives **0, 6, 23, 67, 196**, differing from the training fit only by one point at the very-hard boundary.

| Independent seed | Easy | Medium | Hard | Very hard |
|------------------|------|--------|------|-----------|
| 20261103 | 5 | 23 | 67 | 202 |
| 20269022 | 6 | 23 | 66 | 199 |
| 20276941 | 6 | 23 | 66 | 197 |
| 20284860 | 6 | 23 | 67 | 194 |
| 20292779 | 5 | 23 | 66 | 193 |

The separately fitted minima by crowdedness stratum are:

| Crowdedness | Easy | Medium | Hard | Very hard |
|-------------|------|--------|------|-----------|
| 0 | 5 | 21 | 64 | 182 |
| 1-9 | 5 | 22 | 66 | 182 |
| 10-19 | 6 | 23 | 69 | 206 |
| 20-39 | 6 | 24 | 73 | 217 |
| 40+ | 6 | 24 | 71 | 209 |

One global set is used rather than crowdedness-dependent bands: the metric already accounts for actual available moves. The per-stratum differences quantify residual uncertainty, especially at the very-hard boundary.

## Existing levels under crowded rules

All **60** existing solved boards have crowdedness zero, as expected. However:

- levels **8, 30 and 45** have at least two solutions when the adjacency restriction is removed;
- of the **57** levels that remain unique, **35** have changed distractor or technique replay statistics;
- the other **22** unique levels have unchanged replay statistics.

This confirms that a zero-crowdedness solution can still become non-unique or differently difficult in crowded mode. The unrestricted solver admits competing placements that normal mode rejects. Non-unique puzzles are not assigned a crowded difficulty score.

The table below compares each unique level's score under the normal-mode and crowded-mode calculations. Levels 8, 30 and 45 are omitted because they are not unique in crowded mode. Both scores use the same formula, so they can be compared directly; only the bands differ. Bold marks a score at least 1.5 times its normal-mode value, or a change of strongest technique.

| Level | Normal score | Normal band | Crowded score | Crowded band | Change | Ratio | Strongest technique (normal → crowded) |
|------:|-------------:|-------------|--------------:|--------------|-------:|------:|-----------------------------------------|
| 1 | 0 | very-easy | 0 | very-easy | 0 | — | singles |
| 2 | 0 | very-easy | 0 | very-easy | 0 | — | singles |
| 3 | 1 | very-easy | 1 | very-easy | 0 | 1.00× | singles |
| 4 | 6 | very-easy | 6 | easy | 0 | 1.00× | singles |
| 5 | 8 | very-easy | 8 | easy | 0 | 1.00× | singles |
| 6 | 9 | very-easy | 9 | easy | 0 | 1.00× | singles |
| 7 | 13 | easy | 13 | easy | 0 | 1.00× | singles |
| 9 | 27 | easy | 27 | medium | 0 | 1.00× | elimination |
| 10 | 33 | easy | 72 | hard | **+39** | **2.18×** | **singles → elimination** |
| 11 | 33 | easy | 33 | medium | 0 | 1.00× | singles |
| 12 | 37 | easy | 42 | medium | +5 | 1.14× | singles |
| 13 | 52 | medium | 48 | medium | -4 | 0.92× | singles |
| 14 | 64 | medium | 64 | medium | 0 | 1.00× | singles |
| 15 | 76 | medium | 74 | hard | -2 | 0.97× | singles |
| 16 | 87 | medium | 87 | hard | 0 | 1.00× | elimination |
| 17 | 106 | medium | 167 | hard | **+61** | **1.58×** | elimination |
| 18 | 114 | medium | 160 | hard | +46 | 1.40× | elimination |
| 19 | 135 | hard | 223 | very-hard | **+88** | **1.65×** | **elimination → guess** |
| 20 | 151 | hard | 151 | hard | 0 | 1.00× | elimination |
| 21 | 170 | hard | 170 | hard | 0 | 1.00× | elimination |
| 22 | 189 | hard | 155 | hard | -34 | 0.82× | elimination |
| 23 | 227 | hard | 395 | very-hard | **+168** | **1.74×** | **elimination → guess** |
| 24 | 263 | hard | 314 | very-hard | +51 | 1.19× | guess |
| 25 | 313 | very-hard | 353 | very-hard | +40 | 1.13× | guess |
| 26 | 363 | very-hard | 441 | very-hard | +78 | 1.21× | guess |
| 27 | 407 | very-hard | 477 | very-hard | +70 | 1.17× | guess |
| 28 | 445 | very-hard | 446 | very-hard | +1 | 1.00× | guess |
| 29 | 478 | very-hard | 599 | very-hard | +121 | 1.25× | guess |
| 31 | 0 | very-easy | 1 | very-easy | +1 | — | singles |
| 32 | 2 | very-easy | 2 | very-easy | 0 | 1.00× | singles |
| 33 | 3 | very-easy | 3 | very-easy | 0 | 1.00× | singles |
| 34 | 4 | very-easy | 4 | very-easy | 0 | 1.00× | singles |
| 35 | 5 | very-easy | 6 | easy | +1 | 1.20× | singles |
| 36 | 7 | very-easy | 8 | easy | +1 | 1.14× | singles |
| 37 | 12 | easy | 16 | easy | +4 | 1.33× | singles |
| 38 | 16 | easy | 16 | easy | 0 | 1.00× | elimination |
| 39 | 19 | easy | 19 | easy | 0 | 1.00× | singles |
| 40 | 21 | easy | 32 | medium | **+11** | **1.52×** | singles |
| 41 | 30 | easy | 31 | medium | +1 | 1.03× | elimination |
| 42 | 35 | easy | 36 | medium | +1 | 1.03× | singles |
| 43 | 47 | medium | 51 | medium | +4 | 1.09× | singles |
| 44 | 58 | medium | 58 | medium | 0 | 1.00× | singles |
| 46 | 81 | medium | 81 | hard | 0 | 1.00× | elimination |
| 47 | 96 | medium | 99 | hard | +3 | 1.03× | elimination |
| 48 | 100 | medium | 104 | hard | +4 | 1.04× | elimination |
| 49 | 161 | hard | 161 | hard | 0 | 1.00× | elimination |
| 50 | 208 | hard | 406 | very-hard | **+198** | **1.95×** | **elimination → guess** |
| 51 | 233 | hard | 376 | very-hard | **+143** | **1.61×** | **elimination → guess** |
| 52 | 247 | hard | 252 | very-hard | +5 | 1.02× | guess |
| 53 | 275 | hard | 277 | very-hard | +2 | 1.01× | guess |
| 54 | 289 | hard | 289 | very-hard | 0 | 1.00× | guess |
| 55 | 339 | very-hard | 443 | very-hard | +104 | 1.31× | guess |
| 56 | 386 | very-hard | 354 | very-hard | -32 | 0.92× | guess |
| 57 | 497 | very-hard | 500 | very-hard | +3 | 1.01× | guess |
| 58 | 522 | very-hard | 602 | very-hard | +80 | 1.15× | guess |
| 59 | 531 | very-hard | 536 | very-hard | +5 | 1.01× | guess |
| 60 | 532 | very-hard | 526 | very-hard | -6 | 0.99× | guess |

### Are the scores wildly different?

Mostly not. The two scores rank the 57 levels almost identically (Spearman rank correlation **0.989**; Pearson **0.972**):

- **22** scores are identical, **30** rise and **5** fall. The median absolute change is **2** points.
- Decreases are small: the largest is **−34** (level 22, 189 → 155).
- **7** levels rise sharply, by at least 1.5 times: 10 (33 → 72), 17 (106 → 167), 19 (135 → 223), 23 (227 → 395), 40 (21 → 32), 50 (208 → 406) and 51 (233 → 376). The largest change is **+198** (level 50).
- **5** of those also need a stronger technique: level 10 moves from singles to elimination, and levels 19, 23, 50 and 51 from elimination to a trial placement.

The large rises come from extra locally valid placements. Without the adjacency rule, pieces that would touch a neighbouring path without joining become legal candidates, so some solving steps have more distractors and fewer forced singles. Most band changes come from the boundaries rather than the scores: crowded bands are lower, so levels 4-6, 9, 11, 16, 46 and 54 keep exactly the same score but move up a band.

Individual results are in [crowded-calibration.json](./crowded-calibration.json).

## Limitations and authoring guidance

- Equal crowdedness quotas intentionally overrepresent some board shapes. These shares are **not estimates of the prevalence of difficulty bands among all possible Crosspath puzzles**.
- Random walks do not uniformly sample the space of valid paths. Crowdedness above 59 was not sampled; 59 is the observed maximum, not a proven maximum.
- Clue variants are correlated within a board. The sample contains 250,000 independent canonical board identities, not 991,432 independent board shapes. Holding out complete seed batches avoids splitting a family between training and validation.
- Clue policy matters substantially. The 250,000 reduced-clue variants have median score **194**, versus much lower scores after adding clues. Fitting only these variants yields minima **0, 40, 51, 80, 233**. The implemented boundaries target a mixed-clue catalogue spanning easy through very hard; a catalogue restricted to reduced-clue puzzles should be recalibrated.
- Reduced clues are locally irredundant under the removal pass, except for intentionally retained marked ends. This is not a proof of a globally smallest clue set.
- The scores model this solver's singles, elimination and trial strategy, not measured human solve times.

## Tests and outputs

Crowded-mode rules, scoring and catalogue tests, from the repository root:

```sh
node crosspath/crowded.test.js
node crosspath/crowded-levels.test.js
node crosspath/solver.test.js
node crosspath/puzzle-canonical.test.js
node crosspath/puzzle-progress.test.js
```

`crowded-calibration.json` holds the survey's aggregate statistics, fitted cuts, per-seed and per-stratum results, and the crowded-mode reanalysis of existing levels. The full pool of boards and puzzle codes (about 512 MB) is not part of the repository.
