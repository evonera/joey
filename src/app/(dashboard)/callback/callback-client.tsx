'use client';

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { handleZernioCallback, selectEntityAndFinalize } from "@/app/actions/zernio";
import { EntitySelector } from "@/app/_components/entity-selector";
import { Loading03Icon as Loader2, CheckmarkCircle02Icon as CheckCircle2, AlertCircleIcon as AlertCircle } from "hugeicons-react";

type CallbackStep = "processing" | "select_entity" | "success" | "error";

export function CallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [step, setStep] = useState<CallbackStep>("processing");
  const [error, setError] = useState<string | null>(null);
  const [entityData, setEntityData] = useState<any>(null);

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
      } else if (result.requiresSelection) {
        setEntityData({
          platform: result.platform,
          entities: result.entities,
        });
        setStep("select_entity");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
      setStep("error");
    }
  }, [searchParams, router]);

  useEffect(() => {
    processCallback();
  }, [processCallback]);

  const handleEntitySelect = async (entityId: string) => {
    if (!entityData) return;
    setStep("processing");

    try {
      const result = await selectEntityAndFinalize(
        entityData.platform,
        entityId
      );

      if (result.error) {
        setError(result.error);
        setStep("error");
      } else {
        setStep("success");
        setTimeout(() => router.push("/accounts"), 1500);
      }
    } catch (err: any) {
      setError("Failed to complete connection. Please try again.");
      setStep("error");
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-md dark:bg-zinc-900 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-6">
          {step === "processing" && "Connecting Account..."}
          {step === "select_entity" && "Select Account"}
          {step === "success" && "Connected!"}
          {step === "error" && "Connection Failed"}
        </h2>
        
        {step === "processing" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-12 w-12 animate-spin text-indigo-600" />
            <p className="text-zinc-500">Please wait while we finalize the connection...</p>
          </div>
        )}

        {step === "select_entity" && entityData && (
          <EntitySelector
            platform={entityData.platform}
            entities={entityData.entities || []}
            onSelect={handleEntitySelect}
          />
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
              className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Back to Accounts
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
