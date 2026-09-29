import { ImageResponse } from 'next/og'
import { SITE_NAME, SITE_TAGLINE } from '@/lib/config/site'

// Closes a previously-identified gap: no OG/social preview image existed,
// so links shared on Slack/LinkedIn/etc. showed no card at all. Generated
// programmatically from the same brand mark/copy already used elsewhere
// (app/layout.tsx's favicon, the homepage hero) - no external image asset,
// no fabricated logo/photo/claim, just the real brand color and copy.
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 72,
            height: 72,
            borderRadius: 16,
            backgroundColor: '#3D3FDB',
            marginBottom: 40,
          }}
        >
          <span style={{ color: 'white', fontSize: 36, fontWeight: 700 }}>G</span>
        </div>
        <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, color: 'white', maxWidth: 900 }}>{SITE_NAME}</div>
        <div style={{ display: 'flex', fontSize: 32, color: '#a3a4ad', marginTop: 20, maxWidth: 900 }}>{SITE_TAGLINE}</div>
      </div>
    ),
    { ...size },
  )
}
