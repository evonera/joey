"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft01Icon, ArrowRight01Icon, Cancel01Icon } from "hugeicons-react";
import {
  getProductTourProgress,
  startProductTourProgress,
  updateProductTourProgress,
} from "@/app/actions/onboarding-tour";
import { Button } from "@/components/ui/button";

const TOUR_EVENT = "joey:start-product-tour";

const STEPS = [
  { route: "/dashboard", target: "[data-tour='nav-dashboard']", title: "AI Chat", body: "Research, draft, and coordinate work in a conversational workspace." },
  { route: "/dashboard", target: "[data-tour='chat-accounts']", title: "Choose publishing accounts", body: "Select connected accounts or preview a platform format before asking Joey to draft." },
  { route: "/compose", target: "[data-tour='nav-compose']", title: "Compose", body: "Create and validate a post directly when you already know what you want to publish." },
  { route: "/theme-studio", target: "[data-tour='nav-theme-studio']", title: "Theme Studio", body: "Turn repeatable brand rules into reusable visual content packages." },
  { route: "/flows", target: "[data-tour='nav-flows']", title: "Flows", body: "Build repeatable automations from triggers, data, AI, and review steps." },
  { route: "/accounts", target: "[data-tour='nav-accounts']", title: "Connect accounts", body: "Authorize social channels through Zernio, then target them from Chat, Compose, and Theme Studio." },
] as const;

export function startProductTour(restart = false) {
  window.dispatchEvent(new CustomEvent(TOUR_EVENT, { detail: { restart } }));
}

export function ProductTour() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [step, setStep] = React.useState<number | null>(null);
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const cardRef = React.useRef<HTMLElement>(null);
  const hasLoadedProgress = React.useRef(false);
  const persistenceQueue = React.useRef(Promise.resolve());

  const save = React.useCallback((currentStep: number, status: "in_progress" | "dismissed" | "completed") => {
    // Preserve the user's input order. The server also rejects stale writes
    // after completion in case another tab has an older in-flight request.
    persistenceQueue.current = persistenceQueue.current
      .catch(() => undefined)
      .then(() => updateProductTourProgress({ currentStep, status }))
      .then(() => undefined)
      .catch(() => undefined);
  }, []);

  const start = React.useCallback((restart = false) => {
    void startProductTourProgress(restart)
      .then(progress => setStep(Math.min(progress.currentStep, STEPS.length - 1)))
      .catch(() => undefined);
  }, []);

  const dismiss = React.useCallback(() => {
    if (step !== null) save(step, "dismissed");
    setStep(null);
    setRect(null);
  }, [save, step]);

  const finish = React.useCallback(() => {
    if (step !== null) save(step, "completed");
    setStep(null);
    setRect(null);
  }, [save, step]);

  React.useEffect(() => {
    const handleStart = (event: Event) => {
      const restart = (event as CustomEvent<{ restart?: boolean }>).detail?.restart ?? false;
      start(restart);
    };
    window.addEventListener(TOUR_EVENT, handleStart);
    return () => window.removeEventListener(TOUR_EVENT, handleStart);
  }, [start]);

  React.useEffect(() => {
    if (hasLoadedProgress.current) return;
    hasLoadedProgress.current = true;
    if (searchParams.get("tour") === "1") {
      start(true);
      router.replace(pathname);
      return;
    }
    void getProductTourProgress()
      .then(progress => {
        if (progress?.status === "in_progress") setStep(Math.min(progress.currentStep, STEPS.length - 1));
      })
      .catch(() => undefined);
  }, [pathname, router, searchParams, start]);

  React.useEffect(() => {
    if (step === null) return;
    const current = STEPS[step];
    if (pathname !== current.route) {
      router.push(current.route);
      return;
    }

    let frame = 0;
    const update = () => {
      const element = document.querySelector(current.target);
      if (element) {
        element.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
        setRect(element.getBoundingClientRect());
      } else {
        setRect(null);
      }
    };
    frame = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [pathname, router, step]);

  React.useEffect(() => {
    if (step === null) return;
    cardRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismiss, step]);

  const goTo = (nextStep: number) => {
    setStep(nextStep);
    save(nextStep, "in_progress");
  };

  if (step === null) return null;
  const current = STEPS[step];

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Joey product tour">
      <div className="absolute inset-0 bg-black/55" aria-hidden="true" onClick={dismiss} />
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl border-2 border-[#ffe633] shadow-[0_0_0_5px_rgba(255,230,51,0.16)] transition-all duration-200"
          style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      ) : null}
      <section ref={cardRef} tabIndex={-1} className="absolute bottom-4 left-3 right-3 ml-auto w-auto max-w-sm rounded-xl border bg-background p-4 shadow-2xl outline-none sm:bottom-6 sm:left-auto sm:right-6">
        <div className="flex items-start justify-between gap-4">
          <div aria-live="polite">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
            <h2 className="mt-1 text-base font-semibold">{current.title}</h2>
          </div>
          <Button variant="ghost" size="icon" className="size-7" onClick={dismiss} aria-label="Pause tour"><Cancel01Icon className="size-4" /></Button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{current.body}</p>
        {rect ? null : <p className="mt-2 text-xs text-muted-foreground">The matching control is unavailable on this screen, but you can continue the tour.</p>}
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" disabled={step === 0} onClick={() => goTo(step - 1)}><ArrowLeft01Icon className="size-4" />Back</Button>
          <Button size="sm" onClick={() => step === STEPS.length - 1 ? finish() : goTo(step + 1)}>
            {step === STEPS.length - 1 ? "Finish" : "Next"}{step < STEPS.length - 1 ? <ArrowRight01Icon className="size-4" /> : null}
          </Button>
        </div>
      </section>
    </div>
  );
}
