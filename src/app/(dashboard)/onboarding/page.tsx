'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Key01Icon as KeyRound, CheckmarkCircle02Icon as CheckCircle, Loading03Icon as Loader2 } from "hugeicons-react";

export default function OnboardingPage() {
  const [apiKey, setApiKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    
    try {
      const res = await fetch("/api/validate-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to validate key");
      }
      
      setSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
      }, 1500);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="w-full max-w-lg space-y-8 rounded-xl bg-white p-10 shadow-md dark:bg-zinc-900">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#ffe633]/20">
            <KeyRound className="h-6 w-6 text-[#ffe633]" />
          </div>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">Bring Your Own Key</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Joey uses your Zernio API key to connect to 14+ social platforms. 
            Your key is encrypted and stored securely.
          </p>
        </div>
        
        {success ? (
          <div className="rounded-md bg-green-50 p-4 dark:bg-green-900/20">
            <div className="flex items-center">
              <CheckCircle className="h-5 w-5 text-green-400" />
              <p className="ml-3 text-sm font-medium text-green-800 dark:text-green-300">
                Key validated and saved securely. Redirecting...
              </p>
            </div>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleValidate}>
            {error && (
              <div className="rounded-md bg-red-50 p-4 dark:bg-red-900/20">
                <p className="text-sm font-medium text-red-800 dark:text-red-300">{error}</p>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Zernio API Key</label>
              <input
                type="password"
                required
                placeholder="sk_..."
                className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 shadow-sm focus:border-[#ffe633] focus:outline-none focus:ring-1 focus:ring-[#ffe633] dark:border-zinc-700 dark:bg-zinc-800 dark:text-white sm:text-sm"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="mt-2 text-xs text-zinc-500">
                Get your key from the <a href="https://zernio.com/dashboard" target="_blank" rel="noreferrer" className="text-[#ffe633] hover:underline">Zernio Dashboard</a>.
              </p>
            </div>
            
            <button
              type="submit"
              disabled={isLoading || !apiKey}
              className="flex w-full justify-center rounded-md border border-transparent bg-[#ffe633] px-4 py-2 text-sm font-semibold text-black shadow-sm hover:bg-[#ffe633]/90 focus:outline-none focus:ring-2 focus:ring-[#ffe633] focus:ring-offset-2 disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Validating...
                </>
              ) : (
                "Save & Continue"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
