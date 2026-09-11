"use client";

import { useMemo } from "react";
import { RoomProvider, useOthers, useSelf, useIsInsideRoom } from "@liveblocks/react";
import { useLiveblocksConfig } from "./liveblocks-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface CollaborativeAvatarsProps {
  roomId?: string;
  className?: string;
  maxAvatars?: number;
  showSelf?: boolean;
}

function InnerAvatarStack({
  maxAvatars = 4,
  showSelf = true,
  className = "",
}: {
  maxAvatars?: number;
  showSelf?: boolean;
  className?: string;
}) {
  const others = useOthers();
  const self = useSelf();

  const allUsers = useMemo(() => {
    const list: Array<{ id: string; name: string; avatar?: string; role?: string; isSelf: boolean }> = [];
    if (showSelf && self) {
      list.push({
        id: self.id,
        name: self.info?.name ? `${self.info.name} (You)` : "You",
        avatar: self.info?.avatar,
        role: self.info?.role,
        isSelf: true,
      });
    }
    others.forEach((other) => {
      list.push({
        id: String(other.connectionId),
        name: other.info?.name || "Teammate",
        avatar: other.info?.avatar,
        role: other.info?.role,
        isSelf: false,
      });
    });
    return list;
  }, [others, self, showSelf]);

  if (allUsers.length === 0) {
    return null;
  }

  const visibleUsers = allUsers.slice(0, maxAvatars);
  const overflowCount = allUsers.length - maxAvatars;

  return (
    <TooltipProvider delayDuration={200}>
      <div className={`flex items-center -space-x-2 overflow-hidden ${className}`}>
        {visibleUsers.map((user, idx) => {
          const initials = (user.name || "U")
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("")
            .toUpperCase();

          return (
            <Tooltip key={`${user.id}-${idx}`}>
              <TooltipTrigger asChild>
                <div className="relative inline-block focus:outline-none">
                  <Avatar
                    className={`h-7 w-7 border-2 border-background ring-1 transition-transform hover:z-20 hover:scale-110 ${
                      user.isSelf ? "ring-amber-500/50" : "ring-emerald-500/50"
                    }`}
                  >
                    {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
                    <AvatarFallback className="text-[10px] font-semibold bg-zinc-800 text-zinc-200">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className={`absolute bottom-0 right-0 block h-2 w-2 rounded-full ring-1 ring-background ${
                      user.isSelf ? "bg-amber-400" : "bg-emerald-400 animate-pulse"
                    }`}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <p className="font-semibold">{user.name}</p>
                {user.role && (
                  <p className="text-[10px] text-muted-foreground capitalize">
                    {user.role}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}

        {overflowCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-zinc-800 text-[10px] font-medium text-zinc-200 ring-1 ring-border cursor-default hover:scale-105 transition-transform">
                +{overflowCount}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <p>{overflowCount} more teammate{overflowCount > 1 ? "s" : ""} online</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

export function CollaborativeAvatars({
  roomId,
  className,
  maxAvatars = 4,
  showSelf = true,
}: CollaborativeAvatarsProps) {
  const { isConfigured } = useLiveblocksConfig();
  const isInsideRoom = useIsInsideRoom();

  if (!isConfigured) {
    return null;
  }

  // If already inside a RoomProvider, render directly
  if (isInsideRoom) {
    return (
      <InnerAvatarStack
        maxAvatars={maxAvatars}
        showSelf={showSelf}
        className={className}
      />
    );
  }

  // If a specific roomId was provided, wrap in a RoomProvider
  if (roomId) {
    return (
      <RoomProvider
        id={roomId}
        initialPresence={{
          isReviewing: true,
          cursor: null,
          activeDraftId: null,
        }}
      >
        <InnerAvatarStack
          maxAvatars={maxAvatars}
          showSelf={showSelf}
          className={className}
        />
      </RoomProvider>
    );
  }

  return null;
}
