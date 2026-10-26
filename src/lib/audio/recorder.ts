import { computeRms } from './notes'
import { PitchFrame } from './types'
import { yin } from './yin'

const WINDOW = 2048 // analysis window in samples
const HOP_MS = 40 // analysis frame rate ≈ 25 fps
const MAX_DURATION_SEC = 60

export interface LivePitch {
  name: string
  freq: number
  level: number
}

/**
 * Microphone capture service: requests the RAW mic signal (browser noise
 * suppression / AGC are disabled — they mangle whistled tones and pump the
 * gain mid-note), filters rumble/hiss with biquad filters and runs YIN pitch
 * detection in real time, collecting (time, frequency, loudness, confidence)
 * frames for the post-processing pipeline. All noise handling happens later,
 * in analysis.ts.
 */
export class MicRecorder {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private analyser: AnalyserNode | null = null
  private buf = new Float32Array(WINDOW)
  private timer: ReturnType<typeof setInterval> | null = null
  private startMs = 0
  private frames: PitchFrame[] = []

  /** live feedback hook (called ~25 times per second) */
  onFrame: ((frame: PitchFrame) => void) | null = null

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('MIC_UNAVAILABLE')
    }
    this.frames = []

    // Raw mono capture. Browser DSP (NS/AGC/EC) is a known killer of clean
    // sustained tones like whistles — the post-processing gate is smarter.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    })

    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new Ctor()
    if (this.ctx.state === 'suspended') await this.ctx.resume()

    const src = this.ctx.createMediaStreamSource(this.stream)

    // Hardware-level noise filtering chain: cut rumble below the vocal range
    // and hiss above the whistle range.
    const hp = this.ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 65
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 4500

    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = WINDOW * 2
    this.analyser.smoothingTimeConstant = 0

    src.connect(hp)
    hp.connect(lp)
    lp.connect(this.analyser) // not connected to destination — no feedback

    this.startMs = performance.now()
    this.timer = setInterval(() => this.tick(), HOP_MS)
  }

  private tick() {
    if (!this.analyser || !this.ctx) return
    this.analyser.getFloatTimeDomainData(this.buf)
    const t = (performance.now() - this.startMs) / 1000
    const rms = computeRms(this.buf)
    const { freq, prob } = yin(this.buf, this.ctx.sampleRate)
    const frame: PitchFrame = { t, freq, rms, prob }
    this.frames.push(frame)
    this.onFrame?.(frame)
  }

  /** Stop capturing and return all collected pitch frames. */
  stop(): PitchFrame[] {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    try {
      this.stream?.getTracks().forEach((tr) => tr.stop())
    } catch {
      /* noop */
    }
    const ctx = this.ctx
    this.analyser = null
    this.ctx = null
    this.stream = null
    if (ctx) void ctx.close().catch(() => undefined)
    return this.frames
  }

  get elapsedSec(): number {
    return (performance.now() - this.startMs) / 1000
  }

  get maxDurationSec(): number {
    return MAX_DURATION_SEC
  }
}
