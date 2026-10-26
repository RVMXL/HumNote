'use client'

import { AlertTriangle, AudioLines } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { analyzeRecording, quantize } from '@/lib/audio/analysis'
import { freqToMidi, midiToName } from '@/lib/audio/notes'
import { notesToMidiBlob } from '@/lib/audio/midi'
import { MicRecorder } from '@/lib/audio/recorder'
import { renderMelodyWav, SynthPlayer, WaveChoice } from '@/lib/audio/synth'
import { MelodyAnalysis, NoteEvent } from '@/lib/audio/types'
import { saveBlob, shareBlob } from '@/lib/export'
import { newSketchId, useHistory } from '@/lib/store'
import { MelodySketch } from '@/lib/types'
import { HistoryList } from './history-list'
import { RecordButton } from './record-button'
import { ResultPanel } from './result-panel'

type Phase = 'idle' | 'recording' | 'processing' | 'result' | 'error'

const MAX_REC_SEC = 60

function defaultTitle(): string {
  return `Набросок · ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
}

export function MelodyRecorder() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [liveNote, setLiveNote] = useState<string | null>(null)
  const [level, setLevel] = useState(0)

  const [analysis, setAnalysis] = useState<MelodyAnalysis | null>(null)
  const [loadedNotes, setLoadedNotes] = useState<NoteEvent[] | null>(null)
  const [bpm, setBpm] = useState(100)
  const [grid, setGrid] = useState(0.5)
  const [wave, setWave] = useState<WaveChoice>('sine')
  const [title, setTitle] = useState('')
  const [saved, setSaved] = useState(false)

  const [playing, setPlaying] = useState(false)
  const [exportingWav, setExportingWav] = useState(false)
  const [saving, setSaving] = useState(false)

  const playheadRef = useRef(0)
  const recorderRef = useRef<MicRecorder | null>(null)
  const playerRef = useRef<SynthPlayer | null>(null)
  const stopFnRef = useRef<() => void>(() => undefined)

  const { toast } = useToast()
  const addSketch = useHistory((s) => s.add)

  /** quantized notes — recomputed live when tempo/grid change */
  const notes = useMemo(() => {
    if (analysis) return quantize(analysis.rawSegments, bpm, grid)
    if (loadedNotes) return loadedNotes
    return []
  }, [analysis, loadedNotes, bpm, grid])

  const durationSec = useMemo(() => {
    if (!notes.length) return 0
    const endBeat = notes.reduce((m, n) => Math.max(m, n.startBeat + n.durBeats), 0)
    return endBeat * (60 / bpm)
  }, [notes, bpm])

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current
    if (!rec) return
    recorderRef.current = null
    const frames = rec.stop()
    setLiveNote(null)
    setLevel(0)
    setPhase('processing')

    // small UX beat so the "recognizing" state is visible, then post-process
    window.setTimeout(() => {
      const result = analyzeRecording(frames)
      if (!result.rawSegments.length) {
        setPhase('idle')
        toast({
          title: 'Ноты не распознаны',
          description: 'Попробуйте напеть громче и ближе к микрофону',
          variant: 'destructive',
        })
        return
      }
      setAnalysis(result)
      setBpm(result.bpm)
      setGrid(0.5)
      setLoadedNotes(null)
      setSaved(false)
      setTitle(defaultTitle())
      playheadRef.current = 0
      setPhase('result')
    }, 350)
  }, [toast])
  stopFnRef.current = stopRecording

  const startRecording = useCallback(async () => {
    setError(null)
    playerRef.current?.stop()
    setPlaying(false)
    playheadRef.current = 0
    setAnalysis(null)
    setLoadedNotes(null)

    const rec = new MicRecorder()
    rec.onFrame = (f) => {
      setLevel(f.rms)
      if (f.freq > 0 && f.prob > 0.55) {
        setLiveNote(`${midiToName(freqToMidi(f.freq))} · ${Math.round(f.freq)} Гц`)
      } else {
        setLiveNote(null)
      }
    }
    try {
      await rec.start()
      recorderRef.current = rec
      setElapsed(0)
      setPhase('recording')
    } catch (e) {
      const err = e as Error
      if (err.message === 'MIC_UNAVAILABLE' || !navigator.mediaDevices?.getUserMedia) {
        setError('Микрофон недоступен. Разрешите запись в настройках приложения или откройте веб-версию по HTTPS.')
      } else if (err.name === 'NotAllowedError') {
        setError('Доступ к микрофону запрещён. Разрешите его в настройках системы и попробуйте снова.')
      } else {
        setError('Не удалось получить доступ к микрофону. Проверьте разрешения и попробуйте снова.')
      }
      setPhase('error')
    }
  }, [])

  const handleToggle = useCallback(() => {
    if (phase === 'recording') {
      stopRecording()
    } else if (phase === 'idle' || phase === 'error') {
      void startRecording()
    }
  }, [phase, stopRecording, startRecording])

  // live elapsed timer
  useEffect(() => {
    if (phase !== 'recording') return
    const iv = window.setInterval(() => {
      const rec = recorderRef.current
      if (rec) setElapsed(rec.elapsedSec)
    }, 250)
    return () => window.clearInterval(iv)
  }, [phase])

  // auto-stop at max duration
  useEffect(() => {
    if (phase !== 'recording') return
    const to = window.setTimeout(() => stopFnRef.current(), MAX_REC_SEC * 1000)
    return () => window.clearTimeout(to)
  }, [phase])

  const handlePlay = useCallback(async () => {
    if (!notes.length || playing) return
    const player = (playerRef.current ??= new SynthPlayer())
    setPlaying(true)
    try {
      await player.play(
        notes,
        bpm,
        wave,
        (beat) => {
          playheadRef.current = beat
        },
        () => {
          setPlaying(false)
          playheadRef.current = 0
        }
      )
    } catch {
      setPlaying(false)
    }
  }, [notes, bpm, wave, playing])

  const handleStop = useCallback(() => {
    playerRef.current?.stop()
    setPlaying(false)
    playheadRef.current = 0
  }, [])

  const handleExportMidi = useCallback(async () => {
    if (!notes.length) return
    try {
      await saveBlob(notesToMidiBlob(notes, bpm, title || 'Melody Sketch'), 'melody-sketch.mid')
      toast({ title: 'MIDI сохранён', description: 'Файл откроется в любой DAW или piano roll редакторе' })
    } catch {
      toast({ title: 'Не удалось сохранить MIDI', variant: 'destructive' })
    }
  }, [notes, bpm, title, toast])

  const handleExportWav = useCallback(async () => {
    if (!notes.length || exportingWav) return
    setExportingWav(true)
    toast({ title: 'Рендерю WAV…' })
    try {
      const blob = await renderMelodyWav(notes, bpm, wave)
      await saveBlob(blob, 'melody-sketch.wav')
      toast({ title: 'WAV сохранён', description: 'Синтезированная версия вашей мелодии' })
    } catch {
      toast({ title: 'Ошибка экспорта WAV', variant: 'destructive' })
    } finally {
      setExportingWav(false)
    }
  }, [notes, bpm, wave, exportingWav, toast])

  const handleShare = useCallback(async () => {
    if (!notes.length) return
    try {
      await shareBlob(notesToMidiBlob(notes, bpm, title || 'Melody Sketch'), 'melody-sketch.mid', title || 'Моя мелодия')
      toast({ title: 'Файл готов к отправке' })
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      toast({ title: 'Не удалось открыть общий доступ', variant: 'destructive' })
    }
  }, [notes, bpm, title, toast])

  const handleSave = useCallback(() => {
    if (!notes.length || saving) return
    setSaving(true)
    try {
      addSketch({
        id: newSketchId(),
        title: title || 'Набросок',
        bpm: Math.round(bpm),
        notes: notes.map((n) => ({ midi: n.midi, startBeat: n.startBeat, durBeats: n.durBeats })),
        createdAt: new Date().toISOString(),
      } satisfies MelodySketch)
      setSaved(true)
      toast({ title: 'Сохранено в историю', description: 'Набросок хранится на устройстве' })
    } finally {
      setSaving(false)
    }
  }, [notes, bpm, title, durationSec, saving, addSketch, toast])

  const handleLoad = useCallback(
    (rec: MelodySketch) => {
      playerRef.current?.stop()
      setPlaying(false)
      if (!rec.notes.length) {
        toast({ title: 'Файл повреждён', variant: 'destructive' })
        return
      }
      setAnalysis(null)
      setLoadedNotes(rec.notes)
      setBpm(rec.bpm)
      setGrid(0)
      setTitle(rec.title)
      setSaved(true)
      playheadRef.current = 0
      setError(null)
      setPhase('result')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [toast]
  )

  const handleReset = useCallback(() => {
    playerRef.current?.stop()
    setPlaying(false)
    playheadRef.current = 0
    setAnalysis(null)
    setLoadedNotes(null)
    setError(null)
    setSaved(false)
    setPhase('idle')
  }, [])

  const isFromHistory = !analysis && !!loadedNotes

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="mx-auto w-full max-w-2xl px-4 pb-2 pt-6">
        <div className="flex items-center justify-center gap-2">
          <AudioLines className="h-5 w-5 text-emerald-400" aria-hidden />
          <h1 className="text-sm font-medium uppercase tracking-widest text-zinc-300">
            Ментальный диктофон мелодий
          </h1>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pb-10">
        {phase === 'result' ? (
          <ResultPanel
            notes={notes}
            bpm={bpm}
            onBpmChange={setBpm}
            grid={grid}
            onGridChange={setGrid}
            wave={wave}
            onWaveChange={setWave}
            playing={playing}
            playheadRef={playheadRef}
            onPlay={() => void handlePlay()}
            onStop={handleStop}
            durationSec={durationSec}
            title={title}
            onTitleChange={setTitle}
            onSave={handleSave}
            saving={saving}
            saved={saved}
            onExportMidi={() => void handleExportMidi()}
            onExportWav={() => void handleExportWav()}
            onShare={() => void handleShare()}
            exportingWav={exportingWav}
            onReset={handleReset}
            isFromHistory={isFromHistory}
          />
        ) : (
          <>
            <RecordButton
              phase={phase === 'processing' ? 'processing' : phase === 'recording' ? 'recording' : 'idle'}
              elapsed={elapsed}
              maxSec={MAX_REC_SEC}
              liveNote={liveNote}
              level={level}
              onToggle={handleToggle}
            />
            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"
              >
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <p>{error}</p>
              </div>
            )}
          </>
        )}

        <HistoryList onLoad={handleLoad} />
      </main>

      <footer className="mt-auto border-t border-zinc-900">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 text-xs text-zinc-600">
          <span>HumNote · офлайн, без сервера</span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
            YIN · Web Audio · данные не покидают устройство
          </span>
        </div>
      </footer>
    </div>
  )
}
