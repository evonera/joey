import { Suspense } from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { CalendarView } from "@/components/calendar/calendar-view";
import { Loading03Icon as Loader2 } from "hugeicons-react";

export default function CalendarPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-72"><Loader2 className="animate-spin text-muted-foreground" /></div>}>
      <NuqsAdapter>
        <div className="flex flex-col space-y-4 pb-12">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Content Calendar</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage and track your scheduled and published posts across channels.</p>
          </div>
          <div className="flex-1 min-h-[640px]">
            <CalendarView />
          </div>
        </div>
      </NuqsAdapter>
    </Suspense>
  );
}
