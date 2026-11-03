export interface DraftPublicationConfirmation {
  content: string | null;
  platformOptions: unknown;
  status: string;
  scheduledFor: string | null;
  account: { id: string; accountName: string | null; platform: string; platformAccountId: string };
}
