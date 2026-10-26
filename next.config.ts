import type { NextConfig } from "next";

/**
 * HumNote — ПОЛНОСТЬЮ АВТОНОМНОЕ приложение: статический сайт (output: export)
 * пакуется в Android через `cap sync` и работает без сервера. Распознавание,
 * синтез и экспорт выполняются на устройстве, история — в localStorage.
 */
const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: false,
};

export default nextConfig;
