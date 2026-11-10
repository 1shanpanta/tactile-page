import { useEffect, useRef, useState } from 'react'
import { cn } from 'cn'
import { AiPanel } from '@/components/AiPanel'
import { EditorPanel } from '@/components/EditorPanel'
import { KeyExport } from '@/components/KeyExport'
import { RuleReport } from '@/components/RuleReport'
import { SourcePicker } from '@/components/SourcePicker'
import { Workbench, type WorkbenchMode } from '@/components/Workbench'
import { PAGES, type PageSpec } from '@/export/page'
import { SourceError, loadFile, loadSvg, type LoadError, type LoadedSource } from '@/io/loadSource'
import type { Box } from '@/pipeline/bitmap'
import type { LabelEdit, SourceLabel } from '@/pipeline/labels'
import { finish, rasterStage, type Edits, type PipelineOutput, type RasterStage } from '@/pipeline/run'
import { RULES } from '@/rules/bana'
import { summarize } from '@/rules/check'
import { SAMPLES } from '@/samples'

type Origin = { kind: 'sample'; id: string } | { kind: 'file'; file: File }

interface Session {
  origin: Origin
  source: LoadedSource
  stage: RasterStage
  edits: Edits
  output: PipelineOutput
}

const LOAD_ERRORS: Record<LoadError, string> = {
  type: 'That file type is not supported. Use a PNG, JPG or SVG.',
  size: 'That file is larger than 15 MB.',
  unreadable: 'That file could not be read as a picture.',
  empty: 'That picture has nothing dark enough to trace.',
}

const emptyEdits = (): Edits => ({
  remove: new Set(),
  keep: new Set(),
  erase: [],
  labels: new Map(),
  added: [],
})

/** Lets the browser paint the "working" state before the pipeline blocks the thread. */
const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))

export default function App() {
  const [page, setPage] = useState<PageSpec>(PAGES[0])
  const [session, setSession] = useState<Session | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mode, setMode] = useState<WorkbenchMode>('compare')
  const [highlight, setHighlight] = useState<Box | null>(null)
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)
  const workbenchRef = useRef<HTMLElement>(null)
  const started = useRef(false)

  const open = async (origin: Origin, target: PageSpec) => {
    setBusy(true)
    setLoadError(null)
    setHighlight(null)
    setStatus('Reading the picture.')
    try {
      await nextPaint()
      const source =
        origin.kind === 'sample'
          ? await loadSvg(
              SAMPLES.find((s) => s.id === origin.id)!.svg,
              SAMPLES.find((s) => s.id === origin.id)!.name,
              target,
            )
          : await loadFile(origin.file, target)
      setStatus('Simplifying and thickening lines.')
      await nextPaint()
      const edits = emptyEdits()
      const stage = rasterStage(source.input, edits.remove, edits.keep)
      setStatus('Placing braille labels and checking rules.')
      await nextPaint()
      const output = finish(source.input, stage, edits)
      setSession((previous) => {
        if (previous?.source.originalUrl.startsWith('blob:')) URL.revokeObjectURL(previous.source.originalUrl)
        return { origin, source, stage, edits, output }
      })
      setStatus(`Done. ${summarize(output.results)}`)
    } catch (error) {
      const code = error instanceof SourceError ? error.code : 'unreadable'
      setLoadError(LOAD_ERRORS[code])
      setStatus(LOAD_ERRORS[code])
    } finally {
      setBusy(false)
    }
  }

  // The first sample is drawn on arrival so the page opens on a real result.
  useEffect(() => {
    if (started.current) return
    started.current = true
    void open({ kind: 'sample', id: SAMPLES[0].id }, PAGES[0])
  }, [])

  const applyEdits = async (edits: Edits, redraw: boolean) => {
    if (!session) return
    setHighlight(null)
    let stage = session.stage
    if (redraw) {
      setBusy(true)
      setStatus('Drawing the graphic again.')
      await nextPaint()
      stage = rasterStage(session.source.input, edits.remove, edits.keep, edits.erase)
    }
    const output = finish(session.source.input, stage, edits)
    setSession({ ...session, stage, edits, output })
    setStatus(`Updated. ${summarize(output.results)}`)
    setBusy(false)
  }

  const editLabel = (id: string, edit: LabelEdit) => {
    if (!session) return
    const merged: LabelEdit = { ...session.edits.labels.get(id), ...edit }
    for (const key of Object.keys(merged) as (keyof LabelEdit)[]) {
      if (merged[key] === undefined) delete merged[key]
    }
    const labels = new Map(session.edits.labels)
    labels.set(id, merged)
    void applyEdits({ ...session.edits, labels }, false)
  }

  const toggleElement = (id: number) => {
    if (!session) return
    const element = session.output.elements.find((candidate) => candidate.id === id)
    if (!element) return
    const remove = new Set(session.edits.remove)
    const keep = new Set(session.edits.keep)
    if (element.removedBy === 'you') remove.delete(id)
    else if (element.removedBy !== null) keep.add(id)
    else if (keep.has(id)) keep.delete(id)
    else remove.add(id)
    void applyEdits({ ...session.edits, remove, keep }, true)
  }

  const addLabel = () => {
    if (!session) return
    const { bounds } = session.output
    const label: SourceLabel = {
      id: `added-${session.edits.added.length + 1}`,
      text: 'label',
      box: { x: bounds.w / 2 - 10, y: bounds.h / 2 - 3, w: 20, h: 6 },
      rotationDeg: 0,
    }
    setMode('edit')
    setSelectedLabel(label.id)
    void applyEdits({ ...session.edits, added: [...session.edits.added, label] }, false)
  }

  const locate = (box: Box) => {
    setHighlight(box)
    workbenchRef.current?.scrollIntoView({ block: 'start' })
  }

  const output = session?.output
  const review = output ? output.results.filter((r) => r.status === 'flagged').length : 0

  return (
    <div className="min-h-svh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-foreground focus:px-4 focus:py-2 focus:text-background"
      >
        Skip to the diagram
      </a>

      <header className="mx-auto flex max-w-[1320px] items-center justify-between gap-6 px-5 py-5 sm:px-8">
        <a href="#top" className="flex items-center gap-2.5 font-medium tracking-tight">
          <svg viewBox="0 0 20 28" className="h-6 w-auto" aria-hidden="true">
            <circle cx="5" cy="5" r="4" />
            <circle cx="15" cy="5" r="4" />
            <circle cx="5" cy="14" r="4" className="fill-signal" />
            <circle cx="15" cy="14" r="4" />
            <circle cx="5" cy="23" r="4" />
          </svg>
          Tactile Page
        </a>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span aria-hidden="true" className={cn('size-2 rounded-full', busy ? 'animate-pulse bg-signal' : 'bg-foreground')} />
          <span className="hidden sm:inline">Runs in this browser. Your diagram is not uploaded.</span>
          <span className="sm:hidden">Runs in this browser</span>
        </p>
      </header>

      <main id="main" className="mx-auto max-w-[1320px] px-5 pb-24 sm:px-8">
        <section id="top" className="grid gap-x-16 gap-y-6 pb-12 pt-8 sm:pt-14 lg:grid-cols-[1.25fr_1fr] lg:items-end">
          <h1 className="text-[clamp(2.5rem,6.4vw,5.25rem)] leading-[0.98] font-medium tracking-[-0.035em] text-balance">
            A tactile draft of any clean diagram, ready to{' '}
            <em className="font-serif font-normal tracking-[-0.02em] text-signal">feel</em>.
          </h1>
          <div className="max-w-[52ch] space-y-4 text-lg leading-relaxed">
            <p>
              Give it a textbook diagram. Tactile Page thickens the lines, clears the clutter, sets the labels in
              braille and checks the result against {RULES.length} rules from the BANA tactile graphics standard.
              You print it on swell paper.
            </p>
            <p className="border-l-2 border-signal pl-4 text-base text-muted-foreground">
              No blind reader has felt this output. It is a first pass for a teacher of students with visual
              impairments, who must check every page by touch before a student uses it.
            </p>
          </div>
        </section>

        <section aria-labelledby="pick-title" className="border-t border-foreground pt-6">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1">
            <h2 id="pick-title" className="text-2xl font-medium tracking-tight">
              Pick a diagram
            </h2>
            <p className="max-w-[70ch] text-sm text-muted-foreground">
              Made for clean line art: geometry, a labelled cell, simple circuits, graphs and number lines. Not
              for phone photos of curved book pages.
            </p>
          </div>
          <SourcePicker
            activeSample={session?.origin.kind === 'sample' ? session.origin.id : null}
            busy={busy}
            error={loadError}
            onSample={(id) => void open({ kind: 'sample', id }, page)}
            onFile={(file) => void open({ kind: 'file', file }, page)}
          />
        </section>

        <section ref={workbenchRef} aria-labelledby="result-title" className="mt-16 scroll-mt-6 border-t border-foreground pt-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <div>
              <h2 id="result-title" className="text-2xl font-medium tracking-tight">
                {session ? `${session.source.name}, before and after` : 'Before and after'}
              </h2>
              <p role="status" aria-live="polite" className="mt-1 min-h-6 text-muted-foreground">
                {status}
              </p>
            </div>
            <div role="group" aria-label="View" className="flex rounded-lg border border-foreground/25 p-0.5">
              {(['compare', 'edit'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={mode === option}
                  onClick={() => setMode(option)}
                  className={cn(
                    'h-9 rounded-md px-4 text-sm font-medium transition-colors duration-200',
                    mode === option ? 'bg-foreground text-background' : 'text-foreground hover:bg-muted',
                  )}
                >
                  {option === 'compare' ? 'Compare' : 'Edit'}
                </button>
              ))}
            </div>
          </div>

          {output && output.unread.length > 0 && (
            <p className="mb-5 max-w-[80ch] border-l-2 border-signal pl-4">
              Printed words found in this picture but not read: {output.unread.length}. They show as a braille
              question mark. Single letters and upright text are not found at all and stay as raised ink. Open
              Edit to type each word, or use the optional AI step below.
            </p>
          )}

          {session && output ? (
            <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
              <div className={cn('transition-opacity duration-300', busy && 'opacity-50')}>
                <Workbench
                  key={session.source.originalUrl}
                  source={session.source}
                  output={output}
                  mode={mode}
                  highlight={highlight}
                  selectedLabel={selectedLabel}
                  onSelectLabel={setSelectedLabel}
                  // A moved label keeps its form: a key stays a key.
                  onMoveLabel={(id, x, y) =>
                    editLabel(id, { x, y, mode: output.labels.find((label) => label.id === id)?.mode })
                  }
                  onDeleteLabel={(id) => editLabel(id, { deleted: true })}
                  onToggleElement={toggleElement}
                  erased={session.edits.erase}
                  onErase={(box) => void applyEdits({ ...session.edits, erase: [...session.edits.erase, box] }, true)}
                />
              </div>
              <div className="reveal" key={mode}>
                {mode === 'compare' ? (
                  <>
                    <h3 className="border-b border-foreground pb-2 font-medium">What the pipeline did</h3>
                    <ol className="divide-y divide-border">
                      {output.steps.map((step, i) => (
                        <li key={step.id} className="grid grid-cols-[1.75rem_1fr] gap-x-2 py-3.5">
                          <span className="num pt-px text-sm text-muted-foreground">{i + 1}</span>
                          <span>
                            <span className="block font-medium">{step.title}</span>
                            <span className="block text-sm leading-relaxed text-muted-foreground">{step.detail}</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                    <p className="mt-4 text-sm text-muted-foreground">
                      Every step is plain arithmetic on pixels. No AI model is used.
                    </p>
                  </>
                ) : (
                  <EditorPanel
                    labels={output.labels}
                    unread={output.unread}
                    deletedCount={session.edits.labels.size}
                    elements={output.elements}
                    selectedLabel={selectedLabel}
                    onSelectLabel={setSelectedLabel}
                    onEditLabel={editLabel}
                    onResetLabels={() => void applyEdits({ ...session.edits, labels: new Map(), added: [] }, false)}
                    onAddLabel={addLabel}
                    onToggleElement={toggleElement}
                    erased={session.edits.erase}
                    onRestoreErased={(index) =>
                      void applyEdits(
                        { ...session.edits, erase: session.edits.erase.filter((_, i) => i !== index) },
                        true,
                      )
                    }
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="grid aspect-[16/9] place-items-center border border-dashed border-foreground/30 text-muted-foreground">
              {busy ? 'Working.' : 'Pick a sample or upload a diagram to begin.'}
            </div>
          )}
        </section>

        {session && output && (
          <>
            <section aria-labelledby="rules-title" className="mt-20 border-t border-foreground pt-6">
              <div className="grid gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)]">
                <div className="self-start lg:sticky lg:top-8">
                  <h2 id="rules-title" className="text-2xl font-medium tracking-tight">
                    Rule report
                  </h2>
                  <p className="mt-3 max-w-[44ch] leading-relaxed text-muted-foreground">
                    {summarize(output.results)} Each rule names its section in the standard, so you can open the
                    source and judge it yourself.
                  </p>
                </div>
                <RuleReport results={output.results} onLocate={locate} />
              </div>
            </section>

            <section aria-labelledby="export-title" className="mt-20 border-t border-foreground pt-6">
              <h2 id="export-title" className="mb-6 text-2xl font-medium tracking-tight">
                Key page and export
              </h2>
              <KeyExport
                name={session.source.name}
                output={output}
                page={page}
                reviewCount={review}
                onPage={(next) => {
                  setPage(next)
                  void open(session.origin, next)
                }}
              />
            </section>

            <section aria-label="Optional AI step" className="mt-16">
              <AiPanel
                pictureUrl={session.source.originalUrl}
                spots={output.labels.map((label) => ({
                  id: label.id,
                  text: label.text,
                  x: (label.box.x + label.box.w / 2 - session.source.frame.x) / session.source.frame.w,
                  y: (label.box.y + label.box.h / 2 - session.source.frame.y) / session.source.frame.h,
                }))}
                onApply={editLabel}
              />
            </section>
          </>
        )}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto grid max-w-[1320px] gap-x-12 gap-y-4 px-5 py-10 text-sm text-muted-foreground sm:px-8 lg:grid-cols-3">
          <p>
            Tactile Page checks a draft against selected rules from the BANA Guidelines and Standards for Tactile
            Graphics, 2022. It does not certify a graphic.
          </p>
          <p>
            Braille is uncontracted Unified English Braille from a built-in table. Nemeth Code, contracted
            braille and area textures are not supported.
          </p>
          <p>
            Built for the CTRL-V Hackathon. MIT licence. Contact:{' '}
            <a href="mailto:ispanta03@gmail.com" className="underline underline-offset-4 hover:text-foreground">
              ispanta03@gmail.com
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
