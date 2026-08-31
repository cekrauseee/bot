import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import {
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  MorphPopover,
  MorphPopoverContent,
  MorphPopoverTrigger,
} from "@/components/motion/popover-morph";
import { SPRING_LAYOUT } from "@/lib/ease";
import { useTouchCapable } from "@/lib/hooks/use-touch-capable";
import { cn } from "@/lib/utils";
import { SidebarTitle } from "../sidebar-title";
import { canContain } from "./operations";
import type {
  DropTarget,
  FlatResource,
  SidebarResourceMoveCommands,
  SidebarResourceTreeProps,
} from "./types";

const MenuAction = ({
  icon: Icon,
  onSelect,
  children,
}: {
  icon: LucideIcon;
  onSelect: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={onSelect}
    className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
  >
    <Icon aria-hidden="true" className="size-3.5 shrink-0" />
    <span className="min-w-0 truncate">{children}</span>
  </button>
);

function defaultIcon(item: FlatResource["item"], expanded: boolean) {
  const Icon =
    item.kind === "folder" || item.kind === "project"
      ? expanded
        ? FolderOpen
        : Folder
      : item.kind === "bookmark"
        ? Bookmark
        : FileText;
  return <Icon className="size-4" />;
}

type ResourceRowProps = {
  row: FlatResource;
  active: boolean;
  expanded: boolean;
  focused: boolean;
  draggingId: string | null;
  dropTarget: DropTarget | null;
  menuOpen: boolean;
  moves: SidebarResourceMoveCommands;
  renaming: boolean;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>, row: FlatResource) => void;
  onDragStart: (event: DragEvent<HTMLDivElement>, id: string) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onFocus: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onMenuOpenChange: (open: boolean) => void;
  onRenameCancel: () => void;
  onRenameCommit: (label: string) => void;
  onRenameStart: () => void;
  onSelect: () => void;
  onToggle: () => void;
  renderIcon?: SidebarResourceTreeProps["renderIcon"];
  renderMenu?: SidebarResourceTreeProps["renderMenu"];
  setRef: (node: HTMLDivElement | null) => void;
};

export function ResourceRow({
  row,
  active,
  expanded,
  focused,
  draggingId,
  dropTarget,
  menuOpen,
  moves,
  renaming,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
  onFocus,
  onKeyDown,
  onMenuOpenChange,
  onRenameCancel,
  onRenameCommit,
  onRenameStart,
  onSelect,
  onToggle,
  renderIcon,
  renderMenu,
  setRef,
}: ResourceRowProps) {
  const reduce = useReducedMotion() ?? false;
  const canTouch = useTouchCapable();
  const [hovered, setHovered] = useState(false);
  const [draft, setDraft] = useState(row.item.label);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlur = useRef(false);
  const dragged = useRef(false);
  const acceptsChildren = canContain(row.item);
  const isDragging = draggingId === row.item.id;
  const dropPosition =
    dropTarget?.id === row.item.id ? dropTarget.position : null;

  useEffect(() => {
    if (!renaming) return;
    skipBlur.current = false;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [renaming]);

  const closeAnd = (action: () => void) => () => {
    onMenuOpenChange(false);
    action();
  };
  const startRename = () => {
    setDraft(row.item.label);
    onRenameStart();
  };
  const menu = renderMenu?.(row.item, {
    close: () => onMenuOpenChange(false),
    rename: closeAnd(startRename),
    moves,
  }) ?? (
    <>
      <MenuAction icon={Pencil} onSelect={closeAnd(startRename)}>
        Rename
      </MenuAction>
      {moves.up || moves.down || moves.into || moves.out ? (
        <div aria-hidden="true" className="my-1 h-px bg-border" />
      ) : null}
      {moves.up ? (
        <MenuAction icon={ArrowUp} onSelect={closeAnd(moves.up)}>
          Move up
        </MenuAction>
      ) : null}
      {moves.down ? (
        <MenuAction icon={ArrowDown} onSelect={closeAnd(moves.down)}>
          Move down
        </MenuAction>
      ) : null}
      {moves.into ? (
        <MenuAction icon={FolderInput} onSelect={closeAnd(moves.into.run)}>
          Move into {moves.into.label}
        </MenuAction>
      ) : null}
      {moves.out ? (
        <MenuAction icon={Undo2} onSelect={closeAnd(moves.out)}>
          Move out
        </MenuAction>
      ) : null}
    </>
  );

  return (
    <motion.div
      ref={setRef}
      layout="position"
      transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={acceptsChildren ? undefined : active}
      aria-expanded={acceptsChildren ? expanded : undefined}
      aria-disabled={row.item.disabled || undefined}
      tabIndex={focused ? 0 : -1}
      draggable={!row.item.disabled && !renaming}
      data-menu-open={menuOpen || undefined}
      data-drop={dropPosition ?? undefined}
      data-dragging={isDragging || undefined}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          dragged.current ||
          renaming ||
          row.item.disabled
        )
          return;
        if (acceptsChildren) onToggle();
        else onSelect();
      }}
      onDoubleClick={(event) => {
        if (acceptsChildren || row.item.disabled) return;
        event.preventDefault();
        startRename();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDragStartCapture={(event) => {
        dragged.current = true;
        onDragStart(event, row.item.id);
      }}
      onDragEndCapture={() => {
        onDragEnd();
        requestAnimationFrame(() => {
          dragged.current = false;
        });
      }}
      onDragOver={(event) => onDragOver(event, row)}
      onDrop={onDrop}
      className={cn(
        "group/resource relative flex min-h-9 min-w-0 cursor-pointer items-center gap-2.5 rounded-xl pr-3 text-xs outline-none",
        "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        "focus-visible:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        "data-[menu-open=true]:bg-muted data-[menu-open=true]:text-foreground data-[dragging=true]:opacity-40",
        "data-[drop=inside]:bg-primary/10 data-[drop=inside]:ring-1 data-[drop=inside]:ring-primary/45",
        !acceptsChildren && active && "bg-muted text-foreground",
        row.item.disabled && "cursor-not-allowed opacity-45",
      )}
      style={{ paddingLeft: `${12 + row.depth * 16}px` }}
    >
      <span
        aria-hidden="true"
        className="grid size-5 shrink-0 place-items-center"
      >
        {renderIcon?.(row.item) ?? defaultIcon(row.item, expanded)}
      </span>
      {renaming ? (
        <input
          ref={inputRef}
          value={draft}
          aria-label={`Rename ${row.item.label}`}
          onChange={(event) => setDraft(event.target.value)}
          draggable={false}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onBlur={() => {
            if (!skipBlur.current) onRenameCommit(draft);
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              skipBlur.current = true;
              onRenameCommit(draft);
            }
            if (event.key === "Escape") {
              skipBlur.current = true;
              onRenameCancel();
            }
          }}
          className="mx-1 h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : <SidebarTitle active={hovered || menuOpen} title={row.item.label} />}
      {!renaming && !row.item.disabled ? (
        <MorphPopover open={menuOpen} onOpenChange={onMenuOpenChange}>
          <MorphPopoverTrigger>
            <button
              type="button"
              draggable={false}
              tabIndex={-1}
              aria-label={`Actions for ${row.item.label}`}
              onClick={(event) => event.stopPropagation()}
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-lg outline-none transition-opacity hover:bg-foreground/5 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/resource:opacity-100 group-data-[menu-open=true]/resource:opacity-100",
                canTouch ? "opacity-100" : "opacity-0",
              )}
            >
              <MoreHorizontal aria-hidden="true" className="size-4" />
            </button>
          </MorphPopoverTrigger>
          <MorphPopoverContent
            side="bottom"
            align="end"
            sideOffset={8}
            radius={12}
            className="w-40 p-1.5"
          >
            <div data-sidebar-resource-menu={row.item.id}>{menu}</div>
          </MorphPopoverContent>
        </MorphPopover>
      ) : null}
    </motion.div>
  );
}
