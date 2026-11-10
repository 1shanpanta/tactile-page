import { useMemo } from 'react'
import { Download } from 'lucide-react'
import { BRAILLE, brailleDots } from '@/braille/cells'
import { Button } from '@/components/ui/button'
import {
  MARGIN_MM,
  PAGES,
  cellsPerLine,
  graphicSheet,
  keyPageLines,
  keySheet,
  type PageSpec,
} from '@/export/page'
import { sheetsToPdf } from '@/export/pdf'
import { sheetToSvg } from '@/export/svg'
import { download, fileSlug } from '@/lib/download'
import type { PipelineOutput } from '@/pipeline/run'
import { PIAF_REQUIREMENTS } from '@/rules/piaf'

interface KeyExportProps {
  name: string
  output: PipelineOutput
  page: PageSpec
  onPage: (page: PageSpec) => void
  reviewCount: number
}

export function KeyExport({ name, output, page, onPage, reviewCount }: KeyExportProps) {
  const lines = useMemo(() => keyPageLines(output.key, cellsPerLine(page)), [output.key, page])
  const dots = useMemo(
    () => lines.flatMap((line, i) => brailleDots(line, 0, i * BRAILLE.linePitchMm)),
    [lines],
  )
  const slug = fileSlug(name)
  const width = page.widthMm - 2 * MARGIN_MM
  const height = Math.max(1, lines.length) * BRAILLE.linePitchMm

  const graphic = () => graphicSheet(page, output.outlines, output.labels, output.shift, name)
  const key = () => keySheet(page, output.key, name)
  const savePdf = () => {
    // 5.8.3.2: when the key cannot share the page, it goes on the page before the graphic.
    const sheets = output.key.length > 0 ? [key(), graphic()] : [graphic()]
    download(`${slug}-tactile.pdf`, 'application/pdf', sheetsToPdf(sheets, `${name}, tactile draft`))
  }

  return (
    <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <h3 className="border-b border-foreground pb-2 font-medium">Key page</h3>
        {output.key.length === 0 ? (
          <p className="mt-4 text-muted-foreground">
            Every label fits on the graphic as a word, so this graphic needs no key page.
          </p>
        ) : (
          <>
            <div className="paper-grain mt-4 border border-foreground/15 bg-sheet p-[6%]">
              <svg
                viewBox={`0 0 ${width} ${height}`}
                className="raised block w-full"
                role="img"
                aria-label={`Braille key page: ${output.key.map((entry) => `${entry.key} means ${entry.text}`).join(', ')}.`}
              >
                {dots.map((dot, i) => (
                  <circle key={i} cx={dot.cx} cy={dot.cy} r={BRAILLE.dotDiameterMm / 2} fill="#141210" />
                ))}
              </svg>
            </div>
            <table className="mt-4 w-full text-sm">
              <caption className="sr-only">Print copy of the key</caption>
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th scope="col" className="w-16 py-2 font-normal">Key</th>
                  <th scope="col" className="w-24 py-2 font-normal">Braille</th>
                  <th scope="col" className="py-2 font-normal">Stands for</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {output.key.map((entry) => (
                  <tr key={entry.key}>
                    <td className="py-2 font-mono">{entry.key}</td>
                    <td className="py-2 text-xl leading-none" lang="en-Brai" aria-hidden="true">{entry.keyBraille}</td>
                    <td className="py-2">{entry.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-sm text-muted-foreground">
              Laid out as BANA 5.8.4 describes: "Key:" in cell 7, each key in cell 1, runovers in cell 3. Bind it
              as the page that faces the graphic (5.8.3.2).
            </p>
          </>
        )}

        {output.note !== '' && (
          <div className="mt-8">
            <h3 className="border-b border-foreground pb-2 font-medium">Draft transcriber&rsquo;s note</h3>
            <p className="mt-3 border-l-2 border-signal pl-4 leading-relaxed">{output.note}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Print text only. Rewrite it in words that fit the grade level, then braille it before the graphic
              (BANA 2.14, 2.15).
            </p>
          </div>
        )}
      </div>

      <div>
        <h3 className="border-b border-foreground pb-2 font-medium">Export for swell paper</h3>
        <fieldset className="mt-4">
          <legend className="text-sm text-muted-foreground">Paper size</legend>
          <div className="mt-2 flex gap-2">
            {PAGES.map((option) => (
              <label
                key={option.id}
                className="flex h-10 items-center gap-2 rounded-md border border-input px-3 text-sm has-checked:border-foreground has-checked:bg-foreground has-checked:text-background has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
              >
                <input
                  type="radio"
                  name="paper"
                  className="sr-only"
                  checked={page.id === option.id}
                  onChange={() => onPage(option)}
                />
                {option.name}
                <span className="num opacity-70">
                  {option.widthMm} by {option.heightMm} mm
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button size="lg" className="h-11 gap-2 bg-signal px-5 text-base text-white hover:bg-signal/90" onClick={savePdf}>
            <Download aria-hidden="true" />
            PDF{output.key.length > 0 ? ', key and graphic' : ''}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-11 gap-2 border-foreground/30 px-5 text-base"
            onClick={() => download(`${slug}-tactile.svg`, 'image/svg+xml', sheetToSvg(graphic()))}
          >
            <Download aria-hidden="true" />
            SVG graphic
          </Button>
          {output.key.length > 0 && (
            <Button
              size="lg"
              variant="outline"
              className="h-11 gap-2 border-foreground/30 px-5 text-base"
              onClick={() => download(`${slug}-key.svg`, 'image/svg+xml', sheetToSvg(key()))}
            >
              <Download aria-hidden="true" />
              SVG key
            </Button>
          )}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {reviewCount > 0
            ? `${reviewCount} ${reviewCount === 1 ? 'rule still needs' : 'rules still need'} your review. You can export now and check the print by touch.`
            : 'No rule is waiting for review. Still check the print by touch.'}{' '}
          Print at 100 percent, with no "fit to page".
        </p>

        <h4 className="mt-8 font-medium">What the fuser needs</h4>
        <ul className="mt-2 divide-y divide-border text-sm">
          {PIAF_REQUIREMENTS.map((item) => (
            <li key={item.text} className="grid grid-cols-[5.5rem_1fr] gap-x-3 py-2.5">
              <span className="text-muted-foreground">{item.inFile ? 'In the file' : 'At the printer'}</span>
              <span>
                {item.text}{' '}
                <a href={item.url} rel="noreferrer" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
                  {item.source}
                </a>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
