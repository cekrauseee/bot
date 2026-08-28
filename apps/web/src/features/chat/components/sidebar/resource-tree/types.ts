import type { ReactNode } from "react";
import type { ChatResource } from "@/features/chat/model";

export type SidebarResource = ChatResource;
export type SidebarResourceDropPosition = "before" | "inside" | "after";
export type SidebarResourceMove = {
  itemId: string;
  targetId: string | null;
  position: SidebarResourceDropPosition;
};
export type SidebarResourceMoveCommands = {
  up?: () => void;
  down?: () => void;
  into?: { label: string; run: () => void };
  out?: () => void;
};
export type SidebarResourceMenuControls = {
  close: () => void;
  rename: () => void;
  moves: SidebarResourceMoveCommands;
};
export type SidebarResourceTreeProps = {
  items?: SidebarResource[];
  defaultItems?: SidebarResource[];
  onItemsChange?: (items: SidebarResource[]) => void;
  onMove?: (move: SidebarResourceMove) => void | Promise<void>;
  onMoveError?: (error: unknown, move: SidebarResourceMove) => void;
  onRename?: (item: SidebarResource, label: string) => void | Promise<void>;
  activeId?: string | null;
  defaultActiveId?: string | null;
  onActiveChange?: (id: string) => void;
  defaultExpandedIds?: string[];
  renderIcon?: (item: SidebarResource) => ReactNode;
  renderMenu?: (
    item: SidebarResource,
    controls: SidebarResourceMenuControls,
  ) => ReactNode;
  ariaLabel?: string;
  className?: string;
};
export type FlatResource = {
  item: SidebarResource;
  depth: number;
  parentId: string | null;
};
export type DropTarget = {
  id: string | null;
  position: SidebarResourceDropPosition;
};
