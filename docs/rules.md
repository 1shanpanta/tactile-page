# Rules

The checker implements 17 rules. The data is in `src/rules/bana.ts`. The checks are in `src/rules/check.ts`.

Related: [architecture](architecture.md), [data model](data-model.md).

## Honesty note

- This is a check against selected rules, not compliance. The app never says a graphic meets the standard.
- The tests check geometry only. No blind reader has felt the output.
- A teacher must check every page by touch before a student uses it.
- The one sentence the app says: "Checked against 17 BANA rules: N pass, N fixed automatically, N need your review."

## Source

Braille Authority of North America, *Guidelines and Standards for Tactile Graphics, 2022*: <https://www.brailleauthority.org/sites/default/files/tg/Tactile%20Graphics%20Standards%20and%20Guidelines%202022.pdf>

Each number below was read in that PDF. The standard gives no minimum line weight in its numbered rules. The 2.0 pt floor comes from the sample line styles in Appendix F. The page margin (12.7 mm) and the speck size (0.75 mm) are choices of this project, not BANA figures.

## Statuses

- Pass: the output meets the rule, and the input did too.
- Fixed: the input broke the rule and the output does not.
- Review: the output still breaks the rule, or only a person can decide. A teacher must look.

## Rules checked

| Section | Meaning in plain words | What the app does |
| --- | --- | --- |
| Appendix F | Lines must be thick enough to feel. Thinnest sample: 2.0 pt. | Uses 2.0 pt (0.71 mm) as the floor. Thickens thin lines to 0.83 mm. |
| 2.11, 3.4.3.11 | Separate parts must be at least 3 mm apart. | Removes a small detail closer than 3 mm. Flags the rest. |
| 3.4.3.2 | Primary lines must be at least 12.5 mm long. | Flags shorter parts. |
| 3.4.3.3 | Dashes are 6 to 10 mm long. Gaps are about half a dash. | Draws straight dashed lines again. |
| 6.11.1.4 | A point is at least 3 mm wide. | Enlarges smaller points. |
| 6.11.1.4, 3.4.3.11 | A point has 3 mm of blank space around it. | Clears a 3 mm ring. |
| 2.6, 3.7.2 | No frame or border unless it is a frame of reference. | Removes an outline that only frames the graphic. |
| 2.7 | The graphic sits at the left margin, not centred. | Moves the graphic to the left margin. |
| 3.4.3.12, 5.10.5 | A label is 3 to 6 mm from its part. | Moves labels to a clear spot. Flags labels it cannot place. |
| 5.10.1 | Labels are horizontal. | Sets rotated labels horizontally. |
| 2.17 | Use a braille word, not a key, when the word fits. | Uses a key only when the word does not fit. |
| 5.8.1.1, 5.8.1.2, 5.8.1.6 | A key has two or three cells, one letter with dot 3 or 6, and avoids aa, ac, cc and ca. A number key has the numeric indicator and no period. | Builds keys from the label. Checks keys the teacher types. |
| 5.7.3, 5.8.4 | Letter keys in alphabetical order, then number keys in numeric order. | Sorts the key page and lays it out as 5.8.4 describes. |
| 5.10.4 | A single lower-case letter label takes a grade 1 indicator. A single capital does not. | Applies it. |
| 3.2.2 | At most five area textures, five line styles and five point symbols. | Uses one solid line, one dashed line and one point symbol. |
| 3.5.2 | A graphic that the reader must measure stays at print size, or a note gives the enlargement. | Always flags, because the app resizes the graphic. |
| 2.14, 10.2.10 | A transcriber's note explains changes to the print format. | Writes a draft note in print. Always flags it for review. |

## Rules read and left out

| Section | Rule | Reason |
| --- | --- | --- |
| 3.4.3.1 | Areas: minimum size "1/4 square inch (6 square millimeters)". | The two figures do not agree, so no number is checked. |
| 3.4.3.4 | Tick marks are 1/2 inch long and straddle the line. | The app cannot tell a tick mark from another short line. |
| 3.4.3.5, 3.4.3.6 | Lead lines are 2 to 3.75 cm long, straight and the least significant line. | Lead lines are kept as drawn. |
| 3.4.3.8 to 3.4.3.10 | Grid lines are weaker than axis lines and at least 1 cm apart. | The app does not tell grid lines from axis lines. |
| 3.4.2 | A graphic fits in 40 cells by 25 lines on 11.5 by 11 inch paper. | Output is for Letter or A4 swell paper. |
| 5.9, Appendix E | Area textures and texture samples in the key. | The app makes no textures. |
| Unit 6 | Nemeth Code labels and layouts for specific graph types. | Labels are uncontracted UEB only. |

## Braille source

- Labels are uncontracted Unified English Braille from a table in `src/braille/ueb.ts`.
- The table follows *The Rules of Unified English Braille*, second edition 2013 (ICEB).
- A character that is not in the table is left out and reported to the teacher.
- Dot size and spacing come from the BANA page "Size and Spacing of Braille Characters" (<https://www.brailleauthority.org/node/63>), which quotes Specification 800 of the National Library Service.
- BANA Appendix D.2 recommends a 24 point swell braille font for microcapsule paper. The app draws circles instead. Dots may need an adjustment for your fuser.
- liblouis was tried and not used. `translateString` aborted on Node 26 in the packages tried, and the wrapper licence (GPL-3.0) does not fit an MIT project.

## PIAF and swell paper facts

The exported file follows the first three points. The last three are for the person at the printer. The data is in `src/rules/piaf.ts`.

- Black only. "Printed images must be in black ink to be made tactile. Colour does not normally work." (Sight and Sound Technology, PIAF guidance on Zychem swell paper, <https://sastltd.zohodesk.eu/portal/en/kb/articles/piaf-guidance-on-using-zychem-swell-paper-to-make-tactile-documents-25-9-2024>)
- No print text. The fuser "raises the gray and black areas on microcapsule paper" (BANA 4.3.2), so print text would rise as clutter.
- Right-reading at 100 percent scale. No guide read for this project asks for a mirrored image on swell paper. BANA names a mirror image only for tooling on paper and foil (Appendix D.3.1).
- Use carbon-based toner or ink (BANA Appendix D.2). Test the printer first.
- Print on the coated side: "white side up" in the tray, and feed the fuser "image side up" (Anne Arundel Community College PIAF guide, <https://aacc.teamdynamix.com/TDClient/2439/Portal/KB/ArticleDet?ID=146333>).
- Start at the lowest heat setting and raise it until the image is raised (same guide).
