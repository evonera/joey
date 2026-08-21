import type { ComponentType } from "react";

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  date: string;
  readingTime: string;
  keywords: string[];
  content: ComponentType;
};

import automate from "@/content/blog/how-to-automate-social-media-with-ai.mdx";
import comparison from "@/content/blog/open-source-social-media-management-joey-vs-buffer-vs-hootsuite.mdx";
import byok from "@/content/blog/what-is-byok-bring-your-own-key-explained.mdx";

export const posts: Omit<BlogPost, "content">[] = [
  {
    slug: "how-to-automate-social-media-with-ai",
    title: "How to Automate Social Media with AI in 2026",
    description:
      "A practical guide to AI social media automation in 2026: what to automate, what to keep human, and how autonomous agents like Joey draft on-brand posts while you keep final say.",
    date: "2026-08-10",
    readingTime: "8 min read",
    keywords: [
      "AI social media automation",
      "social media agent",
      "automate social media posts",
    ],
  },
  {
    slug: "open-source-social-media-management-joey-vs-buffer-vs-hootsuite",
    title: "Open-Source Social Media Management: Joey vs Buffer vs Hootsuite",
    description:
      "Comparing open-source AI social media tools with Buffer and Hootsuite: pricing models, automation depth, self-hosting, and who each tool is actually for.",
    date: "2026-08-17",
    readingTime: "9 min read",
    keywords: [
      "open source social media management",
      "Buffer alternative",
      "Hootsuite alternative",
    ],
  },
  {
    slug: "what-is-byok-bring-your-own-key-explained",
    title: "What is BYOK AI? Bring Your Own Key Explained",
    description:
      "BYOK (bring your own key) means connecting your own AI provider keys instead of renting access through a middleman. Here is how it works, why it cuts costs, and how to keep keys safe.",
    date: "2026-08-21",
    readingTime: "6 min read",
    keywords: ["BYOK", "bring your own key", "BYO AI keys"],
  },
];

const contents: Record<string, ComponentType> = {
  "how-to-automate-social-media-with-ai": automate as ComponentType,
  "open-source-social-media-management-joey-vs-buffer-vs-hootsuite":
    comparison as ComponentType,
  "what-is-byok-bring-your-own-key-explained": byok as ComponentType,
};

export function getPost(slug: string): BlogPost | undefined {
  const meta = posts.find((p) => p.slug === slug);
  const content = contents[slug];
  if (!meta || !content) return undefined;
  return { ...meta, content };
}
