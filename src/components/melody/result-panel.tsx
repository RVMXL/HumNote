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

const GRID_LABELS: Record<number, string> = {
  1: '1/4 такта',
  0.5: '1/8 такта',
  0.25: '1/16 такта',
  0: 'Выкл',
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

  return (
    <section
      className="w-full rounded-3xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-xl sm:p-6"
      aria-label="Распознанная мелодия"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-zinc-100">
          {isFromHistory ? 'Мелодия из истории' : 'Распознанная мелодия'}
        </h2>
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="border-0 bg-zinc-800 font-mono text-zinc-300">
            {notes.length} нот
          </Badge>
          <Badge variant="secondary" className="border-0 bg-zinc-800 font-mono text-zinc-300">
            {bpm} BPM
          </Badge>
          <Badge variant="secondary" className="border-0 bg-zinc-800 font-mono text-zinc-300">
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
            aria-label="Остановить воспроизведение"
          >
            <Square className="mr-1 h-4 w-4 fill-current" /> Стоп
          </Button>
        ) : (
          <Button
            onClick={onPlay}
            disabled={!notes.length}
            className="h-12 rounded-xl bg-emerald-500 font-semibold text-zinc-950 hover:bg-emerald-400"
            aria-label="Воспроизвести мелодию"
          >
            <Play className="mr-1 h-4 w-4 fill-current" /> Слушать
          </Button>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Тембр</span>
          <Select value={wave} onValueChange={(v) => onWaveChange(v as WaveChoice)}>
            <SelectTrigger className="h-11 rounded-xl border-zinc-800 bg-zinc-950" aria-label="Тембр синтезатора">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-zinc-800 bg-zinc-900">
              <SelectItem value="sine">Sine</SelectItem>
              <SelectItem value="square">Square</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <span className="text-xs text-zinc-500">Квантование</span>
          <Select value={String(grid)} onValueChange={(v) => onGridChange(Number(v))}>
            <SelectTrigger className="h-11 rounded-xl border-zinc-800 bg-zinc-950" aria-label="Сетка квантования">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-zinc-800 bg-zinc-900">
              <SelectItem value="1">{GRID_LABELS[1]}</SelectItem>
              <SelectItem value="0.5">{GRID_LABELS[0.5]}</SelectItem>
              <SelectItem value="0.25">{GRID_LABELS[0.25]}</SelectItem>
              <SelectItem value="0">{GRID_LABELS[0]}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* tempo */}
      <div className="mt-4 flex items-center gap-4">
        <span className="w-12 shrink-0 font-mono text-sm text-zinc-400" aria-live="polite">
          {bpm} <span className="text-xs text-zinc-600">BPM</span>
        </span>
        <Slider
          value={[bpm]}
          min={40}
          max={220}
          step={1}
          onValueChange={([v]) => onBpmChange(v)}
          aria-label="Темп"
        />
      </div>

      {/* export */}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-5">
        <Button
          variant="outline"
          onClick={onExportMidi}
          disabled={!notes.length}
          className="h-11 rounded-xl border-zinc-700 bg-transparent hover:bg-zinc-800 hover:text-zinc-100"
        >
          <Download className="mr-1 h-4 w-4" /> MIDI
        </Button>
        <Button
          variant="outline"
          onClick={onExportWav}
          disabled={!notes.length || exportingWav}
          className="h-11 rounded-xl border-zinc-700 bg-transparent hover:bg-zinc-800 hover:text-zinc-100"
        >
          <Download className="mr-1 h-4 w-4" /> WAV
        </Button>
        <Button
          variant="outline"
          onClick={onShare}
          disabled={!notes.length}
          className="h-11 rounded-xl border-zinc-700 bg-transparent hover:bg-zinc-800 hover:text-zinc-100"
        >
          <Share2 className="mr-1 h-4 w-4" /> Поделиться
        </Button>

        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          <Input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Название наброска"
            maxLength={100}
            aria-label="Название наброска"
            className="h-11 min-w-0 flex-1 rounded-xl border-zinc-800 bg-zinc-950 sm:w-44"
          />
          {saved ? (
            <Button disabled variant="outline" className="h-11 rounded-xl border-emerald-500/40 text-emerald-400">
              <Check className="mr-1 h-4 w-4" /> В истории
            </Button>
          ) : (
            <Button
              onClick={onSave}
              disabled={!notes.length || saving}
              className="h-11 rounded-xl bg-white font-semibold text-zinc-950 hover:bg-zinc-200"
            >
              <Save className="mr-1 h-4 w-4" /> {saving ? 'Сохраняю…' : 'Сохранить'}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-center">
        <Button variant="ghost" size="sm" onClick={onReset} className="text-zinc-500 hover:text-zinc-200">
          <RotateCcw className="mr-1.5 h-4 w-4" /> Новая запись
        </Button>
      </div>
    </section>
  )
}
