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
          background: 'linear-gradient(to bottom right, #eef2ff, #c7d2fe)',
          width: '100%',
          height: '100%',
          display: 'flex',
          color: '#312e81',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Left: brand */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            paddingLeft: 72,
            width: 560,
          }}
        >
          <div
            style={{
              fontSize: 84,
              background: '#4f46e5',
              color: 'white',
              width: 130,
              height: 130,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 28,
              marginBottom: 36,
            }}
          >
            J
          </div>
          <div style={{ fontSize: 88, fontWeight: 800, marginBottom: 16, color: '#1e1b4b' }}>
            Joey
          </div>
          <div style={{ fontSize: 34, color: '#4338ca', fontWeight: 500, lineHeight: 1.3 }}>
            Your Autonomous
          </div>
          <div style={{ fontSize: 34, color: '#4338ca', fontWeight: 500, lineHeight: 1.3 }}>
            Social Media Agent
          </div>
          <div style={{ fontSize: 24, color: '#6366f1', marginTop: 24 }}>
            Draft. Approve. Publish.
          </div>
        </div>

        {/* Right: product UI mock */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 640,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: 520,
              height: 430,
              background: '#ffffff',
              borderRadius: 24,
              border: '2px solid #c7d2fe',
              boxShadow: '0 20px 50px rgba(49,46,129,0.18)',
              padding: 32,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  background: '#4f46e5',
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: 22,
                  fontWeight: 800,
                  marginRight: 14,
                }}
              >
                J
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#18181b' }}>
                3 drafts await approval
              </div>
            </div>

            {[
              { c: '#4f46e5', w: 380 },
              { c: '#a78bfa', w: 300 },
              { c: '#10b981', w: 340 },
            ].map((row, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: '#f4f4f5',
                  borderRadius: 12,
                  padding: '14px 16px',
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    background: row.c,
                    marginRight: 14,
                  }}
                />
                <div
                  style={{
                    width: row.w,
                    height: 16,
                    borderRadius: 8,
                    background: '#d4d4d8',
                  }}
                />
                <div
                  style={{
                    marginLeft: 'auto',
                    width: 64,
                    height: 30,
                    borderRadius: 15,
                    background: '#10b981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  Approve
                </div>
              </div>
            ))}

            <div
              style={{
                marginTop: 'auto',
                fontSize: 19,
                color: '#71717a',
              }}
            >
              Nothing goes live without your OK.
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
