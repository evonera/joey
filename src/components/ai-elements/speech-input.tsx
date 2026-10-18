"use client";

import * as React from "react";
import { Mic01Icon as MicIcon, StopIcon } from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type SpeechInputProps = {
  onTranscription?: (text: string) => void;
  onListeningChange?: (listening: boolean) => void;
  disabled?: boolean;
  className?: string;
};

type RecordingState = "idle" | "requesting" | "recording" | "transcribing";

export function SpeechInput({ onTranscription, onListeningChange, disabled, className }: SpeechInputProps) {
  const [state, setState] = React.useState<RecordingState>("idle");
  const recorder = React.useRef<MediaRecorder | null>(null);
  const stream = React.useRef<MediaStream | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = React.useRef<AbortController | null>(null);
  const mounted = React.useRef(false);
  const callbacks = React.useRef({ onTranscription, onListeningChange });
  React.useEffect(() => { callbacks.current = { onTranscription, onListeningChange }; }, [onTranscription, onListeningChange]);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      request.current?.abort();
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  const stop = () => { if (recorder.current?.state === "recording") recorder.current.stop(); };
  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Voice recording is unavailable in this browser. Please type your message."); return;
    }
    setState("requesting");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("No supported recording format. Try another browser.");
      const active = new MediaRecorder(media, { mimeType, audioBitsPerSecond: 64_000 });
      recorder.current = active;
      const chunks: Blob[] = []; let size = 0, failed = false;
      active.ondataavailable = event => {
        if (event.data.size) { chunks.push(event.data); size += event.data.size; }
        if (size > 2 * 1024 * 1024) { failed = true; stop(); toast.error("Recording is too large. Try a shorter message."); }
      };
      active.onerror = () => { failed = true; stop(); toast.error("Microphone recording failed. Please try again."); };
      active.onstop = async () => {
        if (timer.current) clearTimeout(timer.current);
        media.getTracks().forEach(track => track.stop());
        recorder.current = null; stream.current = null;
        if (!mounted.current) return;
        callbacks.current.onListeningChange?.(false);
        if (failed) { setState("idle"); return; }
        setState("transcribing");
        const controller = new AbortController(); request.current = controller;
        const timeout = setTimeout(() => controller.abort(), 40_000);
        try {
          const audio = new Blob(chunks, { type: active.mimeType });
          if (audio.size < 100) throw new Error("No audio recorded. Speak before pressing Stop.");
          const response = await fetch("/api/voice/transcribe", { method: "POST", headers: { "Content-Type": active.mimeType }, body: audio, signal: controller.signal });
          const result = await response.json();
          if (!response.ok || typeof result.text !== "string" || !result.text.trim()) throw new Error(result.error || "No clear speech detected. Try again.");
          if (mounted.current) callbacks.current.onTranscription?.(result.text);
        } catch (error) {
          if (mounted.current) toast.error(error instanceof Error && error.name !== "AbortError" ? error.message : "Transcription timed out. Please try again.");
        } finally { clearTimeout(timeout); request.current = null; if (mounted.current) setState("idle"); }
      };
      media.getAudioTracks().forEach(track => { track.onended = stop; });
      active.start(1000);
      setState("recording"); callbacks.current.onListeningChange?.(true);
      timer.current = setTimeout(stop, 45_000);
    } catch (error) {
      stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
      if (mounted.current) {
        setState("idle");
        toast.error(error instanceof DOMException && error.name === "NotAllowedError" ? "Allow microphone access in your browser, then try again." : error instanceof Error ? error.message : "Could not start the microphone.");
      }
    }
  };
  const recording = state === "recording";
  const label = recording ? "Stop listening" : state === "transcribing" ? "Transcribing voice" : state === "requesting" ? "Waiting for microphone" : "Voice input";
  return <div className={cn("inline-flex items-center gap-2", className)}>
    <Button type="button" variant={recording ? "default" : "ghost"} size="sm" disabled={state === "transcribing" || state === "requesting" || (disabled && !recording)}
      onClick={() => { if (recording) stop(); else void start(); }}
      className={cn("h-8 w-8 rounded-full p-0 cursor-pointer", recording && "bg-red-500 hover:bg-red-600 text-white")}
      title={label} aria-label={label} aria-pressed={recording}>
      {recording ? <StopIcon className="size-4" /> : <MicIcon className="size-4" />}
    </Button>
    {state !== "idle" && <span role="status" className="text-xs text-muted-foreground">{recording ? "Recording · press Stop" : state === "transcribing" ? "Transcribing…" : "Allow microphone access"}</span>}
  </div>;
}
