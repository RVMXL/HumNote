import { midiToFreq } from './notes'
import { NoteEvent } from './types'

export type WaveChoice = 'sine' | 'square'

interface ScheduleOptions {
  notes: NoteEvent[]
  bpm: number
  wave: WaveChoice
  /** absolute context time of the first beat */
  t0: number
}

interface ScheduledNode {
  osc: OscillatorNode
  gain: GainNode
}

/**
 * Schedule the whole melody on any audio context (live AudioContext or
 * OfflineAudioContext for WAV rendering). Returns the end time and the created
 * nodes so a live player can cancel them.
 */
function scheduleSynth(ctx: BaseAudioContext, dest: AudioNode, opts: ScheduleOptions): { endTime: number; nodes: ScheduledNode[] } {
  const { notes, bpm, wave, t0 } = opts
  const spb = 60 / bpm
  const nodes: ScheduledNode[] = []
  let endTime = t0

  for (const n of notes) {
    const freq = midiToFreq(n.midi)
    const st = t0 + n.startBeat * spb
    const dur = Math.max(0.06, n.durBeats * spb * 0.9)
    const en = st + dur

    const osc = ctx.createOscillator()
    osc.type = wave
    osc.frequency.value = freq

    const g = ctx.createGain()
    const peak = wave === 'sine' ? 0.3 : 0.17
    const attack = 0.015
    const release = 0.05
    g.gain.setValueAtTime(0.0001, st)
    g.gain.exponentialRampToValueAtTime(peak, st + attack)
    const relStart = Math.max(st + attack, en - release)
    g.gain.setValueAtTime(peak, relStart)
    g.gain.exponentialRampToValueAtTime(0.0001, Math.max(en, relStart + 0.02))

    osc.connect(g)
    g.connect(dest)
    osc.start(st)
    osc.stop(Math.max(en, relStart + 0.02) + 0.03)

    nodes.push({ osc, gain: g })
    endTime = Math.max(endTime, Math.max(en, relStart + 0.02))
  }
  return { endTime, nodes }
}

/**
 * Minimal synthesizer player for the recognized sketch.
 * Plays with a standard Sine/Square wave, reports the current beat for the piano roll.
 */
export class SynthPlayer {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private nodes: ScheduledNode[] = []
  private rafId = 0
  private startTime = 0
  private spb = 0.5
  private endTime = 0
  playing = false

  private ensureCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext()
    return this.ctx
  }

  async play(
    notes: NoteEvent[],
    bpm: number,
    wave: WaveChoice,
    onBeat: (beat: number) => void,
    onEnd: () => void
  ): Promise<void> {
    this.stopInternal()
    const ctx = this.ensureCtx()
    if (ctx.state === 'suspended') await ctx.resume()

    const master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(ctx.destination)

    const t0 = ctx.currentTime + 0.08
    const { endTime, nodes } = scheduleSynth(ctx, master, { notes, bpm, wave, t0 })

    this.master = master
    this.nodes = nodes
    this.startTime = t0
    this.spb = 60 / bpm
    this.endTime = endTime
    this.playing = true

    const loop = () => {
      if (!this.playing) return
      onBeat(Math.max(0, (ctx.currentTime - this.startTime) / this.spb))
      if (ctx.currentTime >= this.endTime + 0.1) {
        this.stopInternal()
        onEnd()
        return
      }
      this.rafId = requestAnimationFrame(loop)
    }
    this.rafId = requestAnimationFrame(loop)
  }

  private stopInternal() {
    this.playing = false
    cancelAnimationFrame(this.rafId)
    for (const { osc, gain } of this.nodes) {
      try {
        osc.stop()
      } catch {
        /* already stopped */
      }
      try {
        gain.disconnect()
      } catch {
        /* noop */
      }
    }
    this.nodes = []
    if (this.master) {
      try {
        this.master.disconnect()
      } catch {
        /* noop */
      }
      this.master = null
    }
  }

  stop() {
    this.stopInternal()
  }

  dispose() {
    this.stopInternal()
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined)
      this.ctx = null
    }
  }
}

/** Offline-render the melody to a 16-bit mono WAV blob. */
export async function renderMelodyWav(notes: NoteEvent[], bpm: number, wave: WaveChoice): Promise<Blob> {
  const sampleRate = 44100
  const spb = 60 / bpm
  const endBeat = notes.reduce((m, n) => Math.max(m, n.startBeat + n.durBeats), 0)
  const duration = Math.min(150, endBeat * spb + 0.6)
  const ctx = new OfflineAudioContext(1, Math.ceil(duration * sampleRate), sampleRate)

  const master = ctx.createGain()
  master.gain.value = 0.9
  master.connect(ctx.destination)

  scheduleSynth(ctx, master, { notes, bpm, wave, t0: 0.05 })
  const buffer = await ctx.startRendering()
  return encodeWavPcm16(buffer.getChannelData(0), sampleRate)
}

function encodeWavPcm16(samples: Float32Array, sampleRate: number): Blob {
  const dataLength = samples.length * 2
  const buffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer)

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataLength, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return new Blob([buffer], { type: 'audio/wav' })
}
