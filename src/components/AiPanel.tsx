import { useState } from 'react'
import { ChevronDown, LoaderCircle } from 'lucide-react'
import { suggestLabels, type LabelSpot, type LabelSuggestion, type SuggestError } from '@/ai/suggest'
import { Button } from '@/components/ui/button'
import type { LabelEdit } from '@/pipeline/labels'

const ERRORS: Record<SuggestError, string> = {
  bad_key: 'The key was not accepted. Check it and try again.',
  refused: 'The model declined this picture. Nothing was changed.',
  failed: 'The request failed. Nothing was changed.',
}

interface AiPanelProps {
  pictureUrl: string
  spots: readonly LabelSpot[]
  onApply: (id: string, edit: LabelEdit) => void
}

export function AiPanel({ pictureUrl, spots, onApply }: AiPanelProps) {
  // The key lives in this component's memory only. It is never stored or logged.
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<SuggestError | null>(null)
  const [suggestions, setSuggestions] = useState<LabelSuggestion[] | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    const result = await suggestLabels(apiKey.trim(), pictureUrl, spots)
    setBusy(false)
    if (result.ok) setSuggestions(result.suggestions)
    else setError(result.error)
  }
  const current = new Map(spots.map((spot) => [spot.id, spot.text]))
  const useful = suggestions?.filter(
    (s) => current.has(s.id) && (!s.essential || s.text !== current.get(s.id)),
  )

  return (
    <details className="group border-y border-border py-4">
      <summary className="flex items-center justify-between gap-4">
        <span>
          <span className="font-medium">Optional: ask an AI model to read the labels</span>
          <span className="block text-sm text-muted-foreground">
            Off by default. Everything above works without it.
          </span>
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="mt-4 max-w-[62ch] space-y-4 text-sm">
        <p className="text-muted-foreground">
          This sends the picture and the label positions to the Anthropic API with your own key. The key stays
          in this tab&rsquo;s memory and is gone when you close it. The model only proposes label text and which
          labels could be left off. You accept or ignore each one.
        </p>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void run()
          }}
        >
          <label className="flex-1 basis-56">
            <span className="mb-1 block text-muted-foreground">Anthropic API key</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-card px-3 font-mono"
            />
          </label>
          <Button type="submit" size="lg" className="h-10 gap-2 px-4" disabled={busy || apiKey.trim() === '' || spots.length === 0}>
            {busy && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            {busy ? 'Asking' : 'Suggest'}
          </Button>
        </form>
        <div role="status" aria-live="polite">
          {error && <p className="text-destructive">{ERRORS[error]}</p>}
          {spots.length === 0 && <p className="text-muted-foreground">This graphic has no labels to read.</p>}
          {useful && useful.length === 0 && <p>The model agrees with every label as it is.</p>}
          {useful && useful.length > 0 && (
            <ul className="divide-y divide-border">
              {useful.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-4 py-2.5">
                  <span>
                    <span className="font-medium">
                      {s.essential ? `Read "${current.get(s.id)}" as "${s.text}"` : `Leave off "${s.text}"`}
                    </span>
                    <span className="block text-muted-foreground">{s.reason}</span>
                  </span>
                  <button
                    type="button"
                    className="shrink-0 font-medium text-signal underline-offset-4 hover:underline"
                    onClick={() => {
                      onApply(s.id, s.essential ? { text: s.text } : { deleted: true })
                      setSuggestions((list) => list?.filter((other) => other.id !== s.id) ?? null)
                    }}
                  >
                    Accept
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </details>
  )
}
