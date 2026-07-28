'use client';

import { useState, useEffect, useCallback } from "react";
import { listAssets } from "@/app/actions/assets";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ImageIcon, Search, Loader2, Check } from "lucide-react";

type Asset = Awaited<ReturnType<typeof listAssets>>["assets"][number];

export function AssetPickerDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (urls: string[]) => void;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const loadAssets = useCallback(async () => {
    setLoading(true);
    const res = await listAssets({ search: search || undefined, mimeType: "image/*" });
    setAssets(res.assets);
    setLoading(false);
  }, [search]);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  const toggleAsset = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const handleConfirm = () => {
    onSelect(Array.from(selected));
    setSelected(new Set());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ImageIcon className="mr-2 h-4 w-4" />
          From Assets
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Media</DialogTitle>
        </DialogHeader>

        <div className="relative flex-1 max-w-sm mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : assets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ImageIcon className="mx-auto h-10 w-10 mb-3 opacity-50" />
              <p>No images found. Upload assets first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
              {assets.map((asset) => {
                const isSelected = selected.has(asset.publicUrl);
                return (
                  <button
                    key={asset.id}
                    onClick={() => toggleAsset(asset.publicUrl)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      isSelected
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-transparent hover:border-muted-foreground/30"
                    }`}
                  >
                    <img
                      src={asset.publicUrl}
                      alt={asset.altText || asset.filename}
                      className="object-cover w-full h-full"
                      loading="lazy"
                    />
                    {isSelected && (
                      <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                      <p className="text-xs text-white truncate">{asset.filename}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t mt-4">
          <p className="text-sm text-muted-foreground">
            {selected.size} selected
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={selected.size === 0}>
              <Check className="mr-2 h-4 w-4" />
              Add {selected.size > 0 && `(${selected.size})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
