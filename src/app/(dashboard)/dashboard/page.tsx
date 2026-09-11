import { AgentChat } from "@/app/_components/agent-chat";
import { getActiveTenantMembership } from "@/lib/auth";
import { ChatStorageProvider } from "@/components/chat/chat-storage-provider";

export default async function DashboardHome() {
    const { userId, tenantId } = await getActiveTenantMembership();
    const scope = JSON.stringify([userId, tenantId]);
    return <ChatStorageProvider scope={scope} key={scope}><AgentChat /></ChatStorageProvider>;
}
