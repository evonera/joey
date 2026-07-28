import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssetPickerDialog } from '../asset-picker-dialog';

const mockListAssets = vi.fn().mockResolvedValue({ assets: [] });

vi.mock('@/app/actions/assets', () => ({
  listAssets: (...args: unknown[]) => mockListAssets(...args),
}));

afterEach(() => {
  vi.clearAllMocks();
  mockListAssets.mockResolvedValue({ assets: [] });
  cleanup();
});

const sampleAssets = [
  {
    id: '1',
    filename: 'hero.png',
    key: 'tenant-1/hero.png',
    mimeType: 'image/png',
    size: 102400,
    publicUrl: 'https://cdn.example.com/hero.png',
    tags: ['product', 'hero'],
    altText: 'Hero image',
    tenantId: 'tenant-1',
    width: 1200,
    height: 800,
    createdAt: new Date('2026-07-28'),
  },
];

describe('AssetPickerDialog', () => {
  it('renders trigger button', () => {
    render(
      <AssetPickerDialog open={false} onOpenChange={vi.fn()} onSelect={vi.fn()} />
    );
    expect(screen.getByText('From Assets')).toBeInTheDocument();
  });

  it('opens dialog with correct title', async () => {
    mockListAssets.mockResolvedValue({ assets: [] });

    render(
      <AssetPickerDialog open={true} onOpenChange={vi.fn()} onSelect={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Select Media' })).toBeInTheDocument();
    });
  });

  it('shows empty state when no assets', async () => {
    mockListAssets.mockResolvedValue({ assets: [] });

    render(
      <AssetPickerDialog open={true} onOpenChange={vi.fn()} onSelect={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('No images found. Upload assets first.')).toBeInTheDocument();
    });
  });

  it('renders asset grid and allows selection', async () => {
    const onSelect = vi.fn();
    mockListAssets.mockResolvedValue({ assets: sampleAssets });

    render(
      <AssetPickerDialog open={true} onOpenChange={vi.fn()} onSelect={onSelect} />
    );

    await waitFor(() => {
      expect(screen.getByText('hero.png')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('hero.png'));
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /add/i }));
    expect(onSelect).toHaveBeenCalledWith(['https://cdn.example.com/hero.png']);
  });

  it('calls onSelect with correct URLs and closes on confirm', async () => {
    const onOpenChange = vi.fn();
    const onSelect = vi.fn();
    const multiAssets = [
      sampleAssets[0],
      {
        ...sampleAssets[0],
        id: '2',
        filename: 'logo.svg',
        publicUrl: 'https://cdn.example.com/logo.svg',
      },
    ];
    mockListAssets.mockResolvedValue({ assets: multiAssets });

    render(
      <AssetPickerDialog open={true} onOpenChange={onOpenChange} onSelect={onSelect} />
    );

    await waitFor(() => {
      expect(screen.getByText('hero.png')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('hero.png'));
    await userEvent.click(screen.getByText('logo.svg'));
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /add/i }));
    expect(onSelect).toHaveBeenCalledWith([
      'https://cdn.example.com/hero.png',
      'https://cdn.example.com/logo.svg',
    ]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
