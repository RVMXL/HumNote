import { NoteEvent } from '@/lib/audio/types'

/** Melody sketch stored in the offline history (localStorage via zustand persist). */
export interface MelodySketch {
  id: string
  title: string
  bpm: number
  notes: NoteEvent[]
  /** ISO date */
  createdAt: string
}

/** Defensive parse of persisted notes — protects history from corrupted entries. */
export function parseNotes(value: unknown): NoteEvent[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (n: unknown): n is NoteEvent =>
        !!n &&
        typeof (n as NoteEvent).midi === 'number' &&
        typeof (n as NoteEvent).startBeat === 'number' &&
        typeof (n as NoteEvent).durBeats === 'number' &&
        (n as NoteEvent).midi >= 0 &&
        (n as NoteEvent).midi <= 127
    )
    .map((n: NoteEvent) => ({ midi: n.midi, startBeat: n.startBeat, durBeats: n.durBeats }))
}
