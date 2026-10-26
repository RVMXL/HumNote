import type { CapacitorConfig } from '@capacitor/cli';

/**
 * HumNote Android — ПОЛНОСТЬЮ АВТОНОМНОЕ приложение:
 * статический сайт (out/, см. next.config.ts output:'export') упаковывается
 * в assets через `cap sync`; запись, распознавание нот (YIN), синтез и
 * экспорт MIDI/WAV выполняются прямо на устройстве (WebView).
 * Сервер не нужен, приложение работает офлайн.
 */
const config: CapacitorConfig = {
  appId: 'ru.rvmxl.humnote',
  appName: 'HumNote',
  webDir: 'out',
};

export default config;
