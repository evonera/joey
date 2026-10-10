import { isIP } from "node:net";
import { isPrivateAddress } from "@/lib/flows/outbound-request";

const hosts: Record<string, string[]> = {
  instagram: ["instagram.com"],
  tiktok: ["tiktok.com"],
  twitter: ["x.com", "twitter.com"],
  youtube: ["youtube.com", "youtu.be"],
  web: [],
  rss: [],
};

/** Shared static rules for saved sources, collection inputs, and evidence URLs. */
export function isPublicScoutHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const ip = isIP(host);
    return (
      value.length <= 2048 &&
      url.href.length <= 2048 &&
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (ip ? !isPrivateAddress(host) : host.includes(".")) &&
      !["localhost", "local", "internal", "lan", "test", "invalid"].some(
        (suffix) => host === suffix || host.endsWith(`.${suffix}`)
      )
    );
  } catch {
    return false;
  }
}

export function validateScoutSource(targetUrl: string, platform: string) {
  if (!Object.hasOwn(hosts, platform)) throw new Error("Unsupported Scout platform.");
  if (!isPublicScoutHttpsUrl(targetUrl))
    throw new Error("Enter a public HTTPS target URL without credentials, at most 2048 characters.");
  const url = new URL(targetUrl);
  if (
    hosts[platform].length &&
    !hosts[platform].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  ) {
    throw new Error(`Use a ${platform} URL for this platform.`);
  }
  return url.toString();
}
