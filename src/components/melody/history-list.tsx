'use client'

import { useSyncExternalStore } from 'react'
import { Download, History, Music2, Play, Sparkles, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { notesToMidiBlob } from '@/lib/audio/midi'
import { DEMO_SKETCH } from '@/lib/demo'
import { saveBlob } from '@/lib/export'
import { LOCALE_TAGS, useI18n } from '@/lib/i18n'
import { useHistory } from '@/lib/store'
import { MelodySketch } from '@/lib/types'

interface HistoryListProps {
  onLoad: (record: MelodySketch) => void
}

export function HistoryList({ onLoad }: HistoryListProps) {
  const { t, locale } = useI18n()
  const sketches = useHistory((s) => s.sketches)
  const removeSketch = useHistory((s) => s.remove)

  // zustand persist hydrates after mount — avoid flashing an empty list and SSR mismatch.
  // На сервере .persist не существует (localStorage недоступен), поэтому guarded доступ.
  const hydrated = useSyncExternalStore(
    (onStoreChange) =>
      useHistory.persist?.onFinishHydration(() => onStoreChange()) ?? (() => undefined),
    () => useHistory.persist?.hasHydrated() ?? false,
    () => false
  )

  const dateFormatter = new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  const quickMidi = async (rec: MelodySketch) => {
    if (!rec.notes.length) return
    try {
      await saveBlob(notesToMidiBlob(rec.notes, rec.bpm, rec.title), `${rec.title || 'melody'}.mid`)
    } catch {
      // ignore — user cancelled the share sheet or download
    }
  }

  return (
    <section className="w-full rounded-3xl border border-border bg-card p-4 sm:p-5" aria-label={t('hist.aria')}>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <History className="h-4 w-4" aria-hidden /> {t('hist.title')}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 rounded-lg px-2 text-xs text-muted-foreground hover:bg-accent hover:text-primary"
            onClick={() => onLoad({ ...DEMO_SKETCH, title: t('demo.title') })}
            title={t('hist.demoTip')}
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" aria-hidden /> {t('hist.demo')}
          </Button>
          {sketches.length > 0 && (
            <Badge variant="secondary" className="border-0 bg-muted font-mono text-muted-foreground">
              {sketches.length}
            </Badge>
          )}
        </div>
      </div>

      <div className="scrollbar-thin mt-3 max-h-80 overflow-y-auto pr-1">
        {!hydrated && (
          <div className="flex flex-col gap-3 py-2">
            <Skeleton className="h-11 w-full rounded-xl bg-muted" />
            <Skeleton className="h-11 w-full rounded-xl bg-muted" />
            <Skeleton className="h-11 w-full rounded-xl bg-muted" />
          </div>
        )}

        {hydrated && sketches.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('hist.empty')}</p>
        )}

        <ul className="flex flex-col">
          {sketches.map((rec) => (
            <li key={rec.id} className="flex items-center gap-2 border-b border-border/60 py-2.5 last:border-0 sm:gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                <Music2 className="h-4 w-4 text-primary" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{rec.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {dateFormatter.format(new Date(rec.createdAt))} · {t('notes.count', { n: rec.notes.length })} · {rec.bpm} BPM
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-10 w-10 text-muted-foreground hover:bg-accent hover:text-primary"
                  onClick={() => onLoad(rec)}
                  aria-label={t('hist.loadAria', { name: rec.title })}
                  title={t('hist.load')}
                >
                  <Play className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-10 w-10 text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => void quickMidi(rec)}
                  aria-label={t('hist.midiAria', { name: rec.title })}
                  title={t('hist.midi')}
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-10 w-10 text-muted-foreground hover:bg-accent hover:text-destructive"
                  onClick={() => removeSketch(rec.id)}
                  aria-label={t('hist.deleteAria', { name: rec.title })}
                  title={t('hist.delete')}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
