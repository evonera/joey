'use client';

import { useState, useEffect, useCallback } from "react";
import { getDrafts } from "@/app/actions/drafts";
import Link from "next/link";
import { DraftCard } from "@/components/draft-card";

export default function DraftsPage() {
    const [drafts, setDrafts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>("pending_review");

    const fetchDrafts = useCallback(async () => {
        setLoading(true);
        const res = await getDrafts(statusFilter);
        if (res.drafts) {
            setDrafts(res.drafts);
        }
        setLoading(false);
    }, [statusFilter]);

    useEffect(() => {
        fetchDrafts();
    }, [fetchDrafts]);

    const tabs = [
        { id: "pending_review", label: "Pending" },
        { id: "approved", label: "Approved" },
        { id: "rejected", label: "Rejected" },
        { id: "published", label: "Published" },
    ];

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Drafts</h1>

            <div className="flex border-b overflow-x-auto">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setStatusFilter(tab.id)}
                        className={`px-4 py-2 border-b-2 whitespace-nowrap text-sm font-medium transition-colors ${
                            statusFilter === tab.id 
                                ? "border-primary text-primary font-semibold" 
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="space-y-4">
                {loading ? (
                    <div className="text-center py-8 text-zinc-500">Loading drafts...</div>
                ) : drafts.length === 0 ? (
                    <div className="text-center py-12 bg-white dark:bg-zinc-900 rounded-xl border border-dashed">
                        <p className="text-zinc-500 mb-6">No {statusFilter.replace('_', ' ')} drafts found.</p>
                        {statusFilter === "pending_review" && (
                            <div className="flex flex-col items-center gap-3">
                                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Try asking your agent to:</p>
                                <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                                    <Link href="/dashboard" className="text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 px-3 py-2 rounded-full transition-colors border border-zinc-200 dark:border-zinc-700">
                                        Draft a thread about our new product launch
                                    </Link>
                                    <Link href="/dashboard" className="text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 px-3 py-2 rounded-full transition-colors border border-zinc-200 dark:border-zinc-700">
                                        Summarize our latest blog post for LinkedIn
                                    </Link>
                                    <Link href="/dashboard" className="text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 px-3 py-2 rounded-full transition-colors border border-zinc-200 dark:border-zinc-700">
                                        Write a punchy tweet about AI trends
                                    </Link>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    drafts.map(draft => (
                        <DraftCard 
                            key={draft.id} 
                            draft={draft} 
                            onActionComplete={fetchDrafts} 
                        />
                    ))
                )}
            </div>
        </div>
    );
}
