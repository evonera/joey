import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getActiveTenantId } from "@/lib/auth";
import { CANDIDATE_TOOLKITS, manageConnections } from "@/lib/composio-connect";
import { db } from "@/lib/db";

interface ToolkitResult {
  toolkit?: string;
  status?: string;
  accounts?: {
    id?: string;
    status?: string;
    alias?: string;
    is_default?: boolean;
    user_info?: Record<string, unknown>;
  }[];
  redirect_url?: string;
  error_message?: string;
}

function accountLabel(info: Record<string, unknown> | undefined): string | null {
  if (!info) return null;
  for (const key of ["emailAddress", "email", "login", "username", "name", "id"]) {
    const value = info[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenantId = await getActiveTenantId();

    const data = await manageConnections(
      tenantId,
      CANDIDATE_TOOLKITS.map((name) => ({ name, action: "list" as const })),
    );
    const results = (data.results ?? {}) as Record<string, ToolkitResult>;
    const connections = Object.values(results)
      .filter((entry) => (entry.accounts?.length ?? 0) > 0)
      .map((entry) => ({
        toolkit: entry.toolkit ?? "",
        accounts: (entry.accounts ?? []).map((account) => ({
          id: account.id ?? "",
          status: account.status ?? "unknown",
          alias: account.alias ?? null,
          label: accountLabel(account.user_info),
        })),
      }));
    return NextResponse.json({ connections, checked: CANDIDATE_TOOLKITS });
  } catch (error) {
    if (error instanceof Error && error.message === "No active workspace found") {
      return NextResponse.json({ error: "No tenant found" }, { status: 404 });
    }
    console.error("Connections list failed:", error);
    return NextResponse.json({ error: "Connections unavailable" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { toolkit?: unknown } | null;
  if (body === null || typeof body.toolkit !== "string" || !/^[a-z0-9_-]+$/.test(body.toolkit)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const tenantId = await getActiveTenantId();

    const data = await manageConnections(tenantId, [{ name: body.toolkit, action: "add" }]);
    const results = (data.results ?? {}) as Record<string, ToolkitResult>;
    const entry = results[body.toolkit];
    if (entry?.redirect_url) return NextResponse.json({ url: entry.redirect_url });
    return NextResponse.json({ error: entry?.error_message ?? "No auth link returned" }, { status: 502 });
  } catch (error) {
    console.error("Connection add failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Connect failed" },
      { status: 502 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    toolkit?: unknown;
    accountId?: unknown;
  } | null;
  if (
    body === null ||
    typeof body.toolkit !== "string" ||
    !/^[a-z0-9_-]+$/.test(body.toolkit) ||
    typeof body.accountId !== "string" ||
    body.accountId.length === 0
  ) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const tenantId = await getActiveTenantId();

    await manageConnections(tenantId, [
      { name: body.toolkit, action: "remove", account_id: body.accountId },
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Connection remove failed:", error);
    return NextResponse.json({ error: "Disconnect failed" }, { status: 502 });
  }
}
