import type { Metadata } from "next";
import Link from "next/link";
import { posts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog — AI Social Media Automation",
  description:
    "Guides on AI social media automation, BYOK, and open-source alternatives to Buffer and Hootsuite. Written by the Joey team.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Joey Blog — AI Social Media Automation",
    description:
      "Guides on AI social media automation, BYOK, and open-source social media management.",
    url: "/blog",
    type: "website",
  },
};

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

export default function BlogIndex() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50">
      <header className="px-6 py-4 flex items-center justify-between max-w-7xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold text-xl">
            J
          </div>
          <span className="text-xl font-bold tracking-tight">Joey.ai</span>
        </Link>
        <nav aria-label="Main navigation" className="flex items-center gap-4">
          <Link href="/" className="text-sm font-medium hover:text-indigo-600 transition-colors">Home</Link>
          <Link href="/signup" className="text-sm font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-4 py-2 rounded-full hover:opacity-90 transition-opacity">
            Get Started
          </Link>
        </nav>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-extrabold tracking-tight mb-4">Blog</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mb-12">
          Guides on AI social media automation, BYOK, and open-source tooling.
        </p>

        <div className="space-y-8">
          {posts.map((post) => (
            <article key={post.slug} className="group">
              <Link href={`/blog/${post.slug}`} className="block rounded-2xl border bg-white dark:bg-zinc-900 p-8 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400 mb-2">
                  <time dateTime={post.date}>{dateFmt.format(new Date(post.date))}</time>
                  <span aria-hidden="true">·</span>
                  <span>{post.readingTime}</span>
                </div>
                <h2 className="text-2xl font-bold tracking-tight mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {post.title}
                </h2>
                <p className="text-zinc-500 dark:text-zinc-400">{post.description}</p>
              </Link>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
