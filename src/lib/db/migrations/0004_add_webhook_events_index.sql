CREATE INDEX IF NOT EXISTS webhook_events_status_tenant_idx ON webhook_events (status, tenant_id) WHERE status = 'pending';
