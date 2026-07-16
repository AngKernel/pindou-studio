export function safeExportBaseName(name: string): string {
  return name
    .replace(/[\u0000-\u001f\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 80) || 'pindou-pattern';
}
