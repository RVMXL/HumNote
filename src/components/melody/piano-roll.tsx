'use client'

import { useEffect, useRef, useState } from 'react'
import { NoteEvent } from '@/lib/audio/types'
import { midiToName } from '@/lib/audio/notes'

interface PianoRollProps {
  notes: NoteEvent[]
  playing: boolean
  playheadRef: React.MutableRefObject<number>
}

const COLORS = {
  bg: '#141417',
  gridWeak: 'rgba(255,255,255,0.05)',
  gridStrong: 'rgba(255,255,255,0.1)',
  cRow: 'rgba(255,255,255,0.035)',
  noteFill: '#34d399',
  noteStroke: '#0ea371',
  noteLabel: '#022c22',
  playhead: '#fafafa',
  barLabel: 'rgba(255,255,255,0.28)',
  octaveLabel: 'rgba(255,255,255,0.22)',
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

/**
 * Minimal piano roll visualization of the recognized melody on canvas,
 * with an animated playhead driven by the synth player via playheadRef.
 */
export function PianoRoll({ notes, playing, playheadRef }: PianoRollProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width === 0 || notes.length === 0) return

    const dpr = window.devicePixelRatio || 1
    const minMidi = Math.min(...notes.map((n) => n.midi))
    const maxMidi = Math.max(...notes.map((n) => n.midi))
    const rows = Math.max(4, maxMidi - minMidi + 3)
    const rowH = Math.max(13, Math.min(22, 320 / rows))
    const height = Math.min(340, Math.max(150, rows * rowH))
    const topMidi = maxMidi + 1
    const maxEnd = notes.reduce((m, n) => Math.max(m, n.startBeat + n.durBeats), 0)
    const totalBeats = Math.max(8, Math.ceil(maxEnd / 4) * 4)

    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const beat = playheadRef.current
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = COLORS.bg
      ctx.fillRect(0, 0, width, height)

      const rowY = (midi: number) => ((topMidi - midi) / rows) * height

      // horizontal rows
      for (let midi = minMidi - 1; midi <= topMidi; midi++) {
        const y = rowY(midi)
        if (midi % 12 === 0) {
          ctx.fillStyle = COLORS.cRow
          ctx.fillRect(0, y, width, height / rows)
        }
        ctx.strokeStyle = COLORS.gridWeak
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
        if (midi % 12 === 0) {
          ctx.fillStyle = COLORS.octaveLabel
          ctx.font = '9px ui-monospace, monospace'
          ctx.fillText(midiToName(midi), 4, y + 11)
        }
      }

      // vertical beat/bar grid
      for (let b = 0; b <= totalBeats; b++) {
        const x = (b / totalBeats) * width
        ctx.strokeStyle = b % 4 === 0 ? COLORS.gridStrong : COLORS.gridWeak
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
        if (b % 4 === 0 && b < totalBeats) {
          ctx.fillStyle = COLORS.barLabel
          ctx.font = '10px ui-monospace, monospace'
          ctx.fillText(String(b / 4 + 1), x + 4, 12)
        }
      }

      // notes
      for (const n of notes) {
        const x = (n.startBeat / totalBeats) * width
        const w = Math.max(3, (n.durBeats / totalBeats) * width - 1)
        const y = rowY(n.midi) + 1
        const h = height / rows - 2
        roundRectPath(ctx, x, y, w, h, 3)
        ctx.fillStyle = COLORS.noteFill
        ctx.fill()
        ctx.strokeStyle = COLORS.noteStroke
        ctx.lineWidth = 1
        ctx.stroke()
        if (w >= 36 && h >= 11) {
          ctx.fillStyle = COLORS.noteLabel
          ctx.font = '9px ui-monospace, monospace'
          ctx.fillText(midiToName(n.midi), x + 4, y + h / 2 + 3)
        }
      }

      // playhead
      if (beat > 0) {
        const x = (Math.min(beat, totalBeats) / totalBeats) * width
        ctx.strokeStyle = COLORS.playhead
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
        ctx.fillStyle = COLORS.playhead
        ctx.beginPath()
        ctx.moveTo(x - 4, 0)
        ctx.lineTo(x + 4, 0)
        ctx.lineTo(x, 6)
        ctx.closePath()
        ctx.fill()
      }
    }

    draw()
    if (!playing) return
    let raf = 0
    const loop = () => {
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [notes, width, playing, playheadRef])

  return (
    <div ref={wrapRef} className="w-full overflow-hidden rounded-xl border border-zinc-800">
      {notes.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-zinc-500">
          Нет нот для отображения
        </div>
      ) : (
        <canvas ref={canvasRef} role="img" aria-label="Piano roll распознанной мелодии" />
      )}
    </div>
  )
}
