'use client';

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { handleZernioCallback } from "@/app/actions/zernio";
import { EntitySelector } from "@/app/_components/entity-selector";
import { Loading03Icon as Loader2, CheckmarkCircle02Icon as CheckCircle2, AlertCircleIcon as AlertCircle } from "hugeicons-react";

type CallbackStep = "processing" | "success" | "error";

export function CallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [step, setStep] = useState<CallbackStep>("processing");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const processCallback = useCallback(async () => {
    try {
      const params = Object.fromEntries(searchParams.entries());
      const result = await handleZernioCallback(params);

      if (result.error) {
        setError(result.error);
        setStep("error");
      } else if (result.success) {
        setStep("success");
        setTimeout(() => router.push("/accounts"), 1500);

      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
      setStep("error");
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void processCallback();
  }, [processCallback]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-md dark:bg-zinc-900 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-6">
          {step === "processing" && "Connecting Account..."}
          {step === "success" && "Connected!"}
          {step === "error" && "Connection Failed"}
        </h2>
        
        {step === "processing" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-zinc-500">Please wait while we finalize the connection...</p>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-zinc-500">Redirecting back to your accounts...</p>
          </div>
        )}

        {step === "error" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <AlertCircle className="h-12 w-12 text-red-500" />
            <p className="text-zinc-600 dark:text-zinc-400">{error}</p>
            <button
              onClick={() => router.push("/accounts")}
              className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Back to Accounts
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
