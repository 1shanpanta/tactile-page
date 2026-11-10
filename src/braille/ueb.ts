/**
 * Uncontracted Unified English Braille for short labels. The table follows
 * "The Rules of Unified English Braille", second edition 2013 (ICEB):
 * letters (4.1), numbers (6), capitals (8), punctuation (7) and symbols (3).
 */

function cell(dots: string): string {
  let bits = 0
  for (const dot of dots) bits |= 1 << (Number(dot) - 1)
  return String.fromCharCode(0x2800 + bits)
}

function cells(...patterns: string[]): string {
  return patterns.map(cell).join('')
}

const LETTERS: Record<string, string> = {
  a: '1', b: '12', c: '14', d: '145', e: '15', f: '124', g: '1245', h: '125', i: '24',
  j: '245', k: '13', l: '123', m: '134', n: '1345', o: '135', p: '1234', q: '12345',
  r: '1235', s: '234', t: '2345', u: '136', v: '1236', w: '2456', x: '1346', y: '13456',
  z: '1356',
}

const DIGITS: Record<string, string> = {
  '1': '1', '2': '12', '3': '14', '4': '145', '5': '15',
  '6': '124', '7': '1245', '8': '125', '9': '24', '0': '245',
}

const SYMBOLS: Record<string, string> = {
  ',': cells('2'),
  ';': cells('23'),
  ':': cells('25'),
  '.': cells('256'),
  '!': cells('235'),
  '?': cells('236'),
  "'": cells('3'),
  '’': cells('3'),
  '-': cells('36'),
  '(': cells('5', '126'),
  ')': cells('5', '345'),
  '[': cells('46', '126'),
  ']': cells('46', '345'),
  '/': cells('456', '34'),
  '"': cells('6', '2356'),
  '+': cells('5', '235'),
  '=': cells('5', '2356'),
  '−': cells('5', '36'),
  '×': cells('5', '236'),
  '÷': cells('5', '34'),
  '<': cells('4', '126'),
  '>': cells('4', '345'),
  '%': cells('46', '356'),
  '°': cells('45', '245'),
  $: cells('4', '234'),
  '&': cells('4', '12346'),
  '*': cells('5', '35'),
  '@': cells('4', '1'),
  '#': cells('456', '1456'),
}

export const INDICATORS = {
  capital: cell('6'),
  capitalWord: cells('6', '6'),
  capitalTerminator: cells('6', '3'),
  numeric: cell('3456'),
  grade1: cell('56'),
  space: cell(''),
  transcriberNoteOpen: cells('4', '46', '126'),
  transcriberNoteClose: cells('4', '46', '345'),
} as const

const isLower = (ch: string | undefined): boolean => ch !== undefined && ch >= 'a' && ch <= 'z'
const isUpper = (ch: string | undefined): boolean => ch !== undefined && ch >= 'A' && ch <= 'Z'
const isLetter = (ch: string | undefined): boolean => isLower(ch) || isUpper(ch)
const isDigit = (ch: string | undefined): boolean => ch !== undefined && ch >= '0' && ch <= '9'

export interface BrailleText {
  /** Unicode braille patterns, one character per cell. */
  cells: string
  /** Print characters that are not in the table and were left out. */
  unsupported: string[]
}

/** True when every dot of the letter is in the top two rows, so it has no dot 3 or 6. */
export function isUpperCellLetter(letter: string): boolean {
  const dots = LETTERS[letter.toLowerCase()]
  return dots !== undefined && !dots.includes('3') && !dots.includes('6')
}

/**
 * Translates one label. `isLabel` applies BANA 5.10.4: a label that is one
 * lower-case letter takes the grade 1 indicator, a single capital does not.
 */
export function toBraille(text: string, isLabel = false): BrailleText {
  const source = text.trim().replace(/\s+/g, ' ')
  const unsupported: string[] = []
  let out = ''
  let i = 0

  if (isLabel && source.length === 1 && isLower(source)) {
    return { cells: INDICATORS.grade1 + cell(LETTERS[source]), unsupported }
  }

  while (i < source.length) {
    const ch = source[i]

    if (isDigit(ch)) {
      out += INDICATORS.numeric
      while (i < source.length) {
        const c = source[i]
        const next = source[i + 1]
        if (isDigit(c)) out += cell(DIGITS[c])
        else if (c === '.' && isDigit(next)) out += cell('256')
        else if (c === ',' && isDigit(next)) out += cell('2')
        else if (c === '/' && isDigit(next)) out += cell('34')
        else break
        i++
      }
      // A letter a to j right after a number would read as another digit.
      if (isLower(source[i]) && source[i] <= 'j') out += INDICATORS.grade1
      continue
    }

    if (isLetter(ch)) {
      let end = i
      while (isLetter(source[end])) end++
      const run = source.slice(i, end)
      const alone = run.length === 1 && !"'’-".includes(source[i - 1] ?? ' ') &&
        !"'’-".includes(source[end] ?? ' ') && !isDigit(source[i - 1])
      if (alone && isLower(run) && !'aio'.includes(run)) out += INDICATORS.grade1
      let k = 0
      while (k < run.length) {
        if (isUpper(run[k])) {
          let caps = k
          while (isUpper(run[caps])) caps++
          if (caps - k >= 2) {
            out += INDICATORS.capitalWord
            for (; k < caps; k++) out += cell(LETTERS[run[k].toLowerCase()])
            if (k < run.length) out += INDICATORS.capitalTerminator
          } else {
            out += INDICATORS.capital + cell(LETTERS[run[k].toLowerCase()])
            k++
          }
        } else {
          out += cell(LETTERS[run[k]])
          k++
        }
      }
      i = end
      continue
    }

    if (ch === ' ') out += INDICATORS.space
    else if (SYMBOLS[ch] !== undefined) out += SYMBOLS[ch]
    else unsupported.push(ch)
    i++
  }
  return { cells: out, unsupported }
}

/** Cells for a letter key: lower-case letters with no indicator (BANA 5.8.1.3). */
export function keyLetterCells(key: string): string {
  return [...key].map((letter) => cell(LETTERS[letter] ?? '')).join('')
}

/** Reads a braille string back as dot numbers, for tests and screen readers: "⠝⠥" is "1345 136". */
export function dotNumbers(brailleCells: string): string {
  return [...brailleCells]
    .map((ch) => {
      const bits = ch.charCodeAt(0) - 0x2800
      let dots = ''
      for (let dot = 1; dot <= 6; dot++) if (bits & (1 << (dot - 1))) dots += dot
      return dots === '' ? '0' : dots
    })
    .join(' ')
}
