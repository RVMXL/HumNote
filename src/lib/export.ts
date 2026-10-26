import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/**
 * Export & share helpers.
 *
 * Web: standard anchor download / Web Share API with files.
 * Android (Capacitor): WebView cannot save blob: URLs, so the file is written
 * to the app cache via @capacitor/filesystem and handed to the system share
 * sheet via @capacitor/share (user can pick "Save to Files", messengers, DAW, …).
 */

function downloadBlobWeb(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Save to disk / trigger a download. Never throws to the caller UI. */
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: filename,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
    })
    await Share.share({ title: filename, url: uri })
    return
  }
  downloadBlobWeb(blob, filename)
}

/** Open the system share sheet for the blob; falls back to a download. */
export async function shareBlob(blob: Blob, filename: string, title: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: filename,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
    })
    await Share.share({ title, url: uri })
    return
  }
  try {
    const file = new File([blob], filename, { type: blob.type })
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
    if (nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title })
      return
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return // user closed the share sheet
  }
  downloadBlobWeb(blob, filename)
}
