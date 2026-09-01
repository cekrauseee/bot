import { ArrowDown, ArrowUp, Folder, FolderOpen, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/motion/button'
import { Input } from '@/components/motion/input'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ProjectSummary } from '@/features/chat/model'
import { useTouchCapable } from '@/lib/hooks/use-touch-capable'
import { cn } from '@/lib/utils'
import { SidebarTitle } from '../sidebar/sidebar-title'
import { SidebarRowActions } from '../sidebar/sidebar-row-actions'
import { sidebarFocusRing, sidebarRenameField, sidebarRowFocusRing, sidebarMenuSurface, sidebarMenuItem, sidebarMenuSeparator } from '../sidebar/sidebar-row-styles'

export const projectDragType = 'application/x-mybot-project'

type ProjectRowProps = {
  project: ProjectSummary
  open: boolean
  onToggle: () => void
  onRename: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  reorderDisabled: boolean
  onMoveUp?: () => void
  onMoveDown?: () => void
}

export function ProjectRow({ project, open, onToggle, onRename, onDelete, reorderDisabled, onMoveUp, onMoveDown }: ProjectRowProps) {
  const canTouch = useTouchCapable()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(project.name)
  const [menuOpen, setMenuOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [titleFocused, setTitleFocused] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const [actionsFocused, setActionsFocused] = useState(false)
  const actionsVisible = hovered || menuOpen || canTouch || titleFocused || actionsFocused
  const highlighted = hovered || menuOpen || titleFocused || actionsFocused
  const pendingRef = useRef(false)
  const dragged = useRef(false)

  useEffect(() => {
    if (!editing) return
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [editing])

  const restoreFocus = () => requestAnimationFrame(() =>
    rowRef.current?.querySelector<HTMLButtonElement>('button')?.focus())

  const beginRename = () => {
    if (pendingRef.current) return
    setDraft(project.name)
    setError('')
    setMenuOpen(false)
    setEditing(true)
  }

  const rename = async () => {
    if (pendingRef.current) return
    const name = draft.trim().replace(/\s+/g, ' ')
    if (!name) {
      setError('Enter a project name.')
      return
    }
    if (name === project.name) {
      setEditing(false)
      restoreFocus()
      return
    }
    pendingRef.current = true
    setPending(true)
    setError('')
    try {
      await onRename(project.id, name)
      setEditing(false)
      restoreFocus()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to rename the project. Try again.')
      requestAnimationFrame(() => inputRef.current?.focus())
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  const remove = async () => {
    if (pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    setError('')
    try {
      await onDelete(project.id)
      setDeleteOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete the project. Try again.')
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  return (
    <>
      <div
        ref={rowRef}
        data-project-row={project.id}
        draggable={!editing && !pending && !reorderDisabled}
        onDragStart={(event) => {
          if (editing || pending || reorderDisabled) { event.preventDefault(); return }
          dragged.current = true
          event.dataTransfer.clearData()
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData(projectDragType, project.id)
        }}
        onDragEnd={() => requestAnimationFrame(() => { dragged.current = false })}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        className={cn(
          'group/project relative flex h-9 min-w-0 items-center rounded-xl hover:bg-muted',
          sidebarRowFocusRing,
          highlighted && 'bg-muted',
        )}
      >
        <span aria-hidden="true" className="pointer-events-none absolute start-2.5 top-2.5 grid size-4 place-items-center text-muted-foreground [&_svg]:size-4">
          <Folder
            className={cn(
              'col-start-1 row-start-1 transition-opacity duration-150 ease-out motion-reduce:transition-none',
              open ? 'opacity-0' : 'opacity-100',
            )}
          />
          <FolderOpen
            className={cn(
              'col-start-1 row-start-1 transition-opacity duration-150 ease-out motion-reduce:transition-none',
              open ? 'opacity-100' : 'opacity-0',
            )}
          />
        </span>
        {editing ? (
          <form
            className="flex min-w-0 flex-1 items-center ps-9 pe-2.5"
            onSubmit={(event) => { event.preventDefault(); void rename() }}
          >
            <Input
              ref={inputRef}
              aria-label={`Rename ${project.name}`}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `project-${project.id}-error` : undefined}
              value={draft}
              onChange={(value) => { setDraft(value); setError('') }}
              onBlur={() => {
                if (pendingRef.current) return
                setEditing(false)
                setDraft(project.name)
                setError('')
              }}
              maxLength={80}
              autoComplete="off"
              disabled={pending}
              className="min-w-0 flex-1"
              classNames={{ field: sidebarRenameField, input: 'px-1 text-base sm:text-xs' }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) {
                  if (event.key === 'Enter') event.preventDefault()
                  return
                }
                if (event.key === 'Escape' && !pendingRef.current) {
                  event.preventDefault()
                  setEditing(false)
                  setError('')
                  restoreFocus()
                }
              }}
            />
          </form>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            data-sidebar-primary=""
            aria-controls={`project-${project.id}-conversations`}
            aria-describedby="project-reorder-hint"
            onClick={() => { if (!dragged.current) onToggle() }}
            onFocus={(event) => setTitleFocused(event.currentTarget.matches(':focus-visible'))}
            onBlur={() => setTitleFocused(false)}
            whileHover={undefined}
            whileTap={undefined}
            className="h-9 min-w-0 flex-1 justify-start rounded-xl ps-9 pe-2.5 font-normal outline-none hover:bg-transparent"
          >
            <SidebarTitle
              title={project.name}
              active={hovered || menuOpen || titleFocused || actionsFocused}
              actionsRef={actionsRef}
              actionsVisible={actionsVisible}
            />
          </Button>
        )}
        {!editing ? (
          <SidebarRowActions
            ref={actionsRef}
            visible={actionsVisible}
            highlighted={highlighted}
            onFocusCapture={(event) => setActionsFocused(event.target.matches(':focus-visible'))}
            onBlurCapture={(event) => {
              if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setActionsFocused(false)
            }}
          >
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger render={
              <button
                type="button"
                draggable={false}
                aria-label={`Actions for ${project.name}`}
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground',
                  sidebarFocusRing,
                )}
              />
            }>
              <MoreHorizontal aria-hidden="true" className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" sideOffset={6} className={sidebarMenuSurface}>
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={beginRename} className={sidebarMenuItem}>
                  <Pencil aria-hidden="true" />Rename project
                </DropdownMenuItem>
              </DropdownMenuGroup>
              {onMoveUp || onMoveDown ? (
                <>
                  <DropdownMenuSeparator className={sidebarMenuSeparator} />
                  <DropdownMenuGroup>
                    <DropdownMenuItem disabled={pending || reorderDisabled || !onMoveUp} onClick={onMoveUp} className={sidebarMenuItem}>
                      <ArrowUp aria-hidden="true" />Move up
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={pending || reorderDisabled || !onMoveDown} onClick={onMoveDown} className={sidebarMenuItem}>
                      <ArrowDown aria-hidden="true" />Move down
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </>
              ) : null}
              <DropdownMenuSeparator className={sidebarMenuSeparator} />
              <DropdownMenuGroup>
                <DropdownMenuItem variant="destructive" className={sidebarMenuItem} onClick={() => {
                  setMenuOpen(false)
                  setError('')
                  setDeleteOpen(true)
                }}>
                  <Trash2 aria-hidden="true" />Delete project
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          </SidebarRowActions>
        ) : null}
      </div>
      {error && !deleteOpen ? (
        <p id={`project-${project.id}-error`} role="alert" className="px-3 py-1 text-xs text-destructive">{error}</p>
      ) : null}
      <Dialog open={deleteOpen} onOpenChange={(next) => {
        if (pendingRef.current) return
        setDeleteOpen(next)
        if (!next) { setError(''); restoreFocus() }
      }}>
        <DialogContent showCloseButton={false} className="gap-3">
          <DialogHeader className="gap-1.5">
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription className="text-xs leading-5">
              Delete “{project.name}”? Its conversations will be kept and moved to Recents.
            </DialogDescription>
          </DialogHeader>
          {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
          <DialogFooter className="-mx-4 -mb-4 p-3">
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => {
              setDeleteOpen(false)
              setError('')
              restoreFocus()
            }}>Cancel</Button>
            <Button size="sm" disabled={pending} onClick={() => void remove()}>
              {pending ? 'Deleting…' : 'Delete project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
