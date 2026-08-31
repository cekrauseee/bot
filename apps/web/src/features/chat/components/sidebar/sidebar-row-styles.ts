export const sidebarFocusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'

// The primary link/button owns keyboard behavior; the row owns its visual focus.
export const sidebarRowFocusRing =
  'has-[[data-sidebar-primary]:focus-visible]:outline-2 has-[[data-sidebar-primary]:focus-visible]:outline-solid has-[[data-sidebar-primary]:focus-visible]:outline-ring has-[[data-sidebar-primary]:focus-visible]:-outline-offset-2'

export const sidebarRenameField =
  'h-7 rounded-md ring-inset data-[state=focused]:ring-ring'

export const sidebarMenuSurface = 'w-52 rounded-xl p-1.5'
export const sidebarMenuItem = "h-8 gap-2 px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5"
export const sidebarMenuSeparator = 'mx-1 my-1.5'
