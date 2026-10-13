// Links into the class hub (VITE_HUB_URL is read by lib/hub.ts as well).
export function hubHomeUrl(): string {
  return (import.meta.env.VITE_HUB_URL || '/').replace(/\/?$/, '/');
}
