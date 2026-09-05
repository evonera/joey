"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconLayoutColumns,
  IconEye,
  IconHeart,
  IconMessageCircle,
  IconShare,
  IconTrendingUp,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

export interface PostPerformanceItem {
  id: string;
  content?: string;
  publishedAt?: string;
  platforms: Array<{
    platform: string;
    analytics: {
      impressions?: number;
      likes?: number;
      comments?: number;
      shares?: number;
      views?: number;
    } | null;
  }>;
}

export function PostPerformanceTable({ posts }: { posts: PostPerformanceItem[] }) {
  const isMobile = useIsMobile();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 });
  const [selectedPost, setSelectedPost] = React.useState<PostPerformanceItem | null>(null);

  const flatData = React.useMemo(() => {
    return posts.map((post) => {
      let impressions = 0;
      let likes = 0;
      let comments = 0;
      let shares = 0;

      for (const p of post.platforms) {
        if (p.analytics) {
          impressions += p.analytics.impressions ?? 0;
          likes += p.analytics.likes ?? 0;
          comments += p.analytics.comments ?? 0;
          shares += p.analytics.shares ?? 0;
        }
      }

      const totalEngagements = likes + comments + shares;
      const rate = impressions > 0 ? (totalEngagements / impressions) * 100 : 0;

      return {
        id: post.id,
        content: post.content || "(No text content)",
        publishedAt: post.publishedAt || new Date().toISOString(),
        platforms: post.platforms.map((p) => p.platform),
        impressions,
        likes,
        comments,
        shares,
        rate,
        raw: post,
      };
    });
  }, [posts]);

  const columns: ColumnDef<typeof flatData[number]>[] = [
    {
      accessorKey: "content",
      header: "Post Content",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="max-w-[320px] sm:max-w-[420px] font-medium text-foreground truncate">
            <DrawerTrigger asChild onClick={() => setSelectedPost(item.raw)}>
              <button className="hover:underline text-left cursor-pointer truncate w-full block">
                {item.content}
              </button>
            </DrawerTrigger>
          </div>
        );
      },
    },
    {
      accessorKey: "platforms",
      header: "Channels",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.platforms.map((plat) => (
            <Badge key={plat} variant="secondary" className="capitalize text-[10px] px-1.5 py-0.5">
              {plat}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      accessorKey: "publishedAt",
      header: "Published",
      cell: ({ row }) => {
        const d = new Date(row.original.publishedAt);
        return (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {!isNaN(d.getTime()) ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
          </span>
        );
      },
    },
    {
      accessorKey: "impressions",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="p-0 text-xs font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Impressions
          <IconChevronDown className="size-3 ml-1" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="tabular-nums text-xs font-semibold text-right block pr-2">
          {row.original.impressions.toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: "likes",
      header: "Likes",
      cell: ({ row }) => (
        <span className="tabular-nums text-xs text-muted-foreground text-right block pr-2">
          {row.original.likes.toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: "comments",
      header: "Replies",
      cell: ({ row }) => (
        <span className="tabular-nums text-xs text-muted-foreground text-right block pr-2">
          {row.original.comments.toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: "rate",
      header: "Rate",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/20">
          {row.original.rate.toFixed(1)}%
        </Badge>
      ),
    },
  ];

  const table = useReactTable({
    data: flatData,
    columns,
    state: {
      sorting,
      columnVisibility,
      columnFilters,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <Drawer direction={isMobile ? "bottom" : "right"}>
      <div className="space-y-4">
        {/* Table Toolbar */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{flatData.length}</span> published posts
          </p>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
                <IconLayoutColumns className="size-3.5" />
                <span>Columns</span>
                <IconChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {table
                .getAllColumns()
                .filter((column) => typeof column.accessorFn !== "undefined" && column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize text-xs"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* The Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50 border-b border-border">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="text-xs font-semibold py-2.5">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="hover:bg-muted/30 transition-colors">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-2.5 text-xs">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-xs text-muted-foreground">
                    No posts found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <div>
            Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <IconChevronsLeft className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <IconChevronLeft className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <IconChevronRight className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <IconChevronsRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Slide-over Post Inspection Drawer */}
      <DrawerContent className="max-w-md p-6 space-y-4">
        <DrawerHeader className="p-0 text-left">
          <DrawerTitle className="text-base font-semibold">Post Analytics Breakdown</DrawerTitle>
          <DrawerDescription className="text-xs text-muted-foreground">
            Performance metrics by connected platform
          </DrawerDescription>
        </DrawerHeader>

        {selectedPost && (
          <div className="space-y-4 py-2">
            <div className="p-3.5 rounded-xl border border-white/[0.08] bg-[#141312] text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
              {selectedPost.content}
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Platform Performance
              </h4>
              <div className="space-y-2">
                {selectedPost.platforms.map((p) => (
                  <div key={p.platform} className="p-3 rounded-lg border border-border bg-card flex items-center justify-between">
                    <span className="text-xs font-semibold capitalize">{p.platform}</span>
                    <div className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <IconEye className="size-3.5 text-primary" />
                        {p.analytics?.impressions ?? 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <IconHeart className="size-3.5 text-rose-500" />
                        {p.analytics?.likes ?? 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <IconMessageCircle className="size-3.5 text-amber-500" />
                        {p.analytics?.comments ?? 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <IconShare className="size-3.5 text-indigo-500" />
                        {p.analytics?.shares ?? 0}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DrawerFooter className="p-0 pt-2 flex flex-row justify-end">
          <DrawerClose asChild>
            <Button variant="outline" size="sm">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
