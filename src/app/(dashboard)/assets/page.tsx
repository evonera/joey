'use client';

import { useState, useEffect, useCallback, useRef } from "react";
import { requestUploadUrl, registerAsset, listAssets, deleteAsset } from "@/app/actions/assets";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Upload,
  Trash2,
  Search,
  ImageIcon,
  FileIcon,
  FilmIcon,
  Loader2,
  X,
} from "lucide-react";

type Asset = Awaited<ReturnType<typeof listAssets>>["assets"][number];

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return ImageIcon;
  if (mimeType.startsWith("video/")) return FilmIcon;
  return FileIcon;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filterMime, setFilterMime] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAssets({
        search: search || undefined,
        mimeType: filterMime || undefined,
      });
      setAssets(res.assets);
    } catch (err: any) {
      setError(err.message || "Failed to load assets");
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterMime]);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(searchInput), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  async function handleFileUpload(file: File) {
    setUploading(true);
    try {
      const { uploadUrl, key, publicUrl } = await requestUploadUrl(
        file.name,
        file.type
      );

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!uploadRes.ok) throw new Error("Upload to R2 failed");

      let width: number | null = null;
      let height: number | null = null;

      if (file.type.startsWith("image/")) {
        const dims = await getImageDimensions(file);
        width = dims.width;
        height = dims.height;
      }

      await registerAsset({
        filename: file.name,
        key,
        mimeType: file.type,
        size: file.size,
        publicUrl,
        width,
        height,
      });

      toast.success(`${file.name} uploaded`);
      await loadAssets();
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string, filename: string) {
    try {
      await deleteAsset(id);
      toast.success(`${filename} deleted`);
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } catch (err: any) {
      toast.error(err.message || "Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assets</h1>
          <p className="text-muted-foreground mt-1">
            Upload and manage images, videos, and files for your posts.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,application/pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = "";
            }}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search assets..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {["image/*", "video/*", "application/pdf"].map((mime) => {
            const label = mime.split("/")[0];
            const isActive = filterMime === mime;
            return (
              <Badge
                key={mime}
                variant={isActive ? "default" : "outline"}
                className="cursor-pointer capitalize"
                onClick={() => setFilterMime(isActive ? null : mime)}
              >
                {label === "application" ? "PDF" : label}
                {isActive && (
                  <X className="ml-1 h-3 w-3" onClick={(e) => { e.stopPropagation(); setFilterMime(null); }} />
                )}
              </Badge>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <div className="aspect-square bg-muted rounded-t-lg" />
              <CardContent className="p-3 space-y-2">
                <div className="h-3 bg-muted rounded w-3/4" />
                <div className="h-2 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : assets.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ImageIcon className="mx-auto h-12 w-12 mb-4 opacity-50" />
          <p className="text-lg font-medium">No assets yet</p>
          <p className="text-sm">Upload an image, video, or file to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {assets.map((asset) => {
            const Icon = getFileIcon(asset.mimeType);
            return (
              <Card key={asset.id} className="group overflow-hidden">
                <div className="aspect-square relative bg-muted">
                  {asset.mimeType.startsWith("image/") ? (
                    <img
                      src={asset.publicUrl}
                      alt={asset.altText || asset.filename}
                      className="object-cover w-full h-full"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex items-center justify-center w-full h-full">
                      <Icon className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                    onClick={() => handleDelete(asset.id, asset.filename)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <CardContent className="p-3 space-y-1">
                  <p className="text-sm font-medium truncate">{asset.filename}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatSize(asset.size)}</span>
                    <span>&middot;</span>
                    <span>{formatDate(asset.createdAt)}</span>
                  </div>
                  {asset.tags && asset.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {asset.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for dimension detection"));
    };
    img.src = url;
  });
}
