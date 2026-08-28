import { MessageSquarePlus, Search, Timer } from "lucide-react";
import {
  AnimatedSidebar,
  AnimatedSidebarContent,
  AnimatedSidebarFooter,
  AnimatedSidebarGroup,
  AnimatedSidebarGroupContent,
  AnimatedSidebarGroupLabel,
  AnimatedSidebarHeader,
  AnimatedSidebarMenu,
  AnimatedSidebarMenuButton,
  AnimatedSidebarMenuItem,
} from "@/components/motion/animated-sidebar";
import type { ButtonState } from "@/components/motion/button/stateful";
import type { ChatResource, ChatUserView } from "@/features/chat/model";
import { AccountMenu } from "./account-menu";
import { ResourceTree } from "./resource-tree";

export type ChatSidebarProps = {
  resources: ChatResource[];
  activeResourceId: string | null;
  expandedResourceIds: string[];
  user: ChatUserView;
  signOutError: string;
  signOutStatus: ButtonState;
  onResourceSelect: (id: string) => void;
  onResourcesChange: (resources: ChatResource[]) => void;
  onNewTask?: () => void;
  onSearch?: () => void;
  onRuns?: () => void;
  onSignOut: () => void;
};

export function ChatSidebar({
  resources,
  activeResourceId,
  expandedResourceIds,
  user,
  signOutError,
  signOutStatus,
  onResourceSelect,
  onResourcesChange,
  onNewTask,
  onSearch,
  onRuns,
  onSignOut,
}: ChatSidebarProps) {
  return (
    <AnimatedSidebar collapsible="icon" ariaLabel="Agent workspace">
      <AnimatedSidebarHeader>
        <AnimatedSidebarMenu>
          <AnimatedSidebarMenuItem>
            <AnimatedSidebarMenuButton
              icon={<MessageSquarePlus aria-hidden="true" />}
              onSelect={onNewTask}
              disabled={!onNewTask}
            >
              New task
            </AnimatedSidebarMenuButton>
          </AnimatedSidebarMenuItem>
          <AnimatedSidebarMenuItem>
            <AnimatedSidebarMenuButton
              icon={<Search aria-hidden="true" />}
              onSelect={onSearch}
              disabled={!onSearch}
            >
              Search
            </AnimatedSidebarMenuButton>
          </AnimatedSidebarMenuItem>
          <AnimatedSidebarMenuItem>
            <AnimatedSidebarMenuButton
              icon={<Timer aria-hidden="true" />}
              onSelect={onRuns}
              disabled={!onRuns}
            >
              Runs
            </AnimatedSidebarMenuButton>
          </AnimatedSidebarMenuItem>
        </AnimatedSidebarMenu>
      </AnimatedSidebarHeader>
      <AnimatedSidebarContent>
        <AnimatedSidebarGroup>
          <AnimatedSidebarGroupLabel>Projects</AnimatedSidebarGroupLabel>
          <AnimatedSidebarGroupContent>
            <div className="px-1">
              <ResourceTree
                items={resources}
                onItemsChange={onResourcesChange}
                activeId={activeResourceId}
                defaultExpandedIds={expandedResourceIds}
                onActiveChange={onResourceSelect}
                ariaLabel="Project resources"
              />
            </div>
          </AnimatedSidebarGroupContent>
        </AnimatedSidebarGroup>
      </AnimatedSidebarContent>
      <AnimatedSidebarFooter>
        <AccountMenu
          user={user}
          signOutError={signOutError}
          signOutStatus={signOutStatus}
          onSignOut={onSignOut}
        />
      </AnimatedSidebarFooter>
    </AnimatedSidebar>
  );
}
