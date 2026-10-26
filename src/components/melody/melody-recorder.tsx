'use client'

import { AlertTriangle, AudioLines, Globe, Moon, Sun } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { analyzeRecording, quantize } from '@/lib/audio/analysis'
import { freqToMidi, midiToName } from '@/lib/audio/notes'
import { notesToMidiBlob } from '@/lib/audio/midi'
import { MicRecorder } from '@/lib/audio/recorder'
import { renderMelodyWav, SynthPlayer, WaveChoice } from '@/lib/audio/synth'
import { MelodyAnalysis, NoteEvent } from '@/lib/audio/types'
import { saveBlob, shareBlob } from '@/lib/export'
import { LOCALES, LOCALE_NAMES, LOCALE_TAGS, Locale, useI18n } from '@/lib/i18n'
import { useTheme } from '@/lib/theme'
import { newSketchId, useHistory } from '@/lib/store'
import { MelodySketch } from '@/lib/types'
import { HistoryList } from './history-list'
import { RecordButton } from './record-button'
import { ResultPanel } from './result-panel'

type Phase = 'idle' | 'recording' | 'processing' | 'result' | 'error'

const MAX_REC_SEC = 60

/** Flag on the pushed history entry — the Android back gesture unwinds it. */
const HISTORY_FLAG = 'humnoteView'

function hasViewGuard(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean((window.history.state as Record<string, unknown> | null)?.[HISTORY_FLAG])
}

function pushViewGuard(): void {
  if (typeof window === 'undefined' || hasViewGuard()) return
  window.history.pushState({ [HISTORY_FLAG]: true }, '')
}

export function MelodyRecorder() {
  const { t, locale, setLocale } = useI18n()
  const { theme, toggle: toggleTheme } = useTheme()

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
  // invalidates the pending "recognizing" timeout when the view is reset
  const analyzeTokenRef = useRef(0)

  const { toast } = useToast()
  const addSketch = useHistory((s) => s.add)

  const defaultTitle = useMemo(
    () =>
      `${t('sketch.default')} · ${new Date().toLocaleTimeString(LOCALE_TAGS[locale], {
        hour: '2-digit',
        minute: '2-digit',
      })}`,
    [t, locale]
  )

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

  /**
   * Full reset to the "ready to record" state. Called from the "New recording"
   * button and from the popstate handler — the Android/browser back gesture
   * therefore always goes one step back inside the app (cancel recording,
   * discard the result) instead of minimizing it.
   */
  const hardReset = useCallback(() => {
    analyzeTokenRef.current += 1
    const rec = recorderRef.current
    if (rec) {
      recorderRef.current = null
      rec.stop()
    }
    playerRef.current?.stop()
    setPlaying(false)
    setLiveNote(null)
    setLevel(0)
    setElapsed(0)
    playheadRef.current = 0
    setAnalysis(null)
    setLoadedNotes(null)
    setError(null)
    setSaved(false)
    setPhase('idle')
  }, [])

  // Back gesture (Android hardware/gesture, iOS swipe, browser back).
  useEffect(() => {
    const onPopState = () => hardReset()
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [hardReset])

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current
    if (!rec) return
    recorderRef.current = null
    const frames = rec.stop()
    setLiveNote(null)
    setLevel(0)
    setPhase('processing')

    // small UX beat so the "recognizing" state is visible, then post-process
    const token = ++analyzeTokenRef.current
    window.setTimeout(() => {
      if (token !== analyzeTokenRef.current) return // view was reset meanwhile
      const result = analyzeRecording(frames)
      if (!result.rawSegments.length) {
        setPhase('idle')
        toast({
          title: t('toast.notRecognized'),
          description: t('toast.notRecognizedDesc'),
          variant: 'destructive',
        })
        return
      }
      setAnalysis(result)
      setBpm(result.bpm)
      setGrid(0.5)
      setLoadedNotes(null)
      setSaved(false)
      setTitle(defaultTitle)
      playheadRef.current = 0
      setPhase('result')
    }, 350)
  }, [toast, t, defaultTitle])
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
      if (f.freq > 0 && f.prob > 0.6) {
        setLiveNote(`${midiToName(freqToMidi(f.freq))} · ${Math.round(f.freq)}${t('unit.hz')}`)
      } else {
        setLiveNote(null)
      }
    }
    try {
      await rec.start()
      // back gesture now stops the recording instead of leaving the app
      pushViewGuard()
      recorderRef.current = rec
      setElapsed(0)
      setPhase('recording')
    } catch (e) {
      const err = e as Error
      if (err.message === 'MIC_UNAVAILABLE' || !navigator.mediaDevices?.getUserMedia) {
        setError(t('err.micUnavailable'))
      } else if (err.name === 'NotAllowedError') {
        setError(t('err.micDenied'))
      } else {
        setError(t('err.micGeneric'))
      }
      setPhase('error')
    }
  }, [t])

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
      toast({ title: t('toast.midiSaved'), description: t('toast.midiSavedDesc') })
    } catch {
      toast({ title: t('toast.midiFailed'), variant: 'destructive' })
    }
  }, [notes, bpm, title, toast, t])

  const handleExportWav = useCallback(async () => {
    if (!notes.length || exportingWav) return
    setExportingWav(true)
    toast({ title: t('toast.renderingWav') })
    try {
      const blob = await renderMelodyWav(notes, bpm, wave)
      await saveBlob(blob, 'melody-sketch.wav')
      toast({ title: t('toast.wavSaved'), description: t('toast.wavSavedDesc') })
    } catch {
      toast({ title: t('toast.wavFailed'), variant: 'destructive' })
    } finally {
      setExportingWav(false)
    }
  }, [notes, bpm, wave, exportingWav, toast, t])

  const handleShare = useCallback(async () => {
    if (!notes.length) return
    try {
      await shareBlob(notesToMidiBlob(notes, bpm, title || 'Melody Sketch'), 'melody-sketch.mid', title || 'HumNote')
      toast({ title: t('toast.shareReady') })
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      toast({ title: t('toast.shareFailed'), variant: 'destructive' })
    }
  }, [notes, bpm, title, toast, t])

  const handleSave = useCallback(() => {
    if (!notes.length || saving) return
    setSaving(true)
    try {
      addSketch({
        id: newSketchId(),
        title: title || t('sketch.default'),
        bpm: Math.round(bpm),
        notes: notes.map((n) => ({ midi: n.midi, startBeat: n.startBeat, durBeats: n.durBeats })),
        createdAt: new Date().toISOString(),
      } satisfies MelodySketch)
      setSaved(true)
      toast({ title: t('toast.savedTitle'), description: t('toast.savedDesc') })
    } finally {
      setSaving(false)
    }
  }, [notes, bpm, title, saving, addSketch, toast, t])

  const handleLoad = useCallback(
    (rec: MelodySketch) => {
      playerRef.current?.stop()
      setPlaying(false)
      if (!rec.notes.length) {
        toast({ title: t('toast.corrupt'), variant: 'destructive' })
        return
      }
      // back gesture returns from the result view to the recorder
      pushViewGuard()
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

  /** "Новая запись" — unwind the pushed history entry so the next back leaves cleanly. */
  const handleReset = useCallback(() => {
    if (hasViewGuard()) {
      window.history.back() // popstate → hardReset
    } else {
      hardReset()
    }
  }, [hardReset])

  const isFromHistory = !analysis && !!loadedNotes

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="mx-auto w-full max-w-2xl px-4 pb-2 pt-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <AudioLines className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <h1 className="truncate text-xs font-medium uppercase tracking-widest text-muted-foreground sm:text-sm">
              {t('app.title')}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
              <SelectTrigger
                size="sm"
                aria-label={t('lang.aria')}
                className="h-9 w-[4.7rem] gap-1 rounded-xl border-border bg-card px-2.5"
              >
                <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <span className="text-xs font-semibold uppercase tracking-wide">{locale}</span>
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((l) => (
                  <SelectItem key={l} value={l} className="text-foreground">
                    {LOCALE_NAMES[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={toggleTheme}
              aria-label={t('theme.aria')}
              className="h-9 w-9 rounded-xl border-border bg-card"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
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
                className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
              >
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <p>{error}</p>
              </div>
            )}
          </>
        )}

        <HistoryList onLoad={handleLoad} />
      </main>

      <footer className="mt-auto border-t border-border">
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 text-xs text-muted-foreground">
          <span>{t('footer.left')}</span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
            YIN · Web Audio · {t('footer.tech')}
          </span>
        </div>
      </footer>
    </div>
  )
}
