'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react'

/**
 * Lightweight offline i18n: no runtime dependencies, dictionaries are bundled.
 * The locale is persisted in localStorage and detected from the browser on
 * first launch. All UI strings go through useI18n().t(key, vars?).
 */

export const LOCALES = ['en', 'ru', 'es', 'pt', 'fr', 'de', 'zh', 'ja'] as const
export type Locale = (typeof LOCALES)[number]

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  ru: 'Русский',
  es: 'Español',
  pt: 'Português',
  fr: 'Français',
  de: 'Deutsch',
  zh: '中文',
  ja: '日本語',
}

/** BCP-47 tags for Intl formatters and <html lang>. */
export const LOCALE_TAGS: Record<Locale, string> = {
  en: 'en-US',
  ru: 'ru-RU',
  es: 'es-ES',
  pt: 'pt-BR',
  fr: 'fr-FR',
  de: 'de-DE',
  zh: 'zh-CN',
  ja: 'ja-JP',
}

const STORAGE_KEY = 'humnote-locale'
const DEFAULT_LOCALE: Locale = 'ru'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

type DictValue = string | ((n: number) => string)

type Dict = Record<string, DictValue>

/* ── plural helpers ─────────────────────────────────────────────────────── */

const ruNotes = (n: number): string => {
  const m10 = n % 10
  const m100 = n % 100
  let word = 'нот'
  if (m10 === 1 && m100 !== 11) word = 'нота'
  else if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) word = 'ноты'
  return `${n} ${word}`
}

/* ── dictionaries ───────────────────────────────────────────────────────── */

const en: Dict = {
  'app.title': 'Mental melody recorder',
  'rec.hint': 'Hum or whistle a melody',
  'rec.listening': 'Listening…',
  'rec.processing': 'Recognizing notes…',
  'rec.startAria': 'Start recording',
  'rec.stopAria': 'Stop recording',
  'result.recognized': 'Recognized melody',
  'result.fromHistory': 'Melody from history',
  'result.timbre': 'Timbre',
  'result.quant': 'Quantize',
  'result.timbreAria': 'Synth timbre',
  'result.gridAria': 'Quantization grid',
  'result.tempoAria': 'Tempo',
  'grid.1': 'Quarter note',
  'grid.0.5': 'Eighth note',
  'grid.0.25': 'Sixteenth note',
  'grid.0': 'Off',
  'result.listen': 'Listen',
  'result.stop': 'Stop',
  'result.share': 'Share',
  'result.titlePlaceholder': 'Sketch name',
  'result.titleAria': 'Sketch name',
  'result.saved': 'Saved',
  'result.saving': 'Saving…',
  'result.save': 'Save',
  'result.newRec': 'New recording',
  'notes.count': (n) => (n === 1 ? '1 note' : `${n} notes`),
  'hist.title': 'History',
  'hist.aria': 'Sketch history',
  'hist.demo': 'Demo',
  'hist.demoTip': 'Load the demo melody (no microphone needed)',
  'hist.empty': 'Nothing here yet — record your first melody or open the demo',
  'hist.load': 'Load',
  'hist.loadAria': 'Load {name}',
  'hist.midi': 'Download MIDI',
  'hist.midiAria': 'Download MIDI of {name}',
  'hist.delete': 'Delete',
  'hist.deleteAria': 'Delete {name}',
  'pianoRoll.aria': 'Piano roll of the recognized melody',
  'pianoRoll.empty': 'No notes to display',
  'footer.left': 'HumNote · offline, no server',
  'footer.tech': 'data never leaves the device',
  'toast.notRecognized': 'No notes recognized',
  'toast.notRecognizedDesc': 'Try humming louder and closer to the microphone',
  'err.micUnavailable':
    'Microphone is unavailable. Allow recording in the app settings or open the web version over HTTPS.',
  'err.micDenied': 'Microphone access denied. Enable it in system settings and try again.',
  'err.micGeneric': 'Could not access the microphone. Check permissions and try again.',
  'toast.midiSaved': 'MIDI saved',
  'toast.midiSavedDesc': 'The file opens in any DAW or piano roll editor',
  'toast.midiFailed': 'Could not save the MIDI',
  'toast.renderingWav': 'Rendering WAV…',
  'toast.wavSaved': 'WAV saved',
  'toast.wavSavedDesc': 'A synthesized version of your melody',
  'toast.wavFailed': 'WAV export failed',
  'toast.shareReady': 'File is ready to share',
  'toast.shareFailed': 'Could not open the share sheet',
  'toast.savedTitle': 'Saved to history',
  'toast.savedDesc': 'The sketch is stored on the device',
  'toast.corrupt': 'File is corrupted',
  'sketch.default': 'Sketch',
  'demo.title': 'Ode to Joy · demo',
  'lang.aria': 'Language',
  'theme.aria': 'Toggle theme',
  'unit.hz': ' Hz',
}

const ru: Dict = {
  'app.title': 'Ментальный диктофон мелодий',
  'rec.hint': 'Напойте или просвистите мелодию',
  'rec.listening': 'Слушаю…',
  'rec.processing': 'Распознаю ноты…',
  'rec.startAria': 'Начать запись',
  'rec.stopAria': 'Остановить запись',
  'result.recognized': 'Распознанная мелодия',
  'result.fromHistory': 'Мелодия из истории',
  'result.timbre': 'Тембр',
  'result.quant': 'Квантование',
  'result.timbreAria': 'Тембр синтезатора',
  'result.gridAria': 'Сетка квантования',
  'result.tempoAria': 'Темп',
  'grid.1': '1/4 такта',
  'grid.0.5': '1/8 такта',
  'grid.0.25': '1/16 такта',
  'grid.0': 'Выкл',
  'result.listen': 'Слушать',
  'result.stop': 'Стоп',
  'result.share': 'Поделиться',
  'result.titlePlaceholder': 'Название наброска',
  'result.titleAria': 'Название наброска',
  'result.saved': 'В истории',
  'result.saving': 'Сохраняю…',
  'result.save': 'Сохранить',
  'result.newRec': 'Новая запись',
  'notes.count': ruNotes,
  'hist.title': 'История',
  'hist.aria': 'История набросков',
  'hist.demo': 'Демо',
  'hist.demoTip': 'Загрузить демо-мелодию (не нужен микрофон)',
  'hist.empty': 'Пока пусто — запишите первую мелодию или откройте демо',
  'hist.load': 'Загрузить',
  'hist.loadAria': 'Загрузить {name}',
  'hist.midi': 'Скачать MIDI',
  'hist.midiAria': 'Скачать MIDI {name}',
  'hist.delete': 'Удалить',
  'hist.deleteAria': 'Удалить {name}',
  'pianoRoll.aria': 'Piano roll распознанной мелодии',
  'pianoRoll.empty': 'Нет нот для отображения',
  'footer.left': 'HumNote · офлайн, без сервера',
  'footer.tech': 'данные не покидают устройство',
  'toast.notRecognized': 'Ноты не распознаны',
  'toast.notRecognizedDesc': 'Попробуйте напеть громче и ближе к микрофону',
  'err.micUnavailable':
    'Микрофон недоступен. Разрешите запись в настройках приложения или откройте веб-версию по HTTPS.',
  'err.micDenied': 'Доступ к микрофону запрещён. Разрешите его в настройках системы и попробуйте снова.',
  'err.micGeneric': 'Не удалось получить доступ к микрофону. Проверьте разрешения и попробуйте снова.',
  'toast.midiSaved': 'MIDI сохранён',
  'toast.midiSavedDesc': 'Файл откроется в любой DAW или piano roll редакторе',
  'toast.midiFailed': 'Не удалось сохранить MIDI',
  'toast.renderingWav': 'Рендерю WAV…',
  'toast.wavSaved': 'WAV сохранён',
  'toast.wavSavedDesc': 'Синтезированная версия вашей мелодии',
  'toast.wavFailed': 'Ошибка экспорта WAV',
  'toast.shareReady': 'Файл готов к отправке',
  'toast.shareFailed': 'Не удалось открыть общий доступ',
  'toast.savedTitle': 'Сохранено в историю',
  'toast.savedDesc': 'Набросок хранится на устройстве',
  'toast.corrupt': 'Файл повреждён',
  'sketch.default': 'Набросок',
  'demo.title': 'Ода к радости · демо',
  'lang.aria': 'Язык',
  'theme.aria': 'Сменить тему',
  'unit.hz': ' Гц',
}

const es: Dict = {
  'app.title': 'Dictado mental de melodías',
  'rec.hint': 'Tararea o silba una melodía',
  'rec.listening': 'Escuchando…',
  'rec.processing': 'Reconociendo notas…',
  'rec.startAria': 'Empezar grabación',
  'rec.stopAria': 'Detener grabación',
  'result.recognized': 'Melodía reconocida',
  'result.fromHistory': 'Melodía del historial',
  'result.timbre': 'Timbre',
  'result.quant': 'Cuantizar',
  'result.timbreAria': 'Timbre del sintetizador',
  'result.gridAria': 'Rejilla de cuantización',
  'result.tempoAria': 'Tempo',
  'grid.1': 'Negra',
  'grid.0.5': 'Corchea',
  'grid.0.25': 'Semicorchea',
  'grid.0': 'Apagado',
  'result.listen': 'Escuchar',
  'result.stop': 'Parar',
  'result.share': 'Compartir',
  'result.titlePlaceholder': 'Nombre del boceto',
  'result.titleAria': 'Nombre del boceto',
  'result.saved': 'Guardado',
  'result.saving': 'Guardando…',
  'result.save': 'Guardar',
  'result.newRec': 'Nueva grabación',
  'notes.count': (n) => (n === 1 ? '1 nota' : `${n} notas`),
  'hist.title': 'Historial',
  'hist.aria': 'Historial de bocetos',
  'hist.demo': 'Demo',
  'hist.demoTip': 'Cargar la melodía de demostración (no se necesita micrófono)',
  'hist.empty': 'Aún no hay nada — graba tu primera melodía o abre la demo',
  'hist.load': 'Cargar',
  'hist.loadAria': 'Cargar {name}',
  'hist.midi': 'Descargar MIDI',
  'hist.midiAria': 'Descargar MIDI de {name}',
  'hist.delete': 'Eliminar',
  'hist.deleteAria': 'Eliminar {name}',
  'pianoRoll.aria': 'Piano roll de la melodía reconocida',
  'pianoRoll.empty': 'No hay notas que mostrar',
  'footer.left': 'HumNote · sin conexión, sin servidor',
  'footer.tech': 'los datos nunca salen del dispositivo',
  'toast.notRecognized': 'No se reconocieron notas',
  'toast.notRecognizedDesc': 'Intenta tararear más fuerte y más cerca del micrófono',
  'err.micUnavailable':
    'Micrófono no disponible. Permite la grabación en los ajustes de la app o abre la versión web por HTTPS.',
  'err.micDenied': 'Acceso al micrófono denegado. Actívalo en los ajustes del sistema e inténtalo de nuevo.',
  'err.micGeneric': 'No se pudo acceder al micrófono. Comprueba los permisos e inténtalo de nuevo.',
  'toast.midiSaved': 'MIDI guardado',
  'toast.midiSavedDesc': 'El archivo se abre en cualquier DAW o editor de piano roll',
  'toast.midiFailed': 'No se pudo guardar el MIDI',
  'toast.renderingWav': 'Generando WAV…',
  'toast.wavSaved': 'WAV guardado',
  'toast.wavSavedDesc': 'Versión sintetizada de tu melodía',
  'toast.wavFailed': 'Error al exportar WAV',
  'toast.shareReady': 'Archivo listo para enviar',
  'toast.shareFailed': 'No se pudo abrir el menú de compartir',
  'toast.savedTitle': 'Guardado en el historial',
  'toast.savedDesc': 'El boceto se guarda en el dispositivo',
  'toast.corrupt': 'Archivo dañado',
  'sketch.default': 'Boceto',
  'demo.title': 'Oda a la alegría · demo',
  'lang.aria': 'Idioma',
  'theme.aria': 'Cambiar tema',
  'unit.hz': ' Hz',
}

const pt: Dict = {
  'app.title': 'Ditador mental de melodias',
  'rec.hint': 'Cante ou assobie uma melodia',
  'rec.listening': 'Ouvindo…',
  'rec.processing': 'Reconhecendo notas…',
  'rec.startAria': 'Iniciar gravação',
  'rec.stopAria': 'Parar gravação',
  'result.recognized': 'Melodia reconhecida',
  'result.fromHistory': 'Melodia do histórico',
  'result.timbre': 'Timbre',
  'result.quant': 'Quantizar',
  'result.timbreAria': 'Timbre do sintetizador',
  'result.gridAria': 'Grade de quantização',
  'result.tempoAria': 'Tempo',
  'grid.1': 'Semínima',
  'grid.0.5': 'Colcheia',
  'grid.0.25': 'Semicolcheia',
  'grid.0': 'Desligado',
  'result.listen': 'Ouvir',
  'result.stop': 'Parar',
  'result.share': 'Compartilhar',
  'result.titlePlaceholder': 'Nome do rascunho',
  'result.titleAria': 'Nome do rascunho',
  'result.saved': 'Salvo',
  'result.saving': 'Salvando…',
  'result.save': 'Salvar',
  'result.newRec': 'Nova gravação',
  'notes.count': (n) => (n === 1 ? '1 nota' : `${n} notas`),
  'hist.title': 'Histórico',
  'hist.aria': 'Histórico de rascunhos',
  'hist.demo': 'Demo',
  'hist.demoTip': 'Carregar a melodia de demonstração (sem microfone)',
  'hist.empty': 'Nada por aqui ainda — grave sua primeira melodia ou abra a demo',
  'hist.load': 'Carregar',
  'hist.loadAria': 'Carregar {name}',
  'hist.midi': 'Baixar MIDI',
  'hist.midiAria': 'Baixar MIDI de {name}',
  'hist.delete': 'Excluir',
  'hist.deleteAria': 'Excluir {name}',
  'pianoRoll.aria': 'Piano roll da melodia reconhecida',
  'pianoRoll.empty': 'Sem notas para exibir',
  'footer.left': 'HumNote · off-line, sem servidor',
  'footer.tech': 'os dados nunca saem do dispositivo',
  'toast.notRecognized': 'Nenhuma nota reconhecida',
  'toast.notRecognizedDesc': 'Tente cantar mais alto e mais perto do microfone',
  'err.micUnavailable':
    'Microfone indisponível. Permita a gravação nas configurações do app ou abra a versão web via HTTPS.',
  'err.micDenied': 'Acesso ao microfone negado. Ative-o nas configurações do sistema e tente novamente.',
  'err.micGeneric': 'Não foi possível acessar o microfone. Verifique as permissões e tente novamente.',
  'toast.midiSaved': 'MIDI salvo',
  'toast.midiSavedDesc': 'O arquivo abre em qualquer DAW ou editor de piano roll',
  'toast.midiFailed': 'Não foi possível salvar o MIDI',
  'toast.renderingWav': 'Renderizando WAV…',
  'toast.wavSaved': 'WAV salvo',
  'toast.wavSavedDesc': 'Versão sintetizada da sua melodia',
  'toast.wavFailed': 'Falha ao exportar WAV',
  'toast.shareReady': 'Arquivo pronto para enviar',
  'toast.shareFailed': 'Não foi possível abrir o compartilhamento',
  'toast.savedTitle': 'Salvo no histórico',
  'toast.savedDesc': 'O rascunho fica armazenado no dispositivo',
  'toast.corrupt': 'Arquivo corrompido',
  'sketch.default': 'Rascunho',
  'demo.title': 'Ode à Alegria · demo',
  'lang.aria': 'Idioma',
  'theme.aria': 'Alternar tema',
  'unit.hz': ' Hz',
}

const fr: Dict = {
  'app.title': 'Dictaphone mental de mélodies',
  'rec.hint': 'Chantez ou sifflez une mélodie',
  'rec.listening': 'Écoute…',
  'rec.processing': 'Reconnaissance des notes…',
  'rec.startAria': "Commencer l'enregistrement",
  'rec.stopAria': "Arrêter l'enregistrement",
  'result.recognized': 'Mélodie reconnue',
  'result.fromHistory': 'Mélodie de l’historique',
  'result.timbre': 'Timbre',
  'result.quant': 'Quantifier',
  'result.timbreAria': 'Timbre du synthé',
  'result.gridAria': 'Grille de quantification',
  'result.tempoAria': 'Tempo',
  'grid.1': 'Noire',
  'grid.0.5': 'Croche',
  'grid.0.25': 'Double croche',
  'grid.0': 'Désactivé',
  'result.listen': 'Écouter',
  'result.stop': 'Stop',
  'result.share': 'Partager',
  'result.titlePlaceholder': 'Nom du brouillon',
  'result.titleAria': 'Nom du brouillon',
  'result.saved': 'Enregistré',
  'result.saving': 'Enregistrement…',
  'result.save': 'Enregistrer',
  'result.newRec': 'Nouvel enregistrement',
  'notes.count': (n) => (n > 1 ? `${n} notes` : '1 note'),
  'hist.title': 'Historique',
  'hist.aria': 'Historique des brouillons',
  'hist.demo': 'Démo',
  'hist.demoTip': 'Charger la mélodie de démonstration (sans micro)',
  'hist.empty': "Rien pour l'instant — enregistrez votre première mélodie ou ouvrez la démo",
  'hist.load': 'Charger',
  'hist.loadAria': 'Charger {name}',
  'hist.midi': 'Télécharger le MIDI',
  'hist.midiAria': 'Télécharger le MIDI de {name}',
  'hist.delete': 'Supprimer',
  'hist.deleteAria': 'Supprimer {name}',
  'pianoRoll.aria': 'Piano roll de la mélodie reconnue',
  'pianoRoll.empty': 'Aucune note à afficher',
  'footer.left': 'HumNote · hors ligne, sans serveur',
  'footer.tech': 'les données ne quittent jamais l’appareil',
  'toast.notRecognized': 'Aucune note reconnue',
  'toast.notRecognizedDesc': 'Essayez de chanter plus fort et plus près du micro',
  'err.micUnavailable':
    "Micro indisponible. Autorisez l'enregistrement dans les réglages de l'app ou ouvrez la version web en HTTPS.",
  'err.micDenied': 'Accès au micro refusé. Activez-le dans les réglages du système et réessayez.',
  'err.micGeneric': "Impossible d'accéder au micro. Vérifiez les autorisations et réessayez.",
  'toast.midiSaved': 'MIDI enregistré',
  'toast.midiSavedDesc': "Le fichier s'ouvre dans n'importe quel DAW ou éditeur piano roll",
  'toast.midiFailed': "Impossible d'enregistrer le MIDI",
  'toast.renderingWav': 'Rendu du WAV…',
  'toast.wavSaved': 'WAV enregistré',
  'toast.wavSavedDesc': 'Version synthétisée de votre mélodie',
  'toast.wavFailed': "Échec de l'export WAV",
  'toast.shareReady': 'Fichier prêt à partager',
  'toast.shareFailed': "Impossible d'ouvrir le partage",
  'toast.savedTitle': "Enregistré dans l'historique",
  'toast.savedDesc': 'Le brouillon est stocké sur l’appareil',
  'toast.corrupt': 'Fichier corrompu',
  'sketch.default': 'Brouillon',
  'demo.title': 'Ode à la joie · démo',
  'lang.aria': 'Langue',
  'theme.aria': 'Changer de thème',
  'unit.hz': ' Hz',
}

const de: Dict = {
  'app.title': 'Mentales Melodien-Diktiergerät',
  'rec.hint': 'Summe oder pfeife eine Melodie',
  'rec.listening': 'Höre zu…',
  'rec.processing': 'Erkenne Noten…',
  'rec.startAria': 'Aufnahme starten',
  'rec.stopAria': 'Aufnahme stoppen',
  'result.recognized': 'Erkannte Melodie',
  'result.fromHistory': 'Melodie aus dem Verlauf',
  'result.timbre': 'Klangfarbe',
  'result.quant': 'Quantisieren',
  'result.timbreAria': 'Synth-Klangfarbe',
  'result.gridAria': 'Quantisierungsraster',
  'result.tempoAria': 'Tempo',
  'grid.1': 'Viertelnote',
  'grid.0.5': 'Achtelnote',
  'grid.0.25': 'Sechzehntelnote',
  'grid.0': 'Aus',
  'result.listen': 'Anhören',
  'result.stop': 'Stopp',
  'result.share': 'Teilen',
  'result.titlePlaceholder': 'Skizzenname',
  'result.titleAria': 'Skizzenname',
  'result.saved': 'Gespeichert',
  'result.saving': 'Speichern…',
  'result.save': 'Speichern',
  'result.newRec': 'Neue Aufnahme',
  'notes.count': (n) => (n === 1 ? '1 Note' : `${n} Noten`),
  'hist.title': 'Verlauf',
  'hist.aria': 'Skizzenverlauf',
  'hist.demo': 'Demo',
  'hist.demoTip': 'Demo-Melodie laden (kein Mikrofon nötig)',
  'hist.empty': 'Noch nichts da — nimm deine erste Melodie auf oder öffne die Demo',
  'hist.load': 'Laden',
  'hist.loadAria': '{name} laden',
  'hist.midi': 'MIDI herunterladen',
  'hist.midiAria': 'MIDI von {name} herunterladen',
  'hist.delete': 'Löschen',
  'hist.deleteAria': '{name} löschen',
  'pianoRoll.aria': 'Piano Roll der erkannten Melodie',
  'pianoRoll.empty': 'Keine Noten anzuzeigen',
  'footer.left': 'HumNote · offline, ohne Server',
  'footer.tech': 'Daten verlassen das Gerät nie',
  'toast.notRecognized': 'Keine Noten erkannt',
  'toast.notRecognizedDesc': 'Versuche, lauter und näher am Mikrofon zu summen',
  'err.micUnavailable':
    'Mikrofon nicht verfügbar. Erlaube die Aufnahme in den App-Einstellungen oder öffne die Webversion über HTTPS.',
  'err.micDenied': 'Mikrofonzugriff verweigert. Aktiviere ihn in den Systemeinstellungen und versuche es erneut.',
  'err.micGeneric': 'Zugriff auf das Mikrofon fehlgeschlagen. Prüfe die Berechtigungen und versuche es erneut.',
  'toast.midiSaved': 'MIDI gespeichert',
  'toast.midiSavedDesc': 'Die Datei öffnet sich in jeder DAW oder im Piano-Roll-Editor',
  'toast.midiFailed': 'MIDI konnte nicht gespeichert werden',
  'toast.renderingWav': 'WAV wird gerendert…',
  'toast.wavSaved': 'WAV gespeichert',
  'toast.wavSavedDesc': 'Synthetisierte Version deiner Melodie',
  'toast.wavFailed': 'WAV-Export fehlgeschlagen',
  'toast.shareReady': 'Datei bereit zum Teilen',
  'toast.shareFailed': 'Teilen-Dialog konnte nicht geöffnet werden',
  'toast.savedTitle': 'Im Verlauf gespeichert',
  'toast.savedDesc': 'Die Skizze bleibt auf dem Gerät',
  'toast.corrupt': 'Datei beschädigt',
  'sketch.default': 'Skizze',
  'demo.title': 'Ode an die Freude · Demo',
  'lang.aria': 'Sprache',
  'theme.aria': 'Theme wechseln',
  'unit.hz': ' Hz',
}

const zh: Dict = {
  'app.title': '心哼记谱',
  'rec.hint': '哼唱或吹口哨一段旋律',
  'rec.listening': '聆听中…',
  'rec.processing': '正在识别音符…',
  'rec.startAria': '开始录音',
  'rec.stopAria': '停止录音',
  'result.recognized': '识别出的旋律',
  'result.fromHistory': '来自历史的旋律',
  'result.timbre': '音色',
  'result.quant': '量化',
  'result.timbreAria': '合成器音色',
  'result.gridAria': '量化网格',
  'result.tempoAria': '速度',
  'grid.1': '四分音符',
  'grid.0.5': '八分音符',
  'grid.0.25': '十六分音符',
  'grid.0': '关闭',
  'result.listen': '试听',
  'result.stop': '停止',
  'result.share': '分享',
  'result.titlePlaceholder': '草稿名称',
  'result.titleAria': '草稿名称',
  'result.saved': '已保存',
  'result.saving': '保存中…',
  'result.save': '保存',
  'result.newRec': '新录音',
  'notes.count': (n) => `${n} 个音符`,
  'hist.title': '历史',
  'hist.aria': '草稿历史',
  'hist.demo': '示例',
  'hist.demoTip': '加载示例旋律（无需麦克风）',
  'hist.empty': '还没有记录 — 录制你的第一段旋律或打开示例',
  'hist.load': '加载',
  'hist.loadAria': '加载 {name}',
  'hist.midi': '下载 MIDI',
  'hist.midiAria': '下载 {name} 的 MIDI',
  'hist.delete': '删除',
  'hist.deleteAria': '删除 {name}',
  'pianoRoll.aria': '识别旋律的钢琴卷帘',
  'pianoRoll.empty': '没有可显示的音符',
  'footer.left': 'HumNote · 离线，无服务器',
  'footer.tech': '数据永不离开设备',
  'toast.notRecognized': '未识别到音符',
  'toast.notRecognizedDesc': '请试着更大声、更靠近麦克风哼唱',
  'err.micUnavailable': '麦克风不可用。请在应用设置中允许录音，或通过 HTTPS 打开网页版。',
  'err.micDenied': '麦克风访问被拒绝。请在系统设置中开启后重试。',
  'err.micGeneric': '无法访问麦克风。请检查权限后重试。',
  'toast.midiSaved': 'MIDI 已保存',
  'toast.midiSavedDesc': '文件可在任何 DAW 或钢琴卷帘编辑器中打开',
  'toast.midiFailed': 'MIDI 保存失败',
  'toast.renderingWav': '正在渲染 WAV…',
  'toast.wavSaved': 'WAV 已保存',
  'toast.wavSavedDesc': '旋律的合成版本',
  'toast.wavFailed': 'WAV 导出失败',
  'toast.shareReady': '文件已就绪，可以分享',
  'toast.shareFailed': '无法打开分享面板',
  'toast.savedTitle': '已保存到历史',
  'toast.savedDesc': '草稿存储在设备上',
  'toast.corrupt': '文件已损坏',
  'sketch.default': '草稿',
  'demo.title': '欢乐颂 · 示例',
  'lang.aria': '语言',
  'theme.aria': '切换主题',
  'unit.hz': ' Hz',
}

const ja: Dict = {
  'app.title': 'メンタルメロディレコーダー',
  'rec.hint': 'ハミングや口笛でメロディを録音してください',
  'rec.listening': '聞いています…',
  'rec.processing': '音符を認識中…',
  'rec.startAria': '録音を開始',
  'rec.stopAria': '録音を停止',
  'result.recognized': '認識したメロディ',
  'result.fromHistory': '履歴のメロディ',
  'result.timbre': '音色',
  'result.quant': 'クオンタイズ',
  'result.timbreAria': 'シンセの音色',
  'result.gridAria': 'クオンタイズグリッド',
  'result.tempoAria': 'テンポ',
  'grid.1': '4分音符',
  'grid.0.5': '8分音符',
  'grid.0.25': '16分音符',
  'grid.0': 'オフ',
  'result.listen': '聴く',
  'result.stop': '停止',
  'result.share': '共有',
  'result.titlePlaceholder': 'スケッチ名',
  'result.titleAria': 'スケッチ名',
  'result.saved': '保存済み',
  'result.saving': '保存中…',
  'result.save': '保存',
  'result.newRec': '新規録音',
  'notes.count': (n) => `${n} 音符`,
  'hist.title': '履歴',
  'hist.aria': 'スケッチ履歴',
  'hist.demo': 'デモ',
  'hist.demoTip': 'デモメロディを読み込む（マイク不要）',
  'hist.empty': 'まだ何もありません — 最初のメロディを録音するかデモを開いてください',
  'hist.load': '読み込む',
  'hist.loadAria': '{name} を読み込む',
  'hist.midi': 'MIDIをダウンロード',
  'hist.midiAria': '{name} のMIDIをダウンロード',
  'hist.delete': '削除',
  'hist.deleteAria': '{name} を削除',
  'pianoRoll.aria': '認識したメロディのピアノロール',
  'pianoRoll.empty': '表示する音符がありません',
  'footer.left': 'HumNote · オフライン、サーバーなし',
  'footer.tech': 'データは端末の外に出ません',
  'toast.notRecognized': '音符を認識できませんでした',
  'toast.notRecognizedDesc': 'もっと大きく、マイクに近づいてハミングしてみてください',
  'err.micUnavailable': 'マイクを利用できません。アプリの設定で録音を許可するか、HTTPSでWeb版を開いてください。',
  'err.micDenied': 'マイクへのアクセスが拒否されました。システム設定で許可してから再試行してください。',
  'err.micGeneric': 'マイクにアクセスできませんでした。権限を確認して再試行してください。',
  'toast.midiSaved': 'MIDIを保存しました',
  'toast.midiSavedDesc': 'ファイルはどんなDAWやピアノロールエディタでも開けます',
  'toast.midiFailed': 'MIDIを保存できませんでした',
  'toast.renderingWav': 'WAVをレンダリング中…',
  'toast.wavSaved': 'WAVを保存しました',
  'toast.wavSavedDesc': 'メロディの合成版です',
  'toast.wavFailed': 'WAVエクスポートに失敗しました',
  'toast.shareReady': 'ファイルを共有できます',
  'toast.shareFailed': '共有シートを開けませんでした',
  'toast.savedTitle': '履歴に保存しました',
  'toast.savedDesc': 'スケッチは端末に保存されます',
  'toast.corrupt': 'ファイルが壊れています',
  'sketch.default': 'スケッチ',
  'demo.title': '歓喜の歌 · デモ',
  'lang.aria': '言語',
  'theme.aria': 'テーマを切り替える',
  'unit.hz': ' Hz',
}

export const dictionaries: Record<Locale, Dict> = { en, ru, es, pt, fr, de, zh, ja }

/* ── translator ─────────────────────────────────────────────────────────── */

export type TFunc = (key: string, vars?: Record<string, string | number>) => string

function makeT(locale: Locale): TFunc {
  return (key, vars) => {
    const dict = dictionaries[locale] ?? en
    let value: DictValue = dict[key] ?? en[key] ?? key
    if (typeof value === 'function') value = value(Number(vars?.n ?? 0))
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        value = (value as string).replaceAll(`{${k}}`, String(v))
      }
    }
    return value as string
  }
}

/* ── provider ───────────────────────────────────────────────────────────── */

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: TFunc
}

const I18nContext = createContext<I18nContextValue | null>(null)

function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isLocale(stored)) return stored
  } catch {
    /* storage unavailable */
  }
  const candidates =
    typeof navigator !== 'undefined' && navigator.languages?.length
      ? navigator.languages
      : [navigator.language]
  for (const tag of candidates) {
    const base = tag?.slice(0, 2).toLowerCase()
    if (isLocale(base)) return base
  }
  return DEFAULT_LOCALE
}

let currentLocale: Locale = DEFAULT_LOCALE
let initialized = false
const listeners = new Set<() => void>()

function ensureInit() {
  if (!initialized && typeof window !== 'undefined') {
    currentLocale = detectLocale()
    initialized = true
  }
}

const localeStore = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  get(): Locale {
    ensureInit()
    return currentLocale
  },
  set(next: Locale) {
    ensureInit()
    currentLocale = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* storage unavailable */
    }
    for (const l of listeners) l()
  },
}

const noopSubscribe = () => () => undefined

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Server + hydration render the default locale; the detected one appears
  // right after mount via the external store (no setState-in-effect).
  const storeLocale = useSyncExternalStore(localeStore.subscribe, localeStore.get, () => DEFAULT_LOCALE)
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false)
  const locale = mounted ? storeLocale : DEFAULT_LOCALE

  // keep <html lang> in sync with the active locale
  useEffect(() => {
    document.documentElement.lang = LOCALE_TAGS[locale]
  }, [locale])

  const setLocale = useCallback((next: Locale) => localeStore.set(next), [])
  const t = useMemo(() => makeT(locale), [locale])
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
