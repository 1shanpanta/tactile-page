/**
 * Rules taken from the BANA "Guidelines and Standards for Tactile Graphics",
 * 2022 edition. Every number here was read in that PDF. The section is kept
 * beside each rule so a teacher can open the source and check it.
 */

export const BANA_SOURCE = {
  title: 'Guidelines and Standards for Tactile Graphics, 2022',
  publisher: 'Braille Authority of North America',
  url: 'https://www.brailleauthority.org/sites/default/files/tg/Tactile%20Graphics%20Standards%20and%20Guidelines%202022.pdf',
} as const

export const MM_PER_POINT = 25.4 / 72

export const LIMITS = {
  /** Appendix F: "Plotted line 3 (2.0pt)", the thinnest solid plotted line sample. */
  minLineWidthMm: 2 * MM_PER_POINT,
  /** Appendix F: "Dashed (2.5pt)". */
  dashedLineWidthMm: 2.5 * MM_PER_POINT,
  /** 3.4.3.11 and 6.11.1.4: 1/8 inch (3 millimeters). */
  minGapMm: 3,
  /** 3.4.3.2: 1/2 inch (1.25 centimeters). */
  minLineLengthMm: 12.5,
  /** 3.4.3.3: dashes of 1/4 to 3/8 inch (6 millimeters to 1 centimeter). */
  dashMinMm: 6,
  dashMaxMm: 10,
  /** 3.4.3.3: spaces "approximately half the length of the dash". */
  dashGapRatio: 0.5,
  /** 6.11.1.4: a point not smaller than 1/8 inch (3 millimeters) in diameter. */
  minPointDiameterMm: 3,
  /** 3.4.3.12 and 5.10.5: 1/8 inch (3 mm) to 1/4 inch (6 mm) from the component. */
  labelMinGapMm: 3,
  labelMaxGapMm: 6,
  /** 3.4.3.5: preferred minimum lead line length, 3/4 inch (2 centimeters). */
  leadLineMinMm: 20,
  /** 3.2.2: no more than five line styles, area textures or point symbols. */
  maxStyles: 5,
} as const

export type RuleId =
  | 'line-weight'
  | 'spacing'
  | 'line-length'
  | 'dashes'
  | 'point-size'
  | 'point-clearance'
  | 'frame'
  | 'left-margin'
  | 'label-distance'
  | 'label-horizontal'
  | 'word-before-key'
  | 'key-format'
  | 'key-order'
  | 'single-letter'
  | 'variety'
  | 'enlargement'
  | 'transcriber-note'

export interface RuleDefinition {
  id: RuleId
  /** Section or appendix in the 2022 edition. */
  section: string
  title: string
  /** The requirement, quoted or closely paraphrased from the source. */
  requirement: string
  /** What Tactile Page does by itself, or null when only a person can decide. */
  autoFix: string | null
}

export const RULES: readonly RuleDefinition[] = [
  {
    id: 'line-weight',
    section: 'Appendix F',
    title: 'Lines are heavy enough to feel',
    requirement:
      'The line styles for microcapsule paper list "Plotted line 3 (2.0pt)" as the thinnest solid plotted line. Tactile Page uses 2.0 pt (0.71 mm) as its floor. The appendix shows samples and does not state a minimum.',
    autoFix: 'Thinner lines are thickened.',
  },
  {
    id: 'spacing',
    section: '2.11, 3.4.3.11',
    title: 'Separate parts are 3 mm apart',
    requirement:
      '"Clutter occurs when components of the graphic are too close together." "The space between a point symbol and any other component must be a minimum of 1/8 inch (3 millimeters)." Tactile Page applies 3 mm between all separate parts.',
    autoFix: 'A small detail closer than 3 mm to a larger part is removed.',
  },
  {
    id: 'line-length',
    section: '3.4.3.2',
    title: 'Lines are long enough to follow',
    requirement: '"Primary lines must be a minimum of 1/2 inch (1.25 centimeters) in length."',
    autoFix: null,
  },
  {
    id: 'dashes',
    section: '3.4.3.3',
    title: 'Dashed lines use standard dashes',
    requirement:
      '"The length of each dash should be 1/4 to 3/8 inch (6 millimeters to 1 centimeter), separated by spaces approximately half the length of the dash."',
    autoFix: 'Straight dashed lines are drawn again with dashes of 6 to 10 mm.',
  },
  {
    id: 'point-size',
    section: '6.11.1.4',
    title: 'Points are at least 3 mm wide',
    requirement: '"The point should not be smaller than 1/8 inch (3 millimeters) in diameter."',
    autoFix: 'Smaller points are enlarged to 3 mm.',
  },
  {
    id: 'point-clearance',
    section: '6.11.1.4, 3.4.3.11',
    title: 'Points have clear space around them',
    requirement:
      '"It is especially important for microcapsule and computer-embossed graphics to use a 1/8-inch (3-millimeter) blank space all around a point to separate it from the surrounding material."',
    autoFix: 'A 3 mm ring is cleared around each point.',
  },
  {
    id: 'frame',
    section: '2.6, 3.7.2',
    title: 'No frame around the graphic',
    requirement:
      '"Frames or borders found around many print diagrams should be eliminated unless it provides a frame of reference."',
    autoFix: 'An outline that only frames the graphic is removed.',
  },
  {
    id: 'left-margin',
    section: '2.7',
    title: 'Graphic starts at the left margin',
    requirement:
      '"The tactile graphic should be positioned at the left margin of the page, rather than centered."',
    autoFix: 'The graphic is moved to the left margin.',
  },
  {
    id: 'label-distance',
    section: '3.4.3.12, 5.10.5',
    title: 'Labels sit 3 to 6 mm from their part',
    requirement:
      '"Labels should be placed a minimum of 1/8 inch (3 millimeters) to a maximum of 1/4 inch (6 millimeters) from any other component. If the label cannot be placed within the minimum and maximum distance, the label must be placed far enough away to allow a 3/4-inch (2 centimeter) lead line."',
    autoFix: 'Labels that touch a line are moved to the nearest clear spot.',
  },
  {
    id: 'label-horizontal',
    section: '5.10.1',
    title: 'Labels read horizontally',
    requirement: '"Labels should be placed horizontally on the tactile graphic master."',
    autoFix: 'Rotated labels are set horizontally.',
  },
  {
    id: 'word-before-key',
    section: '2.17',
    title: 'Words are used where they fit',
    requirement:
      '"Use a braille label (word) instead of a keyed symbol when the label itself will fit in the available space."',
    autoFix: 'A label becomes a key only when the word does not fit.',
  },
  {
    id: 'key-format',
    section: '5.8.1.1, 5.8.1.2, 5.8.1.6',
    title: 'Keys are well formed',
    requirement:
      'A letter key uses two or three cells. "One of the letters in each key entry must include dot 3 and/or dot 6." "The use of aa, ac, cc, and ca as a two-cell alphabetic key should be avoided." In a numeric key, "the numeric indicator must precede each number and is brailled without a period."',
    autoFix: 'Keys are made from the letters of the label.',
  },
  {
    id: 'key-order',
    section: '5.7.3, 5.8.4',
    title: 'Key page is in order',
    requirement:
      'Letter keys come before number keys. "The keyed abbreviations are to be presented in alphabetical order on the key listing." "Numbered keys should be placed in numeric order."',
    autoFix: 'The key page is sorted.',
  },
  {
    id: 'single-letter',
    section: '5.10.4',
    title: 'Single letters carry the right indicator',
    requirement:
      '"A grade 1 symbol indicator is not required with a single capital letter that is used as a label on a tactile graphic. A grade 1 symbol indicator is required with an uncapitalized letter (including a, i, and o)."',
    autoFix: 'The indicator is added to lower-case single letters.',
  },
  {
    id: 'variety',
    section: '3.2.2',
    title: 'No more than five kinds of line, texture or point',
    requirement:
      '"A single graphic should contain no more than five different area textures, five different line styles, and five different types of point symbols."',
    autoFix: 'The output uses one solid line, one dashed line and one point symbol.',
  },
  {
    id: 'enlargement',
    section: '3.5.2',
    title: 'Size is safe for measuring tasks',
    requirement:
      '"When diagrams require the reader to use a ruler to measure or to use a distance scale to compare areas, it must be produced at exactly the same size as shown in print." If it is enlarged, "a transcriber’s note must precede the graphic explaining the amount of enlargement."',
    autoFix: null,
  },
  {
    id: 'transcriber-note',
    section: '2.14, 10.2.10',
    title: 'Changes are explained in a note',
    requirement:
      '"Use transcriber’s notes to explain changes made to the print format." "Determine if transcriber’s notes are needed to clarify the elimination of details."',
    autoFix: 'A draft note lists every change. A person must review it.',
  },
]

export function ruleById(id: RuleId): RuleDefinition {
  const rule = RULES.find((candidate) => candidate.id === id)
  if (!rule) throw new Error(`Unknown rule: ${id}`)
  return rule
}

/** Rules read in the source and left out, with the reason. Shown in the app and the README. */
export const SKIPPED_RULES: readonly { section: string; text: string; reason: string }[] = [
  {
    section: '3.4.3.1',
    text: 'Areas: minimum size "1/4 square inch (6 square millimeters)".',
    reason: 'The two figures in the source do not agree, so no number is checked.',
  },
  {
    section: '3.4.3.4',
    text: 'Tick marks are 1/2 inch long and straddle the line.',
    reason: 'The pipeline cannot tell a tick mark from another short line.',
  },
  {
    section: '3.4.3.5, 3.4.3.6',
    text: 'Lead lines are 2 to 3.75 cm long, straight and the least significant line.',
    reason: 'Lead lines are kept as drawn. They are not recognised or redrawn.',
  },
  {
    section: '3.4.3.8 to 3.4.3.10',
    text: 'Grid lines are weaker than axis lines and at least 1 cm apart.',
    reason: 'Grid and axis lines are not told apart.',
  },
  {
    section: '3.4.2',
    text: 'A graphic fits in 40 cells by 25 lines on 11.5 by 11 inch paper.',
    reason: 'Output is for Letter or A4 swell paper, not for an embosser page.',
  },
  {
    section: '5.9, Appendix E',
    text: 'Area textures and texture samples in the key.',
    reason: 'Filled areas stay solid black. No textures are made.',
  },
  {
    section: 'Unit 6',
    text: 'Nemeth Code labels and the layout of specific graph types.',
    reason: 'Labels are uncontracted UEB only.',
  },
]
