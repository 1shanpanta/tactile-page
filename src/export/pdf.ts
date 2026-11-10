import { BRAILLE } from '../braille/cells'
import { CORNER_MM, roundCorners } from '../pipeline/trace'
import type { Sheet } from './page'

const POINTS_PER_MM = 72 / 25.4
/** Control point offset that makes four Bezier curves look like a circle. */
const KAPPA = 0.5522847498

function n(value: number): string {
  return value.toFixed(3)
}

function circle(cx: number, cy: number, r: number): string {
  const k = r * KAPPA
  return [
    `${n(cx + r)} ${n(cy)} m`,
    `${n(cx + r)} ${n(cy + k)} ${n(cx + k)} ${n(cy + r)} ${n(cx)} ${n(cy + r)} c`,
    `${n(cx - k)} ${n(cy + r)} ${n(cx - r)} ${n(cy + k)} ${n(cx - r)} ${n(cy)} c`,
    `${n(cx - r)} ${n(cy - k)} ${n(cx - k)} ${n(cy - r)} ${n(cx)} ${n(cy - r)} c`,
    `${n(cx + k)} ${n(cy - r)} ${n(cx + r)} ${n(cy - k)} ${n(cx + r)} ${n(cy)} c`,
    'h',
  ].join('\n')
}

function contentStream(sheet: Sheet): string {
  const lines: string[] = [
    // Flip the y axis and switch to millimetres, so the page uses the same numbers as the SVG.
    `${n(POINTS_PER_MM)} 0 0 ${n(-POINTS_PER_MM)} 0 ${n(sheet.page.heightMm * POINTS_PER_MM)} cm`,
    '0 g',
  ]
  for (const outline of sheet.outlines) {
    roundCorners(outline, CORNER_MM).forEach((c, i) => {
      lines.push(`${n(c.ax)} ${n(c.ay)} ${i === 0 ? 'm' : 'l'}`)
      // PDF has no quadratic curve, so the same curve is written as a cubic.
      const third = 2 / 3
      lines.push(
        `${n(c.ax + (c.vx - c.ax) * third)} ${n(c.ay + (c.vy - c.ay) * third)} ` +
          `${n(c.bx + (c.vx - c.bx) * third)} ${n(c.by + (c.vy - c.by) * third)} ` +
          `${n(c.bx)} ${n(c.by)} c`,
      )
    })
    lines.push('h')
  }
  if (sheet.outlines.length > 0) lines.push('f*')
  for (const dot of sheet.dots) lines.push(circle(dot.cx, dot.cy, BRAILLE.dotDiameterMm / 2))
  if (sheet.dots.length > 0) lines.push('f')
  return lines.join('\n')
}

function pdfString(text: string): string {
  const ascii = text.replace(/[^\x20-\x7e]/g, '?')
  return `(${ascii.replace(/([\\()])/g, '\\$1')})`
}

/**
 * Builds a vector PDF by hand: black fills only, no fonts, one page per
 * sheet, each at the exact paper size so "actual size" printing is true scale.
 */
export function sheetsToPdf(sheets: readonly Sheet[], title: string): Uint8Array {
  const objects: string[] = []
  const pageIds = sheets.map((_, i) => 3 + i * 2)
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Count ${sheets.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`
  sheets.forEach((sheet, i) => {
    const stream = contentStream(sheet)
    const w = n(sheet.page.widthMm * POINTS_PER_MM)
    const h = n(sheet.page.heightMm * POINTS_PER_MM)
    objects[pageIds[i]] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << >> /Contents ${pageIds[i] + 1} 0 R >>`
    objects[pageIds[i] + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  })
  const infoId = objects.length
  objects[infoId] = `<< /Title ${pdfString(title)} /Creator (Tactile Page) >>`

  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = body.length
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xref = body.length
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let id = 1; id < objects.length; id++) {
    body += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  }
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  // The file is ASCII only, so one character is one byte and the offsets are exact.
  return new TextEncoder().encode(body)
}
