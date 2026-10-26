import { freqToMidi } from './notes'
import { NoteEvent, PitchFrame, RawSegment } from './types'

const MIN_FREQ = 60
const MAX_FREQ = 2200
const MIN_PROB = 0.55
/** frame window length in seconds (2048 samples @ 44.1kHz ≈ 46ms) */
const FRAME_SEC = 0.046

/**
 * Convert raw pitch frames into note segments:
 * adaptive noise gate → voice detection → median smoothing → segmentation → merge/cleanup.
 */
export function framesToSegments(frames: PitchFrame[]): RawSegment[] {
  if (frames.length === 0) return []

  // Adaptive noise gate relative to the loudest frame of the take.
  let peak = 0
  for (const f of frames) peak = Math.max(peak, f.rms)
  const gate = Math.max(0.007, peak * 0.045)

  const voiced: { t: number; midi: number }[] = []
  for (const f of frames) {
    if (f.freq > MIN_FREQ && f.freq < MAX_FREQ && f.prob >= MIN_PROB && f.rms > gate) {
      voiced.push({ t: f.t, midi: freqToMidi(f.freq) })
    }
  }
  if (voiced.length < 2) return []

  // Median filter (window 5) removes octave jumps and short noise bursts.
  const smoothed = voiced.map((v, i) => {
    const window: number[] = []
    for (let j = i - 2; j <= i + 2; j++) {
      if (j >= 0 && j < voiced.length) window.push(voiced[j].midi)
    }
    window.sort((a, b) => a - b)
    return { t: v.t, midi: window[Math.floor(window.length / 2)] }
  })

  // Split into segments whenever the rounded semitone changes or a silence gap occurs.
  const segments: RawSegment[] = []
  let segStartIdx = 0
  for (let i = 1; i < smoothed.length; i++) {
    const gap = smoothed[i].t - smoothed[i - 1].t
    const changedNote = Math.round(smoothed[i].midi) !== Math.round(smoothed[i - 1].midi)
    if (gap > 0.15 || changedNote) {
      pushSegment(segments, smoothed, segStartIdx, i - 1)
      segStartIdx = i
    }
  }
  pushSegment(segments, smoothed, segStartIdx, smoothed.length - 1)

  // Merge repeated same-note segments separated by a tiny gap, drop very short blips.
  const merged: RawSegment[] = []
  for (const seg of segments) {
    const prev = merged[merged.length - 1]
    if (prev && prev.midi === seg.midi && seg.startSec - prev.endSec < 0.08) {
      prev.endSec = seg.endSec
    } else {
      merged.push({ ...seg })
    }
  }
  return merged.filter((s) => s.endSec - s.startSec >= 0.09)
}

function pushSegment(out: RawSegment[], arr: { t: number; midi: number }[], from: number, to: number) {
  if (to < from) return
  let sum = 0
  for (let i = from; i <= to; i++) sum += arr[i].midi
  out.push({
    midi: Math.round(sum / (to - from + 1)),
    startSec: arr[from].t,
    endSec: arr[to].t + FRAME_SEC,
  })
}

/**
 * Rough tempo estimation: assume the median inter-onset interval is an
 * eighth note, then fold the result into a musically useful 60..190 BPM range.
 */
export function estimateBpm(segments: RawSegment[]): number {
  if (segments.length < 4) return 100
  const iois: number[] = []
  for (let i = 1; i < segments.length; i++) {
    iois.push(segments[i].startSec - segments[i - 1].startSec)
  }
  iois.sort((a, b) => a - b)
  const median = iois[Math.floor(iois.length / 2)]
  let bpm = 30 / Math.max(0.1, median)
  while (bpm < 65) bpm *= 2
  while (bpm > 190) bpm /= 2
  return Math.round(bpm)
}

/**
 * Quantize raw segments onto a tempo grid to compensate imperfect singing.
 * @param gridBeats grid size in beats: 1 = quarter, 0.5 = eighth, 0.25 = sixteenth, <= 0 = off
 */
export function quantize(segments: RawSegment[], bpm: number, gridBeats: number): NoteEvent[] {
  const spb = 60 / bpm

  if (gridBeats <= 0) {
    // Free timing — only convert seconds to beats.
    return segments.map((s) => ({
      midi: s.midi,
      startBeat: s.startSec / spb,
      durBeats: Math.max(0.1, (s.endSec - s.startSec) / spb),
    }))
  }

  const snap = (beats: number) => Math.round(beats / gridBeats) * gridBeats
  const notes: NoteEvent[] = []

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    const startBeat = Math.max(0, snap(s.startSec / spb))
    let endBeat = snap(s.endSec / spb)
    if (endBeat <= startBeat) endBeat = startBeat + gridBeats

    // Monophonic clamp: never let a note run over the next one.
    if (i + 1 < segments.length) {
      const nextStart = snap(segments[i + 1].startSec / spb)
      if (nextStart > startBeat && endBeat > nextStart) endBeat = nextStart
    }
    notes.push({ midi: s.midi, startBeat, durBeats: endBeat - startBeat })
  }
  return notes
}

/** Full post-processing pipeline for a finished recording. */
export function analyzeRecording(frames: PitchFrame[]): { rawSegments: RawSegment[]; bpm: number; durationSec: number } {
  const rawSegments = framesToSegments(frames)
  const bpm = estimateBpm(rawSegments)
  const durationSec = frames.length ? frames[frames.length - 1].t : 0
  return { rawSegments, bpm, durationSec }
}
