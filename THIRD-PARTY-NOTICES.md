# Сторонние компоненты HumNote

HumNote распространяется по лицензии Apache-2.0 (см. [LICENSE](LICENSE)).
Ниже — runtime- и build-зависимости с их лицензиями. Точные версии — в
[`package.json`](package.json) и [`bun.lock`](bun.lock).

## Runtime (входит в сборки приложения)

| Компонент | Лицензия | Назначение |
|---|---|---|
| [Next.js](https://nextjs.org) | MIT | веб-фреймворк, статический экспорт |
| [React / React DOM](https://react.dev) | MIT | UI |
| [Capacitor Core](https://capacitorjs.com) | MIT | нативная оболочка Android |
| [@capacitor/android](https://capacitorjs.com) | MIT | платформа Android |
| [@capacitor/share](https://capacitorjs.com) | MIT | системный «Поделиться» |
| [@capacitor/filesystem](https://capacitorjs.com) | MIT | запись файла перед «Поделиться» |
| [Zustand](https://zustand.docs.pmnd.rs) | MIT | состояние, persist истории в localStorage |
| [Radix UI](https://www.radix-ui.com) (select, slider, slot, toast) | MIT | доступные примитивы UI |
| [lucide-react](https://lucide.dev) | ISC | иконки |
| [class-variance-authority](https://cva.style) | Apache-2.0 | варианты классов компонентов |
| [clsx](https://github.com/lukeed/clsx) | MIT | конкатенация классов |
| [tailwind-merge](https://github.com/dcastil/tailwind-merge) | MIT | слияние Tailwind-классов |

## Build (не попадает в сборки)

| Компонент | Лицензия | Назначение |
|---|---|---|
| [Tailwind CSS](https://tailwindcss.com) | MIT | стили |
| [tw-animate-css](https://github.com/Wombosvideo/tw-animate-css) | MIT | анимационные утилиты |
| [TypeScript](https://www.typescriptlang.org) | Apache-2.0 | типизация |
| [ESLint / eslint-config-next](https://eslint.org) | MIT | качество кода |
| [sharp](https://sharp.pixelplumbing.com) | Apache-2.0 | генерация иконок/splash из SVG |
| [@capacitor/cli](https://capacitorjs.com) | MIT | синхронизация web-ассетов в Android |

## Шрифты

- **Geist** (Vercel) — SIL Open Font License 1.1; подгружается через
  `next/font` и встраивается в сборку (приложение работает офлайн).

Все перечисленные компоненты используются в неизменном виде и распространяются
на условиях их собственных лицензий.
