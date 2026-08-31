import { Orbit, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link } from 'react-router'

import { AnimatedSidebarTrigger } from '@/components/motion/animated-sidebar'
import { useAnimatedSidebar } from '@/components/motion/animated-sidebar-context'
import { Tooltip } from '@/components/motion/tooltip'
import { SPRING_SIDEBAR } from '@/lib/ease'
import { cn } from '@/lib/utils'

export function SidebarBrandHeader() {
  const sidebar = useAnimatedSidebar()
  const expanded = sidebar.isMobile ? sidebar.openMobile : sidebar.open
  const [hovered, setHovered] = useState(false)
  const [focusVisible, setFocusVisible] = useState(false)
  const [suppressCollapsedHover, setSuppressCollapsedHover] = useState(false)
  const [closing, setClosing] = useState(false)
  const showToggle = (
    expanded || closing || focusVisible || (hovered && !suppressCollapsedHover)
  )
  const showWordmark = expanded
  const fadeTransition = sidebar.reduce
    ? { duration: 0 }
    : { duration: 0.14, ease: 'easeOut' as const }
  const wordmarkTransition = sidebar.reduce
    ? { duration: 0 }
    : showWordmark
      ? { duration: 0.16, delay: 0.12, ease: 'easeOut' as const }
      : { duration: 0.1, ease: 'easeOut' as const }
  const markTransition = sidebar.reduce
    ? { duration: 0 }
    : expanded
      ? { duration: 0.08, ease: 'easeOut' as const }
      : { duration: 0.14, ease: 'easeOut' as const }

  return (
    <div
      className="relative flex h-10 w-full min-w-0 items-center"
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') setHovered(true)
      }}
      onPointerLeave={() => {
        setHovered(false)
        setSuppressCollapsedHover(false)
      }}
    >
      <motion.span
        inert={!showWordmark}
        aria-hidden={!showWordmark || undefined}
        initial={false}
        animate={{ opacity: showWordmark ? 1 : 0 }}
        transition={wordmarkTransition}
        className="absolute inset-y-0 start-3.5 flex items-center whitespace-nowrap text-base font-semibold tracking-tight text-foreground"
      >
        <Link
          to="/"
          aria-label="myBot home"
          onClick={() => {
            if (sidebar.isMobile) sidebar.setOpenMobile(false)
          }}
          className="-mx-1 rounded-md px-1 py-1 outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2"
        >
          myBot
        </Link>
      </motion.span>
      <motion.span
        aria-hidden="true"
        initial={false}
        animate={{ opacity: !expanded && !showToggle ? 1 : 0 }}
        transition={markTransition}
        className="pointer-events-none absolute inset-y-0 start-0 grid size-11 place-items-center text-foreground"
      >
        <Orbit aria-hidden="true" className="size-5" strokeWidth={2} />
      </motion.span>
      <motion.div
        layout="position"
        transition={sidebar.reduce ? { duration: 0 } : SPRING_SIDEBAR}
        onLayoutAnimationComplete={() => {
          if (!expanded) setClosing(false)
        }}
        className={cn(
          'absolute inset-y-0 z-10 flex w-11 items-center justify-center',
          expanded ? '-end-0.5' : 'start-0',
        )}
      >
        <Tooltip
          content={expanded ? 'Close sidebar' : 'Open sidebar'}
          side={expanded ? 'bottom' : 'right'}
          wrapperClassName="items-center justify-center"
        >
          <AnimatedSidebarTrigger
            aria-label={expanded ? 'Close sidebar' : 'Open sidebar'}
            onClick={(event) => {
              if (!sidebar.isMobile && expanded) {
                event.preventDefault()
                setHovered(false)
                setSuppressCollapsedHover(true)
                if (!sidebar.reduce) setClosing(true)
                sidebar.setOpen(false)
                event.currentTarget.blur()
              }
            }}
            onFocus={(event) => {
              setFocusVisible(event.currentTarget.matches(':focus-visible'))
            }}
            onBlur={() => setFocusVisible(false)}
            onPointerDown={(event) => {
              if (event.pointerType !== 'touch') setFocusVisible(false)
            }}
            className={cn(
              'relative size-10 rounded-xl text-muted-foreground transition-[background-color,color,opacity] duration-150 ease-out hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:opacity-100 motion-reduce:transition-none',
              showToggle ? 'opacity-100' : 'opacity-0',
            )}
          >
            <motion.span
              aria-hidden="true"
              initial={false}
              animate={{ opacity: expanded ? 1 : 0 }}
              transition={fadeTransition}
              className="absolute inset-0 grid place-items-center"
            >
              <PanelLeftClose />
            </motion.span>
            <motion.span
              aria-hidden="true"
              initial={false}
              animate={{ opacity: expanded ? 0 : 1 }}
              transition={fadeTransition}
              className="absolute inset-0 grid place-items-center"
            >
              <PanelLeftOpen />
            </motion.span>
          </AnimatedSidebarTrigger>
        </Tooltip>
      </motion.div>
    </div>
  )
}
