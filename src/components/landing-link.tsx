import type { ComponentProps } from "react";
import NextLink from "next/link";

type LandingLinkProps = ComponentProps<typeof NextLink>;

/**
 * Next 16.3 can issue invalid segment-prefetch requests when a page contains
 * links with different route shapes. Landing-page destinations are small and
 * static, so fetching them on intent is cheaper than repeated failed prefetches.
 */
export function LandingLink(props: LandingLinkProps) {
  return <NextLink {...props} prefetch={false} />;
}
