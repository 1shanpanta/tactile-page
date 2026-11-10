# Architecture

## What it is

Tactile Page is a website: a single-page web app that runs fully in the browser. It is not a browser extension and not a desktop app. There is no server, no account and no upload.

- `npm run build` writes static files to `dist/`. Any static host can serve them from its root path.
- No live hosted copy exists yet. Run it locally with `npm run dev`.
- The main path makes no network call. The code reads and processes the picture in the page.
- The optional AI step is the only network use. It is off by default. See "Optional AI step" below.

Related: [components](components.md), [data model](data-model.md), [rules](rules.md).

## Data flow

```
 file or sample          src/io/loadSource.ts
      |                  scale to the page, 8 px per mm, greyscale
      v
 PipelineInput
      |
      v   rasterStage()  (slow: runs again after a part is removed or erased)
 binarize -> detectText -> autoFix -> indexInk -> traceOutlines -> measureInk
      |
      v   finish()       (fast: runs again after every label edit)
 placeLabels -> buildKey -> measureLayout -> compare
      |
      v
 PipelineOutput ---> UI (src/App.tsx, src/components)
      |
      +--> src/export: sheet -> SVG and PDF
```

`src/pipeline/run.ts` holds `rasterStage()` and `finish()`. React code calls only these two functions.

## Source loading (`src/io/loadSource.ts`)

- `loadSvg()` reads an SVG, removes scripts and similar content, and reads each `<text>` element as a label. It then removes the text from the picture.
- `loadFile()` accepts PNG, JPG and SVG up to 15 MB. A PNG or JPG has no labels, so `findText` is true.
- `fitToPage()` scales the picture to the area between the page margins. It gives the greyscale pixels, the label boxes and the `frame` that places the picture on the sheet.
- `SourceError` carries a `LoadError` code. `App.tsx` turns each code into a message.
- `src/samples/` holds four SVG diagrams drawn for this project.

## Pipeline (`src/pipeline`)

Stages in the order they run:

1. `binarize.ts`: Otsu threshold. A pale colour fill becomes paper. A dark ground is inverted.
2. `detectText.ts`: finds rows of two or more letter-sized shapes in a raster picture, erases them and returns their boxes. It does not read them.
3. `fix.ts`: `autoFix()` removes specks and frames, thickens thin lines, removes crowding details, redraws dashes, enlarges points and clears a ring around them.
4. `measure.ts`: `indexInk()` builds distance fields and shape labels. The finders (`findThinStrokes`, `findPoints`, `findFrame`, `findDashChains`, `findCloseGaps`) read this index.
5. `labels.ts`: `placeLabels()` sets each label as a braille word or a key and finds a clear spot for it. `buildKey()` sorts the key page.
6. `trace.ts`: `traceOutlines()` turns the ink into closed vector outlines in millimetres.
7. `components.ts`, `distance.ts`, `bitmap.ts`: shared helpers for connected shapes, distance maps and bitmaps.

`autoFix()` removes whole shapes first. Shape ids therefore refer to the untouched input and stay stable across edits.

## Rule checker (`src/rules`)

- `bana.ts`: `LIMITS` (numbers in mm), `RULES` (17 rule definitions) and `SKIPPED_RULES`.
- `check.ts`: `measureInk()` and `measureLayout()` give a `Measurement` for each rule. `compare()` joins the measurement before the fixes with the measurement after them. The result is `pass`, `fixed` or `flagged`.
- `piaf.ts`: swell paper print facts, shown next to the export button.
- `summarize()` writes the only sentence the app says about the standard. It never says "compliant".

Rule details: [rules](rules.md).

## Braille (`src/braille`)

- `ueb.ts`: uncontracted Unified English Braille from a built-in table. `toBraille()` returns cells and a list of unsupported characters. `INDICATORS` holds the capital, numeric, grade 1 and transcriber's note cells.
- `cells.ts`: dot geometry. Dots are 1.44 mm wide, 2.34 mm apart in a cell, 6.2 mm from cell to cell and 10 mm from line to line. `brailleDots()` returns dot centres in mm.
- Dots are drawn as circles. No braille font is used.

## Export (`src/export`)

- `page.ts`: `PAGES` (US Letter and A4), `MARGIN_MM` (12.7), `PX_PER_MM` (8), `graphicSheet()`, `keySheet()` and `keyPageLines()`. A `Sheet` holds outlines and dots in mm from the top left corner of the paper.
- `svg.ts`: `sheetToSvg()` writes one sheet. One user unit is one millimetre. All marks are black. The file has no print text.
- `pdf.ts`: `sheetsToPdf()` writes the same sheets as a PDF, with no PDF library.
- `src/lib/download.ts` gives the file to the browser as a download.

## Optional AI step (`src/ai/suggest.ts`)

- `suggestLabels()` is the only code that uses the network. It runs only when the teacher types an Anthropic API key and clicks the button.
- It sends the picture and the label positions. It receives a proposed word and an "essential" flag for each label.
- The reply is parsed and filtered. Only well formed entries for labels that exist are kept.
- The teacher accepts or ignores each proposal. Nothing is applied by itself.
- The key lives in component state in `AiPanel.tsx`. It is not stored.
- The SDK is loaded with a dynamic `import()`, so it is not downloaded when the step is not used.

## UI (`src/App.tsx`, `src/components`)

`App.tsx` owns one `Session` (origin, source, raster stage, edits, output). Each user action builds a new `Edits` value. Then `App.tsx` calls `rasterStage()` when the drawing changes, or only `finish()` when a label changes. See [components](components.md).

## Known limits

- Parts that touch count as one part.
- A dot is found only when it is clearly wider than its line.
- Only straight dashed lines are drawn again.
- A label is placed by distance, not by meaning.
- Line width is measured to the nearest pixel, which is 0.125 mm.
