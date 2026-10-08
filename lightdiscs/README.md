# Light Discs

Light Discs is a browser puzzle about combining coloured light filters and geometric patterns. The player rotates and moves three translucent triangles around a fixed black triangle, then overlaps their corner discs to reproduce three target appearances.

## Pages

- **Tutorial** documents every colour interaction, every available shape, the controls, and the success conditions.
- **Playground** generates a new solvable filter puzzle whenever the page loads or Reset is pressed.
- **Puzzles** is reserved for a future set of authored levels.

## How to play

The board contains a fixed black triangle with three white corner discs. White represents the absence of a filter, so all RGB light channels pass through it.

Three coloured triangles surround the fixed triangle:

- Drag a triangle by its body.
- Drag empty board space to scroll the page or the horizontally scrollable board on smaller screens.
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

## Project files

- `index.html` - main menu
- `tutorial.html` and `tutorial.js` - rules and visual references
- `playground.html` and `lightdiscs.js` - interactive generated game
- `filter-composition.js` - shared mathematical colour renderer used by the tutorial and playground
- `styles.css` - shared presentation
- `assets/light-disc.svg` - game mark used on the main menu

The project has no build step. Serve this directory with any static HTTP server and open `index.html`.

The playground uses a single SVG coordinate system and vector colour composition for consistent alignment across Chromium, Firefox, and WebKit-based browsers.
