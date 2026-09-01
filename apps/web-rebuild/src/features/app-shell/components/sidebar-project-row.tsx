import { useState, type ReactNode } from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EllipsisIcon,
  FolderIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import type { ProjectSummary } from "@/features/app-shell/api"
import { SidebarDeleteDialog } from "@/features/app-shell/components/sidebar-delete-dialog"
import { SidebarInlineRename } from "@/features/app-shell/components/sidebar-inline-rename"

type SidebarProjectRowProps = {
  children: ReactNode
  conversationCount: number
  onDelete: () => Promise<unknown>
  onOpenChange: (open: boolean) => void
  onMoveDown?: () => Promise<unknown>
  onMoveUp?: () => Promise<unknown>
  onRename: (name: string) => Promise<unknown>
  open: boolean
  pending: boolean
  project: ProjectSummary
}

export function SidebarProjectRow({
  children,
  conversationCount,
  onDelete,
  onOpenChange,
  onMoveDown,
  onMoveUp,
  onRename,
  open,
  pending,
  project,
}: SidebarProjectRowProps) {
  const [editing, setEditing] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (editing) {
    return (
      <SidebarMenuItem>
        <SidebarInlineRename
          label="Project name"
          value={project.name}
          maxLength={80}
          onCancel={() => setEditing(false)}
          onRename={onRename}
        />
      </SidebarMenuItem>
    )
  }

  return (
    <SidebarMenuItem>
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger
          render={
            <SidebarMenuButton tooltip={project.name} disabled={pending} />
          }
        >
          <FolderIcon aria-hidden="true" />
          <span className="font-normal">{project.name}</span>
        </CollapsibleTrigger>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuAction
                showOnHover
                disabled={pending}
                aria-label={`Actions for ${project.name}`}
              />
            }
          >
            <EllipsisIcon aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="right"
            align="start"
            sideOffset={6}
            className="w-max min-w-48"
          >
            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={pending}
                onClick={() => setEditing(true)}
              >
                <PencilIcon aria-hidden="true" />
                Rename project
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
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                variant="destructive"
                disabled={pending}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2Icon aria-hidden="true" />
                Delete project
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <CollapsibleContent>
          <SidebarMenuSub>
            {conversationCount > 0 ? (
              children
            ) : (
              <SidebarMenuSubItem className="px-2 py-1 text-xs text-muted-foreground">
                Move conversations here
              </SidebarMenuSubItem>
            )}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>

      <SidebarDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete project?"
        description="The project will be deleted. Its conversations will be kept and moved to Recents."
        onConfirm={onDelete}
      />
    </SidebarMenuItem>
  )
}
