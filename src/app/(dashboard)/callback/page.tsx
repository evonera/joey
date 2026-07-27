import { Suspense } from "react";
import { CallbackClient } from "./callback-client";

export default function CallbackPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}>
      <CallbackClient />
    </Suspense>
  );
}
