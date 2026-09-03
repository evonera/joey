'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { 
  Building01Icon, 
  ArrowDown01Icon, 
  CheckmarkCircle02Icon, 
  PlusSignIcon,
  Loading03Icon 
} from 'hugeicons-react';
import { toast } from 'sonner';

interface Organization {
  id: string;
  name: string;
  slug?: string;
  logo?: string | null;
}

export function OrganizationSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [organizations, setOrganizations] = React.useState<Organization[]>([]);
  const [activeOrg, setActiveOrg] = React.useState<Organization | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [switching, setSwitching] = React.useState<string | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);
  const [newOrgName, setNewOrgName] = React.useState('');
  const [creatingLoading, setCreatingLoading] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setCreatingLoading(true);
    try {
      const slugBase = newOrgName.trim().toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') || 'workspace';
      const slug = `${slugBase}-${Math.random().toString(36).substring(2, 6)}`;
      const { data, error } = await authClient.organization.create({
        name: newOrgName.trim(),
        slug,
      });

      if (error) {
        toast.error(error.message || 'Failed to create workspace');
        return;
      }

      if (data?.id) {
        await authClient.organization.setActive({ organizationId: data.id });
      }

      toast.success('Workspace created');
      setIsCreating(false);
      setNewOrgName('');
      setOpen(false);
      router.refresh();
      window.location.reload();
    } catch {
      toast.error('An error occurred while creating workspace');
    } finally {
      setCreatingLoading(false);
    }
  };

  const fetchOrgs = React.useCallback(async () => {
    try {
      setLoading(true);
      const { data: orgList } = await authClient.organization.list();
      
      if (orgList && Array.isArray(orgList)) {
        setOrganizations(orgList as unknown as Organization[]);
        setActiveOrg((prev) => prev ?? (orgList[0] as unknown as Organization));
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectOrg = async (orgId: string) => {
    if (orgId === activeOrg?.id) {
      setOpen(false);
      return;
    }

    setSwitching(orgId);
    try {
      await authClient.organization.setActive({ organizationId: orgId });
      toast.success('Workspace switched');
      setOpen(false);
      router.refresh();
      window.location.reload();
    } catch {
      toast.error('Failed to switch workspace');
    } finally {
      setSwitching(null);
    }
  };

  return (
    <div className={`relative ${className || ''}`} ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-border bg-sidebar-accent/50 px-3 py-1.5 text-xs text-foreground hover:bg-sidebar-accent hover:border-border/80 transition-all focus:outline-none w-full"
        aria-expanded={open}
      >
        <Building01Icon size={14} className="text-[#ffe633] shrink-0" />
        <span className="font-medium max-w-[140px] truncate text-left flex-1">
          {loading ? 'Loading...' : (activeOrg?.name || 'My Workspace')}
        </span>
        <ArrowDown01Icon size={12} className="text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-60 rounded-xl border border-border bg-popover p-1.5 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Workspaces</p>
          </div>

          <div className="py-1 space-y-0.5 max-h-48 overflow-y-auto">
            {organizations.map((org) => {
              const isActive = org.id === activeOrg?.id;
              const isPendingThis = switching === org.id;

              return (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => handleSelectOrg(org.id)}
                  disabled={isPendingThis}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg transition-colors cursor-pointer text-left ${
                    isActive 
                      ? 'bg-accent text-accent-foreground font-medium' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <div className="w-5 h-5 rounded bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-bold shrink-0">
                      {org.name.slice(0, 1).toUpperCase()}
                    </div>
                    <span className="truncate">{org.name}</span>
                  </div>

                  {isPendingThis ? (
                    <Loading03Icon size={14} className="animate-spin text-[#ffe633]" />
                  ) : isActive ? (
                    <CheckmarkCircle02Icon size={14} className="text-[#ffe633] shrink-0" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="pt-1 border-t border-border">
            {isCreating ? (
              <form onSubmit={handleCreateOrg} className="p-2 space-y-2">
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Workspace name"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#ffe633] focus:outline-none"
                />
                <div className="flex items-center gap-1.5 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreating(false);
                      setNewOrgName('');
                    }}
                    className="px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingLoading || !newOrgName.trim()}
                    className="px-2.5 py-1 text-[10px] bg-[#ffe633] text-black font-semibold rounded hover:bg-[#ffe633]/90 disabled:opacity-50 flex items-center gap-1"
                  >
                    {creatingLoading && <Loading03Icon size={10} className="animate-spin" />}
                    <span>Create</span>
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#ffe633] hover:text-[#f0d82e] rounded-lg hover:bg-[#ffe633]/10 transition-colors cursor-pointer"
              >
                <PlusSignIcon size={14} />
                <span>Create Workspace</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
