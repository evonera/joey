'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { getAuthoritativeWorkspaceData } from '@/app/actions/workspace';
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
  createdAt?: string | Date;
}

export function OrganizationSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [organizations, setOrganizations] = React.useState<Organization[]>([]);
  const [activeOrg, setActiveOrg] = React.useState<Organization | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [switching, setSwitching] = React.useState<string | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const fetchOrgs = React.useCallback(async () => {
    try {
      setLoading(true);
      const [listResult, workspaceDataResult] = await Promise.allSettled([
        authClient.organization.list(),
        getAuthoritativeWorkspaceData(),
      ]);

      const orgList = listResult.status === 'fulfilled' ? listResult.value.data : null;
      const serverData = workspaceDataResult.status === 'fulfilled' ? workspaceDataResult.value : null;

      if (orgList && Array.isArray(orgList)) {
        const typedList = orgList as unknown as Organization[];

        // Order organizations according to server membership creation time (newest first)
        let sortedList = typedList;
        if (serverData && serverData.orderedTenantIds.length > 0) {
          const orgMap = new Map(typedList.map(o => [o.id, o]));
          const ordered: Organization[] = [];
          for (const id of serverData.orderedTenantIds) {
            const org = orgMap.get(id);
            if (org) {
              ordered.push(org);
              orgMap.delete(id);
            }
          }
          for (const remaining of orgMap.values()) {
            ordered.push(remaining);
          }
          sortedList = ordered;
        }

        setOrganizations(sortedList);

        // Authoritatively match the workspace resolved by server tenant resolution
        const matchingOrg = serverData?.activeTenantId 
          ? sortedList.find(o => o.id === serverData.activeTenantId) 
          : null;
        const targetOrg = matchingOrg ?? sortedList[0] ?? null;
        setActiveOrg(targetOrg);
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
        className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-white hover:bg-white/[0.06] hover:border-white/[0.15] transition-all focus:outline-none"
        aria-expanded={open}
      >
        <Building01Icon size={14} className="text-[#ffe633]" />
        <span className="font-medium max-w-[120px] truncate">
          {loading ? 'Loading...' : (activeOrg?.name || 'My Workspace')}
        </span>
        <ArrowDown01Icon size={12} className="text-white/40" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-60 rounded-xl border border-white/[0.08] bg-[#161514] p-1.5 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-3 py-2 border-b border-white/[0.06]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Workspaces</p>
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
                      ? 'bg-white/[0.08] text-white font-medium' 
                      : 'text-white/70 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <div className="w-5 h-5 rounded bg-white/[0.06] text-white/80 flex items-center justify-center text-[10px] font-bold shrink-0">
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

          <div className="pt-1 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push('/onboarding');
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#ffe633] hover:text-[#f0d82e] rounded-lg hover:bg-[#ffe633]/10 transition-colors cursor-pointer"
            >
              <PlusSignIcon size={14} />
              <span>Create Workspace</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
