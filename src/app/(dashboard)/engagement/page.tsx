import { getUnifiedInbox } from "@/app/actions/engagement";
import { UnifiedInbox } from "@/components/engagement/unified-inbox";

export default async function EngagementPage() {
  const initialResult = await getUnifiedInbox();
  return <UnifiedInbox initialResult={initialResult} />;
}
