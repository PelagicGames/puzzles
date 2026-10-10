# Light Discs

Light Discs is a browser puzzle about combining coloured light filters and geometric patterns. The player rotates and moves three translucent triangles around a fixed black triangle, then overlaps their corner discs to reproduce three target appearances.

## Pages

- **Tutorial** documents every colour interaction, every available shape, the controls, and the success conditions.
- **Puzzles** contains the authored levels.
- **Random** generates a new solvable filter puzzle whenever the page loads or Reset is pressed, and displays its copyable level code.
- **Design** accepts a level code so custom layouts can be edited and tested.

## How to play

The board contains a fixed black triangle with three white corner discs. White represents the absence of a filter, so all RGB light channels pass through it.

Three coloured triangles surround the fixed triangle:

- Drag a triangle by its body.
- Drag empty board space to scroll the page. At increased browser page zoom, the enlarged board can also be scrolled horizontally.
- Triangles remain within the rendered board, including while rotated.
- Drop it while one or more of its corner discs overlap fixed corner discs to snap them together.
- A drop with no overlapping corner returns the triangle to its starting position.
- Use the curved arrows to rotate a free triangle clockwise or anticlockwise in 60-degree steps.
- Rotation is disabled after a triangle has snapped.

The small discs in the centre of the fixed triangle show the required target appearances. Their status rings indicate whether each target currently matches:

- Green: matched
- Orange: not matched

Hover, focus, click, or tap a target to open an enlarged, vector-rendered target-versus-current comparison. The progress summary also reports matched targets, snapped triangles, and snapped circles.

## Filter colours

Every filter colour is represented as a set of RGB light channels:

| Colour | Channels |
| --- | --- |
| White | Red + green + blue |
| Black | None |
| Cyan | Green + blue |
| Yellow | Red + green |
| Magenta | Red + blue |
| Red | Red |
| Green | Green |
| Blue | Blue |

Overlapping filters retain only channels present in every filter. For example:

- Cyan + yellow = green
- Magenta + cyan = blue
- Red + cyan = black
- Blue + yellow = black
- White + any colour = that colour
- Black + any colour = black

The board uses RGB-channel intersection to render overlapping filters. The success matcher represents each colour channel and geometric region as a Boolean expression, then compares the resulting colour-and-shape formations without pixel sampling.

## Filter patterns

Each movable corner disc has a background filter colour and may contain a differently coloured shape:

- No shape
- Square
- 12-pointed star formed from three squares rotated by 60 degrees
- Equilateral triangle
- Six-pointed star formed from a triangle and its reflection
- Large disc
- Small disc
- Annulus formed by subtracting the small disc from the large disc

Patterns rotate with their triangle. Matching is based on the resulting colour-and-shape formation rather than the names of the source shapes. Composite shapes are expanded into their geometric parts, so three rotated squares are equivalent to a 12-pointed star and complementary colour patterns can simplify to a solid disc.

## Targets and success

Generated target states use one, two, or three snapped circles from each movable triangle. Possible distributions are:

`1-1-3`, `1-2-2`, `1-2-3`, `1-3-3`, `2-2-2`, `2-2-3`, `2-3-3`, and `3-3-3`.

The generated target pose always contains at least five snapped circles. This makes random targets more constrained, but it is not a condition the player's solution must reproduce.

Success requires all of the following:

1. Each of the three movable triangles has at least one corner circle snapped to a fixed circle.
2. All three resulting colour-and-pattern formations match their targets.

Moving a snapped triangle away immediately hides the success state.

## Solvability framework

`solver.js` treats the continuous-looking board as a finite constraint problem. A
rigid equilateral triangle can have only 39 distinct snapped poses: 27 with one
snapped circle, 9 with two, and 3 with all three. The solver never samples
arbitrary screen coordinates.

For triangle \(i\), its placement vector is

`P_i = (s, M, T, r, m_0, m_1, m_2)`

where `s` is its snapped-circle count, `M` and `T` are three-bit masks for its
moving and target circles, `r` is its rotation in 60-degree steps, and `m_j` is
the target position occupied by moving circle `j` or `-1`.

A snapped filter has component vector

`F = (background RGB mask, shape RGB mask, shape kind, rotation)`

and contributes to exactly one target circle. The complete state vector is the
ordered tuple of the three placement vectors, the three ordered multisets of
filter contributions, and the snapped-triangle count. Snapping is addition to a
target's contribution multiset. This is not ordinary vector addition: evaluating
the sum intersects the three-bit RGB masks in every geometric region. Shape
regions are represented by Boolean variables, so equivalent composite shapes
and colours compare exactly without pixel sampling.

Solvability uses the following reductions before search:

1. Enumerate the distinct local ways that zero to three movable circles can make
   each target. A target with no construction proves the puzzle unsolvable.
2. If a target has one local construction, restrict every triangle to poses
   compatible with those forced circles and orientations.
3. Enforce generalized arc consistency. A pose is removed unless every target
   has a supporting pair of poses from the other triangles. This catches forced
   target constructions that cannot coexist.
4. If choices remain, branch on the triangle with the smallest domain, propagate
   constraints again, and memoize local target compositions. Search therefore
   considers only supported poses rather than the full Cartesian product.

Solutions are equivalence classes. Two poses are the same solution when they use
the same source circles at each target and every snapped shape has the same
canonical geometric orientation. Rotating a no-shape disc, circular shape,
12-pointed star, or six-pointed star therefore does not create another solution.
Equivalent poses remain available internally so every equivalent solved state
has path-distance zero. Each returned solution contains its state vector,
minimum-move formulation, and a shorthand such as `T1:R2+G1'`.

### Distance metrics

The **solution-distance** is the sum of the three target-circle distances plus
one for every unsnapped triangle. A target-circle distance compares background
RGB channels, shape RGB channels, shape-region keys, distinct shape rotations,
and exact Boolean-region output. It is zero precisely when the current
formation matches that target.

The **path-distance** is the shortest weighted path from the current placement
vectors to any solution. Its pose graph charges one move for each 60-degree
rotation of a singly snapped circle, change of snapped circle or target
position, change of the free circle or free target position with two circles
snapped, 120-degree rotation with three circles snapped, and snap or unsnap
operation. Dijkstra's algorithm finds the minimum over all solution states.

### Complexity

Complexity is derived from the complete solution set, reset path-distance, and
near-solution traps. Multiple-solution puzzles are classified **Very low**.
Unique-solution puzzles start at **Moderate** and increase according to their
minimum reset path and the number and severity of states with low
solution-distance but high path-distance. The authored puzzle page computes and
displays the classification, score details, and solution count for the selected
level.

## Puzzle codes

Authored levels are listed in `puzzles.js`. Each level has a title and a code containing four sections in this order:

`R: <red triangle> G: <green triangle> B: <blue triangle> T: <targets>`

Each section contains exactly three space-separated circles in top, left, bottom order. A circle starts with one lowercase shape indicator. `n` is followed by one background colour; every other shape is followed by a background colour and a shape colour.

Random codes use `?` for a target whose combined filters do not reduce to one encodable shape.

Colours:

| Code | Colour |
| --- | --- |
| `w` | White |
| `r` | Red |
| `g` | Green |
| `b` | Blue |
| `y` | Yellow |
| `c` | Cyan |
| `m` | Magenta |
| `k` | Black |

Shapes:

| Code | Shape |
| --- | --- |
| `n` | No shape |
| `s` | Square |
| `t` | Equilateral triangle |
| `l` | Large disc |
| `d` | Small disc |
| `a` | Annulus |
| `v` | 12-pointed star |
| `x` | Six-pointed star |

Rotation marks follow the shape indicator and represent 60-degree steps. Squares support `s`, `s'`, and `s''`; triangles support `t` and `t'`. Other shapes cannot have rotation marks. For example, `s'wr` is a once-rotated red square on white.

## Project files

- `index.html` - main menu
- `tutorial.html` and `tutorial.js` - rules and visual references
- `random.html` and `lightdiscs.js` - interactive generated game
- `random.js` - read-only Random code display and copy action
- `design.html` and `design.js` - custom level-code editor and game
- `playground.html` - redirect retained for old Random links
- `filter-composition.js` - shared mathematical colour renderer used throughout the game
- `puzzle-math.js` - exact Boolean-region formation algebra
- `puzzle-code.js` - strict parser for authored puzzle codes
- `solver.js` - reduced constraint solver, state vectors, distances, and complexity
- `solver.test.js` - headless regression checks for the mathematical framework
- `puzzles.html` and `puzzles.js` - authored-level page and level list
- `styles.css` - shared presentation
- `assets/light-disc.svg` - game mark used on the main menu

The project has no build step. Serve this directory with any static HTTP server and open `index.html`.

The game uses a single SVG coordinate system and vector colour composition for consistent alignment across Chromium, Firefox, and WebKit-based browsers.
