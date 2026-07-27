import { ImageResponse } from 'next/og';

// Image metadata
export const alt = 'Joey - Autonomous Social Media Agent';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

// Image generation
export default function Image() {
  return new ImageResponse(
    (
      // ImageResponse JSX element
      <div
        style={{
          fontSize: 64,
          background: 'linear-gradient(to bottom right, #eef2ff, #c7d2fe)', // indigo-50 to indigo-200
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#312e81', // indigo-900
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 100,
            background: '#4f46e5',
            color: 'white',
            width: 150,
            height: 150,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '20%',
            marginBottom: 40,
          }}
        >
          J
        </div>
        <div style={{ fontWeight: 800, marginBottom: 20 }}>Joey</div>
        <div style={{ fontSize: 40, color: '#4338ca', fontWeight: 500 }}>
          Your Autonomous Social Media Agent
        </div>
      </div>
    ),
    // ImageResponse options
    {
      ...size,
    }
  );
}
