import { useId, useState } from 'react'
import { Upload } from 'lucide-react'
import { cn } from 'cn'
import { SAMPLES } from '@/samples'

interface SourcePickerProps {
  activeSample: string | null
  busy: boolean
  error: string | null
  onSample: (id: string) => void
  onFile: (file: File) => void
}

function sampleUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function SourcePicker({ activeSample, busy, error, onSample, onFile }: SourcePickerProps) {
  const inputId = useId()
  const [over, setOver] = useState(false)

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
      {SAMPLES.map((sample) => {
        const active = activeSample === sample.id
        return (
          <button
            key={sample.id}
            type="button"
            disabled={busy}
            aria-pressed={active}
            onClick={() => onSample(sample.id)}
            className={cn(
              'group flex flex-col border bg-card text-left transition-[border-color,transform] duration-200 ease-out-soft hover:-translate-y-0.5 disabled:opacity-60',
              active ? 'border-foreground' : 'border-border hover:border-foreground/50',
            )}
          >
            <span className="block aspect-[4/3] w-full overflow-hidden border-b border-border bg-white">
              <img src={sampleUrl(sample.svg)} alt="" className="h-full w-full object-contain" />
            </span>
            <span className="flex flex-1 flex-col gap-1 p-3">
              <span className="flex items-center gap-2 font-medium">
                <span
                  aria-hidden="true"
                  className={cn('size-2 rounded-full transition-colors', active ? 'bg-signal' : 'bg-border')}
                />
                {sample.name}
              </span>
              <span className="hidden text-sm text-muted-foreground sm:block">{sample.about}</span>
              <span className="mt-auto pt-1 text-xs text-muted-foreground">
                Original sample
              </span>
            </span>
          </button>
        )
      })}

      <div className="col-span-2 flex flex-col lg:col-span-1">
        <label
          htmlFor={inputId}
          onDragOver={(event) => {
            event.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setOver(false)
            const file = event.dataTransfer.files[0]
            if (file) onFile(file)
          }}
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-2 border border-dashed p-5 text-center transition-colors duration-200 has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
            over ? 'border-signal bg-signal-wash' : 'border-foreground/40 hover:border-foreground hover:bg-card',
            busy && 'pointer-events-none opacity-60',
          )}
        >
          <Upload aria-hidden="true" className="size-6" />
          <span className="font-medium">Upload a diagram</span>
          <span className="text-sm text-muted-foreground">PNG, JPG or SVG, up to 15 MB. It stays in this browser.</span>
          <input
            id={inputId}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,.svg"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onFile(file)
              event.target.value = ''
            }}
          />
        </label>
        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
