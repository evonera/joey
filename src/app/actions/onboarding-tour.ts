"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getActiveTenant } from "@/lib/auth";
import { db } from "@/lib/db";
import { onboardingProgress } from "@/lib/db/schema";

const tourStatusSchema = z.enum(["in_progress", "dismissed", "completed"]);
const tourUpdateSchema = z.object({
  currentStep: z.number().int().min(0).max(5),
  status: tourStatusSchema,
});

export type ProductTourProgress = {
  currentStep: number;
  status: z.infer<typeof tourStatusSchema>;
};

/** Returns only the active user's progress in their active workspace. */
export async function getProductTourProgress(): Promise<ProductTourProgress | null> {
  const { tenantId, user } = await getActiveTenant();
  const progress = await db.query.onboardingProgress.findFirst({
    where: and(
      eq(onboardingProgress.tenantId, tenantId),
      eq(onboardingProgress.userId, user.id),
    ),
    columns: { currentStep: true, status: true },
  });
  return progress
    ? { currentStep: progress.currentStep, status: tourStatusSchema.parse(progress.status) }
    : null;
}

/** Starts or resumes the guided tour for the active workspace member. */
export async function startProductTourProgress(restart = false): Promise<ProductTourProgress> {
  const { tenantId, user } = await getActiveTenant();
  const current = await db.query.onboardingProgress.findFirst({
    where: and(
      eq(onboardingProgress.tenantId, tenantId),
      eq(onboardingProgress.userId, user.id),
    ),
    columns: { currentStep: true, status: true },
  });
  const currentStatus = current ? tourStatusSchema.parse(current.status) : null;
  const currentStep = !restart && currentStatus === "in_progress" ? current!.currentStep : 0;
  const now = new Date();

  await db.insert(onboardingProgress).values({
    tenantId,
    userId: user.id,
    currentStep,
    status: "in_progress",
    completedAt: null,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [onboardingProgress.tenantId, onboardingProgress.userId],
    set: { currentStep, status: "in_progress", completedAt: null, updatedAt: now },
  });
  return { currentStep, status: "in_progress" };
}

/** Persists a tour checkpoint without trusting tenant or user IDs from the client. */
export async function updateProductTourProgress(input: unknown): Promise<ProductTourProgress> {
  const value = tourUpdateSchema.parse(input);
  const { tenantId, user } = await getActiveTenant();
  const now = new Date();
  const completedAt = value.status === "completed" ? now : null;

  await db.insert(onboardingProgress).values({
    tenantId,
    userId: user.id,
    currentStep: value.currentStep,
    status: value.status,
    completedAt,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [onboardingProgress.tenantId, onboardingProgress.userId],
    set: {
      currentStep: value.currentStep,
      status: value.status,
      completedAt,
      updatedAt: now,
    },
  });
  return value;
}
