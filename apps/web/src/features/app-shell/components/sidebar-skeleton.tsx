import { FolderIcon, PlusIcon } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const PROJECT_WIDTHS = ["68%", "54%", "76%"]
const RECENT_WIDTHS = [
  "82%",
  "66%",
  "74%",
  "58%",
  "88%",
  "63%",
  "78%",
  "70%",
  "52%",
  "84%",
  "61%",
  "73%",
  "89%",
  "67%",
  "77%",
  "56%",
  "80%",
  "64%",
]

function SkeletonRow({ project, width }: { project?: boolean; width: string }) {
  return (
    <SidebarMenuItem aria-hidden="true">
      <div className="flex h-8 items-center gap-2 rounded-md px-2">
        {project ? (
          <FolderIcon aria-hidden="true" className="size-4 shrink-0" />
        ) : null}
        <Skeleton className="h-3.5" style={{ width }} />
      </div>
    </SidebarMenuItem>
  )
}

export function SidebarSkeleton() {
  return (
    <div aria-hidden="true">
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>Projects</SidebarGroupLabel>
        <div className="absolute top-3.5 right-3 grid size-5 place-items-center rounded-md group-data-[collapsible=icon]:hidden">
          <PlusIcon aria-hidden="true" className="size-4 shrink-0" />
        </div>
        <SidebarGroupContent>
          <SidebarMenu>
            {PROJECT_WIDTHS.map((width, index) => (
              <SkeletonRow key={`project-${index}`} project width={width} />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>Recents</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {RECENT_WIDTHS.map((width, index) => (
              <SkeletonRow key={`recent-${index}`} width={width} />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </div>
  )
}
