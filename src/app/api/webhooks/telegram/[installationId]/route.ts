import { NextRequest, NextResponse } from "next/server";
import { admitTelegramUpdate, TELEGRAM_UPDATE_LIMIT_BYTES } from "@/lib/telegram";
import { readBoundedJson } from "@/lib/http/read-bounded-json";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ installationId: string }> }) {
  const declared = request.headers.get("content-length");
  if (declared !== null && !/^\d+$/.test(declared)) return NextResponse.json({ error: "Invalid Content-Length header." }, { status: 400 });
  if (declared !== null && Number(declared) > TELEGRAM_UPDATE_LIMIT_BYTES) return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  const body = await readBoundedJson(request, TELEGRAM_UPDATE_LIMIT_BYTES);
  if (!body.ok) return NextResponse.json({ error: body.reason === "too_large" ? "Payload too large." : "Invalid JSON." }, { status: body.reason === "too_large" ? 413 : 400 });
  const payload = body.value;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return NextResponse.json({ error: "Invalid update." }, { status: 400 });
  const result = await admitTelegramUpdate((await params).installationId, request.headers.get("x-telegram-bot-api-secret-token"), payload as Record<string, unknown>);
  if (!result.authenticated) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json({ ok: true });
}
