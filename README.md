# Tactile Page

Blind and low-vision students often get textbook diagrams that are only pictures. A teacher of students with visual impairments (TVI) or a braille transcriber must redraw each one by hand before it can be printed on swell paper.

Tactile Page makes the first draft of that redrawing in the browser. The teacher checks it, edits it and prints it.

Built for the CTRL-V Hackathon (theme: access).

## What it does

1. Takes a clean diagram (PNG, JPG or SVG) or one of four original samples.
2. Simplifies it with plain pixel arithmetic. No AI model is used.
   - Black and white (a pale colour fill becomes paper).
   - Specks and a decorative frame are removed.
   - Thin lines are thickened.
   - Small details that crowd another part are removed.
   - Dashed lines are drawn again with standard dashes.
   - Plotted points are enlarged and get clear space.
3. Sets the labels in braille. A label that does not fit becomes a two-letter key.
4. Checks the result against 17 rules from the BANA standard. Each rule shows as pass, fixed automatically, or flagged for the teacher, with its section number.
5. Lets the teacher move, edit or delete a label, remove a part, or rub out an area.
6. Exports an SVG and a PDF at true physical size, plus a braille key page.

## What it does not do

- It does not replace the teacher. It is a first pass.
- It does not state that a graphic meets the BANA standard. It reports "checked against 17 BANA rules, N need your review".
- It does not handle phone photos of curved book pages, shaded art or 3D drawings.
- It does not read text in a PNG or JPG. It finds printed words of two or more letters and shows a braille question mark until the teacher types the word. Single letters and upright text are not found and stay as raised ink.
- It does not make area textures. A filled area stays solid black.
- It does not write Nemeth Code or contracted braille.

**No blind reader has felt this output.** The tests check geometry only. A teacher must check every page by touch before a student uses it.

## Run it

```
npm install
npm run dev        # start the app
npm test           # unit tests
npm run typecheck  # strict TypeScript
npm run build      # production build in dist/
```

Tested on Node 26.

## BANA rules that are checked

Source: Braille Authority of North America, *Guidelines and Standards for Tactile Graphics, 2022*, <https://www.brailleauthority.org/sites/default/files/tg/Tactile%20Graphics%20Standards%20and%20Guidelines%202022.pdf>. Each number below was read in that PDF. The rule data is in `src/rules/bana.ts`.

| Section | Rule as the standard states it | What the app does |
| --- | --- | --- |
| Appendix F | Line styles for microcapsule paper list "Plotted line 3 (2.0pt)" as the thinnest solid plotted line. | Uses 2.0 pt (0.71 mm) as the floor. Thickens thinner lines to 0.83 mm. |
| 2.11, 3.4.3.11 | "Clutter occurs when components of the graphic are too close together." "The space between a point symbol and any other component must be a minimum of 1/8 inch (3 millimeters)." | Applies 3 mm between all separate parts. Removes a short detail that is closer. Flags the rest. |
| 3.4.3.2 | "Primary lines must be a minimum of 1/2 inch (1.25 centimeters) in length." | Flags shorter parts. |
| 3.4.3.3 | "The length of each dash should be 1/4 to 3/8 inch (6 millimeters to 1 centimeter), separated by spaces approximately half the length of the dash." | Draws straight dashed lines again. |
| 6.11.1.4 | "The point should not be smaller than 1/8 inch (3 millimeters) in diameter." | Enlarges smaller points. |
| 6.11.1.4, 3.4.3.11 | "... use a 1/8-inch (3-millimeter) blank space all around a point to separate it from the surrounding material." | Clears a 3 mm ring. |
| 2.6, 3.7.2 | "Frames or borders found around many print diagrams should be eliminated unless it provides a frame of reference." | Removes an outline that only frames the graphic. |
| 2.7 | "The tactile graphic should be positioned at the left margin of the page, rather than centered." | Moves the graphic to the left margin. |
| 3.4.3.12, 5.10.5 | Labels sit "a minimum of 1/8 inch (3 millimeters) to a maximum of 1/4 inch (6 millimeters)" from the component. | Moves labels to a clear spot. Flags the ones it cannot place. |
| 5.10.1 | "Labels should be placed horizontally." | Sets rotated labels horizontally. |
| 2.17 | "Use a braille label (word) instead of a keyed symbol when the label itself will fit." | Uses a key only when the word does not fit. |
| 5.8.1.1, 5.8.1.2, 5.8.1.6 | A key has two or three cells. One letter must have dot 3 or dot 6. Avoid aa, ac, cc and ca. A number key has the numeric indicator and no period. | Builds keys from the label and checks keys the teacher types. |
| 5.7.3, 5.8.4 | Letter keys in alphabetical order, then number keys in numeric order. | Sorts the key page. Lays it out as 5.8.4 describes. |
| 5.10.4 | A single lower-case letter label takes a grade 1 indicator. A single capital does not. | Applies it. |
| 3.2.2 | "No more than five different area textures, five different line styles, and five different types of point symbols." | Uses one solid line, one dashed line and one point symbol. |
| 3.5.2 | A graphic that the reader must measure "must be produced at exactly the same size as shown in print". | Always flags, because the app resizes the graphic. |
| 2.14, 10.2.10 | "Use transcriber's notes to explain changes made to the print format." | Writes a draft note in print. Always flags it for review. |

### Read in the standard and left out

| Section | Rule | Reason |
| --- | --- | --- |
| 3.4.3.1 | Areas: minimum size "1/4 square inch (6 square millimeters)". | The two figures do not agree, so no number is checked. |
| 3.4.3.4 | Tick marks are 1/2 inch long and straddle the line. | The app cannot tell a tick mark from another short line. |
| 3.4.3.5, 3.4.3.6 | Lead lines are 2 to 3.75 cm long, straight and the least significant line. | Lead lines are kept as drawn. |
| 3.4.3.8 to 3.4.3.10 | Grid lines are weaker than axis lines and at least 1 cm apart. | Grid and axis lines are not told apart. |
| 3.4.2 | A graphic fits in 40 cells by 25 lines on 11.5 by 11 inch paper. | Output is for Letter or A4 swell paper. |
| 5.9, Appendix E | Area textures and texture samples in the key. | No textures are made. |
| Unit 6 | Nemeth Code labels and layouts for specific graph types. | Labels are uncontracted UEB only. |

The standard gives no minimum line weight in its numbered rules. The 2.0 pt floor comes from the sample line styles in Appendix F, and the app says so in its rule list. The page margin (12.7 mm) and the speck size (0.75 mm) are choices of this project, not BANA figures.

## Braille

Labels are uncontracted Unified English Braille from a table in `src/braille/ueb.ts`. It covers letters, capitals, digits with the numeric indicator, common punctuation and a few symbols (degree, plus, equals, percent and others). The table follows *The Rules of Unified English Braille*, second edition 2013 (ICEB). A character that is not in the table is left out and reported to the teacher.

liblouis was tried first. The npm packages `liblouis` 0.4.0 and `liblouis-build` 3.2.0-rc load in Node, but `translateString` aborted inside the compiled code on Node 26. The wrapper is also GPL-3.0, which does not fit an MIT project. So liblouis is not used.

Braille dots are drawn as circles, not with a font: 1.44 mm dots, 2.34 mm apart in a cell, 6.2 mm from cell to cell, 10 mm from line to line. These figures are on the BANA page "Size and Spacing of Braille Characters" (<https://www.brailleauthority.org/node/63>), which quotes Specification 800 of the National Library Service. BANA Appendix D.2 recommends a 24 point swell braille font for microcapsule paper. Dots may need to be adjusted for your fuser.

## Swell paper and PIAF

The exported file follows these points:

- Black only. "Printed images must be in black ink to be made tactile. Colour does not normally work." (Sight and Sound Technology, PIAF guidance on Zychem swell paper, <https://sastltd.zohodesk.eu/portal/en/kb/articles/piaf-guidance-on-using-zychem-swell-paper-to-make-tactile-documents-25-9-2024>)
- No print text. The fuser "raises the gray and black areas on microcapsule paper" (BANA 4.3.2), so print text would rise as clutter.
- Right-reading at 100 percent scale. No guide we read asks for a mirrored image on swell paper. BANA names a mirror image only for tooling on paper and foil (Appendix D.3.1).

At the printer: use carbon-based toner or ink (BANA Appendix D.2), print "white side up" and feed the fuser "image side up", and start at the lowest heat (Anne Arundel Community College PIAF guide, <https://aacc.teamdynamix.com/TDClient/2439/Portal/KB/ArticleDet?ID=146333>).

## Optional AI step

Off by default. The teacher can type an Anthropic API key into the page. The key stays in memory and is never stored. The model proposes label text and which labels can be left off. The teacher accepts or ignores each proposal. This step was not run against the live API during development.

## Limits

- Parts that touch count as one part. One click removes all of them. Use the rub-out tool for a smaller area.
- A dot is found only when it is clearly wider than its line. An arrowhead can be missed or mistaken.
- Only straight dashed lines are drawn again.
- A label is placed by distance, not by meaning. It can land near the wrong part.
- The draft transcriber's note is print text. The teacher must rewrite it and braille it.
- Line width is measured to the nearest pixel, which is 0.125 mm.

## Code layout

- `src/pipeline/`: image pipeline, plain TypeScript, no React.
- `src/rules/`: BANA rule data and the checker, plain TypeScript, no React.
- `src/braille/`, `src/export/`: braille table, dot geometry, SVG and PDF writers.
- `src/samples/`: four diagrams drawn for this project. None is copied from a textbook.
- `src/components/`, `src/App.tsx`: the interface.

## Licence

MIT. See `LICENSE`. Contact: ispanta03@gmail.com
