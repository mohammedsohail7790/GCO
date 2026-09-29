import { ImageResponse } from 'next/og'
import { SITE_NAME, SITE_TAGLINE } from '@/lib/config/site'

// Generated programmatically from the same brand tokens used elsewhere
// (app/layout.tsx's favicon, components/marketing/GCOLogo.tsx) - no
// external image asset, no fabricated logo/photo/claim. The mark here is
// rendered as plain text-in-a-square rather than the GCOMark SVG path used
// elsewhere: next/og's Satori renderer has limited/unverified support for
// arbitrary inline SVG paths, and a broken OG image is worse than a
// slightly simpler one - this keeps the same visual language (ink square,
// accent signal dot) using primitives Satori is known to render reliably.
export const alt = `${SITE_NAME} - ${SITE_TAGLINE}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px',
          backgroundColor: '#0B0D12',
          backgroundImage: 'radial-gradient(circle at 15% 20%, rgba(61,63,219,0.35), transparent 55%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 44 }}>
          <div
            style={{
              display: 'flex',
              position: 'relative',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: 14,
              backgroundColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <span style={{ color: '#FAFAF8', fontSize: 30, fontWeight: 700 }}>G</span>
            <div
              style={{
                display: 'flex',
                position: 'absolute',
                top: -4,
                right: -4,
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: '#3D3FDB',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 18 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: 'white' }}>GCO</span>
            <span style={{ fontSize: 15, fontWeight: 500, color: '#8b8c93', letterSpacing: 1 }}>
              GLOBAL CONVERSATION OPERATIONS
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 56, fontWeight: 700, color: 'white', maxWidth: 920, lineHeight: 1.15 }}>
          Conversation operations, built for scale.
        </div>
        <div style={{ display: 'flex', fontSize: 24, color: '#a3a4ad', marginTop: 24, maxWidth: 820 }}>{SITE_TAGLINE}</div>
      </div>
    ),
    { ...size },
  )
}
