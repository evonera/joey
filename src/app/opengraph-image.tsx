import { ImageResponse } from 'next/og';

// Required for static export
export const dynamic = 'force-static';

// Image metadata
export const alt = 'Joey - Autonomous Social Media Agent';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

// Image generation: brand lockup + product UI mock
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0a0908',
          width: '100%',
          height: '100%',
          display: 'flex',
          color: '#ffffff',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* Subtle background ambient glows */}
        <div
          style={{
            position: 'absolute',
            top: -100,
            left: 200,
            width: 500,
            height: 350,
            background: 'rgba(255, 230, 51, 0.08)',
            borderRadius: '50%',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -50,
            right: 150,
            width: 450,
            height: 300,
            background: 'rgba(245, 158, 11, 0.06)',
            borderRadius: '50%',
          }}
        />

        {/* Left: Brand lockup */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            paddingLeft: 64,
            width: 580,
          }}
        >
          {/* Brand Mascot Lockup */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginBottom: 28,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: 'rgba(255, 230, 51, 0.15)',
                border: '1.5px solid rgba(255, 230, 51, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 32,
              }}
            >
              🐱
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 36,
                fontWeight: 800,
                color: '#ffffff',
                letterSpacing: '-0.02em',
              }}
            >
              Joey
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 12,
                fontWeight: 700,
                color: '#ffe633',
                background: 'rgba(255, 230, 51, 0.12)',
                border: '1px solid rgba(255, 230, 51, 0.25)',
                padding: '4px 10px',
                borderRadius: 20,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Open Source
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              fontSize: 52,
              fontWeight: 800,
              lineHeight: 1.15,
              marginBottom: 20,
              letterSpacing: '-0.03em',
              color: '#ffffff',
            }}
          >
            Autonomous Social Media on Autopilot
          </div>

          <div
            style={{
              display: 'flex',
              fontSize: 20,
              color: 'rgba(255, 255, 255, 0.65)',
              fontWeight: 400,
              lineHeight: 1.4,
              marginBottom: 32,
            }}
          >
            Visual Flows · BYOK Models · Telegram 1-Tap Approvals
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            {['MIT Licensed', 'Zero Token Markup', 'Human in the Loop'].map(
              (pill, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.8)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    padding: '6px 14px',
                    borderRadius: 8,
                  }}
                >
                  {pill}
                </div>
              )
            )}
          </div>
        </div>

        {/* Right: Modern Dark Product UI window mockup */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 620,
            paddingRight: 48,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: 520,
              background: '#131211',
              borderRadius: 20,
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
              padding: 24,
            }}
          >
            {/* Window title bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 16,
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                marginBottom: 18,
              }}
            >
              <div style={{ display: 'flex', gap: 8 }}>
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    background: '#ef4444',
                  }}
                />
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    background: '#f59e0b',
                  }}
                />
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    background: '#10b981',
                  }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'rgba(255, 255, 255, 0.4)',
                }}
              >
                joey-agent · approval-queue
              </div>
            </div>

            {/* Pending items */}
            {[
              {
                network: 'Twitter / X',
                badgeBg: 'rgba(56, 189, 248, 0.15)',
                badgeText: '#38bdf8',
                preview: 'Excited to announce our visual flow builder is live...',
              },
              {
                network: 'LinkedIn',
                badgeBg: 'rgba(96, 165, 250, 0.15)',
                badgeText: '#60a5fa',
                preview: 'Why BYOK is transforming open-source AI deployment...',
              },
            ].map((draft, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      fontSize: 11,
                      fontWeight: 700,
                      color: draft.badgeText,
                      background: draft.badgeBg,
                      padding: '3px 8px',
                      borderRadius: 6,
                    }}
                  >
                    {draft.network}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      background: '#ffe633',
                      color: '#0a0908',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '4px 12px',
                      borderRadius: 6,
                    }}
                  >
                    Approve
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 13,
                    color: 'rgba(255, 255, 255, 0.75)',
                    lineHeight: 1.4,
                  }}
                >
                  {draft.preview}
                </div>
              </div>
            ))}

            {/* Bottom notification */}
            <div
              style={{
                marginTop: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                background: 'rgba(255, 230, 51, 0.08)',
                border: '1px solid rgba(255, 230, 51, 0.2)',
                borderRadius: 10,
              }}
            >
              <div style={{ display: 'flex', fontSize: 14 }}>📱</div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#ffe633',
                }}
              >
                Telegram Bot: 1 tap to publish or edit on mobile
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
