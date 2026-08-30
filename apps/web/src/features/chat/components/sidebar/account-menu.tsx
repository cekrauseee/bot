import { useState } from "react";
import { Check, Loader2, LogOut, RotateCcw } from "lucide-react";
import {
  MorphPopover,
  MorphPopoverContent,
} from "@/components/motion/popover-morph";
import {
  AnimatedSidebarMenu,
  AnimatedSidebarMenuButton,
  AnimatedSidebarMenuItem,
} from "@/components/motion/animated-sidebar";
import { ActionSwapRollButton } from "@/components/motion/action-swap-roll";
import type { ButtonState } from "@/components/motion/button/stateful";
import type { ChatUserView } from "@/features/chat/model";
import { cn } from "@/lib/utils";

export function UserAvatar({
  user,
  initials,
  className,
}: {
  user: ChatUserView;
  initials: string;
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(user.avatarUrl) && !imageFailed;
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-foreground",
        className,
      )}
    >
      {showImage ? (
        <img
          src={user.avatarUrl}
          alt=""
          aria-hidden="true"
          className="size-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      ) : (
        initials
      )}
    </span>
  );
}

export function AccountMenu({
  user,
  signOutError,
  signOutStatus,
  onSignOut,
}: {
  user: ChatUserView;
  signOutError: string;
  signOutStatus: ButtonState;
  onSignOut: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = user.displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <MorphPopover
      open={menuOpen}
      onOpenChange={setMenuOpen}
      className="w-full"
    >
      <AnimatedSidebarMenu>
        <AnimatedSidebarMenuItem>
          <AnimatedSidebarMenuButton
            ariaExpanded={menuOpen}
            expandSidebarOnSelect={false}
            icon={
              <UserAvatar
                user={user}
                initials={initials}
                className="size-5 rounded-md text-[9px]"
              />
            }
            onSelect={() => setMenuOpen((current) => !current)}
            tooltip={user.displayName}
          >
            {user.displayName}
          </AnimatedSidebarMenuButton>
        </AnimatedSidebarMenuItem>
      </AnimatedSidebarMenu>
      <MorphPopoverContent
        side="top"
        align="start"
        sideOffset={8}
        radius={12}
        className="w-[15.5rem] max-w-[calc(100vw-1rem)] p-1.5"
      >
        <div className="flex flex-col gap-1">
          <div className="px-2.5 py-2">
            <div className="flex items-center gap-2.5">
              <UserAvatar user={user} initials={initials} />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground">
                  {user.displayName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              </div>
            </div>
          </div>
          <ActionSwapRollButton
            items={[
              {
                id: "idle",
                label: "Sign out",
                icon: <LogOut aria-hidden="true" className="size-4" />,
              },
              {
                id: "loading",
                label: "Signing out…",
                icon: <Loader2 aria-hidden="true" className="size-4" />,
              },
              {
                id: "success",
                label: "Signed out",
                icon: <Check aria-hidden="true" className="size-4" />,
              },
              {
                id: "error",
                label: "Try again",
                icon: <RotateCcw aria-hidden="true" className="size-4" />,
              },
            ]}
            value={signOutStatus}
            cycle={false}
            variant="ghost"
            size="sm"
            disabled={signOutStatus === "loading"}
            onClick={onSignOut}
            className="w-full justify-start rounded-lg text-xs text-muted-foreground hover:text-foreground"
          />
          {signOutError ? (
            <p role="alert" className="px-2.5 pb-1 text-xs text-destructive">
              {signOutError}
            </p>
          ) : null}
        </div>
      </MorphPopoverContent>
    </MorphPopover>
  );
}
