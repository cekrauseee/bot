import { ChevronDownIcon, LogOutIcon } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ProvidersDialog,
  ProvidersDialogTrigger,
} from "@/features/provider-connections/components/providers-dialog"
import { Spinner } from "@/components/ui/spinner"
import { SidebarMenuButton } from "@/components/ui/sidebar"

type AccountMenuProps = {
  user: {
    email: string
    first_name: string | null
    last_name: string | null
    avatar_url: string | null
  }
  onSignOut: () => void
  signingOut: boolean
}

function userName(user: AccountMenuProps["user"]) {
  return (
    [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email
  )
}

function initials(user: AccountMenuProps["user"]) {
  return (
    [user.first_name, user.last_name]
      .filter(Boolean)
      .map((part) => part?.[0])
      .join("") || user.email[0]
  ).toUpperCase()
}

export function AccountMenu({ user, onSignOut, signingOut }: AccountMenuProps) {
  return (
    <ProvidersDialog>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              tooltip={userName(user)}
              className="data-open:bg-sidebar-accent"
            />
          }
          aria-label={`Account menu for ${userName(user)}`}
        >
          <span className="relative grid size-4 shrink-0 place-items-center">
            <Avatar size="sm" className="absolute size-6 rounded-md">
              {user.avatar_url && (
                <AvatarImage
                  src={user.avatar_url}
                  alt=""
                  className="rounded-md"
                />
              )}
              <AvatarFallback className="rounded-md">
                {initials(user)}
              </AvatarFallback>
            </Avatar>
          </span>
          <span className="min-w-0 flex-1 truncate text-left group-data-[collapsible=icon]:hidden">
            {userName(user)}
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            className="ml-auto group-data-[collapsible=icon]:hidden"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          sideOffset={8}
          className="min-w-60"
        >
          <DropdownMenuGroup>
            <ProvidersDialogTrigger />
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={signingOut} onClick={onSignOut}>
              {signingOut ? (
                <Spinner aria-hidden="true" />
              ) : (
                <LogOutIcon aria-hidden="true" />
              )}
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </ProvidersDialog>
  )
}
