import { BRAILLE } from '../braille/cells'
import { outlinesToPath } from '../pipeline/trace'
import type { Sheet } from './page'

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Writes one sheet as SVG at true size: one user unit is one millimetre.
 * Everything is pure black with no print text, because every black mark
 * rises on swell paper.
 */
export function sheetToSvg(sheet: Sheet): string {
  const { widthMm, heightMm } = sheet.page
  const radius = (BRAILLE.dotDiameterMm / 2).toFixed(2)
  const dots = sheet.dots
    .map((dot) => `<circle cx="${dot.cx.toFixed(2)}" cy="${dot.cy.toFixed(2)}" r="${radius}"/>`)
    .join('')
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}">`,
    `<title>${escapeXml(sheet.title)}</title>`,
    `<desc>${escapeXml(sheet.description)}</desc>`,
    `<rect width="${widthMm}" height="${heightMm}" fill="#fff"/>`,
    `<path fill="#000" fill-rule="evenodd" d="${outlinesToPath(sheet.outlines)}"/>`,
    `<g fill="#000">${dots}</g>`,
    '</svg>',
  ].join('\n')
}
