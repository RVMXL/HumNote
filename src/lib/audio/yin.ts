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
 * Lightweight, works well for humming and whistling in the 60..3200 Hz range,
 * with guards against both octave errors (sub-harmonic reads on low male
 * voices, harmonic reads on whistle-like tones).
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

  // Step 3c/3d: octave guards — the two classic YIN failure modes on voices.
  // Mutually exclusive, each keyed to a structural fingerprint:
  //
  // 3d (octave-UP fix): whistle-like voice quality (weak fundamental, strong
  // 2nd harmonic) makes BOTH the T/2 dip and the T dip pass the threshold;
  // the scan takes the first (T/2) and the estimate lands an octave high.
  // Fingerprint: the dip at 2·tau is decisively deeper (< 45% of the current
  // one) — impossible for a true-period-tau signal, whose 2·tau dip is only
  // marginally deeper.
  //
  // 3c (octave-DOWN fix): a creaky low male voice yields a deeper dip at 2·T
  // than at the true period T; the T dip misses the absolute threshold while
  // still being credible. Fingerprint: the T/2 dip sits in the band
  // [threshold, allowance] — below allowance (credible) but above the
  // absolute threshold (which is exactly why the scan skipped it; a
  // weak-fundamental tone, by contrast, has its T/2 dip below the threshold,
  // so the two cases can never be confused).
  {
    const findDip = (center: number): { tau: number; v: number } | null => {
      const c = Math.round(center)
      if (c < 3 || c > tauMax - 2) return null
      const r = Math.max(3, Math.round(center * 0.06))
      let best = -1
      for (let tau = Math.max(2, c - r); tau <= Math.min(tauMax - 1, c + r); tau++) {
        if (best === -1 || yinBuffer[tau] < yinBuffer[best]) best = tau
      }
      const isLocalMin =
        best > 2 && best < tauMax - 1 &&
        yinBuffer[best] <= yinBuffer[best - 1] && yinBuffer[best] <= yinBuffer[best + 1]
      return isLocalMin ? { tau: best, v: yinBuffer[best] } : null
    }

    const curVal = yinBuffer[tauEstimate]
    const dbl = findDip(tauEstimate * 2)
    if (curVal > 0.02 && dbl && dbl.v < 0.15 && dbl.v < 0.45 * curVal) {
      tauEstimate = dbl.tau
    } else {
      const half = findDip(tauEstimate / 2)
      // 4·curVal: the half-period dip must be in the same quality league as
      // the current one. On a clean frame (d' ≈ 0) ANY dip passes the
      // absolute band — the ratio is what tells "credible alternative
      // period" (≤ ~3× worse) from "not a period at all" (an exact signal
      // scores ∞× worse at its half-period).
      if (half && half.v >= 0.15 && half.v < Math.min(0.3, 0.2 + 0.55 * curVal) && half.v < 4 * curVal) {
        tauEstimate = half.tau
      }
    }
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
