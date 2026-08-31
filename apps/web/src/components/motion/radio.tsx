"use client";
// beui.dev/components/motion/radio

import { motion, MotionConfig, useReducedMotion } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { SPRING_LAYOUT, SPRING_PRESS } from "@/lib/ease";
import { cn } from "@/lib/utils";
import { radioTargetIndex } from "./radio-keyboard";

type RadioCtx = {
  value: string;
  setValue: (value: string) => void;
  tabStopValue: string;
  setTabStopValue: (value: string) => void;
  layoutId: string;
};

const RadioCtx = createContext<RadioCtx | null>(null);

function useRadioGroup() {
  const ctx = useContext(RadioCtx);
  if (!ctx) {
    throw new Error("RadioGroupItem must be used inside <RadioGroup>");
  }
  return ctx;
}

export interface RadioGroupProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
  orientation?: "vertical" | "horizontal";
}

export function RadioGroup({
  value,
  defaultValue = "",
  onValueChange,
  children,
  className,
  orientation = "vertical",
}: RadioGroupProps) {
  const [internal, setInternal] = useState(defaultValue);
  const layoutId = useId();
  const groupRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const controlled = value !== undefined;
  const current = controlled ? value : internal;
  const [tabStopValue, setTabStopValue] = useState(current);
  const setValue = useCallback(
    (next: string) => {
      if (!controlled) setInternal(next);
      onValueChange?.(next);
    },
    [controlled, onValueChange],
  );
  const contextValue = useMemo(
    () => ({ value: current, setValue, tabStopValue, setTabStopValue, layoutId }),
    [current, layoutId, setValue, tabStopValue],
  );

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const items = enabledRadioItems(group);
    const selected = items.find((item) => item.getAttribute("aria-checked") === "true");
    const nextTabStop = selected?.dataset.radioValue ?? items[0]?.dataset.radioValue ?? "";
    setTabStopValue((previous) => previous === nextTabStop ? previous : nextTabStop);
  }, [children, current]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = enabledRadioItems(event.currentTarget);
    const origin = event.target as HTMLElement;
    const currentItem = origin.closest<HTMLButtonElement>('button[role="radio"]');
    const currentIndex = currentItem ? items.indexOf(currentItem) : -1;
    const targetIndex = radioTargetIndex(event.key, currentIndex, items.length);
    if (targetIndex === undefined) return;

    event.preventDefault();
    const target = items[targetIndex];
    const targetValue = target.dataset.radioValue;
    if (targetValue) setTabStopValue(targetValue);
    target.focus();
    target.click();
  };

  return (
    <MotionConfig transition={reduce ? { duration: 0 } : SPRING_LAYOUT}>
      <RadioCtx.Provider value={contextValue}>
        <div
          ref={groupRef}
          role="radiogroup"
          aria-orientation={orientation}
          onKeyDown={handleKeyDown}
          className={cn(
            "flex gap-3",
            orientation === "vertical" ? "flex-col" : "flex-row flex-wrap",
            className,
          )}
        >
          {children}
        </div>
      </RadioCtx.Provider>
    </MotionConfig>
  );
}

export interface RadioGroupItemProps {
  value: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-describedby"?: string;
}

const enabledRadioItems = (group: HTMLElement) =>
  Array.from(
    group.querySelectorAll<HTMLButtonElement>('button[role="radio"]:not(:disabled)'),
  ).filter((item) => item.closest('[role="radiogroup"]') === group);

export function RadioGroupItem({
  value,
  label,
  disabled,
  className,
  id: idProp,
  "aria-describedby": ariaDescribedBy,
}: RadioGroupItemProps) {
  const {
    value: groupValue,
    setValue,
    tabStopValue,
    setTabStopValue,
    layoutId,
  } = useRadioGroup();
  const autoId = useId();
  const id = idProp ?? autoId;
  const reduce = useReducedMotion();
  const selected = groupValue === value;

  return (
    <label
      htmlFor={id}
      className={cn(
        "inline-flex items-center gap-3",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        className,
      )}
    >
      <motion.button
        id={id}
        type="button"
        role="radio"
        aria-checked={selected}
        aria-describedby={ariaDescribedBy}
        tabIndex={disabled ? -1 : tabStopValue === value ? 0 : -1}
        data-radio-value={value}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setTabStopValue(value);
          setValue(value);
        }}
        whileTap={reduce || disabled ? undefined : { scale: 0.92 }}
        transition={SPRING_PRESS}
        data-state={selected ? "checked" : "unchecked"}
        className={cn(
          "relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 outline-none transition-colors duration-200",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-60",
          selected
            ? "border-primary"
            : "border-muted-foreground/50 hover:border-muted-foreground",
        )}
      >
        {selected ? (
          <motion.span
            layoutId={layoutId}
            className="absolute inset-1 rounded-full bg-primary"
            transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
          />
        ) : null}
      </motion.button>
      {label ? (
        <span className={cn("select-none text-sm text-foreground", disabled && "opacity-60")}>
          {label}
        </span>
      ) : null}
    </label>
  );
}
