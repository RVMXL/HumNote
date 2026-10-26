import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { MelodySketch } from '@/lib/types'

/**
 * Offline history of melody sketches.
 *
 * The app is fully offline: sketches live in localStorage on the device,
 * nothing is ever sent to a server (no backend exists at all).
 */
interface HistoryState {
  sketches: MelodySketch[]
  add: (sketch: MelodySketch) => void
  remove: (id: string) => void
}

const MAX_SKETCHES = 100

export const useHistory = create<HistoryState>()(
  persist(
    (set) => ({
      sketches: [],
      add: (sketch) =>
        set((state) => {
          // replace an existing entry with the same id (re-save), newest first
          const rest = state.sketches.filter((s) => s.id !== sketch.id)
          return { sketches: [sketch, ...rest].slice(0, MAX_SKETCHES) }
        }),
      remove: (id) => set((state) => ({ sketches: state.sketches.filter((s) => s.id !== id) })),
    }),
    {
      name: 'humnote-history',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    }
  )
)

export function newSketchId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `sk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
