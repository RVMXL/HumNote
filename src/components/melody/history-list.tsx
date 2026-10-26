'use client'

import { useSyncExternalStore } from 'react'
import { Download, History, Music2, Play, Sparkles, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { notesToMidiBlob } from '@/lib/audio/midi'
import { DEMO_SKETCH } from '@/lib/demo'
import { saveBlob } from '@/lib/export'
import { useHistory } from '@/lib/store'
import { MelodySketch } from '@/lib/types'

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

interface HistoryListProps {
  onLoad: (record: MelodySketch) => void
}

export function HistoryList({ onLoad }: HistoryListProps) {
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

  const quickMidi = async (rec: MelodySketch) => {
    if (!rec.notes.length) return
    try {
      await saveBlob(notesToMidiBlob(rec.notes, rec.bpm, rec.title), `${rec.title || 'melody'}.mid`)
    } catch {
      // ignore — user cancelled the share sheet or download
    }
  }

  return (
    <section className="w-full rounded-3xl border border-zinc-800 bg-zinc-900/70 p-4 sm:p-5" aria-label="История набросков">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          <History className="h-4 w-4" aria-hidden /> История
        </h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 rounded-lg px-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-emerald-400"
            onClick={() => onLoad(DEMO_SKETCH)}
            title="Загрузить демо-мелодию (не нужен микрофон)"
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" aria-hidden /> Демо
          </Button>
          {sketches.length > 0 && (
            <Badge variant="secondary" className="border-0 bg-zinc-800 font-mono text-zinc-400">
              {sketches.length}
            </Badge>
          )}
        </div>
      </div>

      <div className="scrollbar-thin mt-3 max-h-80 overflow-y-auto pr-1">
        {!hydrated && (
          <div className="flex flex-col gap-3 py-2">
            <Skeleton className="h-11 w-full rounded-xl bg-zinc-800" />
            <Skeleton className="h-11 w-full rounded-xl bg-zinc-800" />
            <Skeleton className="h-11 w-full rounded-xl bg-zinc-800" />
          </div>
        )}

        {hydrated && sketches.length === 0 && (
          <p className="py-8 text-center text-sm text-zinc-500">
            Пока пусто — запишите первую мелодию или откройте демо
          </p>
        )}

        <ul className="flex flex-col">
          {sketches.map((rec) => (
            <li key={rec.id} className="flex items-center gap-2 border-b border-zinc-800/60 py-2.5 last:border-0 sm:gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800">
                <Music2 className="h-4 w-4 text-emerald-400" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-200">{rec.title}</p>
                <p className="truncate text-xs text-zinc-500">
                  {dateFormatter.format(new Date(rec.createdAt))} · {rec.notes.length} нот · {rec.bpm} BPM
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-10 w-10 text-zinc-400 hover:bg-zinc-800 hover:text-emerald-400"
                  onClick={() => onLoad(rec)}
                  aria-label={`Загрузить ${rec.title}`}
                  title="Загрузить"
                >
                  <Play className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-10 w-10 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                  onClick={() => void quickMidi(rec)}
                  aria-label={`Скачать MIDI ${rec.title}`}
                  title="Скачать MIDI"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-10 w-10 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                  onClick={() => removeSketch(rec.id)}
                  aria-label={`Удалить ${rec.title}`}
                  title="Удалить"
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
