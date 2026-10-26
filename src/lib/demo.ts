import { NoteEvent } from '@/lib/audio/types'
import { MelodySketch } from '@/lib/types'

/**
 * Built-in demo melody — «Ода к радости» (Бетховен), 15 нот, 120 BPM.
 * Даёт попробовать piano roll, плеер и экспорт без микрофона.
 */
const NOTES: NoteEvent[] = [
  { midi: 64, startBeat: 0, durBeats: 1 },
  { midi: 64, startBeat: 1, durBeats: 1 },
  { midi: 65, startBeat: 2, durBeats: 1 },
  { midi: 67, startBeat: 3, durBeats: 1 },
  { midi: 67, startBeat: 4, durBeats: 1 },
  { midi: 65, startBeat: 5, durBeats: 1 },
  { midi: 64, startBeat: 6, durBeats: 1 },
  { midi: 62, startBeat: 7, durBeats: 1 },
  { midi: 60, startBeat: 8, durBeats: 1 },
  { midi: 60, startBeat: 9, durBeats: 1 },
  { midi: 62, startBeat: 10, durBeats: 1 },
  { midi: 64, startBeat: 11, durBeats: 1 },
  { midi: 64, startBeat: 12, durBeats: 1.5 },
  { midi: 62, startBeat: 13.5, durBeats: 0.5 },
  { midi: 62, startBeat: 14, durBeats: 2 },
]

export const DEMO_SKETCH: MelodySketch = {
  id: 'demo-ode-to-joy',
  title: 'Ода к радости · демо',
  bpm: 120,
  notes: NOTES,
  createdAt: new Date().toISOString(),
}
