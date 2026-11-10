/**
 * Braille dot geometry from the BANA page "Size and Spacing of Braille
 * Characters", which quotes Specification 800 of the National Library Service.
 */
export const BRAILLE = {
  /** 3.2.2: nominal base diameter 0.057 inches [1.44 mm]. */
  dotDiameterMm: 1.44,
  /** 3.2.3.1: dots in the same cell 0.092 inches [2.340 mm] apart. */
  dotPitchMm: 2.34,
  /** 3.2.3.2: corresponding dots in adjacent cells 0.245 inches [6.2 mm] apart. */
  cellPitchMm: 6.2,
  /** 3.2.4: line spacing 0.400 inches [1.000 cm]. */
  linePitchMm: 10,
} as const

export const BRAILLE_HEIGHT_MM = 2 * BRAILLE.dotPitchMm + BRAILLE.dotDiameterMm

export function brailleWidthMm(cellCount: number): number {
  if (cellCount === 0) return 0
  return (cellCount - 1) * BRAILLE.cellPitchMm + BRAILLE.dotPitchMm + BRAILLE.dotDiameterMm
}

export interface Dot {
  cx: number
  cy: number
}

/** Dot centres for a braille string whose top left corner is at (x, y), in millimetres. */
export function brailleDots(cells: string, x: number, y: number): Dot[] {
  const radius = BRAILLE.dotDiameterMm / 2
  const dots: Dot[] = []
  ;[...cells].forEach((ch, index) => {
    const bits = ch.charCodeAt(0) - 0x2800
    for (let dot = 0; dot < 6; dot++) {
      if ((bits & (1 << dot)) === 0) continue
      dots.push({
        cx: x + radius + index * BRAILLE.cellPitchMm + (dot >= 3 ? BRAILLE.dotPitchMm : 0),
        cy: y + radius + (dot % 3) * BRAILLE.dotPitchMm,
      })
    }
  })
  return dots
}
