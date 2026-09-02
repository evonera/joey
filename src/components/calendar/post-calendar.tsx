'use client';

import * as React from "react";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { format, parse, startOfWeek, getDay, addHours, isBefore, startOfDay } from "date-fns";
import { enUS } from "date-fns/locale";
import { ArrowLeft01Icon as ChevronLeft, ArrowRight01Icon as ChevronRight, PlusSignIcon as Plus, Image01Icon as ImageIcon } from "hugeicons-react";
import { IconBrandTwitter as Twitter, IconBrandLinkedin as Linkedin, IconBrandFacebook as Facebook, IconBrandInstagram as Instagram } from "@tabler/icons-react";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import "./post-calendar.css";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { CalendarPost } from "@/app/actions/calendar";

const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

const DragAndDropCalendar = withDragAndDrop<CalendarPost>(Calendar);

export type CalendarViewMode = "month" | "week" | "day";

interface PostCalendarProps {
  posts: CalendarPost[];
  isPending: boolean;
  currentDate: Date;
  view: CalendarViewMode;
  onViewChange: (view: string) => void;
  onDateChange: (date: Date) => void;
  onPostClick: (post: CalendarPost) => void;
  onCreatePost: (date: Date) => void;
  onReschedule: (draftId: string, newDate: Date) => Promise<boolean>;
  onReload?: () => void;
  rightActions?: React.ReactNode;
}

const getPlatformIcon = (platform: string) => {
  switch (platform.toLowerCase()) {
    case 'twitter':
    case 'x': return Twitter;
    case 'linkedin': return Linkedin;
    case 'facebook': return Facebook;
    case 'instagram': return Instagram;
    default: return ImageIcon;
  }
};

const getPlatformColor = (platform: string) => {
  switch (platform.toLowerCase()) {
    case 'twitter':
    case 'x': return "#000000";
    case 'linkedin': return "#0a66c2";
    case 'facebook': return "#1877f2";
    case 'instagram': return "#e1306c";
    default: return "#6b7280";
  }
};

export function PostCalendar({
  posts,
  isPending,
  currentDate,
  view,
  onViewChange,
  onDateChange,
  onPostClick,
  onCreatePost,
  onReschedule,
  onReload,
  rightActions,
}: PostCalendarProps) {

  const events = React.useMemo(() =>
    isPending ? [] : posts.map(p => ({
      ...p,
      // For calendar view, give events a 1 hour duration block
      start: new Date(p.start),
      end: addHours(new Date(p.start), 1),
    })), [posts, isPending]
  );

  const formats = React.useMemo(() => ({
    weekdayFormat: (date: Date, culture?: string, localizer?: any) =>
      localizer.format(date, 'EEEE', culture),
    dayFormat: (date: Date, culture?: string, localizer?: any) =>
      localizer.format(date, 'EEEE d', culture),
  }), []);

  const isTimeGridView = view === "week" || view === "day";

  const CustomToolbar = React.useCallback((toolbar: any) => {
    return (
      <div className="flex flex-col gap-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center border rounded-md overflow-hidden">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none border-r" onClick={() => toolbar.onNavigate('PREV')}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={() => toolbar.onNavigate('NEXT')}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <span className="text-base font-semibold min-w-[150px] text-center">
              {format(toolbar.date, "MMMM yyyy")}
            </span>

            <Button variant="outline" size="sm" className="font-medium" onClick={() => toolbar.onNavigate('TODAY')}>
              Today
            </Button>

            <select
              className="text-sm font-medium bg-transparent border rounded-md p-1 focus:ring-0 cursor-pointer outline-none"
              value={view}
              onChange={(e) => onViewChange(e.target.value)}
            >
              <option value="month">Month</option>
              <option value="week">Week</option>
              <option value="day">Day</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            {rightActions}
          </div>
        </div>
      </div>
    )
  }, [view, onViewChange, rightActions]);

  return (
    <div className={cn("h-full relative flex flex-col min-h-[700px] bg-background")}>
      <DndProvider backend={HTML5Backend}>
      <DragAndDropCalendar
        localizer={localizer}
        events={events}
        date={currentDate}
        formats={formats}
        step={isTimeGridView ? 15 : 60}
        timeslots={4}
        onNavigate={onDateChange}
        view={view === "month" ? Views.MONTH : view === "day" ? Views.DAY : Views.WEEK}
        onView={(v) => onViewChange(v === Views.MONTH ? "month" : v === Views.DAY ? "day" : "week")}
        onSelectEvent={(event: any) => onPostClick(event)}
        onEventDrop={({ event, start }: any) => {
          // Prevent dragging already-published posts; only drafts can be rescheduled.
          if (event.status === "published") {
            toast.error("Published posts cannot be rescheduled.");
            return;
          }
          onReschedule(event.id, new Date(start)).then((ok) => {
            if (ok) onReload?.();
          });
        }}
        draggableAccessor={(event: any) => event.status !== "published"}
        resizable={false}
        slotPropGetter={(date) => {
          const isPastSlot = isBefore(date, new Date())
          return isPastSlot
            ? {
              className: "rbc-time-slot-disabled",
              style: {
                backgroundColor: "hsl(var(--muted) / 0.35)",
                pointerEvents: "none",
              },
            }
            : {}
        }}
        dayPropGetter={(date: Date) => {
          const isPastDate = isBefore(date, startOfDay(new Date()))
          return {
            className: isPastDate ? "pointer-events-none" : "",
            style: isPastDate ? { backgroundColor: "hsl(var(--muted) / 0.2)" } : {}
          }
        }}
        components={{
          toolbar: CustomToolbar,
          event: ({ event }) => {
            const Icon = getPlatformIcon(event.platform);
            const color = getPlatformColor(event.platform);
            const isFailed = event.status === 'failed';
            return (
              <div
                className={cn("flex items-center gap-2 px-2 py-1 h-full relative cursor-pointer group", isFailed && "opacity-60 grayscale")}
                style={{ backgroundColor: color + "20", borderLeft: `3px solid ${color}` }}
                onClick={() => onPostClick(event)}
              >
                {Icon && (
                    <div className="shrink-0 text-white p-0.5 rounded-sm" style={{ background: color }}>
                        <Icon className="w-3 h-3" />
                    </div>
                )}
                <span className="text-xs truncate max-w-[120px]">{event.title}</span>
                <span className="font-semibold text-[10px] ml-auto">{format(event.start, "h:mm a")}</span>
              </div>
            )
          },
          month: {
            dateHeader: ({ label, date: cellDate }: any) => {
              const isCellToday = format(cellDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
              const isPastDate = isBefore(cellDate, startOfDay(new Date()))
              return (
                <>
                  <div className="group flex items-center justify-between w-full p-1">
                    <span className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-sm font-medium",
                      isCellToday ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : isPastDate ? "text-muted-foreground" : "text-foreground"
                    )}>
                      {label}
                    </span>
                    {!isPastDate && !isPending && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="p-1 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation()
                          onCreatePost(cellDate)
                        }}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  {isPending && <Skeleton className="h-8 w-11/12 m-2 my-5" />}
                </>
              )
            }
          },
        }}
      />
      </DndProvider>
    </div>
  )
}
