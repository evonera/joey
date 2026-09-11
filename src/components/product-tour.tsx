"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft01Icon, ArrowRight01Icon, Cancel01Icon } from "hugeicons-react";
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

export function startProductTour() {
  window.dispatchEvent(new Event(TOUR_EVENT));
}

export function ProductTour() {
  const router = useRouter();
  const pathname = usePathname();
  const [step, setStep] = React.useState<number | null>(null);
  const [rect, setRect] = React.useState<DOMRect | null>(null);

  const close = React.useCallback(() => {
    setStep(null);
    setRect(null);
    localStorage.setItem("joey_product_tour_seen", "1");
  }, []);

  React.useEffect(() => {
    const start = () => setStep(0);
    window.addEventListener(TOUR_EVENT, start);
    return () => window.removeEventListener(TOUR_EVENT, start);
  }, []);

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

  if (step === null) return null;
  const current = STEPS[step];

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Joey product tour">
      <div className="absolute inset-0 bg-black/55" onClick={close} />
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl border-2 border-[#ffe633] shadow-[0_0_0_5px_rgba(255,230,51,0.16)] transition-all duration-200"
          style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      ) : null}
      <section className="absolute bottom-5 left-4 right-4 ml-auto w-auto max-w-sm rounded-xl border bg-background p-4 shadow-2xl sm:bottom-6 sm:right-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
            <h2 className="mt-1 text-base font-semibold">{current.title}</h2>
          </div>
          <Button variant="ghost" size="icon" className="size-7" onClick={close} aria-label="Close tour"><Cancel01Icon className="size-4" /></Button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{current.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft01Icon className="size-4" />Back</Button>
          <Button size="sm" onClick={() => step === STEPS.length - 1 ? close() : setStep(step + 1)}>
            {step === STEPS.length - 1 ? "Finish" : "Next"}{step < STEPS.length - 1 ? <ArrowRight01Icon className="size-4" /> : null}
          </Button>
        </div>
      </section>
    </div>
  );
}
