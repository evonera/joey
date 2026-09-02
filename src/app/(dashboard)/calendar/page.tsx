import { Suspense } from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { CalendarView } from "@/components/calendar/calendar-view";
import { Loading03Icon as Loader2 } from "hugeicons-react";

export default function CalendarPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-zinc-400" /></div>}>
      <NuqsAdapter>
        <div className="flex flex-col h-full">
          <header className="px-6 pt-8 pb-4">
            <h1 className="text-2xl font-bold tracking-tight">Content Calendar</h1>
            <p className="text-muted-foreground mt-1">Manage and track your scheduled and published posts.</p>
          </header>
          <div className="flex-1">
            <CalendarView />
          </div>
        </div>
      </NuqsAdapter>
    </Suspense>
  );
}
