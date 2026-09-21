import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FeedSimulator } from '../FeedSimulator';

afterEach(() => {
  cleanup();
});

describe('FeedSimulator', () => {
  it('renders correctly with default mock post content', () => {
    render(
      <FeedSimulator
        postText="How to scale SaaS to $10k MRR in 30 days?"
        overlayText="SECRET FORMULA"
        authorName="Jane Doe"
        authorHandle="@janedoe"
      />
    );

    expect(screen.getByText('Feed Simulation')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('@janedoe')).toBeInTheDocument();
    expect(screen.getByText(/How to scale SaaS to \$10k MRR in 30 days\?/)).toBeInTheDocument();
  });

  it('switches between X, Instagram, and YouTube platforms', () => {
    render(
      <FeedSimulator
        postText="Test post content for multi-platform"
        overlayText="PROVEN HOOK"
      />
    );

    // Click Instagram
    fireEvent.click(screen.getByText(/Instagram/i));
    expect(screen.getByText(/View all 18 comments/i)).toBeInTheDocument();

    // Click YT Mobile
    fireEvent.click(screen.getByText(/YT Mobile/i));
    expect(screen.getByText(/03:42/)).toBeInTheDocument();

    // Click YT Desktop
    fireEvent.click(screen.getByText(/YT Desktop/i));
    expect(screen.getByText(/145K views/i)).toBeInTheDocument();
  });

  it('displays live packaging synergy score and advice', () => {
    render(
      <FeedSimulator
        postText="Scale your SaaS today"
        overlayText="Scale SaaS"
      />
    );

    expect(screen.getByText('Packaging Synergy Linter')).toBeInTheDocument();
    // Duplicate word penalty should show
    expect(screen.getByText(/repeats hook on/i)).toBeInTheDocument();
  });
});
