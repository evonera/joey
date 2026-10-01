"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getActiveTenantMembership } from "@/lib/auth";
import {
  saveAgencyAgent,
  changeAgencyAgentState,
  listAgencyAgents,
  listAgencyRuns,
  listAgencyThreads,
} from "@/lib/agency/service";

const reference = z.object({ id: z.string().uuid(), version: z.number().int().positive() });
export async function getAgencyAgents() {
  return listAgencyAgents(await getActiveTenantMembership());
}
export async function saveAgencyAgentAction(input: unknown, existing?: unknown) {
  const saved = await saveAgencyAgent(
    await getActiveTenantMembership(),
    input,
    existing === undefined ? undefined : reference.parse(existing)
  );
  revalidatePath("/dashboard");
  revalidatePath("/agents");
  return saved;
}
export async function setAgencyAgentState(input: unknown) {
  const value = reference.extend({ state: z.enum(["active", "paused", "archived"]) }).parse(input);
  const saved = await changeAgencyAgentState(await getActiveTenantMembership(), value.id, value.version, value.state);
  revalidatePath("/dashboard");
  revalidatePath("/agents");
  return saved;
}
export async function getAgencyRuns(id: string) {
  return listAgencyRuns(await getActiveTenantMembership(), z.string().uuid().parse(id));
}
export async function getAgencyThreads(id: string) {
  return listAgencyThreads(await getActiveTenantMembership(), z.string().uuid().parse(id));
}
