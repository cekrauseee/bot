import { useRef, useState } from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EllipsisIcon,
  FolderIcon,
  FolderInputIcon,
  InboxIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import type {
  ConversationSummary,
  ProjectSummary,
} from "@/features/app-shell/api"
import { SidebarDeleteDialog } from "@/features/app-shell/components/sidebar-delete-dialog"
import { SidebarInlineRename } from "@/features/app-shell/components/sidebar-inline-rename"
import { SidebarScrollingTitle } from "@/features/app-shell/components/sidebar-scrolling-title"
import { cn } from "@/lib/utils"

type SidebarConversationRowProps = {
  active: boolean
  conversation: ConversationSummary
  onDelete: () => Promise<unknown>
  onMove: (projectId: string | null) => Promise<unknown>
  onMoveDown?: () => Promise<unknown>
  onMoveUp?: () => Promise<unknown>
  onRename: (title: string) => Promise<unknown>
  onSelect: () => void
  onSetPinned: (pinned: boolean) => Promise<unknown>
  pending: boolean
  projects: ProjectSummary[]
  nested?: boolean
}

export function SidebarConversationRow({
  active,
  conversation,
  onDelete,
  onMove,
  onMoveDown,
  onMoveUp,
  onRename,
  onSelect,
  onSetPinned,
  pending,
  projects,
  nested = false,
}: SidebarConversationRowProps) {
  const { isMobile, setOpenMobile } = useSidebar()
  const [editing, setEditing] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const pinned = conversation.pinned_order !== null
  const destinationProjects = projects.filter(
    (project) => project.id !== conversation.project_id
  )
  const canMove =
    !pinned &&
    (conversation.project_id !== null || destinationProjects.length > 0)

  const handleMenuOpenChange = (
    menuOpen: boolean,
    eventDetails: Parameters<
      NonNullable<React.ComponentProps<typeof DropdownMenu>["onOpenChange"]>
    >[1]
  ) => {
    setMenuOpen(menuOpen)
    if (menuOpen || eventDetails.event instanceof KeyboardEvent) return

    requestAnimationFrame(() => menuTriggerRef.current?.blur())
  }

  if (editing) {
    return (
      <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
        <SidebarInlineRename
          label="Conversation title"
          value={conversation.title}
          maxLength={120}
          onCancel={() => setEditing(false)}
          onRename={onRename}
        />
      </SidebarMenuItem>
    )
  }

  return (
    <SidebarMenuItem className="overflow-hidden rounded-md group-data-[collapsible=icon]:hidden">
      <SidebarMenuButton
        className={cn(
          "group-has-data-[sidebar=menu-action]/menu-item:pr-14 md:group-has-data-[sidebar=menu-action]/menu-item:pr-2",
          nested && "ps-8"
        )}
        tooltip={conversation.title}
        isActive={active}
        disabled={pending}
        onClick={() => {
          onSelect()
          if (isMobile) setOpenMobile(false)
        }}
      >
        <SidebarScrollingTitle title={conversation.title} />
      </SidebarMenuButton>

      <div
        aria-hidden="true"
        data-slot="sidebar-action-surface"
        className={cn(
          "pointer-events-none absolute inset-y-0 end-0 z-0 w-14 rounded-e-md bg-sidebar-accent md:opacity-0 md:transition-none",
          menuOpen && "md:opacity-100"
        )}
      >
        <span className="pointer-events-none absolute inset-y-0 -start-3 w-3 bg-linear-to-r from-transparent to-sidebar-accent rtl:bg-linear-to-l" />
      </div>

      <SidebarMenuAction
        showOnHover
        showOnTriggerFocus={false}
        disabled={pending}
        aria-label={`${pinned ? "Unpin" : "Pin"} ${conversation.title}`}
        onClick={() => void onSetPinned(!pinned)}
        className="right-8 z-10 hover:bg-sidebar-accent-foreground/10 hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent-foreground/15 focus-visible:text-sidebar-accent-foreground"
      >
        <PinIcon
          aria-hidden="true"
          className={pinned ? "fill-current" : undefined}
        />
      </SidebarMenuAction>

      <DropdownMenu onOpenChange={handleMenuOpenChange}>
        <DropdownMenuTrigger
          render={
            <SidebarMenuAction
              ref={menuTriggerRef}
              showOnHover
              showOnTriggerFocus={false}
              disabled={pending}
              aria-label={`Actions for ${conversation.title}`}
              className="z-10 hover:bg-sidebar-accent-foreground/10 hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent-foreground/15 focus-visible:text-sidebar-accent-foreground aria-expanded:bg-sidebar-accent-foreground/15 aria-expanded:text-sidebar-accent-foreground"
            />
          }
        >
          <EllipsisIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="start"
          sideOffset={6}
          finalFocus={(closeType) => closeType === "keyboard"}
          className="w-max min-w-48"
        >
          <DropdownMenuGroup>
            <DropdownMenuItem
              disabled={pending}
              onClick={() => void onSetPinned(!pinned)}
            >
              {pinned ? (
                <PinOffIcon aria-hidden="true" />
              ) : (
                <PinIcon aria-hidden="true" />
              )}
              {pinned ? "Unpin" : "Pin"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={pending}
              onClick={() => setEditing(true)}
            >
              <PencilIcon aria-hidden="true" />
              Rename
            </DropdownMenuItem>

            {onMoveUp && (
              <DropdownMenuItem
                disabled={pending}
                onClick={() => void onMoveUp()}
              >
                <ArrowUpIcon aria-hidden="true" />
                Move up
              </DropdownMenuItem>
            )}
            {onMoveDown && (
              <DropdownMenuItem
                disabled={pending}
                onClick={() => void onMoveDown()}
              >
                <ArrowDownIcon aria-hidden="true" />
                Move down
              </DropdownMenuItem>
            )}

            {canMove && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={pending}>
                  <FolderInputIcon aria-hidden="true" />
                  Move to
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-max min-w-44">
                  <DropdownMenuGroup>
                    {conversation.project_id !== null && (
                      <DropdownMenuItem onClick={() => void onMove(null)}>
                        <InboxIcon aria-hidden="true" />
                        Recents
                      </DropdownMenuItem>
                    )}
                    {destinationProjects.map((project) => (
                      <DropdownMenuItem
                        key={project.id}
                        onClick={() => void onMove(project.id)}
                      >
                        <FolderIcon aria-hidden="true" />
                        {project.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
          </DropdownMenuGroup>

          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              disabled={pending}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2Icon aria-hidden="true" />
              Delete conversation
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <SidebarDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete conversation?"
        description="This conversation and its messages will be permanently deleted."
        onConfirm={onDelete}
      />
    </SidebarMenuItem>
  )
}
