import { freqToMidi } from './notes'
import { NoteEvent, PitchFrame, RawSegment } from './types'

/** Frequency gate: low enough to admit sub-harmonic misreads (~43 Hz is the
 *  YIN floor with a 2048 window) so the MIDI floor can fold them up, instead
 *  of dropping the frames and fragmenting the phrase. Real rumble never gets
 *  here — the recorder high-passes below 70 Hz at 24 dB/oct. */
const MIN_FREQ = 40
const MAX_FREQ = 3200
/** Human hums bottom out around E2 (≈ 82 Hz). YIN below that has locked onto
 *  a sub-harmonic — fold the frame back up instead of dropping it (dropping
 *  fragments the phrase; folding preserves it). */
const MIN_HUM_MIDI = 40
/** YIN confidence floor for a frame to count as voiced. */
const MIN_PROB = 0.6
/** silence longer than this splits the pitch run */
const RUN_GAP_SEC = 0.12
/** drift (in semitones) still treated as the same note — absorbs vibrato */
const CHANGE_TOL = 0.8
/** a note change must hold this many consecutive agreeing frames (≈ 2 × 40 ms) */
const CHANGE_HOLD_FRAMES = 2
/** same-note segments separated by less than this are glued together */
const MERGE_GAP_SEC = 0.09
/** shorter blips are noise, not notes */
const MIN_NOTE_SEC = 0.1
/** usable instrument range after rounding */
const MIN_MIDI = 36
const MAX_MIDI = 96
/** frame window length in seconds (2048 samples @ 44.1kHz ≈ 46ms) */
const FRAME_SEC = 0.046

/**
 * Convert raw pitch frames into note segments.
 *
 * Pipeline (tuned against real-world hums and whistles):
 *  1. adaptive noise gate from the take's loudness distribution — breathing
 *     and room noise sit far below the sustained tones;
 *  2. voiced-frame selection (range + confidence + gate);
 *  3. split into runs separated by real silences;
 *  4. per run: median smoothing (kills 1-frame octave spikes) then
 *     segmentation with a 2-frame hysteresis — a note only changes when the
 *     new pitch is stable, so vibrato no longer shatters into fragments;
 *  5. merge same-note neighbours, fold octave-error "sandwiches"
 *     (X · X±12 · X), merge again and drop leftover blips.
 */
export function framesToSegments(frames: PitchFrame[]): RawSegment[] {
  if (frames.length === 0) return []

  // 1) adaptive noise gate from the loudness distribution of the take
  const rmsSorted = frames.map((f) => f.rms).sort((a, b) => a - b)
  const quantile = (p: number) =>
    rmsSorted[Math.min(rmsSorted.length - 1, Math.floor(p * rmsSorted.length))]
  const noise = quantile(0.15)
  const loud = quantile(0.95)
  const gate = Math.max(noise * 2.2, loud * 0.06, 0.006)

  // 2) voiced frames only
  const voiced: { t: number; midi: number }[] = []
  for (const f of frames) {
    if (f.freq > MIN_FREQ && f.freq < MAX_FREQ && f.prob >= MIN_PROB && f.rms > gate) {
      let midi = freqToMidi(f.freq)
      while (midi < MIN_HUM_MIDI) midi += 12
      voiced.push({ t: f.t, midi })
    }
  }
  if (voiced.length < 2) return []

  // 3) split into runs on real silences
  const runs: { t: number; midi: number }[][] = []
  let run = [voiced[0]]
  for (let i = 1; i < voiced.length; i++) {
    if (voiced[i].t - voiced[i - 1].t > RUN_GAP_SEC) {
      runs.push(run)
      run = [voiced[i]]
    } else {
      run.push(voiced[i])
    }
  }
  runs.push(run)

  // 4) per run: median smoothing + hysteresis segmentation
  const segments: RawSegment[] = []
  for (const r of runs) {
    const smoothed = medianSmooth(r)
    segmentRun(smoothed, segments)
  }

  // 5) glue + octave-error repair + cleanup
  let merged = mergeSegments(segments)
  merged = foldOctaveSandwiches(merged)
  merged = mergeSegments(merged)
  return merged.filter(
    (s) => s.endSec - s.startSec >= MIN_NOTE_SEC && s.midi >= MIN_MIDI && s.midi <= MAX_MIDI
  )
}

/** Median filter (window 5) inside a run — octave spikes and clicks vanish. */
function medianSmooth(run: { t: number; midi: number }[]): { t: number; midi: number }[] {
  return run.map((v, i) => {
    const window: number[] = []
    for (let j = Math.max(0, i - 2); j <= Math.min(run.length - 1, i + 2); j++) {
      window.push(run[j].midi)
    }
    window.sort((a, b) => a - b)
    return { t: v.t, midi: window[Math.floor(window.length / 2)] }
  })
}

/**
 * Walk one run and cut it into note segments. A pitch change is accepted only
 * after CHANGE_HOLD_FRAMES consecutive frames agree on the new pitch; short
 * deviations (vibrato dips, glide tails) are absorbed into the current note.
 */
function segmentRun(sm: { t: number; midi: number }[], out: RawSegment[]): void {
  const n = sm.length
  if (n === 0) return

  // incremental sorted list of the current segment's pitches → cheap median
  const collected: number[] = []
  const insertSorted = (arr: number[], value: number) => {
    let lo = 0
    let hi = arr.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (arr[mid] < value) lo = mid + 1
      else hi = mid
    }
    arr.splice(lo, 0, value)
  }
  const median = () => collected[Math.floor(collected.length / 2)]

  const closeSeg = (endIdx: number, startIdx: number) => {
    if (endIdx < startIdx) return
    let sum = 0
    for (let i = startIdx; i <= endIdx; i++) sum += sm[i].midi
    out.push({
      midi: Math.round(sum / (endIdx - startIdx + 1)),
      startSec: sm[startIdx].t,
      endSec: sm[endIdx].t + FRAME_SEC,
    })
  }

  let segStart = 0
  let changeStart = -1
  insertSorted(collected, sm[0].midi)

  for (let i = 1; i < n; i++) {
    const m = sm[i].midi
    if (Math.abs(m - median()) <= CHANGE_TOL) {
      if (changeStart >= 0) {
        // pending change aborted — absorb the deviating frames into this note
        for (let j = changeStart; j <= i; j++) insertSorted(collected, sm[j].midi)
        changeStart = -1
      } else {
        insertSorted(collected, m)
      }
    } else if (changeStart < 0) {
      changeStart = i
    } else if (i - changeStart + 1 >= CHANGE_HOLD_FRAMES && Math.abs(m - sm[changeStart].midi) <= CHANGE_TOL) {
      // stable new pitch — close the previous note and start a new one
      closeSeg(changeStart - 1, segStart)
      collected.length = 0
      segStart = changeStart
      for (let j = changeStart; j <= i; j++) insertSorted(collected, sm[j].midi)
      changeStart = -1
    }
    // else: still gliding — wait for the pitch to settle
  }
  closeSeg(changeStart >= 0 ? changeStart - 1 : n - 1, segStart)
}

/** Glue neighbouring segments of the same rounded note separated by a tiny gap. */
function mergeSegments(segments: RawSegment[]): RawSegment[] {
  const out: RawSegment[] = []
  for (const seg of segments) {
    const prev = out[out.length - 1]
    if (prev && prev.midi === seg.midi && seg.startSec - prev.endSec < MERGE_GAP_SEC) {
      prev.endSec = seg.endSec
    } else {
      out.push({ ...seg })
    }
  }
  return out
}

/**
 * Classic YIN octave error: one segment sits exactly an octave above/below
 * its neighbours, which return to the original pitch — fold it back.
 * Genuine octave leaps continue in the new register, so they are kept.
 */
function foldOctaveSandwiches(segments: RawSegment[]): RawSegment[] {
  for (let i = 1; i < segments.length - 1; i++) {
    const a = segments[i - 1].midi
    const b = segments[i].midi
    const c = segments[i + 1].midi
    const dur = segments[i].endSec - segments[i].startSec
    const octaveJump = b - a === 12 || b - a === -12
    if (octaveJump && Math.abs(c - a) <= 2 && dur < 0.6) {
      segments[i] = { ...segments[i], midi: a }
    }
  }
  return segments
}

/**
 * Rough tempo estimation: assume the median inter-onset interval is an
 * eighth note, then fold the result into a musically useful 65..190 BPM range.
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
