'use client';

import { useState, useEffect, useCallback } from "react";
import { getDrafts } from "@/app/actions/drafts";
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
                        className={`px-4 py-2 border-b-2 whitespace-nowrap text-sm font-medium ${
                            statusFilter === tab.id 
                                ? "border-indigo-500 text-indigo-600 dark:text-indigo-400" 
                                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
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
                        <p className="text-zinc-500">No {statusFilter.replace('_', ' ')} drafts found.</p>
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
