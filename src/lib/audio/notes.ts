const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** Convert frequency in Hz to a (fractional) MIDI note number. */
export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440)
}

/** Convert MIDI note number to frequency in Hz. */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/** Human readable note name, e.g. "A4". */
export function midiToName(midi: number): string {
  const m = Math.round(midi)
  const name = NOTE_NAMES[((m % 12) + 12) % 12]
  const octave = Math.floor(m / 12) - 1
  return `${name}${octave}`
}

/** Root-mean-square loudness of a time-domain buffer. */
export function computeRms(buf: Float32Array): number {
  let sum = 0
  for (let i = 0; i < buf.length; i++) {
    sum += buf[i] * buf[i]
  }
  return Math.sqrt(sum / buf.length)
}

/** Format seconds as m:ss. */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
