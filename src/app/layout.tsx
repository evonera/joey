import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const siteUrl = "https://joey.evonera.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Joey — Autonomous Social Media Agent",
  description:
    "Joey is an open-source, BYOK AI social media agent that learns your brand voice, drafts high-performing posts, and puts you in control. Start automating free.",
  robots: { index: true, follow: true },
  alternates: { canonical: siteUrl },
  openGraph: {
    title: "Joey — Autonomous Social Media Agent",
    description:
      "Open-source, BYOK AI social media automation. Joey analyzes your brand voice and drafts high-performing social posts on autopilot. You just click approve.",
    url: siteUrl,
    siteName: "Joey",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Joey — Autonomous Social Media Agent",
    description:
      "Open-source, BYOK AI social media automation. Draft, schedule, and approve posts across platforms.",
  },
};

const schemaData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "Evonera",
      url: siteUrl,
      logo: `${siteUrl}/logo.svg`,
      sameAs: [
        "https://github.com/evonera",
        "https://github.com/evonera/joey",
        "https://x.com/evonera",
      ],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "support@joey.ai",
      },
    },
    {
      "@type": "WebSite",
      name: "Joey.ai",
      url: siteUrl,
      description:
        "An open-source, BYOK social media automation platform.",
    },
    {
      "@type": "WebApplication",
      name: "Joey",
      url: siteUrl,
      description:
        "Open-source, BYOK autonomous social media agent. Joey analyzes your brand voice, curates content, and drafts high-performing social posts on autopilot.",
      applicationCategory: [
        "SocialNetworking",
        "BusinessApplication",
        "Multimedia",
      ],
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
      },
      author: {
        "@type": "Organization",
        name: "Evonera",
        url: siteUrl,
      },
      featureList: [
        "AI-powered content generation",
        "Human-in-the-loop approval",
        "Smart scheduling with drag-and-drop calendar",
        "Cross-platform posting via Zernio (Twitter, LinkedIn, Facebook)",
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const webMcpOriginTrialToken = process.env.NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {webMcpOriginTrialToken ? (
          <meta httpEquiv="origin-trial" content={webMcpOriginTrialToken} />
        ) : null}
      </head>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <Script
            id="schema-org"
            type="application/ld+json"
            strategy="beforeInteractive"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
          />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
