import fs from 'node:fs';
import path from 'node:path';

import { ImageResponse } from 'next/og';

import { siteConfig } from '@/lib/site';

export const dynamic = 'force-static';

export const alt = siteConfig.ogImageAlt;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Inline the Manut logo as a data URL so Satori (the OG renderer) does not
// need to fetch it over HTTP. process.cwd() is the Next.js app root.
function loadLogoDataUrl(): string {
  const file = path.join(process.cwd(), 'public', 'manut-logo.jpeg');
  const bytes = fs.readFileSync(file);
  return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}

export default function OgImage() {
  const logo = loadLogoDataUrl();

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px',
        background:
          'linear-gradient(135deg, #fafaf2 0%, #f4ece2 60%, #ecdcd2 100%)',
        fontFamily: 'Geist, sans-serif',
        color: '#101013',
        position: 'relative',
      }}
    >
      {/* Spectrum wash — coral + teal + gold echoes of the Newton scene */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 55% 50% at 22% 18%, rgba(238, 108, 92, 0.22), transparent 65%),' +
            'radial-gradient(ellipse 50% 45% at 78% 26%, rgba(70, 142, 168, 0.22), transparent 65%),' +
            'radial-gradient(ellipse 70% 55% at 50% 6%, rgba(231, 191, 110, 0.20), transparent 70%)',
        }}
      />

      {/* Logo card — real Manut illustration */}
      <div
        style={{
          position: 'absolute',
          top: 72,
          right: 72,
          width: 120,
          height: 120,
          borderRadius: 24,
          overflow: 'hidden',
          display: 'flex',
          border: '1px solid rgba(16,16,19,0.08)',
          boxShadow: '0 12px 32px -12px rgba(16,16,19,0.25)',
        }}
      >
        <img
          src={logo}
          alt=""
          width={120}
          height={120}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>

      {/* Top kicker */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 22,
          letterSpacing: 4,
          fontFamily: 'monospace',
          textTransform: 'uppercase',
          color: '#5b5b62',
        }}
      >
        <div style={{ width: 40, height: 2, background: '#5b5b62' }} />
        {siteConfig.name}
      </div>

      {/* Title */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          maxWidth: 880,
        }}
      >
        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            letterSpacing: -3,
            lineHeight: 1.02,
            display: 'flex',
            flexWrap: 'wrap',
          }}
        >
          Work management
          <span
            style={{
              fontStyle: 'italic',
              fontFamily: 'Georgia, serif',
              marginLeft: 16,
              fontWeight: 400,
            }}
          >
            close
          </span>
          <span style={{ marginLeft: 16 }}>to the work.</span>
        </div>
        <div
          style={{
            fontSize: 30,
            color: '#3a3a40',
            maxWidth: 820,
            lineHeight: 1.4,
          }}
        >
          Projects, work items, cycles, modules, intake, views, pages, and
          AI-assisted workflows.
        </div>
      </div>

      {/* Bottom row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 22,
          color: '#3a3a40',
        }}
      >
        <div style={{ display: 'flex', gap: 32 }}>
          <span>Projects</span>
          <span>Cycles</span>
          <span>Intake</span>
        </div>
        <div style={{ fontFamily: 'monospace', color: '#5b5b62' }}>
          {siteConfig.domain}
        </div>
      </div>

      {/* Bottom rainbow seam */}
      <div
        style={{
          position: 'absolute',
          inset: 'auto 0 0 0',
          height: 4,
          background:
            'linear-gradient(90deg,' +
            ' rgba(238,108,92,1) 0%,' +
            ' rgba(231,191,110,1) 25%,' +
            ' rgba(170,201,120,1) 50%,' +
            ' rgba(70,142,168,1) 75%,' +
            ' rgba(120,110,180,1) 100%)',
        }}
      />
    </div>,
    { ...size }
  );
}
