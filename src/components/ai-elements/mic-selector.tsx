"use client";

import * as React from "react";
import { Mic01Icon as MicIcon, ArrowDown01Icon as ChevronDownIcon } from "hugeicons-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type AudioDevice = {
  deviceId: string;
  label: string;
};

export type MicSelectorProps = {
  selectedDeviceId?: string;
  onSelectDevice?: (deviceId: string) => void;
  volumeLevel?: number; // 0 to 100
  className?: string;
};

export function MicSelector({
  selectedDeviceId,
  onSelectDevice,
  volumeLevel = 0,
  className,
}: MicSelectorProps) {
  const [devices, setDevices] = React.useState<AudioDevice[]>([]);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((devs) => {
        const audioInputs = devs
          .filter((d) => d.kind === "audioinput")
          .map((d, idx) => ({
            deviceId: d.deviceId,
            label: d.label || `Microphone ${idx + 1}`,
          }));
        setDevices(audioInputs);
      }).catch(() => {
        setDevices([{ deviceId: "default", label: "Default Microphone" }]);
      });
    }
  }, []);

  const current =
    devices.find((d) => d.deviceId === selectedDeviceId) ||
    devices[0] || { deviceId: "default", label: "Default Microphone" };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border border-border/50 bg-background/60 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors cursor-pointer",
            className
          )}
        >
          <MicIcon className="size-3.5 text-primary shrink-0" />
          <span className="truncate max-w-[120px]">{current.label}</span>
          <MicVolumeMeter level={volumeLevel} />
          <ChevronDownIcon className="size-3 text-muted-foreground opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-64 p-1.5 shadow-md border border-border/60 bg-popover/95 backdrop-blur-md rounded-xl space-y-1"
      >
        <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
          Select Audio Input
        </div>
        {devices.map((device) => (
          <button
            key={device.deviceId}
            type="button"
            onClick={() => {
              onSelectDevice?.(device.deviceId);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/70 cursor-pointer",
              device.deviceId === current.deviceId && "bg-muted font-medium text-foreground"
            )}
          >
            <span className="truncate">{device.label}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function MicVolumeMeter({ level }: { level: number }) {
  const bars = 4;
  const activeBars = Math.min(bars, Math.round((level / 100) * bars));

  return (
    <div className="flex items-center gap-0.5 h-3">
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "w-0.5 rounded-full transition-all duration-75",
            i < activeBars
              ? "bg-emerald-500"
              : "bg-muted-foreground/30",
            i === 0 ? "h-1.5" : i === 1 ? "h-2" : i === 2 ? "h-2.5" : "h-3"
          )}
        />
      ))}
    </div>
  );
}
