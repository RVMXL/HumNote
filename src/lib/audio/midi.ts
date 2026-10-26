import { NoteEvent } from './types'

const PPQ = 480 // ticks per quarter note

/** Variable-length quantity encoding used by the MIDI file format. */
function vlq(n: number): number[] {
  const bytes = [n & 0x7f]
  let value = n >> 7
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80)
    value >>= 7
  }
  return bytes
}

function strBytes(s: string): number[] {
  return Array.from(s).map((c) => c.charCodeAt(0))
}

function u32(n: number): number[] {
  return [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function u16(n: number): number[] {
  return [(n >> 8) & 0xff, n & 0xff]
}

/**
 * Convert quantized note events into a Standard MIDI File (format 0) blob.
 * Each note becomes a Note On / Note Off event pair on channel 1.
 */
export function notesToMidiBlob(notes: NoteEvent[], bpm: number, title = 'Melody Sketch'): Blob {
  const events: { tick: number; on: boolean; midi: number }[] = []
  for (const n of notes) {
    const midi = Math.max(0, Math.min(127, Math.round(n.midi)))
    const onTick = Math.max(0, Math.round(n.startBeat * PPQ))
    const offTick = Math.max(onTick + 10, Math.round((n.startBeat + n.durBeats) * PPQ))
    events.push({ tick: onTick, on: true, midi })
    events.push({ tick: offTick, on: false, midi })
  }
  // At the same tick note-offs must come before note-ons.
  events.sort((a, b) => a.tick - b.tick || (a.on === b.on ? a.midi - b.midi : a.on ? 1 : -1))

  const track: number[] = []

  // Track name meta event
  const nameBytes = strBytes(title).slice(0, 120)
  track.push(0x00, 0xff, 0x03, nameBytes.length, ...nameBytes)

  // Tempo meta event (microseconds per quarter note)
  const mpqn = Math.round(60000000 / bpm)
  track.push(0x00, 0xff, 0x51, 0x03, (mpqn >> 16) & 0xff, (mpqn >> 8) & 0xff, mpqn & 0xff)

  // Time signature 4/4
  track.push(0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08)

  // Note On / Note Off events with delta-time VLQs
  let lastTick = 0
  for (const e of events) {
    track.push(...vlq(e.tick - lastTick))
    lastTick = e.tick
    track.push(e.on ? 0x90 : 0x80, e.midi, e.on ? 96 : 0)
  }

  // End of track
  track.push(0x00, 0xff, 0x2f, 0x00)

  const bytes = [
    ...strBytes('MThd'),
    ...u32(6), // header length
    ...u16(0), // format 0
    ...u16(1), // one track
    ...u16(PPQ),
    ...strBytes('MTrk'),
    ...u32(track.length),
    ...track,
  ]

  return new Blob([new Uint8Array(bytes)], { type: 'audio/midi' })
}
