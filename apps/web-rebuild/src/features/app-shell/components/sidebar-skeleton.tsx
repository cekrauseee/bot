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

function SkeletonLabel({ width }: { width: string }) {
  return <Skeleton className="h-3" style={{ width }} />
}

function SkeletonRow({ icon, width }: { icon?: boolean; width: string }) {
  return (
    <SidebarMenuItem aria-hidden="true">
      <div className="flex h-8 items-center gap-2 rounded-md px-2">
        {icon ? <Skeleton className="size-4 rounded-md" /> : null}
        <Skeleton className="h-3.5" style={{ width }} />
      </div>
    </SidebarMenuItem>
  )
}

export function SidebarSkeleton() {
  return (
    <div aria-hidden="true">
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>
          <SkeletonLabel width="3.5rem" />
        </SidebarGroupLabel>
        <div className="absolute top-3.5 right-3 grid size-5 place-items-center rounded-md group-data-[collapsible=icon]:hidden">
          <Skeleton className="size-3.5 rounded-sm" />
        </div>
        <SidebarGroupContent>
          <SidebarMenu>
            {PROJECT_WIDTHS.map((width, index) => (
              <SkeletonRow key={`project-${index}`} icon width={width} />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>
          <SkeletonLabel width="3.75rem" />
        </SidebarGroupLabel>
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
