"use client";
import * as React from "react";
import { resolveUncertainPrivateReply, listUncertainPrivateReplies } from "@/app/actions/operations";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Item = Awaited<ReturnType<typeof listUncertainPrivateReplies>>[number];
export function UncertainPrivateReplies({ initial }: { initial: Item[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState(initial);
  React.useEffect(() => setItems(initial), [initial]);
  const [busy, setBusy] = React.useState<string | null>(null);
  if (!items.length) return null;
  return <section className="space-y-3 rounded-xl border p-4" aria-label="Unconfirmed private replies">
    <h2 className="font-semibold">Unconfirmed private replies</h2>
    <p className="text-sm text-muted-foreground">Check each comment and its private reply in the social provider. The provider may still complete an interrupted request later, so check again before sending another reply. Mark it reviewed after checking; Joey will not resend it automatically.</p>
    <ul className="space-y-2">{items.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm">
      <span>{item.platform} · {item.commenterHandle || "Unknown account"} · post {item.platformPostId || "unknown"} · comment {item.platformCommentId || "unknown"}</span>
      <Button size="sm" variant="outline" disabled={busy !== null} onClick={async () => {
        setBusy(item.id);
        try { await resolveUncertainPrivateReply(item.id); setItems(await listUncertainPrivateReplies()); router.refresh(); toast.success("Review recorded"); }
        catch (error) { toast.error(error instanceof Error ? error.message : "Could not record review"); }
        finally { setBusy(null); }
      }}>Mark reviewed</Button>
    </li>)}</ul>
  </section>;
}
