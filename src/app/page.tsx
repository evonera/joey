import Link from "next/link";
import { ArrowRight, Bot, CalendarDays, BarChart3, ShieldCheck } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 flex flex-col font-sans">
      
      {/* Navigation */}
      <header className="px-6 py-4 flex items-center justify-between max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold text-xl">
            J
          </div>
          <span className="text-xl font-bold tracking-tight">Joey.ai</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm font-medium hover:text-indigo-600 transition-colors">Log in</Link>
          <Link href="/signup" className="text-sm font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-4 py-2 rounded-full hover:opacity-90 transition-opacity">
            Get Started
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center text-center px-6 pt-32 pb-24">
        <div className="max-w-4xl space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-sm font-medium mb-4">
            <span className="flex h-2 w-2 rounded-full bg-indigo-600 animate-pulse"></span>
            Meet your new social media manager
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-balance">
            Autonomous Social Media, <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-500">Solved.</span>
          </h1>
          <p className="text-xl text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto text-balance">
            Joey analyzes your brand voice, curates content, and drafts high-performing social posts on autopilot. You just click approve.
          </p>
          <div className="flex items-center justify-center gap-4 pt-8">
            <Link href="/signup" className="flex items-center gap-2 bg-indigo-600 text-white px-8 py-4 rounded-full text-lg font-medium hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20">
              Start Automating <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl w-full mt-32 text-left">
          
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border shadow-sm">
            <div className="h-12 w-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center mb-6">
              <Bot className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold mb-2">Eve-Powered AI</h3>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">Joey uses advanced agentic workflows to understand context, format constraints, and your unique brand persona.</p>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border shadow-sm">
            <div className="h-12 w-12 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-xl flex items-center justify-center mb-6">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold mb-2">Human in the Loop</h3>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">Nothing goes live without your say. Review, tweak, and approve agent-generated drafts before they hit your timeline.</p>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border shadow-sm">
            <div className="h-12 w-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center mb-6">
              <CalendarDays className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold mb-2">Smart Scheduling</h3>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">Visual content calendar with drag-and-drop support. Joey knows when to draft content based on your schedule.</p>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border shadow-sm">
            <div className="h-12 w-12 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center mb-6">
              <BarChart3 className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold mb-2">Cross-Platform Sync</h3>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">Powered by Zernio. Post to Twitter, LinkedIn, Facebook, and more simultaneously from one dashboard.</p>
          </div>

        </div>
      </main>

      <footer className="border-t py-8 text-center text-zinc-500 text-sm">
        <p>&copy; {new Date().getFullYear()} Evonera. All rights reserved.</p>
      </footer>
    </div>
  );
}
