"use client";

import * as React from "react";
import { Mic01Icon as MicIcon, StopIcon } from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type SpeechInputProps = {
  onTranscription?: (text: string) => void;
  onInterimResult?: (text: string) => void;
  isListening?: boolean;
  onListeningChange?: (listening: boolean) => void;
  className?: string;
};

export function SpeechInput({
  onTranscription,
  onInterimResult,
  isListening: controlledListening,
  onListeningChange,
  className,
}: SpeechInputProps) {
  const [internalListening, setInternalListening] = React.useState(false);
  const isListening = controlledListening ?? internalListening;
  const recognitionRef = React.useRef<any>(null);

  const startListening = () => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error("Speech recognition is not supported in this browser.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        let interim = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        if (final && onTranscription) {
          stopListening();
          onTranscription(final);
        }
        if (interim && onInterimResult) {
          onInterimResult(interim);
        }
      };

      recognition.onerror = () => {
        stopListening();
      };

      recognition.onend = () => {
        setInternalListening(false);
        onListeningChange?.(false);
      };

      recognition.start();
      recognitionRef.current = recognition;
      setInternalListening(true);
      onListeningChange?.(true);
    } catch {
      setInternalListening(false);
      onListeningChange?.(false);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setInternalListening(false);
    onListeningChange?.(false);
  };

  const toggle = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <Button
        type="button"
        variant={isListening ? "default" : "ghost"}
        size="sm"
        onClick={toggle}
        className={cn(
          "h-8 w-8 rounded-full p-0 cursor-pointer transition-all",
          isListening && "bg-red-500 hover:bg-red-600 text-white animate-pulse"
        )}
        title={isListening ? "Stop listening" : "Voice input"}
      >
        {isListening ? <StopIcon className="size-4" /> : <MicIcon className="size-4 text-muted-foreground hover:text-foreground" />}
      </Button>

      {isListening ? <SpeechInputVisualizer /> : null}
    </div>
  );
}

export function SpeechInputVisualizer() {
  return (
    <div className="flex items-center gap-0.5 h-4 px-1.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20">
      <span className="w-0.5 h-2 rounded-full bg-red-500 animate-[pulse_0.6s_ease-in-out_infinite]" />
      <span className="w-0.5 h-3 rounded-full bg-red-500 animate-[pulse_0.8s_ease-in-out_infinite]" />
      <span className="w-0.5 h-1.5 rounded-full bg-red-500 animate-[pulse_0.5s_ease-in-out_infinite]" />
      <span className="w-0.5 h-2.5 rounded-full bg-red-500 animate-[pulse_0.7s_ease-in-out_infinite]" />
      <span className="text-[10px] font-medium text-red-500 ml-1 select-none">Rec</span>
    </div>
  );
}
