import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";

const siteUrl = "https://joey.evonera.com";

type TeamMember = {
  name: string;
  role: string;
  bio: string;
  /** Optional photo path under /public. Replace with a real headshot (square, >=400px). */
  photo?: string;
  links?: { label: string; url: string }[];
};

/**
 * Team roster — edit this array to reflect the real team.
 * Each entry automatically gets Person JSON-LD with sameAs links.
 */
const team: TeamMember[] = [
  {
    name: "Evonera Team",
    role: "Maintainers",
    bio: "We build Joey: an open-source, BYOK autonomous social media agent. Our focus is agentic automation that respects human approval — nothing publishes without you.",
    links: [
      { label: "GitHub", url: "https://github.com/evonera" },
      { label: "X / Twitter", url: "https://x.com/evonera" },
    ],
  },
];

export const metadata: Metadata = {
  title: "About — Joey & Evonera",
  description:
    "Meet the team behind Joey, the open-source autonomous social media agent by Evonera. Open source, BYOK, and built on the Eve framework.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About Joey & Evonera",
    description:
      "Meet the team behind Joey, the open-source autonomous social media agent by Evonera.",
    url: "/about",
    type: "website",
  },
};

const personSchema = {
  "@context": "https://schema.org",
  "@graph": team.map((member) => ({
    "@type": "Person",
    name: member.name,
    jobTitle: member.role,
    worksFor: {
      "@type": "Organization",
      name: "Evonera",
      url: siteUrl,
    },
    ...(member.photo ? { image: `${siteUrl}${member.photo}` } : {}),
    ...(member.links?.length
      ? { sameAs: member.links.map((l) => l.url) }
      : {}),
  })),
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50">
      <Script
        id="person-schema"
        type="application/ld+json"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
      />

      <header className="px-6 py-4 flex items-center justify-between max-w-7xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold text-xl">
            J
          </div>
          <span className="text-xl font-bold tracking-tight">Joey.ai</span>
        </Link>
        <nav aria-label="Main navigation" className="flex items-center gap-4">
          <Link href="/blog" className="text-sm font-medium hover:text-indigo-600 transition-colors">Blog</Link>
          <Link href="/signup" className="text-sm font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-4 py-2 rounded-full hover:opacity-90 transition-opacity">
            Get Started
          </Link>
        </nav>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-extrabold tracking-tight mb-6">
          About Joey &amp; Evonera
        </h1>

        <section className="mb-12 space-y-4 text-zinc-600 dark:text-zinc-300 leading-relaxed">
          <p>
            Joey is an{" "}
            <a
              href="https://github.com/evonera/joey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              open-source (MIT)
            </a>{" "}
            autonomous social media agent built by{" "}
            <a
              href="https://evonera.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Evonera
            </a>
            . It learns your brand voice, drafts platform-specific posts, and puts every single one in front of you for approval before anything goes live.
          </p>
          <p>
            We started Evonera because AI content tools had two failure modes: generic output that sounded like everyone else, and fully-automated posting that burned brand trust. Joey&apos;s answer is agentic automation with a hard human-in-the-loop gate — the agent does the busywork, you keep the judgment calls.
          </p>
          <p>
            Technically, Joey runs on the Eve agent framework with Next.js and TypeScript. It is BYOK end to end: your own LLM key for generation, your own Zernio key for cross-platform publishing to X/Twitter, LinkedIn, and Facebook.
          </p>
        </section>

        <h2 className="text-3xl font-bold tracking-tight mb-8">The team</h2>
        <div className="space-y-6 mb-16">
          {team.map((member) => (
            <div
              key={member.name}
              className="flex gap-5 rounded-2xl border bg-white dark:bg-zinc-900 p-6 shadow-sm"
            >
              {member.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={member.photo}
                  alt={`Photo of ${member.name}`}
                  width={72}
                  height={72}
                  className="size-18 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="flex size-18 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-xl font-bold text-indigo-600 dark:text-indigo-400">
                  {member.name.charAt(0)}
                </div>
              )}
              <div>
                <h3 className="font-bold">{member.name}</h3>
                <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 mb-2">
                  {member.role}
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">{member.bio}</p>
                {member.links?.length ? (
                  <div className="flex gap-3 text-sm">
                    {member.links.map((link) => (
                      <a
                        key={link.url}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <aside className="p-8 rounded-2xl bg-indigo-600 text-white text-center">
          <h2 className="text-2xl font-bold mb-2">Join us</h2>
          <p className="mb-6 text-indigo-100">
            Joey is MIT licensed — contributions welcome, or self-host your own instance today.
          </p>
          <a
            href="https://github.com/evonera/joey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-white text-indigo-700 px-6 py-3 rounded-full font-medium hover:bg-indigo-50 transition-colors"
          >
            View on GitHub
          </a>
        </aside>
      </main>
    </div>
  );
}
