import { NextRequest, NextResponse } from "next/server";
import { admitTelegramUpdate, TELEGRAM_UPDATE_LIMIT_BYTES } from "@/lib/telegram";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ installationId: string }> }) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > TELEGRAM_UPDATE_LIMIT_BYTES) return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > TELEGRAM_UPDATE_LIMIT_BYTES) return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return NextResponse.json({ error: "Invalid update." }, { status: 400 });
  const result = await admitTelegramUpdate((await params).installationId, request.headers.get("x-telegram-bot-api-secret-token"), payload as Record<string, unknown>);
  if (!result.authenticated) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json({ ok: true });
}
