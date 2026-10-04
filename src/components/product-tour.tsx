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

export const PRODUCT_TOUR_STEPS = [
  { route: "/dashboard", target: "[data-tour='chat-composer']", title: "AI Chat", body: "Research, draft, and coordinate work in a conversational workspace." },
  { route: "/dashboard", target: "[data-tour='chat-accounts']", title: "Choose publishing accounts", body: "Select connected accounts or preview a platform format before asking Joey to draft." },
  { route: "/compose", target: "[data-tour='compose-overview']", title: "Compose", body: "Create and validate a post directly when you already know what you want to publish." },
  { route: "/theme-studio", target: "[data-tour='theme-studio-overview']", title: "Theme Studio", body: "Turn repeatable brand rules into reusable visual content packages." },
  { route: "/flows", target: "[data-tour='flows-overview']", title: "Flows", body: "Build repeatable automations from triggers, data, AI, and review steps." },
  { route: "/accounts", target: "[data-tour='accounts-connect']", title: "Connect accounts", body: "Authorize social channels through Zernio, then target them from Chat, Compose, and Theme Studio." },
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
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const hasLoadedProgress = React.useRef(false);
  const persistenceQueue = React.useRef(Promise.resolve());
  const pending = React.useRef(false);
  const failedAction = React.useRef<(() => Promise<void>) | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const enqueue = React.useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const task = persistenceQueue.current.catch(() => undefined).then(operation);
    persistenceQueue.current = task.then(() => undefined, () => undefined);
    return task;
  }, []);

  const runTransition = React.useCallback(async (operation: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setSaveError(null);
    failedAction.current = null;
    try {
      await operation();
    } catch {
      failedAction.current = operation;
      setSaveError("Tour progress could not be saved. Retry before continuing.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }, []);

  const start = React.useCallback(function begin(restart = false) {
    // A restart is a write too: never let it overtake an in-flight checkpoint.
    if (pending.current) {
      void persistenceQueue.current.then(() => begin(restart));
      return;
    }
    void runTransition(async () => {
      const progress = await enqueue(() => startProductTourProgress(restart));
      setStep(Math.min(progress.currentStep, PRODUCT_TOUR_STEPS.length - 1));
    });
  }, [enqueue, runTransition]);

  const dismiss = React.useCallback(() => {
    if (step === null) return;
    void runTransition(async () => {
      await enqueue(() => updateProductTourProgress({ currentStep: step, status: "dismissed" }));
      setStep(null);
      setRect(null);
    });
  }, [enqueue, runTransition, step]);

  const finish = React.useCallback(() => {
    if (step === null) return;
    void runTransition(async () => {
      await enqueue(() => updateProductTourProgress({ currentStep: step, status: "completed" }));
      setStep(null);
      setRect(null);
    });
  }, [enqueue, runTransition, step]);

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
        if (progress?.status === "in_progress") setStep(Math.min(progress.currentStep, PRODUCT_TOUR_STEPS.length - 1));
      })
      .catch(() => undefined);
  }, [pathname, router, searchParams, start]);

  React.useEffect(() => {
    if (step === null) return;
    const current = PRODUCT_TOUR_STEPS[step];
    if (pathname !== current.route) {
      setRect(null);
      router.push(current.route);
      return;
    }

    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;
    let observedElement: Element | null = null;
    let mutationObserver: MutationObserver | null = null;

    function scheduleUpdate() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    }

    function update() {
      const element = document.querySelector(current.target);
      if (element) {
        mutationObserver?.disconnect();
        mutationObserver = null;
        if (element !== observedElement) {
          resizeObserver?.disconnect();
          observedElement = element;
          element.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
          if (typeof ResizeObserver !== "undefined") {
            resizeObserver = new ResizeObserver(scheduleUpdate);
            resizeObserver.observe(element);
          }
        }
        const nextRect = element.getBoundingClientRect();
        setRect((previous) =>
          previous &&
          previous.left === nextRect.left &&
          previous.top === nextRect.top &&
          previous.width === nextRect.width &&
          previous.height === nextRect.height
            ? previous
            : nextRect,
        );
      } else {
        resizeObserver?.disconnect();
        resizeObserver = null;
        observedElement = null;
        setRect(null);
      }
    }

    mutationObserver = new MutationObserver(scheduleUpdate);
    mutationObserver.observe(document.querySelector("main") ?? document.body, { childList: true, subtree: true });
    scheduleUpdate();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    return () => {
      cancelAnimationFrame(frame);
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [pathname, router, step]);

  React.useEffect(() => {
    if (step === null) {
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
      return;
    }
    if (!returnFocusRef.current && document.activeElement instanceof HTMLElement) {
      returnFocusRef.current = document.activeElement;
    }
    cardRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
      }
      if (event.key === "Tab") {
        const controls = cardRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
        if (!controls?.length) {
          event.preventDefault();
          return;
        }
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === cardRef.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === cardRef.current)) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismiss, step]);

  const goTo = (nextStep: number) => {
    void runTransition(async () => {
      await enqueue(() => updateProductTourProgress({ currentStep: nextStep, status: "in_progress" }));
      setStep(nextStep);
    });
  };

  const retry = () => {
    if (failedAction.current) void runTransition(failedAction.current);
  };
  if (step === null) return saveError ? (
    <div role="alert" className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-xl border bg-background p-4 shadow-xl">
      <p className="text-sm">{saveError}</p>
      <Button className="mt-2" size="sm" disabled={saving} onClick={retry}>Retry tour</Button>
    </div>
  ) : null;
  const current = PRODUCT_TOUR_STEPS[step];

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-busy={saving} aria-label="Joey product tour">
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
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Step {step + 1} of {PRODUCT_TOUR_STEPS.length}</p>
            <h2 className="mt-1 text-base font-semibold">{current.title}</h2>
          </div>
          <Button variant="ghost" size="icon" className="size-7" disabled={saving} onClick={dismiss} aria-label="Pause tour"><Cancel01Icon className="size-4" /></Button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{current.body}</p>
        {saving ? <p role="status" className="mt-2 text-xs text-muted-foreground">Saving tour progress…</p> : null}
        {saveError ? <div role="alert" className="mt-2 text-sm"><p>{saveError}</p><Button size="sm" className="mt-2" onClick={retry}>Retry save</Button></div> : null}
        {rect ? null : <p className="mt-2 text-xs text-muted-foreground">The matching control is unavailable on this screen, but you can continue the tour.</p>}
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" disabled={saving || step === 0} onClick={() => goTo(step - 1)}><ArrowLeft01Icon className="size-4" />Back</Button>
          <Button size="sm" disabled={saving} onClick={() => step === PRODUCT_TOUR_STEPS.length - 1 ? finish() : goTo(step + 1)}>
            {step === PRODUCT_TOUR_STEPS.length - 1 ? "Finish" : "Next"}{step < PRODUCT_TOUR_STEPS.length - 1 ? <ArrowRight01Icon className="size-4" /> : null}
          </Button>
        </div>
      </section>
    </div>
  );
}
