"use client";

import { Check, Loader2, X } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";
import {
  forwardRef,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { EASE_OUT, SPRING_SWAP } from "@/lib/ease";
import { Button, type ButtonProps } from "./base";
import { cn } from '@/lib/utils';

export type ButtonState = "idle" | "loading" | "success" | "error";

export interface StatefulButtonProps extends Omit<ButtonProps, "children"> {
  state?: ButtonState;
  children: ReactNode;
  loadingText?: ReactNode;
  successText?: ReactNode;
  errorText?: ReactNode;
  icon?: ReactNode;
  loadingIcon?: ReactNode;
  loadingIconKey?: string;
  /** Allow a loading action such as Stop to remain interactive. */
  disableWhileLoading?: boolean;
  iconPosition?: 'start' | 'end';
  errorTone?: 'default' | 'destructive';
  contentClassName?: string;
}

const ROLL_BLUR = "blur(6px)";

const ICON_VARIANTS: Variants = {
  initial: { opacity: 0, width: 0, scale: 0.7, filter: ROLL_BLUR },
  animate: {
    opacity: 1,
    width: "1.5rem",
    scale: 1,
    filter: "blur(0px)",
    transition: SPRING_SWAP,
  },
  exit: {
    opacity: 0,
    width: 0,
    scale: 0.7,
    filter: ROLL_BLUR,
    transition: { duration: 0.16, ease: EASE_OUT },
  },
};

function IconSlot({
  keyId,
  children,
}: {
  keyId: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.span
      data-slot="stateful-icon"
      aria-hidden="true"
      variants={ICON_VARIANTS}
      initial={reduce ? { opacity: 0 } : "initial"}
      animate={reduce ? { opacity: 1 } : "animate"}
      exit={reduce ? { opacity: 0 } : "exit"}
      transition={reduce ? { duration: 0.15 } : undefined}
      className="relative inline-grid h-4 w-6 shrink-0 place-items-center overflow-hidden"
    >
      <AnimatePresence initial={false}>
        <motion.span
          key={keyId}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 3, scale: 0.8, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -3, scale: 0.8, filter: 'blur(4px)' }}
          transition={reduce ? { duration: 0.12 } : SPRING_SWAP}
          className="absolute inset-0 grid place-items-center"
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}

function TextSlot({ value, children }: { value: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const measureRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number>();

  useLayoutEffect(() => {
    const nextWidth = measureRef.current?.offsetWidth;
    if (nextWidth !== undefined) setWidth((current) => current === nextWidth ? current : nextWidth);
  }, [children]);

  return (
    <motion.span
      data-slot="stateful-label"
      initial={{ width: 0 }}
      animate={{ width: width ?? 'auto' }}
      exit={{ width: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.16, ease: EASE_OUT }}
      className="relative inline-block shrink-0 overflow-hidden whitespace-nowrap align-bottom"
    >
      <span ref={measureRef} aria-hidden className="invisible inline-block whitespace-nowrap">{children}</span>
      <span className="sr-only">{children}</span>
      <AnimatePresence initial={false}>
        <motion.span
          key={value}
          aria-hidden
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -3 }}
          transition={{ duration: 0.12, ease: EASE_OUT }}
          className="absolute left-0 top-0 inline-block whitespace-nowrap"
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}

export const StatefulButton = forwardRef<HTMLButtonElement, StatefulButtonProps>(
  function StatefulButton(
    {
      state = "idle",
      children,
      loadingText = "Loading",
      successText = "Done",
      errorText = "Try again",
      icon,
      loadingIcon,
      loadingIconKey = 'loading',
      disableWhileLoading = true,
      iconPosition = 'start',
      errorTone = 'default',
      contentClassName,
      className,
      disabled,
      ...rest
    },
    ref,
  ) {
    const isBusy = state === "loading";
    const stateText =
      state === "loading"
        ? loadingText
        : state === "success"
          ? successText
          : state === "error"
            ? errorText
            : children;
    const textKey = typeof stateText === "string" ? `${state}-${stateText}` : state;
    const hasText = stateText !== null && stateText !== undefined && stateText !== false && stateText !== '';
    const stateIcon = state === 'loading'
      ? loadingIcon ?? <Loader2 className="size-4 motion-safe:animate-spin" />
      : state === 'success' ? <Check className="size-4" />
      : state === 'error' ? <X className="size-4" /> : icon;

    return (
      <Button
        ref={ref}
        disabled={disabled || (isBusy && disableWhileLoading)}
        aria-busy={isBusy}
        whileHover={undefined}
        className={cn(className, isBusy && 'disabled:opacity-100', state === 'error' && errorTone === 'destructive' &&
          'border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive focus-visible:outline-destructive')}
        {...rest}
      >
        <span aria-live="polite" className={cn('relative inline-flex items-center justify-center overflow-hidden', iconPosition === 'end' && 'flex-row-reverse', contentClassName)}>
          <AnimatePresence initial={false}>
            {stateIcon ? (
              <IconSlot key="state-icon" keyId={state === 'loading' ? loadingIconKey : state}>
                {stateIcon}
              </IconSlot>
            ) : null}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {hasText ? <TextSlot key="state-label" value={textKey}>{stateText}</TextSlot> : null}
          </AnimatePresence>
        </span>
      </Button>
    );
  },
);
