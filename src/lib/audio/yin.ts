export interface YinResult {
  /** detected frequency in Hz, -1 when no pitch found */
  freq: number
  /** confidence 0..1 (1 - normalized difference at chosen lag) */
  prob: number
}

/** d' above this level means "definitely no periodic signal" — bail out. */
const MAX_NORMALIZED_DIFF = 0.85

/**
 * YIN pitch detection algorithm (A. de Cheveigné & H. Kawahara, 2002).
 * Lightweight, works well for humming and whistling in the 60..2500 Hz range.
 *
 * Instead of dropping the frame when no valley crosses the absolute threshold,
 * we fall back to the global minimum of the normalized difference and report
 * its actual confidence. Transitions between notes (weak voicing, glides) then
 * stay continuous with a lower `prob`, and the post-processing pipeline in
 * analysis.ts filters unvoiced frames by that confidence — much fewer dropped
 * frames means fewer fragmented notes.
 *
 * @param buf        time-domain window (2048 samples recommended)
 * @param sampleRate audio context sample rate
 * @param threshold  absolute threshold on the cumulative mean normalized difference
 */
export function yin(buf: Float32Array, sampleRate: number, threshold = 0.15): YinResult {
  const tauMax = Math.floor(buf.length / 2)
  if (tauMax < 4) return { freq: -1, prob: 0 }

  const yinBuffer = new Float32Array(tauMax)

  // Step 1: squared difference function
  for (let tau = 0; tau < tauMax; tau++) {
    let sum = 0
    for (let i = 0; i < tauMax; i++) {
      const delta = buf[i] - buf[i + tau]
      sum += delta * delta
    }
    yinBuffer[tau] = sum
  }

  // Step 2: cumulative mean normalized difference
  yinBuffer[0] = 1
  let runningSum = 0
  for (let tau = 1; tau < tauMax; tau++) {
    runningSum += yinBuffer[tau]
    yinBuffer[tau] = runningSum === 0 ? 1 : (yinBuffer[tau] * tau) / runningSum
  }

  // Step 3a: absolute threshold — first local minimum below threshold
  let tauEstimate = -1
  for (let tau = 2; tau < tauMax; tau++) {
    if (yinBuffer[tau] < threshold) {
      while (tau + 1 < tauMax && yinBuffer[tau + 1] < yinBuffer[tau]) tau++
      tauEstimate = tau
      break
    }
  }

  // Step 3b: fallback — global minimum, reported with its true confidence
  if (tauEstimate === -1) {
    let best = 2
    for (let tau = 3; tau < tauMax; tau++) {
      if (yinBuffer[tau] < yinBuffer[best]) best = tau
    }
    if (yinBuffer[best] >= MAX_NORMALIZED_DIFF) return { freq: -1, prob: 0 }
    tauEstimate = best
  }

  const prob = Math.max(0, Math.min(1, 1 - yinBuffer[tauEstimate]))

  // Step 4: parabolic interpolation around the minimum for sub-sample precision
  let betterTau = tauEstimate
  if (tauEstimate > 1 && tauEstimate < tauMax - 1) {
    const s0 = yinBuffer[tauEstimate - 1]
    const s1 = yinBuffer[tauEstimate]
    const s2 = yinBuffer[tauEstimate + 1]
    const denom = 2 * (s0 + s2 - 2 * s1)
    if (denom !== 0) {
      const shift = (s0 - s2) / denom
      if (Math.abs(shift) <= 1) betterTau = tauEstimate + shift
    }
  }

  const freq = sampleRate / betterTau
  return { freq, prob }
}
