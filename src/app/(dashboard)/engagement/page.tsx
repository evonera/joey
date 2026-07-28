'use client';

import { useState, useEffect, useCallback } from "react";
import { getEngagementItems } from "@/app/actions/engagement";
import { ReplyCard } from "@/components/engagement/reply-card";

export default function EngagementPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("pending");

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const res = await getEngagementItems(statusFilter);
    if (res.items) setItems(res.items);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const tabs = [
    { id: "pending", label: "Pending" },
    { id: "replied", label: "Replied" },
    { id: "skipped", label: "Skipped" },
    { id: "", label: "All" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Inbox</h1>
      </div>

      <div className="flex border-b overflow-x-auto">
        {tabs.map((tab) => (
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
          <div className="text-center py-8 text-zinc-500">Loading inbox...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-zinc-900 rounded-xl border border-dashed">
            <p className="text-zinc-500">
              {statusFilter
                ? `No ${statusFilter} engagement items found.`
                : "No engagement items yet. Comments and mentions will appear here."}
            </p>
          </div>
        ) : (
          items.map((item) => (
            <ReplyCard key={item.id} item={item} onActionComplete={fetchItems} />
          ))
        )}
      </div>
    </div>
  );
}