export interface PitchFrame {
  /** seconds since recording start */
  t: number
  /** detected frequency in Hz, -1 when unvoiced */
  freq: number
  /** loudness 0..1 */
  rms: number
  /** YIN confidence 0..1 */
  prob: number
}

export interface RawSegment {
  /** rounded MIDI note number */
  midi: number
  startSec: number
  endSec: number
}

export interface NoteEvent {
  midi: number
  startBeat: number
  durBeats: number
}

export interface MelodyAnalysis {
  rawSegments: RawSegment[]
  bpm: number
  durationSec: number
}
