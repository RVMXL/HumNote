/**
 * Synthetic verification of the HumNote DSP pipeline (run with bun):
 *   bun /home/z/eval-dsp/dsp-test.ts
 * Emulates MicRecorder frames (2048 window / 40 ms hop) over generated audio
 * and checks note segmentation for voice-like, whistle-like, vibrato, glide,
 * creak and noise-only material.
 */
import { analyzeRecording } from '../src/lib/audio/analysis'
import { computeRms } from '../src/lib/audio/notes'
import { PitchFrame } from '../src/lib/audio/types'
import { yin } from '../src/lib/audio/yin'

const SR = 44100
const WINDOW = 2048
const HOP = Math.round(0.04 * SR)

interface NoteSpec {
  f0: number
  dur: number
  harmonics: number[]
  vibratoDepth?: number // fraction of f0
  vibratoHz?: number
  glideTo?: number // linear pitch glide target (Hz) across the note
}

function generate(notes: NoteSpec[], gapSec: number, noiseRms: number, breathRms: number): Float32Array {
  const chunks: Float32Array[] = []
  const gapLen = Math.round(gapSec * SR)
  chunks.push(new Float32Array(gapLen))
  for (const n of notes) {
    const len = Math.round(n.dur * SR)
    const chunk = new Float32Array(len)
    const phase = new Float64Array(n.harmonics.length)
    for (let i = 0; i < len; i++) {
      const t = i / SR
      const prog = t / n.dur
      const vib = 1 + (n.vibratoDepth ?? 0) * Math.sin(2 * Math.PI * (n.vibratoHz ?? 5.5) * t)
      const glide = n.glideTo ? Math.pow(n.glideTo / n.f0, prog) : 1
      let s = 0
      for (let h = 0; h < n.harmonics.length; h++) {
        phase[h] += (2 * Math.PI * n.f0 * (h + 1) * vib * glide) / SR
        s += n.harmonics[h] * Math.sin(phase[h])
      }
      chunk[i] = s * 0.25
    }
    chunks.push(chunk)
    const gap = new Float32Array(gapLen)
    for (let i = 0; i < gapLen; i++) {
      const inBreath = Math.abs(i - gapLen / 2) < gapLen * 0.2
      const amp = inBreath ? breathRms : noiseRms
      gap[i] = (Math.random() * 2 - 1) * amp * Math.SQRT1_2
    }
    chunks.push(gap)
  }
  chunks.push(new Float32Array(gapLen))
  const total = chunks.reduce((m, c) => m + c.length, 0)
  const out = new Float32Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  for (let i = 0; i < out.length; i++) out[i] += (Math.random() * 2 - 1) * noiseRms * Math.SQRT1_2
  return out
}

function framesFrom(samples: Float32Array): PitchFrame[] {
  const frames: PitchFrame[] = []
  for (let start = 0; start + WINDOW <= samples.length; start += HOP) {
    const buf = samples.slice(start, start + WINDOW)
    const t = start / SR
    const rms = computeRms(buf)
    const { freq, prob } = yin(buf, SR)
    frames.push({ t, freq, rms, prob })
  }
  return frames
}

function runCase(name: string, samples: Float32Array, expectedMidi: number[], maxExtra: number) {
  const frames = framesFrom(samples)
  const { rawSegments } = analyzeRecording(frames)
  const got = rawSegments.map((s) => s.midi)
  const pass =
    got.length >= expectedMidi.length - maxExtra &&
    got.length <= expectedMidi.length + maxExtra &&
    expectedMidi.every((m) => got.includes(m))
  console.log(
    `${pass ? '✅' : '❌'} ${name}: got [${got.join(', ')}] expected [${expectedMidi.join(', ')}] (${rawSegments.length} segments)`
  )
  return pass
}

// ── 1. voice-like: 4 notes, harmonics, vibrato, breath bursts ──────────────
const voice = generate(
  [
    { f0: 220.0, dur: 0.4, harmonics: [1, 0.5, 0.35, 0.2, 0.12], vibratoDepth: 0.004 },
    { f0: 261.63, dur: 0.4, harmonics: [1, 0.5, 0.35, 0.2, 0.12], vibratoDepth: 0.004 },
    { f0: 329.63, dur: 0.4, harmonics: [1, 0.5, 0.35, 0.2, 0.12], vibratoDepth: 0.004 },
    { f0: 392.0, dur: 0.4, harmonics: [1, 0.5, 0.35, 0.2, 0.12], vibratoDepth: 0.004 },
  ],
  0.14,
  0.01,
  0.05
)

// ── 2. whistle-like: high sine + strong 2nd harmonic, deep vibrato ─────────
const whistle = generate(
  [
    { f0: 1046.5, dur: 0.45, harmonics: [1, 0.4, 0.12], vibratoDepth: 0.008, vibratoHz: 6 },
    { f0: 1318.5, dur: 0.45, harmonics: [1, 0.4, 0.12], vibratoDepth: 0.008, vibratoHz: 6 },
    { f0: 880.0, dur: 0.45, harmonics: [1, 0.4, 0.12], vibratoDepth: 0.008, vibratoHz: 6 },
  ],
  0.12,
  0.008,
  0.04
)

// ── 3. one long legato note with heavy vibrato must not shatter ────────────
const legato = generate(
  [{ f0: 220.0, dur: 1.4, harmonics: [1, 0.5, 0.3], vibratoDepth: 0.012, vibratoHz: 5.5 }],
  0.2,
  0.01,
  0.05
)

// ── 4. noise only ───────────────────────────────────────────────────────────
const noiseOnly = generate([], 0.5, 0.05, 0.08)

// ── 5. male voice low hum: A2 C3 E3 G3, rich glottal stack ────────────────
const maleHarmonics = [1, 0.6, 0.4, 0.25, 0.15, 0.1]
const male = generate(
  [
    { f0: 110.0, dur: 0.45, harmonics: maleHarmonics, vibratoDepth: 0.005 },
    { f0: 130.81, dur: 0.45, harmonics: maleHarmonics, vibratoDepth: 0.005 },
    { f0: 164.81, dur: 0.45, harmonics: maleHarmonics, vibratoDepth: 0.005 },
    { f0: 196.0, dur: 0.45, harmonics: maleHarmonics, vibratoDepth: 0.005 },
  ],
  0.14,
  0.01,
  0.05
)

// ── 6. creaky male tone: AM at f0/2 — the classic octave-down trap ─────────
const creak = generate([{ f0: 110.0, dur: 0.8, harmonics: [1, 0.55, 0.35, 0.2, 0.12] }], 0.2, 0.01, 0.04)
for (let i = 0; i < creak.length; i++) {
  creak[i] *= 1 + 0.35 * Math.cos((2 * Math.PI * 55 * i) / SR)
}

// ── 7. sub-harmonic garbage: a genuine 55 Hz tone folds up to A2 ───────────
const subGarbage = generate([{ f0: 55.0, dur: 0.6, harmonics: [1, 0.5] }], 0.2, 0.01, 0.04)

// ── 8. octave-up trap: weak fundamental, strong 2nd harmonic (D4-ish) ──────
const weakF0 = generate([{ f0: 233.08, dur: 0.7, harmonics: [0.12, 1, 0.3] }], 0.2, 0.01, 0.04)

// ── 9. glide (portamento) must not produce phantom notes ───────────────────
const glide = generate([{ f0: 220.0, dur: 0.9, harmonics: [1, 0.5, 0.3], glideTo: 440 }], 0.2, 0.01, 0.04)

let ok = true
ok = runCase('voice (A3 C4 E4 G4)', voice, [57, 60, 64, 67], 1) && ok
ok = runCase('whistle (C6 E6 A5)', whistle, [84, 88, 81], 1) && ok
ok = runCase('legato vibrato (1 note)', legato, [57], 0) && ok
ok = runCase('noise only', noiseOnly, [], 0) && ok
ok = runCase('male low hum (A2 C3 E3 G3)', male, [45, 48, 52, 55], 1) && ok
ok = runCase('creaky A2 (AM at f0/2)', creak, [45], 0) && ok
ok = runCase('sub-harmonic fold (55 Hz → A2)', subGarbage, [45], 0) && ok
ok = runCase('weak fundamental D3 (no octave-up)', weakF0, [58], 0) && ok
ok = runCase('glide A3→A4 (no phantom notes)', glide, [], 0) && ok

// ── direct YIN checks: pure low tones must not be read an octave down ─────
function yinFreqOf(f0: number, harmonics: number[]): number {
  const buf = new Float32Array(WINDOW)
  for (let i = 0; i < WINDOW; i++) {
    let s = 0
    for (let h = 0; h < harmonics.length; h++) {
      s += harmonics[h] * Math.sin((2 * Math.PI * f0 * (h + 1) * i) / SR)
    }
    buf[i] = s * 0.25
  }
  return yin(buf, SR).freq
}
for (const [name, f0, harmonics] of [
  ['A2 110 Hz clean', 110.0, [1, 0.5, 0.35, 0.2]],
  ['E2 82.4 Hz clean', 82.41, [1, 0.5, 0.3]],
  ['G3 196 Hz clean', 196.0, [1, 0.5, 0.35, 0.2, 0.12]],
] as const) {
  const got = yinFreqOf(f0, [...harmonics])
  const cents = Math.abs((1200 * Math.log2(got / f0)) | 0)
  const pass = cents < 30
  console.log(
    `${pass ? '✅' : '❌'} yin ${name}: ${got.toFixed(1)} Hz (${cents} cents off) — must not be f0/2`
  )
  ok = ok && pass
}

const frames = framesFrom(voice)
const t0 = performance.now()
for (let i = 0; i < 10; i++) analyzeRecording(frames)
console.log(`perf: analyzeRecording(6s take) ×10 → ${((performance.now() - t0) / 10).toFixed(1)} ms`)
process.exit(ok ? 0 : 1)
