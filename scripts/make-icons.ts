/**
 * Генерация Android-ассетов HumNote из SVG-исходников (sharp).
 *
 * Запуск: bun run icons
 * Что создаёт:
 *  - launcher-иконки (legacy + round) mipmap-{m,h,xh,xxh,xxxh}dpi
 *  - adaptive-иконки: foreground-слои + цвет фона (API 26+)
 *  - splash-экраны drawable/ + drawable-{land,port}-*dpi
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const RES = path.resolve(__dirname, '../android/app/src/main/res')

/** Полная иконка: скруглённый квадрат с градиентом + микрофон. */
const LOGO_FULL = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#065f46"/>
      <stop offset="1" stop-color="#022c22"/>
    </linearGradient>
    <linearGradient id="mic" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6ee7b7"/>
      <stop offset="1" stop-color="#34d399"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="512" height="512" rx="112" fill="url(#bg)"/>
  <rect x="214" y="118" width="84" height="172" rx="42" fill="url(#mic)"/>
  <path d="M 176 252 A 80 80 0 0 0 336 252" fill="none" stroke="#34d399" stroke-width="26" stroke-linecap="round"/>
  <path d="M 256 332 L 256 372" fill="none" stroke="#34d399" stroke-width="26" stroke-linecap="round"/>
  <path d="M 206 380 L 306 380" fill="none" stroke="#34d399" stroke-width="26" stroke-linecap="round"/>
  <path d="M 372 186 A 56 56 0 0 1 372 270" fill="none" stroke="#a7f3d0" stroke-width="20" stroke-linecap="round" opacity="0.9"/>
  <path d="M 140 270 A 56 56 0 0 1 140 186" fill="none" stroke="#a7f3d0" stroke-width="20" stroke-linecap="round" opacity="0.55"/>
</svg>`

/** Только глиф (без фона) — adaptive foreground на прозрачном слое. */
const LOGO_GLYPH = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect x="214" y="118" width="84" height="172" rx="42" fill="#6ee7b7"/>
  <path d="M 176 252 A 80 80 0 0 0 336 252" fill="none" stroke="#34d399" stroke-width="26" stroke-linecap="round"/>
  <path d="M 256 332 L 256 372" fill="none" stroke="#34d399" stroke-width="26" stroke-linecap="round"/>
  <path d="M 206 380 L 306 380" fill="none" stroke="#34d399" stroke-width="26" stroke-linecap="round"/>
  <path d="M 372 186 A 56 56 0 0 1 372 270" fill="none" stroke="#a7f3d0" stroke-width="20" stroke-linecap="round" opacity="0.9"/>
  <path d="M 140 270 A 56 56 0 0 1 140 186" fill="none" stroke="#a7f3d0" stroke-width="20" stroke-linecap="round" opacity="0.55"/>
</svg>`

/** Круглая маска для round-иконок. */
const CIRCLE_MASK = (s: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}"><circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}" fill="#fff"/></svg>`

/** Сплэш: тёмный фон приложения + логотип по центру. */
const SPLASH = (w: number, h: number) => {
  const size = Math.round(Math.min(w, h) * 0.34)
  const x = Math.round((w - size) / 2)
  const y = Math.round((h - size) / 2)
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#09090b"/>
  <svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 512 512">${LOGO_GLYPH.replace(/<\/?svg[^>]*>/g, '')}</svg>
</svg>`
}

async function png(svg: string, w: number, h: number, file: string): Promise<void> {
  await sharp(Buffer.from(svg), { density: 300 }).resize(w, h).png().toFile(file)
}

async function pngRound(svg: string, s: number, file: string): Promise<void> {
  await sharp(Buffer.from(svg), { density: 300 })
    .resize(s, s)
    .composite([{ input: Buffer.from(CIRCLE_MASK(s)), blend: 'dest-in' }])
    .png()
    .toFile(file)
}

async function main(): Promise<void> {
  const densities: Array<[string, number]> = [
    ['mdpi', 48],
    ['hdpi', 72],
    ['xhdpi', 96],
    ['xxhdpi', 144],
    ['xxxhdpi', 192],
  ]
  const fgDensities: Array<[string, number]> = [
    ['mdpi', 108],
    ['hdpi', 162],
    ['xhdpi', 216],
    ['xxhdpi', 324],
    ['xxxhdpi', 432],
  ]
  const splashLand: Array<[string, number, number]> = [
    ['hdpi', 800, 480],
    ['xhdpi', 960, 720],
    ['xxhdpi', 1600, 960],
    ['xxxhdpi', 1920, 1280],
  ]
  const splashPort: Array<[string, number, number]> = [
    ['hdpi', 480, 800],
    ['xhdpi', 720, 1280],
    ['xxhdpi', 960, 1600],
    ['xxxhdpi', 1280, 1920],
  ]

  for (const [d, s] of densities) {
    const dir = path.join(RES, `mipmap-${d}`)
    await mkdir(dir, { recursive: true })
    await png(LOGO_FULL, s, s, path.join(dir, 'ic_launcher.png'))
    await pngRound(LOGO_FULL, s, path.join(dir, 'ic_launcher_round.png'))
    console.log(`✓ mipmap-${d}: launcher ${s}px`)
  }

  // adaptive foreground: глиф в безопасной зоне (66% слота 108dp)
  for (const [d, s] of fgDensities) {
    const dir = path.join(RES, `mipmap-${d}`)
    const inner = Math.round(s * 0.66)
    const off = Math.round((s - inner) / 2)
    const fg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <svg x="${off}" y="${off}" width="${inner}" height="${inner}" viewBox="0 0 512 512">${LOGO_GLYPH.replace(/<\/?svg[^>]*>/g, '')}</svg>
</svg>`
    await png(fg, s, s, path.join(dir, 'ic_launcher_foreground.png'))
    console.log(`✓ mipmap-${d}: foreground ${s}px`)
  }

  // сплэши
  await mkdir(path.join(RES, 'drawable'), { recursive: true })
  await png(SPLASH(480, 320), 480, 320, path.join(RES, 'drawable', 'splash.png'))
  for (const [d, w, h] of [...splashLand, ['mdpi', 480, 320] as [string, number, number]]) {
    const dir = path.join(RES, `drawable-land-${d}`)
    await mkdir(dir, { recursive: true })
    await png(SPLASH(w, h), w, h, path.join(dir, 'splash.png'))
  }
  for (const [d, w, h] of [...splashPort, ['mdpi', 320, 480] as [string, number, number]]) {
    const dir = path.join(RES, `drawable-port-${d}`)
    await mkdir(dir, { recursive: true })
    await png(SPLASH(w, h), w, h, path.join(dir, 'splash.png'))
  }
  console.log('✓ splash: drawable + land/port плотности')

  console.log('иконки HumNote готовы')
}

void main()
