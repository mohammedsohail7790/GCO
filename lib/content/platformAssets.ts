// Sanitized screenshots of the real GCO platform.
//
// STATUS: none supplied yet. Cristian approved using sanitized real screenshots; they must be
// produced from demo/seeded data (never real client data, operator names, leads, conversations,
// tokens or tenant details) and reviewed before being added here. Until then the platform page
// shows no screenshot section at all - we do not fabricate screenshots or present mock-ups as
// the real product.
//
// To add one: put the optimised file in /public/platform/ and append an entry
// { src: '/platform/queue.webp', alt: '...', caption: '...', width: 1600, height: 1000 }.

export interface PlatformScreenshot {
  src: string
  alt: string
  caption: string
  width: number
  height: number
}

export const PLATFORM_SCREENSHOTS: readonly PlatformScreenshot[] = []
