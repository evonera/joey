import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';



vi.mock('@/app/actions/media-studio', () => ({
  saveMediaStudioAsset: vi.fn().mockResolvedValue({
    success: true,
    publicUrl: 'https://cdn.example.com/hook.jpg',
  }),
  generateVisualHookSuggestions: vi.fn().mockResolvedValue({
    suggestions: [
      {
        text: 'SECRET FORMULA',
        preset: 'mrbeast',
        sticker: 'arrow',
        explanation: 'Curiosity gap',
      },
    ],
  }),
}));

vi.mock('@/app/actions/assets', () => ({
  listAssets: vi.fn().mockResolvedValue({ assets: [] }),
}));

import { MediaStudioDialog } from '../MediaStudioDialog';

// Mock HTMLCanvasElement for jsdom
beforeAll(() => {
  const ctx: Partial<CanvasRenderingContext2D> & Record<string, unknown> = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    strokeText: vi.fn(),
    fillText: vi.fn(),
    filter: '',
    textAlign: 'center' as CanvasTextAlign,
    textBaseline: 'middle' as CanvasTextBaseline,
    lineJoin: 'miter' as CanvasLineJoin,
    miterLimit: 2,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    strokeStyle: '',
    lineWidth: 1,
    fillStyle: '',
    font: '',
  };
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(ctx);
  HTMLCanvasElement.prototype.toDataURL = vi
    .fn()
    .mockReturnValue('data:image/jpeg;base64,/9j/4AAQSkZJRg==');
  HTMLCanvasElement.prototype.toBlob = vi.fn((cb: (b: Blob) => void) => {
    cb(new Blob(['fake'], { type: 'image/jpeg' }));
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MediaStudioDialog', () => {
  it('renders modal with title and aspect ratio controls', () => {
    render(
      <MediaStudioDialog
        open={true}
        onOpenChange={vi.fn()}
        postContent="Check out this revolutionary AI feature"
      />,
    );

    expect(
      screen.getByText('Joey Media Studio & Packaging Linter'),
    ).toBeInTheDocument();
    expect(screen.getByText('16:9')).toBeInTheDocument();
    expect(screen.getByText('1:1')).toBeInTheDocument();
    expect(screen.getByText('4:5')).toBeInTheDocument();
    expect(screen.getByText('9:16')).toBeInTheDocument();
    expect(screen.getByText('Download JPEG')).toBeInTheDocument();
    expect(screen.getByText('Save to Assets')).toBeInTheDocument();
  });

  it('switches aspect ratio and shows correct dimensions', () => {
    render(
      <MediaStudioDialog
        open={true}
        onOpenChange={vi.fn()}
        postContent="Amazing AI release"
      />,
    );

    const squareBtn = screen.getByText('1:1');
    fireEvent.click(squareBtn);
    expect(screen.getByText(/1080 × 1080/)).toBeInTheDocument();
  });

  it('shows viral preset buttons', () => {
    render(
      <MediaStudioDialog
        open={true}
        onOpenChange={vi.fn()}
        postContent="Scale your business today"
      />,
    );

    expect(screen.getByText('MrBeast High-CTR')).toBeInTheDocument();
    expect(screen.getByText('Clean Modern')).toBeInTheDocument();
    expect(screen.getByText('Showdown / VS')).toBeInTheDocument();
  });

  it('shows Attach to Post button when onAttachToPost is provided', () => {
    render(
      <MediaStudioDialog
        open={true}
        onOpenChange={vi.fn()}
        postContent="Building in public"
        onAttachToPost={vi.fn()}
      />,
    );

    expect(screen.getByText('Attach to Post')).toBeInTheDocument();
  });
});
