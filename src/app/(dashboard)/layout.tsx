import { ReactNode } from "react";
import Link from "next/link";
import { Home, FileText, Settings, Users } from "lucide-react";
import { getPendingDraftCount } from "@/app/actions/drafts";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
    const { count } = await getPendingDraftCount();

    const navItems = [
        { name: "Dashboard", href: "/dashboard", icon: Home },
        { name: "Drafts", href: "/drafts", icon: FileText, badge: count || 0 },
        { name: "Accounts", href: "/accounts", icon: Users },
        { name: "Settings", href: "/settings", icon: Settings },
    ];

    return (
        <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950">
            {/* Sidebar */}
            <aside className="w-64 border-r bg-white dark:bg-zinc-900 hidden md:flex flex-col">
                <div className="h-16 flex items-center px-6 border-b">
                    <span className="text-xl font-bold">Joey.ai</span>
                </div>
                <nav className="flex-1 p-4 space-y-1">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        return (
                            <Link 
                                key={item.name} 
                                href={item.href}
                                className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                            >
                                <Icon className="h-5 w-5" />
                                {item.name}
                                {item.badge !== undefined && item.badge > 0 && (
                                    <span className="ml-auto bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400 py-0.5 px-2 rounded-full text-xs font-semibold">
                                        {item.badge}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <header className="h-16 flex items-center justify-between px-6 border-b bg-white dark:bg-zinc-900 md:hidden">
                    <span className="text-xl font-bold">Joey.ai</span>
                </header>
                <div className="flex-1 overflow-auto p-6">
                    {children}
                </div>
            </main>
        </div>
    );
}
