'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ScheduleType = "now" | "scheduled";

interface SchedulePickerProps {
  scheduleType: ScheduleType;
  scheduledDate?: string; // YYYY-MM-DD
  scheduledTime?: string; // HH:MM
  onScheduleTypeChange: (type: ScheduleType) => void;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
}

export function SchedulePicker({
  scheduleType,
  scheduledDate,
  scheduledTime,
  onScheduleTypeChange,
  onDateChange,
  onTimeChange,
}: SchedulePickerProps) {
  return (
    <div className="space-y-4">
      <Tabs value={scheduleType} onValueChange={(val) => onScheduleTypeChange(val as ScheduleType)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="now">Publish Now</TabsTrigger>
          <TabsTrigger value="scheduled">Schedule for Later</TabsTrigger>
        </TabsList>
      </Tabs>

      {scheduleType === "scheduled" && (
        <div className="grid grid-cols-2 gap-4 pt-4 animate-in fade-in slide-in-from-top-2">
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input 
              id="date" 
              type="date" 
              value={scheduledDate || ""} 
              onChange={(e) => onDateChange(e.target.value)} 
              min={new Date().toISOString().split('T')[0]} // Cannot schedule in past
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="time">Time</Label>
            <Input 
              id="time" 
              type="time" 
              value={scheduledTime || "09:00"} 
              onChange={(e) => onTimeChange(e.target.value)} 
            />
          </div>
          <p className="col-span-2 text-xs text-zinc-500 mt-2">
            Posts are scheduled in UTC. Our background agent polls every 5 minutes to publish scheduled posts.
          </p>
        </div>
      )}
    </div>
  );
}
