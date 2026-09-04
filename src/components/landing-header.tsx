'use client';

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ArrowRight01Icon as ArrowRight,
  ArrowDown01Icon as ChevronDown,
  BotIcon,
  GitForkIcon,
  SparklesIcon,
  SmartPhone01Icon,
  Comment01Icon,
  Book02Icon as BookOpen,
  NoteEditIcon as FileText,
  InformationCircleIcon as InfoIcon,
  Menu01Icon as MenuIcon,
  Cancel01Icon as CloseIcon,
} from "hugeicons-react";
import { JoeyLogo } from "@/components/joey-logo";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export function LandingHeader() {
  const [openDropdown, setOpenDropdown] = useState<"features" | "resources" | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="fixed top-4 left-0 right-0 z-50 pointer-events-none px-4 sm:px-6">
      <div ref={navRef} className="max-w-[1128px] mx-auto">
        <nav className="pointer-events-auto w-full flex items-center justify-between bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl px-4 sm:px-5 py-2.5 shadow-2xl relative">
          {/* Brand Logo */}
          <JoeyLogo size="sm" />

          {/* Center Links (Features, Pricing, Resources) */}
          <div className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
            {/* Features Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === "features" ? null : "features")}
                className={`nav-glass-link flex items-center gap-1.5 cursor-pointer ${
                  openDropdown === "features" ? "text-white bg-white/[0.08]" : ""
                }`}
              >
                <span>Features</span>
                <ChevronDown
                  className={`size-3 opacity-60 transition-transform duration-200 ${
                    openDropdown === "features" ? "rotate-180" : ""
                  }`}
                />
              </button>

              {openDropdown === "features" && (
                <div className="absolute top-full left-0 mt-3.5 bg-[#161514] border border-white/[0.08] backdrop-blur-2xl rounded-xl shadow-2xl p-2 w-[260px] flex flex-col gap-1 z-50">
                  <Link
                    href="/#chat"
                    onClick={() => setOpenDropdown(null)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="size-7 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                      <BotIcon className="size-3.5" />
                    </div>
                    <div>
                      <p className="text-[12px] font-medium text-white">Agent Chat</p>
                      <p className="text-[10px] text-white/40 mt-0.5">BYOK model switcher (Gemini, Claude, GPT)</p>
                    </div>
                  </Link>

                  <Link
                    href="/#flows"
                    onClick={() => setOpenDropdown(null)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="size-7 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0">
                      <GitForkIcon className="size-3.5" />
                    </div>
                    <div>
                      <p className="text-[12px] font-medium text-white">Visual Flows</p>
                      <p className="text-[10px] text-white/40 mt-0.5">Exa AI search &amp; RSS automation</p>
                    </div>
                  </Link>

                  <Link
                    href="/#theme-studio"
                    onClick={() => setOpenDropdown(null)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="size-7 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                      <SparklesIcon className="size-3.5" />
                    </div>
                    <div>
                      <p className="text-[12px] font-medium text-white">Theme Studio</p>
                      <p className="text-[10px] text-white/40 mt-0.5">Dynamic SVG cards &amp; carousels</p>
                    </div>
                  </Link>

                  <Link
                    href="/#telegram"
                    onClick={() => setOpenDropdown(null)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="size-7 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                      <SmartPhone01Icon className="size-3.5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[12px] font-medium text-white">Telegram Approvals</p>
                      <p className="text-[10px] text-white/40 mt-0.5">1-tap mobile draft reviews</p>
                    </div>
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-purple-400 bg-purple-400/10 rounded px-1.5 py-0.5 shrink-0">
                      FREE
                    </span>
                  </Link>

                  <Link
                    href="/#inbox"
                    onClick={() => setOpenDropdown(null)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="size-7 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                      <Comment01Icon className="size-3.5" />
                    </div>
                    <div>
                      <p className="text-[12px] font-medium text-white">Engagement Inbox</p>
                      <p className="text-[10px] text-white/40 mt-0.5">Cross-platform comments &amp; DMs</p>
                    </div>
                  </Link>
                </div>
              )}
            </div>

            {/* Pricing Link */}
            <Link href="/#pricing" className="nav-glass-link">
              Pricing
            </Link>

            {/* Resources Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === "resources" ? null : "resources")}
                className={`nav-glass-link flex items-center gap-1.5 cursor-pointer ${
                  openDropdown === "resources" ? "text-white bg-white/[0.08]" : ""
                }`}
              >
                <span>Resources</span>
                <ChevronDown
                  className={`size-3 opacity-60 transition-transform duration-200 ${
                    openDropdown === "resources" ? "rotate-180" : ""
                  }`}
                />
              </button>

              {openDropdown === "resources" && (
                <div className="absolute top-full left-0 mt-3.5 bg-[#161514] border border-white/[0.08] backdrop-blur-2xl rounded-xl shadow-2xl p-2 w-[240px] flex flex-col gap-1 z-50">
                  <Link
                    href="/docs"
                    onClick={() => setOpenDropdown(null)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="size-7 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0 text-white/70">
                      <BookOpen className="size-3.5" />
                    </div>
                    <div>
                      <p className="text-[12px] font-medium text-white">Documentation</p>
                      <p className="text-[10px] text-white/40 mt-0.5">REST API &amp; Guides</p>
                    </div>
                  </Link>

                  <Link
                    href="/blog"
                    onClick={() => setOpenDropdown(null)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="size-7 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0 text-white/70">
                      <FileText className="size-3.5" />
                    </div>
                    <div>
                      <p className="text-[12px] font-medium text-white">Blog</p>
                      <p className="text-[10px] text-white/40 mt-0.5">Industry insights &amp; tutorials</p>
                    </div>
                  </Link>

                  <Link
                    href="/about"
                    onClick={() => setOpenDropdown(null)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="size-7 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0 text-white/70">
                      <InfoIcon className="size-3.5" />
                    </div>
                    <div>
                      <p className="text-[12px] font-medium text-white">About</p>
                      <p className="text-[10px] text-white/40 mt-0.5">The team behind Joey</p>
                    </div>
                  </Link>

                  <a
                    href="https://github.com/evonera/joey"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setOpenDropdown(null)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="size-7 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0 text-white/70">
                      <GithubIcon className="size-3.5" />
                    </div>
                    <div>
                      <p className="text-[12px] font-medium text-white">GitHub</p>
                      <p className="text-[10px] text-white/40 mt-0.5">Open source repository</p>
                    </div>
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2.5 shrink-0">
            <Link
              href="/login"
              className="text-xs font-medium text-white/60 hover:text-white px-2.5 py-1.5 transition-colors hidden sm:inline-block"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="btn-accent text-xs font-semibold py-1.5 px-3.5 rounded-lg shadow-sm flex items-center gap-1.5"
            >
              <span>Get Joey Free</span>
              <ArrowRight className="size-3.5" />
            </Link>

            {/* Mobile menu trigger */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-white/60 hover:text-white p-1 rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
              aria-label="Toggle mobile menu"
            >
              {mobileMenuOpen ? <CloseIcon className="size-5" /> : <MenuIcon className="size-5" />}
            </button>
          </div>
        </nav>

        {/* Mobile Dropdown Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden pointer-events-auto mt-2 bg-[#121110] border border-white/[0.08] rounded-xl p-4 shadow-2xl flex flex-col gap-3">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40 px-2">
                Features
              </span>
              <Link
                href="/#chat"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-xs font-medium text-white/80 hover:text-white px-2 py-1.5 rounded hover:bg-white/[0.04]"
              >
                Agent Chat &amp; BYOK Models
              </Link>
              <Link
                href="/#flows"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-xs font-medium text-white/80 hover:text-white px-2 py-1.5 rounded hover:bg-white/[0.04]"
              >
                Visual Flows Studio
              </Link>
              <Link
                href="/#theme-studio"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-xs font-medium text-white/80 hover:text-white px-2 py-1.5 rounded hover:bg-white/[0.04]"
              >
                Theme Studio &amp; SVG Carousels
              </Link>
              <Link
                href="/#telegram"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-xs font-medium text-white/80 hover:text-white px-2 py-1.5 rounded hover:bg-white/[0.04]"
              >
                Telegram Mobile Approvals
              </Link>
            </div>

            <div className="border-t border-white/[0.06] pt-2 space-y-1">
              <Link
                href="/#pricing"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-xs font-medium text-white/80 hover:text-white px-2 py-1.5 rounded hover:bg-white/[0.04]"
              >
                Pricing
              </Link>
              <Link
                href="/docs"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-xs font-medium text-white/80 hover:text-white px-2 py-1.5 rounded hover:bg-white/[0.04]"
              >
                Documentation
              </Link>
              <Link
                href="/blog"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-xs font-medium text-white/80 hover:text-white px-2 py-1.5 rounded hover:bg-white/[0.04]"
              >
                Blog
              </Link>
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-xs font-medium text-white/80 hover:text-white px-2 py-1.5 rounded hover:bg-white/[0.04]"
              >
                Log in
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
