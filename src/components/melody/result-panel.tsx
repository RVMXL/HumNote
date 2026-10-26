'use client'

import { Check, Download, Play, RotateCcw, Save, Share2, Square } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { NoteEvent } from '@/lib/audio/types'
import { formatTime } from '@/lib/audio/notes'
import { WaveChoice } from '@/lib/audio/synth'
import { useI18n } from '@/lib/i18n'
import { PianoRoll } from './piano-roll'

interface ResultPanelProps {
  notes: NoteEvent[]
  bpm: number
  onBpmChange: (bpm: number) => void
  grid: number
  onGridChange: (grid: number) => void
  wave: WaveChoice
  onWaveChange: (wave: WaveChoice) => void
  playing: boolean
  playheadRef: React.MutableRefObject<number>
  onPlay: () => void
  onStop: () => void
  durationSec: number
  title: string
  onTitleChange: (title: string) => void
  onSave: () => void
  saving: boolean
  saved: boolean
  onExportMidi: () => void
  onExportWav: () => void
  onShare: () => void
  exportingWav: boolean
  onReset: () => void
  isFromHistory: boolean
}

export function ResultPanel(props: ResultPanelProps) {
  const {
    notes,
    bpm,
    onBpmChange,
    grid,
    onGridChange,
    wave,
    onWaveChange,
    playing,
    playheadRef,
    onPlay,
    onStop,
    durationSec,
    title,
    onTitleChange,
    onSave,
    saving,
    saved,
    onExportMidi,
    onExportWav,
    onShare,
    exportingWav,
    onReset,
    isFromHistory,
  } = props
  const { t } = useI18n()

  return (
    <section
      className="w-full rounded-3xl border border-border bg-card p-4 shadow-xl sm:p-6"
      aria-label={t('result.recognized')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">
          {isFromHistory ? t('result.fromHistory') : t('result.recognized')}
        </h2>
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="border-0 bg-muted font-mono text-foreground">
            {t('notes.count', { n: notes.length })}
          </Badge>
          <Badge variant="secondary" className="border-0 bg-muted font-mono text-foreground">
            {bpm} BPM
          </Badge>
          <Badge variant="secondary" className="border-0 bg-muted font-mono text-foreground">
            {formatTime(durationSec)}
          </Badge>
        </div>
      </div>

      <div className="mt-4">
        <PianoRoll notes={notes} playing={playing} playheadRef={playheadRef} />
      </div>

      {/* transport + timbre + grid */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {playing ? (
          <Button
            onClick={onStop}
            className="h-12 rounded-xl bg-red-500 font-semibold text-white hover:bg-red-400"
            aria-label={t('result.stop')}
          >
            <Square className="mr-1 h-4 w-4 fill-current" /> {t('result.stop')}
          </Button>
        ) : (
          <Button
            onClick={onPlay}
            disabled={!notes.length}
            className="h-12 rounded-xl bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
            aria-label={t('result.listen')}
          >
            <Play className="mr-1 h-4 w-4 fill-current" /> {t('result.listen')}
          </Button>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t('result.timbre')}</span>
          <Select value={wave} onValueChange={(v) => onWaveChange(v as WaveChoice)}>
            <SelectTrigger
              className="h-11 w-full rounded-xl border-border bg-card"
              aria-label={t('result.timbreAria')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sine" className="text-foreground">
                Sine
              </SelectItem>
              <SelectItem value="square" className="text-foreground">
                Square
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <span className="text-xs text-muted-foreground">{t('result.quant')}</span>
          <Select value={String(grid)} onValueChange={(v) => onGridChange(Number(v))}>
            <SelectTrigger
              className="h-11 w-full rounded-xl border-border bg-card"
              aria-label={t('result.gridAria')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1" className="text-foreground">
                {t('grid.1')}
              </SelectItem>
              <SelectItem value="0.5" className="text-foreground">
                {t('grid.0.5')}
              </SelectItem>
              <SelectItem value="0.25" className="text-foreground">
                {t('grid.0.25')}
              </SelectItem>
              <SelectItem value="0" className="text-foreground">
                {t('grid.0')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* tempo */}
      <div className="mt-4 flex items-center gap-4">
        <span className="w-12 shrink-0 font-mono text-sm text-muted-foreground" aria-live="polite">
          {bpm} <span className="text-xs text-muted-foreground/70">BPM</span>
        </span>
        <Slider
          value={[bpm]}
          min={40}
          max={220}
          step={1}
          onValueChange={([v]) => onBpmChange(v)}
          aria-label={t('result.tempoAria')}
        />
      </div>

      {/* export */}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-5">
        <Button variant="outline" onClick={onExportMidi} disabled={!notes.length} className="h-11 rounded-xl">
          <Download className="mr-1 h-4 w-4" /> MIDI
        </Button>
        <Button
          variant="outline"
          onClick={onExportWav}
          disabled={!notes.length || exportingWav}
          className="h-11 rounded-xl"
        >
          <Download className="mr-1 h-4 w-4" /> WAV
        </Button>
        <Button variant="outline" onClick={onShare} disabled={!notes.length} className="h-11 rounded-xl">
          <Share2 className="mr-1 h-4 w-4" /> {t('result.share')}
        </Button>

        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          <Input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder={t('result.titlePlaceholder')}
            maxLength={100}
            aria-label={t('result.titleAria')}
            className="h-11 min-w-0 flex-1 rounded-xl border-border bg-card sm:w-44"
          />
          {saved ? (
            <Button
              disabled
              variant="outline"
              className="h-11 rounded-xl border-primary/40 text-primary"
            >
              <Check className="mr-1 h-4 w-4" /> {t('result.saved')}
            </Button>
          ) : (
            <Button
              onClick={onSave}
              disabled={!notes.length || saving}
              className="h-11 rounded-xl bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Save className="mr-1 h-4 w-4" /> {saving ? t('result.saving') : t('result.save')}
            </Button>
          )}
        </div>
      </div>

      {/* prominent accent CTA — starts the next take */}
      <div className="mt-5 flex justify-center">
        <Button
          onClick={onReset}
          className="h-11 rounded-xl bg-primary px-6 font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90"
        >
          <RotateCcw className="mr-1.5 h-4 w-4" /> {t('result.newRec')}
        </Button>
      </div>
    </section>
  )
}
