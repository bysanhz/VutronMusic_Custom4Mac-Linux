/** Redact authenticated URLs and credential assignments before retaining diagnostic text. */
export const redactDiagnosticText = (value: string): string =>
  value
    .replace(/(?:https?:\/\/|atom:\/\/)[^\s"'<>]+/gi, '[redacted-url]')
    .replace(/\b(cookie|authorization|token|MUSIC_U)\s*[:=]\s*[^\n,;]+/gi, '$1=[redacted]')
    .slice(0, 2000)
