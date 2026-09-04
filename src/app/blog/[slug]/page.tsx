import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Script from "next/script";
import { posts, getPost } from "@/lib/blog";
import { JoeyLogo } from "@/components/joey-logo";

const siteUrl = "https://joey.evonera.com";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: `${post.title} — Joey Blog`,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      url: `/blog/${post.slug}`,
      type: "article",
      publishedTime: post.date,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const Content = post.content;

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: siteUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Blog",
        item: `${siteUrl}/blog`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: `${siteUrl}/blog/${post.slug}`,
      },
    ],
  };

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: {
      "@type": "Organization",
      name: "Evonera",
      url: siteUrl,
    },
    publisher: {
      "@type": "Organization",
      name: "Evonera",
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/logo.svg`,
      },
    },
    mainEntityOfPage: `${siteUrl}/blog/${post.slug}`,
  };

  const dateFmt = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50">
      <Script
        id="breadcrumb-schema"
        type="application/ld+json"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <Script
        id="article-schema"
        type="application/ld+json"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />

      <header className="px-6 py-4 flex items-center justify-between max-w-7xl mx-auto w-full">
        <JoeyLogo size="md" />
        <nav aria-label="Main navigation" className="flex items-center gap-4">
          <Link href="/blog" className="text-sm font-medium hover:text-indigo-600 transition-colors">Blog</Link>
          <Link href="/signup" className="text-sm font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-4 py-2 rounded-full hover:opacity-90 transition-opacity">
            Get Started
          </Link>
        </nav>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <nav aria-label="Breadcrumb" className="text-sm text-zinc-500 dark:text-zinc-400 mb-8">
          <ol className="flex items-center gap-2">
            <li><Link href="/" className="hover:text-indigo-600 transition-colors">Home</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link href="/blog" className="hover:text-indigo-600 transition-colors">Blog</Link></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="truncate max-w-[16rem]">{post.title}</li>
          </ol>
        </nav>

        <article>
          <header className="mb-10">
            <div className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400 mb-3">
              <time dateTime={post.date}>{dateFmt.format(new Date(post.date))}</time>
              <span aria-hidden="true">·</span>
              <span>{post.readingTime}</span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-balance mb-4">
              {post.title}
            </h1>
            <p className="text-xl text-zinc-500 dark:text-zinc-400">{post.description}</p>
          </header>

          <div
            className="
              prose prose-zinc dark:prose-invert max-w-none
              prose-headings:tracking-tight
              prose-a:text-indigo-600 dark:prose-a:text-indigo-400
              prose-table:block prose-table:overflow-x-auto
            "
          >
            <Content />
          </div>
        </article>

        <aside className="mt-16 p-8 rounded-2xl bg-indigo-600 text-white text-center">
          <h2 className="text-2xl font-bold mb-2">Put it on autopilot</h2>
          <p className="mb-6 text-indigo-100">
            Joey drafts on-brand posts for every platform. You just approve.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-white text-indigo-700 px-6 py-3 rounded-full font-medium hover:bg-indigo-50 transition-colors"
          >
            Get Started Free
          </Link>
        </aside>
      </main>
    </div>
  );
}
