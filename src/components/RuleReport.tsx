import { Check, ChevronDown, Flag, LocateFixed, Wrench } from 'lucide-react'
import { cn } from 'cn'
import type { Box } from '@/pipeline/bitmap'
import { BANA_SOURCE, SKIPPED_RULES } from '@/rules/bana'
import type { RuleResult, RuleStatus } from '@/rules/check'

const STATUS: Record<RuleStatus, { label: string; icon: typeof Check }> = {
  flagged: { label: 'Review', icon: Flag },
  fixed: { label: 'Fixed', icon: Wrench },
  pass: { label: 'Pass', icon: Check },
}
const ORDER: RuleStatus[] = ['flagged', 'fixed', 'pass']

interface RuleReportProps {
  results: readonly RuleResult[]
  onLocate: (box: Box) => void
}

export function RuleReport({ results, onLocate }: RuleReportProps) {
  const count = (status: RuleStatus) => results.filter((r) => r.status === status).length
  const sorted = [...results].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))

  return (
    <div>
      <dl className="num grid grid-cols-3 border-y border-foreground">
        {(
          [
            ['flagged', 'need your review'],
            ['fixed', 'fixed automatically'],
            ['pass', 'pass as drawn'],
          ] as const
        ).map(([status, caption], i) => (
          <div key={status} className={cn('py-5 sm:py-6', i > 0 && 'border-l border-border pl-4 sm:pl-6')}>
            <dd
              className={cn(
                'text-5xl leading-none font-medium tracking-tight sm:text-6xl',
                status === 'flagged' && count('flagged') > 0 && 'text-signal',
              )}
            >
              {count(status)}
            </dd>
            <dt className="mt-2 text-sm text-muted-foreground">{caption}</dt>
          </div>
        ))}
      </dl>

      <ul className="divide-y divide-border">
        {sorted.map((result) => {
          const { icon: Icon, label } = STATUS[result.status]
          return (
            <li key={result.rule.id}>
              <details className="group" open={result.status === 'flagged' && result.findings.some((f) => f.at)}>
                <summary className="grid grid-cols-[1.5rem_1fr_auto] items-start gap-x-3 py-4 sm:grid-cols-[1.5rem_5.5rem_1fr_auto] sm:gap-x-4">
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      'mt-0.5 size-5',
                      result.status === 'flagged' ? 'text-signal' : 'text-foreground',
                      result.status === 'pass' && 'opacity-45',
                    )}
                    strokeWidth={result.status === 'pass' ? 1.75 : 2.25}
                  />
                  <span
                    className={cn(
                      'hidden text-sm font-medium sm:block',
                      result.status === 'flagged' && 'text-signal',
                      result.status === 'pass' && 'text-muted-foreground',
                    )}
                  >
                    {label}
                  </span>
                  <span>
                    <span className="block font-medium">
                      <span className="sr-only sm:hidden">{label}: </span>
                      {result.rule.title}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{result.summary}</span>
                    <span className="num mt-0.5 block text-sm text-muted-foreground sm:hidden">
                      BANA {result.rule.section}
                    </span>
                  </span>
                  <span className="num flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="hidden sm:inline">
                      <span className="sr-only">BANA section </span>
                      {result.rule.section}
                    </span>
                    <ChevronDown aria-hidden="true" className="size-4 transition-transform duration-200 group-open:rotate-180" />
                  </span>
                </summary>
                <div className="pb-5 pl-9 sm:pl-[8.5rem]">
                  <p className="max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">BANA {result.rule.section}. </span>
                    {result.rule.requirement}
                  </p>
                  {result.findings.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {result.findings.map((finding, i) => (
                        <li key={`${finding.message}-${i}`} className="flex items-start gap-3 text-sm">
                          <span className="max-w-[60ch]">{finding.message}</span>
                          {finding.at && (
                            <button
                              type="button"
                              onClick={() => onLocate(finding.at!)}
                              className="inline-flex shrink-0 items-center gap-1 font-medium text-signal underline-offset-4 hover:underline"
                            >
                              <LocateFixed aria-hidden="true" className="size-3.5" />
                              Show
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            </li>
          )
        })}
      </ul>

      <details className="group mt-6 border-t border-foreground pt-4">
        <summary className="flex items-center justify-between gap-4 font-medium">
          {SKIPPED_RULES.length} parts of the standard that Tactile Page does not check
          <ChevronDown aria-hidden="true" className="size-4 transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <ul className="mt-3 space-y-3 text-sm">
          {SKIPPED_RULES.map((rule) => (
            <li key={rule.section} className="grid gap-x-4 sm:grid-cols-[8.5rem_1fr]">
              <span className="num text-muted-foreground">{rule.section}</span>
              <span>
                {rule.text} <span className="text-muted-foreground">{rule.reason}</span>
              </span>
            </li>
          ))}
        </ul>
      </details>

      <p className="mt-6 text-sm text-muted-foreground">
        Source:{' '}
        <a href={BANA_SOURCE.url} className="underline underline-offset-4 hover:text-foreground" rel="noreferrer">
          {BANA_SOURCE.publisher}, {BANA_SOURCE.title}
        </a>
        . This is a check against selected rules, not a statement that the graphic meets the standard.
      </p>
    </div>
  )
}
