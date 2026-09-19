import * as React from "react";
import { getScouts } from "@/app/actions/scouts";
import { ScoutsClient } from "./scouts-client";

export default async function ScoutsPage() {
  const initialScouts = await getScouts();

  return <ScoutsClient initialScouts={initialScouts as any[]} />;
}
