import { ChevronDown, Plus, RotateCcw, Trash2, Undo2 } from 'lucide-react'
import { cn } from 'cn'
import type { Box } from '@/pipeline/bitmap'
import { dotNumbers } from '@/braille/ueb'
import { isValidLetterKey, isValidNumberKey, type LabelEdit, type PlacedLabel } from '@/pipeline/labels'
import type { DiagramElement, RemovalReason } from '@/pipeline/fix'

const REASON: Record<RemovalReason, string> = {
  you: 'removed by you',
  speck: 'too small to feel',
  frame: 'frame around the graphic',
  'too-close': 'small detail closer than 3 mm to another part',
}

interface EditorPanelProps {
  labels: readonly PlacedLabel[]
  unread: readonly string[]
  deletedCount: number
  elements: readonly DiagramElement[]
  selectedLabel: string | null
  onSelectLabel: (id: string | null) => void
  onEditLabel: (id: string, edit: LabelEdit) => void
  onResetLabels: () => void
  onAddLabel: () => void
  onToggleElement: (id: number) => void
  erased: readonly Box[]
  onRestoreErased: (index: number) => void
}

export function EditorPanel({
  labels,
  unread,
  deletedCount,
  elements,
  selectedLabel,
  onSelectLabel,
  onEditLabel,
  onResetLabels,
  onAddLabel,
  onToggleElement,
  erased,
  onRestoreErased,
}: EditorPanelProps) {
  const removed = elements.filter((element) => element.removedBy !== null && element.removedBy !== 'speck')
  const present = elements
    .filter((element) => element.removedBy === null)
    .sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)

  return (
    <div className="space-y-8">
      <section aria-labelledby="labels-title">
        <div className="flex items-baseline justify-between gap-4 border-b border-foreground pb-2">
          <h3 id="labels-title" className="font-medium">
            Labels <span className="num text-muted-foreground">{labels.length}</span>
          </h3>
          <div className="flex gap-4 text-sm">
            <button type="button" onClick={onAddLabel} className="inline-flex items-center gap-1 font-medium text-signal underline-offset-4 hover:underline">
              <Plus aria-hidden="true" className="size-4" />
              Add label
            </button>
            {deletedCount > 0 && (
              <button type="button" onClick={onResetLabels} className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                <RotateCcw aria-hidden="true" className="size-3.5" />
                Undo all label edits
              </button>
            )}
          </div>
        </div>
        {unread.length > 0 && (
          <p role="status" className="mt-3 border-l-2 border-signal pl-3 text-sm">
            {unread.length === 1 ? '1 printed word was' : `${unread.length} printed words were`} found in the
            picture but cannot be read without the optional AI step. Type each word below.
          </p>
        )}
        {labels.length === 0 && <p className="mt-3 text-sm text-muted-foreground">This graphic has no labels.</p>}
        <ul className="divide-y divide-border">
          {labels.map((label) => {
            const keyOk = label.key === null || isValidLetterKey(label.key) || isValidNumberKey(label.key)
            return (
              <li
                key={label.id}
                className={cn(
                  'grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 py-3 transition-colors duration-150',
                  selectedLabel === label.id && 'bg-signal-wash/60',
                )}
                onFocus={() => onSelectLabel(label.id)}
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <input
                    type="text"
                    defaultValue={label.text}
                    key={label.text}
                    aria-label={`Text of label ${label.text}`}
                    maxLength={60}
                    onBlur={(event) => {
                      const text = event.target.value.trim()
                      if (text !== '' && text !== label.text) onEditLabel(label.id, { text })
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                    }}
                    className={cn(
                      'h-9 min-w-0 flex-1 basis-32 rounded-md border bg-card px-2.5 text-sm',
                      unread.includes(label.id) ? 'border-signal' : 'border-input',
                    )}
                  />
                  <select
                    aria-label={`How ${label.text} is shown`}
                    value={label.mode}
                    onChange={(event) =>
                      onEditLabel(label.id, { mode: event.target.value as 'word' | 'key', key: undefined })
                    }
                    className="h-9 rounded-md border border-input bg-card px-2 text-sm"
                  >
                    <option value="word">Word</option>
                    <option value="key">Key</option>
                  </select>
                  {label.key !== null && (
                    <input
                      type="text"
                      defaultValue={label.key}
                      key={label.key}
                      aria-label={`Key for ${label.text}`}
                      aria-invalid={!keyOk}
                      maxLength={3}
                      onBlur={(event) => {
                        const key = event.target.value.trim().toLowerCase()
                        if (key !== '' && key !== label.key) onEditLabel(label.id, { key })
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur()
                      }}
                      className={cn(
                        'h-9 w-14 rounded-md border bg-card px-2 text-center font-mono text-sm',
                        keyOk ? 'border-input' : 'border-destructive',
                      )}
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onEditLabel(label.id, { deleted: true })}
                  aria-label={`Remove label ${label.text}`}
                  className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
                <p className="col-span-2 flex flex-wrap items-baseline gap-x-3 text-sm text-muted-foreground">
                  <span lang="en-Brai" aria-label={`Braille dots ${dotNumbers(label.braille)}`} className="text-xl leading-none text-foreground">
                    {label.braille}
                  </span>
                  <span>
                    {[...label.braille].length} cells{label.pinned ? ', placed by you' : ''}
                  </span>
                  {label.unsupported.length > 0 && (
                    <span className="text-destructive">
                      Not in the braille table and left out: {[...new Set(label.unsupported)].join(' ')}
                    </span>
                  )}
                  {label.pinned && (
                    <button
                      type="button"
                      onClick={() => onEditLabel(label.id, { x: undefined, y: undefined })}
                      className="font-medium text-signal underline-offset-4 hover:underline"
                    >
                      Place automatically
                    </button>
                  )}
                </p>
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="removed-title">
        <h3 id="removed-title" className="border-b border-foreground pb-2 font-medium">
          Removed parts <span className="num text-muted-foreground">{removed.length + erased.length}</span>
        </h3>
        {removed.length + erased.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nothing is removed. Click a line on the graphic, or use the list of parts below.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {erased.map((box, i) => (
              <li key={`${box.x}-${box.y}-${i}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span>
                  <span className="num font-medium">
                    {box.w.toFixed(1)} by {box.h.toFixed(1)} mm
                  </span>
                  <span className="text-muted-foreground">, area rubbed out by you</span>
                </span>
                <button
                  type="button"
                  onClick={() => onRestoreErased(i)}
                  className="inline-flex shrink-0 items-center gap-1 font-medium text-signal underline-offset-4 hover:underline"
                >
                  <Undo2 aria-hidden="true" className="size-3.5" />
                  Restore
                </button>
              </li>
            ))}
            {removed.map((element) => (
              <li key={element.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span>
                  <span className="num font-medium">
                    {element.box.w.toFixed(1)} by {element.box.h.toFixed(1)} mm
                  </span>
                  <span className="text-muted-foreground">, {REASON[element.removedBy!]}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onToggleElement(element.id)}
                  className="inline-flex shrink-0 items-center gap-1 font-medium text-signal underline-offset-4 hover:underline"
                >
                  <Undo2 aria-hidden="true" className="size-3.5" />
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
        <details className="group mt-4">
          <summary className="flex items-center justify-between gap-4 text-sm font-medium">
            All {present.length} parts, for removal without a mouse
            <ChevronDown aria-hidden="true" className="size-4 transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <ul className="mt-1 divide-y divide-border">
            {present.map((element) => (
              <li key={element.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="num">
                  {element.box.w.toFixed(1)} by {element.box.h.toFixed(1)} mm, {element.box.x.toFixed(0)} mm from
                  the left, {element.box.y.toFixed(0)} mm from the top
                </span>
                <button
                  type="button"
                  onClick={() => onToggleElement(element.id)}
                  className="shrink-0 font-medium text-signal underline-offset-4 hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  )
}
