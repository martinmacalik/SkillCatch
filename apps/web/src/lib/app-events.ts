// Tiny app-wide events over window, for components that don't share state.
//   profile:refresh → TopBar reloads XP / coins
//   timer:stopped   → heatmaps reload their data

type AppEvent = 'profile:refresh' | 'timer:stopped'

export function emitAppEvent(name: AppEvent) {
  window.dispatchEvent(new Event(name))
}

export function onAppEvent(name: AppEvent, handler: () => void): () => void {
  window.addEventListener(name, handler)
  return () => window.removeEventListener(name, handler)
}
