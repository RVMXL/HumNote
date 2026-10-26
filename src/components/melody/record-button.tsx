'use client'

import { Loader2, Mic, Square } from 'lucide-react'
import { formatTime } from '@/lib/audio/notes'
import { useI18n } from '@/lib/i18n'

interface RecordButtonProps {
  phase: 'idle' | 'recording' | 'processing'
  elapsed: number
  maxSec: number
  liveNote: string | null
  level: number
  onToggle: () => void
}

/**
 * Shazam-style single big record button — one tap from open app to capturing
 * the melody idea.
 */
export function RecordButton({ phase, elapsed, maxSec, liveNote, level, onToggle }: RecordButtonProps) {
  const { t } = useI18n()
  const isRecording = phase === 'recording'
  const isProcessing = phase === 'processing'

  return (
    <section className="flex flex-col items-center gap-6 py-8 sm:py-12" aria-label={t('rec.startAria')}>
      <div className="relative flex h-44 w-44 items-center justify-center">
        {isRecording && (
          <>
            <span className="pulse-ring pointer-events-none absolute inset-0 rounded-full border-2 border-red-500/50" />
            <span className="pulse-ring-delay pointer-events-none absolute inset-0 rounded-full border-2 border-red-500/40" />
          </>
        )}
        <button
          type="button"
          onClick={onToggle}
          disabled={isProcessing}
          aria-label={isRecording ? t('rec.stopAria') : t('rec.startAria')}
          className={`flex h-36 w-36 items-center justify-center rounded-full shadow-2xl transition-all duration-300 active:scale-95 disabled:cursor-wait ${
            isRecording
              ? 'bg-red-500 text-white shadow-red-500/30 hover:bg-red-400'
              : isProcessing
                ? 'bg-muted text-muted-foreground'
                : 'bg-primary text-primary-foreground shadow-primary/30 hover:bg-primary/90'
          }`}
        >
          {isProcessing ? (
            <Loader2 className="h-10 w-10 animate-spin" aria-hidden />
          ) : isRecording ? (
            <Square className="h-10 w-10 fill-current" aria-hidden />
          ) : (
            <Mic className="h-11 w-11" aria-hidden />
          )}
        </button>
      </div>

      <div className="flex h-6 items-center font-mono text-sm text-muted-foreground" aria-live="polite">
        {isRecording ? `${formatTime(elapsed)} / ${formatTime(maxSec)}` : '\u00A0'}
      </div>

      {/* live level meter */}
      <div className="h-1 w-44 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-red-500 transition-[width] duration-100"
          style={{ width: `${Math.min(100, level * 300)}%` }}
        />
      </div>

      <p className="flex h-10 items-center text-center text-sm" aria-live="polite">
        {isProcessing ? (
          <span className="text-muted-foreground">{t('rec.processing')}</span>
        ) : isRecording ? (
          liveNote ? (
            <span className="font-mono text-primary">{liveNote}</span>
          ) : (
            <span className="text-muted-foreground">{t('rec.listening')}</span>
          )
        ) : (
          <span className="text-muted-foreground">{t('rec.hint')}</span>
        )}
      </p>
    </section>
  )
}
