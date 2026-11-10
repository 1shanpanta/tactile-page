# Data model

Main TypeScript types. All lengths are in millimetres (mm) unless the table says pixels (px). Working resolution is 8 px per mm, so 1 px is 0.125 mm.

Related: [architecture](architecture.md), [components](components.md), [rules](rules.md).

## Geometry (`src/pipeline/bitmap.ts`)

- `Bitmap`: `width` and `height` in px. `data[y * width + x]` is 1 for ink and 0 for paper.
- `Box`: `x`, `y` (top left corner) and `w`, `h` (size). Units depend on the context. Boxes in `PlacedLabel`, `DiagramElement` and `Finding` are in mm.

## Input (`src/io/loadSource.ts`, `src/pipeline/run.ts`)

`LoadedSource`
- `name`: file or sample name.
- `kind`: `'svg'` or `'raster'`.
- `originalUrl`: the untouched picture, for the "before" side.
- `frame`: `Box` in mm. Where the picture lies on the working sheet.
- `input`: a `PipelineInput`.

`PipelineInput`
- `gray`: greyscale pixels. 0 is black, 255 is white.
- `width`, `height`: size in px.
- `pxPerMm`: scale, 8.
- `labels`: `SourceLabel[]` read from an SVG. Empty for a raster picture.
- `findText`: true for a raster picture. Words are then found in the pixels.
- `drawableWidthMm`: page width minus both margins, in mm.

`SourceLabel` (`src/pipeline/labels.ts`)
- `id`, `text`.
- `box`: where the print label sits, in mm.
- `rotationDeg`: rotation in degrees.

## Edits (`src/pipeline/run.ts`)

`Edits` is the teacher's work. The app never changes it in place.
- `remove`: ids of parts the teacher removed.
- `keep`: ids of parts the teacher restored. No automatic step may remove them.
- `erase`: `Box[]` rubbed out by hand, in mm.
- `labels`: `Map<string, LabelEdit>`. Per label: `text`, `x` and `y` (mm), `mode` (`'word'` or `'key'`), `key` and `deleted`.
- `added`: labels the teacher added by hand.

## Output (`src/pipeline/run.ts`)

`RasterStage`: work that depends only on the picture and on removed parts. Holds the raw and fixed ink indexes, `elements`, `changes`, `outlines`, and the ink-only rule measurements before and after the fixes.

`PipelineOutput`
- `ink`, `index`: the fixed drawing and its distance fields.
- `pxPerMm`, `bounds`: scale and sheet area in mm.
- `labels`: `PlacedLabel[]`.
- `unread`: ids of found words with no typed text yet.
- `key`: `KeyEntry[]`.
- `elements`: `DiagramElement[]`.
- `changes`: `Change[]` made by the automatic fixes.
- `results`: `RuleResult[]`.
- `note`: draft transcriber's note. Empty when nothing changed.
- `outlines`: closed vector outlines.
- `shift`: `{x, y}` in mm that moves the content to the margins.
- `steps`: `Step[]` shown in the Compare panel.
- `elementAt(xMm, yMm)`: id of the part near a point, or null. The pick radius is 1.5 mm.

`DiagramElement` (`src/pipeline/fix.ts`)
- `id`: shape id in the untouched input. Stable across edits.
- `box`: bounding box in mm.
- `removedBy`: `'you'`, `'speck'`, `'frame'`, `'too-close'` or null.

`Change`: `rule` (a `RuleId` or `'despeckle'`) and `message`.

`Outline`: `number[]` of x, y pairs in mm. `Corner` (`src/pipeline/trace.ts`) describes one rounded corner as a quadratic curve.

## Labels (`src/pipeline/labels.ts`)

`PlacedLabel`
- `id`, `text`.
- `mode`: `'word'` or `'key'`.
- `key`: key letters, or null for a word.
- `braille`: cells drawn on the graphic. These are the word or the key.
- `wordBraille`: cells of the full word, also when a key is drawn.
- `box`: position and size in mm.
- `rotationDeg`: rotation in degrees.
- `unsupported`: characters that are not in the braille table.
- `pinned`: true when the teacher set the position.

`KeyEntry`
- `key`, `keyBraille`: key letters and their cells.
- `text`, `braille`: the full label and its cells.
- `numeric`: true for a number key.

## Rules (`src/rules`)

- `RuleDefinition`: `id`, `section` (in the BANA 2022 edition), `title`, `requirement` and `autoFix` (null when only a person can decide).
- `Measurement`: `rule`, `ok`, `summary` and `findings`.
- `Finding`: `message` and optional `at` (`Box` in mm).
- `RuleResult`: `rule`, `status` (`'pass'`, `'fixed'` or `'flagged'`), `summary` and `findings`.
- `DiagramState`: the input for `measureLayout()`. It has `index`, `labels`, `key`, `bounds`, `leftGapMm`, `resized` and `changes`.
- `LIMITS` (`bana.ts`): every number the checker uses, in mm. `MM_PER_POINT` is 25.4 / 72. A line of 2.0 pt is 0.71 mm.

## Export (`src/export/page.ts`)

- `PageSpec`: `id` (`'letter'` or `'a4'`), `name`, `widthMm`, `heightMm`.
- `Sheet`: `page`, `title`, `description`, `outlines` and `dots`. Positions are in mm from the top left corner of the paper.
- `Dot` (`src/braille/cells.ts`): `cx`, `cy`, the dot centre in mm.
- `BRAILLE` (`src/braille/cells.ts`): `dotDiameterMm` 1.44, `dotPitchMm` 2.34, `cellPitchMm` 6.2, `linePitchMm` 10.

## AI (`src/ai/suggest.ts`)

- `LabelSpot`: `id`, `text`, and `x`, `y` as fractions of the picture from the top left.
- `LabelSuggestion`: `id`, `text`, `essential` and `reason`.
- `SuggestResult`: `{ ok: true, suggestions }` or `{ ok: false, error }`. `error` is `'bad_key'`, `'refused'` or `'failed'`.
