import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from 'cn'
import { BRAILLE, brailleDots } from '@/braille/cells'
import type { LoadedSource } from '@/io/loadSource'
import type { Box } from '@/pipeline/bitmap'
import type { PipelineOutput } from '@/pipeline/run'
import { outlinesToPath } from '@/pipeline/trace'

export type WorkbenchMode = 'compare' | 'edit'

interface WorkbenchProps {
  source: LoadedSource
  output: PipelineOutput
  mode: WorkbenchMode
  highlight: Box | null
  selectedLabel: string | null
  onSelectLabel: (id: string | null) => void
  onMoveLabel: (id: string, x: number, y: number) => void
  onDeleteLabel: (id: string) => void
  onToggleElement: (id: number) => void
  erased: readonly Box[]
  onErase: (box: Box) => void
}

interface Drag {
  id: string
  /** Offset from the pointer to the top left corner of the label, in millimetres. */
  dx: number
  dy: number
  x: number
  y: number
}

interface Rub {
  x0: number
  y0: number
  x1: number
  y1: number
}

function rubBox(rub: Rub): Box {
  return {
    x: Math.min(rub.x0, rub.x1),
    y: Math.min(rub.y0, rub.y1),
    w: Math.abs(rub.x1 - rub.x0),
    h: Math.abs(rub.y1 - rub.y0),
  }
}

/** A drag shorter than this is a click with a shaky hand. */
const MIN_RUB_MM = 2
const DOT_RADIUS = BRAILLE.dotDiameterMm / 2

export function Workbench({
  source,
  output,
  mode,
  highlight,
  selectedLabel,
  onSelectLabel,
  onMoveLabel,
  onDeleteLabel,
  onToggleElement,
  erased,
  onErase,
}: WorkbenchProps) {
  const [position, setPosition] = useState(50)
  const [drag, setDrag] = useState<Drag | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const { bounds } = output
  const viewBox = `0 0 ${bounds.w} ${bounds.h}`

  const path = useMemo(() => outlinesToPath(output.outlines), [output.outlines])
  const dots = useMemo(
    () =>
      output.labels.flatMap((label) =>
        brailleDots(label.braille, label.box.x, label.box.y).map((dot, i) => ({
          ...dot,
          key: `${label.id}-${i}`,
        })),
      ),
    [output.labels],
  )
  const [hovered, setHovered] = useState<number | null>(null)
  const [rub, setRub] = useState<Rub | null>(null)

  const toSheet = (event: { clientX: number; clientY: number }): { x: number; y: number } => {
    const svg = svgRef.current!
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const mapped = point.matrixTransform(svg.getScreenCTM()!.inverse())
    return { x: mapped.x, y: mapped.y }
  }

  const clamp = (box: Box, x: number, y: number) => ({
    x: Math.min(bounds.w - box.w, Math.max(0, x)),
    y: Math.min(bounds.h - box.h, Math.max(0, y)),
  })

  const onLabelKey = (event: KeyboardEvent, id: string, box: Box) => {
    const step = event.shiftKey ? 5 : 1
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    if (moves[event.key]) {
      event.preventDefault()
      const next = clamp(box, box.x + moves[event.key][0], box.y + moves[event.key][1])
      onMoveLabel(id, next.x, next.y)
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      onDeleteLabel(id)
    }
  }

  return (
    <figure className="m-0" style={{ maxWidth: `calc(80svh * ${bounds.w / bounds.h})` }}>
      <div aria-hidden="true" className="mb-2 flex justify-between text-sm font-medium">
        {mode === 'compare' ? (
          <>
            <span className={cn('transition-opacity duration-200', position < 8 && 'opacity-30')}>Original</span>
            <span className={cn('transition-opacity duration-200', position > 92 && 'opacity-30')}>
              Tactile draft
            </span>
          </>
        ) : (
          <span>Tactile draft, editable</span>
        )}
      </div>
      <div
        className="paper-grain relative w-full overflow-hidden border border-foreground/15 bg-sheet shadow-[0_30px_60px_-40px_rgb(40_30_10/0.45)]"
        style={{ aspectRatio: `${bounds.w} / ${bounds.h}` }}
      >
        <svg
          ref={svgRef}
          viewBox={viewBox}
          className="absolute inset-0 h-full w-full touch-none select-none"
          role={mode === 'compare' ? 'img' : 'group'}
          aria-label={
            mode === 'compare'
              ? `Tactile draft of ${source.name}: raised lines and ${output.labels.length} braille labels.`
              : `Editor for ${source.name}. Tab to a label, then use the arrow keys to move it or Delete to remove it.`
          }
        >
          <defs>
            <radialGradient id="dome" cx="38%" cy="32%" r="75%">
              <stop offset="0" stopColor="#57534e" />
              <stop offset="0.55" stopColor="#1c1917" />
              <stop offset="1" stopColor="#0c0a09" />
            </radialGradient>
          </defs>
          <g className="raised">
            <path d={path} fillRule="evenodd" fill="#141210" />
            <g fill="url(#dome)">
              {dots.map((dot) => (
                <circle key={dot.key} cx={dot.cx} cy={dot.cy} r={DOT_RADIUS} />
              ))}
            </g>
          </g>

          {mode === 'edit' && (
            <rect
              width={bounds.w}
              height={bounds.h}
              className={cn('fill-transparent', hovered !== null && 'cursor-pointer')}
              onPointerDown={(event) => {
                const point = toSheet(event)
                event.currentTarget.setPointerCapture(event.pointerId)
                setRub({ x0: point.x, y0: point.y, x1: point.x, y1: point.y })
              }}
              onPointerMove={(event) => {
                const point = toSheet(event)
                if (rub) setRub({ ...rub, x1: point.x, y1: point.y })
                else setHovered(output.elementAt(point.x, point.y))
              }}
              onPointerLeave={() => setHovered(null)}
              onPointerUp={() => {
                if (!rub) return
                const box = rubBox(rub)
                setRub(null)
                // A drag rubs out an area. A plain click picks the whole part under it.
                if (box.w >= MIN_RUB_MM || box.h >= MIN_RUB_MM) {
                  onErase(box)
                } else {
                  const id = output.elementAt(rub.x0, rub.y0)
                  if (id !== null) onToggleElement(id)
                }
              }}
            />
          )}
          {mode === 'edit' &&
            [...erased, ...(rub ? [rubBox(rub)] : [])].map((box, i) => (
              <rect
                key={i}
                x={box.x}
                y={box.y}
                width={box.w}
                height={box.h}
                className="pointer-events-none fill-signal/10 stroke-signal [stroke-dasharray:1_1]"
                strokeWidth={0.3}
              />
            ))}
          {mode === 'edit' &&
            output.elements
              .filter((element) => element.removedBy !== null || element.id === hovered)
              .map((element) => (
                <rect
                  key={element.id}
                  x={element.box.x - 0.8}
                  y={element.box.y - 0.8}
                  width={element.box.w + 1.6}
                  height={element.box.h + 1.6}
                  rx={0.8}
                  className={cn(
                    'pointer-events-none fill-none stroke-signal',
                    element.removedBy !== null && '[stroke-dasharray:1.6_1.6]',
                    element.removedBy !== null && element.id !== hovered && 'opacity-50',
                  )}
                  strokeWidth={0.45}
                />
              ))}

          {mode === 'edit' &&
            output.labels.map((label) => {
              const at = drag?.id === label.id ? drag : label.box
              const selected = selectedLabel === label.id
              return (
                <g
                  key={label.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`Label ${label.text}${label.key ? `, key ${label.key}` : ''}. Arrow keys move it, Delete removes it.`}
                  className="cursor-grab outline-none active:cursor-grabbing [&:focus-visible>rect]:stroke-[0.9]"
                  onFocus={() => onSelectLabel(label.id)}
                  onKeyDown={(event) => onLabelKey(event, label.id, label.box)}
                  onPointerDown={(event) => {
                    const point = toSheet(event)
                    event.currentTarget.setPointerCapture(event.pointerId)
                    onSelectLabel(label.id)
                    setDrag({
                      id: label.id,
                      dx: point.x - label.box.x,
                      dy: point.y - label.box.y,
                      x: label.box.x,
                      y: label.box.y,
                    })
                  }}
                  onPointerMove={(event) => {
                    if (drag?.id !== label.id) return
                    const point = toSheet(event)
                    setDrag({ ...drag, ...clamp(label.box, point.x - drag.dx, point.y - drag.dy) })
                  }}
                  onPointerUp={() => {
                    if (drag?.id !== label.id) return
                    if (drag.x !== label.box.x || drag.y !== label.box.y) onMoveLabel(label.id, drag.x, drag.y)
                    setDrag(null)
                  }}
                >
                  <rect
                    x={at.x - 1.2}
                    y={at.y - 1.2}
                    width={label.box.w + 2.4}
                    height={label.box.h + 2.4}
                    rx={1}
                    className={cn(
                      'stroke-signal',
                      selected ? 'fill-signal/15' : 'fill-signal/5',
                    )}
                    strokeWidth={selected ? 0.6 : 0.3}
                  />
                </g>
              )
            })}

          {highlight && (
            <rect
              x={highlight.x - 1.5}
              y={highlight.y - 1.5}
              width={highlight.w + 3}
              height={highlight.h + 3}
              rx={1.5}
              className="locate pointer-events-none fill-signal/10 stroke-signal"
              strokeWidth={0.7}
            />
          )}
        </svg>

        {mode === 'compare' && (
          <>
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-white"
              style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
            >
              <svg viewBox={viewBox} className="h-full w-full">
                <image
                  href={source.originalUrl}
                  x={source.frame.x}
                  y={source.frame.y}
                  width={source.frame.w}
                  height={source.frame.h}
                  preserveAspectRatio="none"
                />
              </svg>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={position}
              onChange={(event) => setPosition(Number(event.target.value))}
              aria-label="Compare: slide right to show more of the original, left to show more of the tactile draft"
              aria-valuetext={`${position} percent original, ${100 - position} percent tactile draft`}
              className="peer absolute inset-0 z-10 h-full w-full cursor-ew-resize opacity-0"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 w-px bg-signal peer-focus-visible:w-0.5"
              style={{ left: `${position}%` }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-signal text-white shadow-lg ring-signal/30 transition-[box-shadow] duration-200 peer-focus-visible:ring-8"
              style={{ left: `${position}%` }}
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 7-5 5 5 5M15 7l5 5-5 5" />
              </svg>
            </div>
          </>
        )}
      </div>
      <figcaption className="num mt-3 flex flex-wrap justify-between gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span>
          Drawn at true size: {bounds.w.toFixed(0)} mm wide, lines at least 0.71 mm, braille cells 6.2 mm apart.
        </span>
        <span>
          {mode === 'edit'
            ? 'Drag a label to move it. Click a line to remove that part. Drag on the paper to rub out an area.'
            : 'Drag the handle or use the arrow keys.'}
        </span>
      </figcaption>
    </figure>
  )
}
