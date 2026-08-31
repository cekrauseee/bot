"use client";

import { animate, useReducedMotion } from "motion/react";
import {
  type ComponentPropsWithRef,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  PreviewRail,
  type PreviewRailItem,
} from "@/components/motion/preview-rail";
import { cn } from "@/lib/utils";
import { TranscriptInteractionContext } from "../shared/transcript-interaction-context";
import { ScrollToBottomButton } from "./scroll-to-bottom-button";
import { createTurnSpacer } from "../../motion/turn-spacer";

const PREVIEW_TITLE_LENGTH = 56;
const PREVIEW_DESCRIPTION_LENGTH = 88;
type ScrollTransition = {
  duration: number;
  ease: readonly [number, number, number, number];
};
const DEFAULT_SCROLL: ScrollTransition = {
  duration: 0.2,
  ease: [0.2, 0.2, 0.8, 1],
};
const TURN_ANCHOR_SCROLL: ScrollTransition = {
  duration: 0.24,
  ease: [0.3, 0, 0.12, 1],
};

function truncateMessageText(text: string, limit: number) {
  if (text.length <= limit) return text;
  const excerpt = text.slice(0, limit);
  const boundary = excerpt.lastIndexOf(" ");
  return `${excerpt.slice(0, boundary > limit * 0.65 ? boundary : limit).trim()}…`;
}

function getMessageText(message: HTMLElement) {
  const surface =
    message.querySelector<HTMLElement>('[data-slot="message-bubble-content"]') ??
    message.querySelector<HTMLElement>('[data-slot="message-content"]') ??
    message;
  return (surface.textContent ?? "").replace(/\s+/g, " ").trim();
}

function getMessagePreview(
  message: HTMLElement,
  assistantResponse?: HTMLElement,
) {
  const text = getMessageText(message);
  if (!text) {
    return { label: "Message", description: undefined };
  }

  if (text.length <= PREVIEW_TITLE_LENGTH) {
    const responseText = assistantResponse
      ? getMessageText(assistantResponse)
      : "";
    return {
      label: text,
      description: responseText
        ? truncateMessageText(responseText, PREVIEW_DESCRIPTION_LENGTH)
        : undefined,
    };
  }

  const titleExcerpt = text.slice(0, PREVIEW_TITLE_LENGTH);
  const titleBoundary = titleExcerpt.lastIndexOf(" ");
  const titleEnd =
    titleBoundary > PREVIEW_TITLE_LENGTH * 0.65
      ? titleBoundary
      : PREVIEW_TITLE_LENGTH;
  const label = `${text.slice(0, titleEnd).trim()}…`;
  const responseText = assistantResponse
    ? getMessageText(assistantResponse)
    : text.slice(titleEnd).trim();
  return {
    label,
    description: responseText
      ? truncateMessageText(responseText, PREVIEW_DESCRIPTION_LENGTH)
      : undefined,
  };
}

export interface MessageScrollerProps extends ComponentPropsWithRef<"div"> {
  /** Keep streamed output pinned while the reader remains near the end. */
  followOutput?: boolean;
  /** Distance from the end that still counts as following the output. */
  followThreshold?: number;
  /** Animate explicit navigation and optional output following. */
  smooth?: boolean;
  /** Reports when the reader leaves or returns to the live edge. */
  onFollowChange?: (following: boolean) => void;
  onInitialPosition?: (viewport: HTMLElement) => void;
  /** A newly submitted user message to position at the top of this view. */
  anchorMessageKey?: string;
  /** Accessible label for the scrollable transcript. */
  label?: string;
  /** Marks the transcript as waiting for more streamed content. */
  busy?: boolean;
  /** Adds a compact rail for navigating between rendered Message rows. */
  navigation?: "rail";
  /** Accessible label for the optional message navigation rail. */
  navigationLabel?: string;
  viewportClassName?: string;
  contentClassName?: string;
  railClassName?: string;
  viewportRef?: Ref<HTMLElement>;
  viewportProps?: Omit<
    ComponentPropsWithRef<"section">,
    "children" | "className" | "ref"
  >;
  contentProps?: Omit<
    ComponentPropsWithRef<"div">,
    "children" | "className" | "ref"
  >;
}

export function MessageScroller({
  followOutput = true,
  followThreshold = 56,
  smooth = true,
  onFollowChange,
  onInitialPosition,
  anchorMessageKey,
  label = "Conversation",
  busy,
  navigation,
  navigationLabel = "Message navigation",
  viewportClassName,
  contentClassName,
  railClassName,
  viewportRef: externalViewportRef,
  viewportProps,
  contentProps,
  className,
  children,
  ...props
}: MessageScrollerProps) {
  const reduce = useReducedMotion() ?? false;
  const viewportRef = useRef<HTMLElement>(null);
  const initialPositionCallback = useRef(onInitialPosition);
  useLayoutEffect(() => { initialPositionCallback.current = onInitialPosition; }, [onInitialPosition]);
  const contentRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const turnSpacerRef = useRef<ReturnType<typeof createTurnSpacer> | null>(null);
  const anchorMessageKeyRef = useRef(anchorMessageKey);
  const followingRef = useRef(followOutput);
  const programmaticScrollRef = useRef(false);
  const readingDisclosureRef = useRef(false);
  const scrollAnimationRef = useRef<ReturnType<typeof animate> | null>(null);
  const frameRef = useRef<number | undefined>(undefined);
  const railFrameRef = useRef<number | undefined>(undefined);
  const railIdRef = useRef(new WeakMap<HTMLElement, string>());
  const railIdCounterRef = useRef(0);
  const railTargetsRef = useRef(new Map<string, HTMLElement>());
  const [railItems, setRailItems] = useState<PreviewRailItem[]>([]);
  const [activeRailId, setActiveRailId] = useState("");
  const [railOverflowing, setRailOverflowing] = useState(false);
  const [awayFromEnd, setAwayFromEnd] = useState(false);
  const {
    onScroll: onViewportScroll,
    onWheel: onViewportWheel,
    onTouchStart: onViewportTouchStart,
    onKeyDown: onViewportKeyDown,
    ...restViewportProps
  } = viewportProps ?? {};

  useImperativeHandle(externalViewportRef, () => viewportRef.current!, []);

  const setViewportRef = useCallback((node: HTMLElement | null) => {
    viewportRef.current = node;
  }, []);

  const setFollowing = useCallback(
    (next: boolean) => {
      if (followingRef.current === next) return;
      followingRef.current = next;
      onFollowChange?.(next);
    },
    [onFollowChange],
  );

  const updateActiveRailItem = useCallback(() => {
    if (navigation !== "rail") return;
    const viewport = viewportRef.current;
    const targets = [...railTargetsRef.current.entries()];
    if (!viewport || targets.length === 0) return;

    const viewportRect = viewport.getBoundingClientRect();
    if (viewport.scrollTop <= followThreshold) {
      const firstId = targets[0]?.[0] ?? "";
      setActiveRailId((current) => (current === firstId ? current : firstId));
      return;
    }

    const distanceFromEnd =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    if (distanceFromEnd <= followThreshold) {
      const lastId = targets.at(-1)?.[0] ?? "";
      setActiveRailId((current) => (current === lastId ? current : lastId));
      return;
    }

    const viewportCenter = viewportRect.top + viewportRect.height / 2;
    let nearestId = targets[0]?.[0] ?? "";
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const [id, element] of targets) {
      const rect = element.getBoundingClientRect();
      const messageCenter = rect.top + rect.height / 2;
      const distance = Math.abs(messageCenter - viewportCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestId = id;
      }
    }

    setActiveRailId((current) =>
      current === nearestId ? current : nearestId,
    );
  }, [followThreshold, navigation]);

  const syncRailItems = useCallback(() => {
    if (navigation !== "rail") return;
    const content = contentRef.current;
    const viewport = viewportRef.current;
    if (!content || !viewport) return;

    const messages = Array.from(
      content.querySelectorAll<HTMLElement>('[data-slot="message"]'),
    );
    const targets = new Map<string, HTMLElement>();
    const nextItems = messages.map((message, index) => {
      let id = railIdRef.current.get(message);
      if (!id) {
        railIdCounterRef.current += 1;
        id = `message-rail-${railIdCounterRef.current}`;
        railIdRef.current.set(message, id);
      }
      targets.set(id, message);
      const sender = message.dataset.from ?? "conversation";
      const assistantResponse =
        sender === "user"
          ? messages
              .slice(index + 1)
              .find((candidate) => candidate.dataset.from === "assistant")
          : undefined;
      const preview = getMessagePreview(message, assistantResponse);

      return {
        id,
        label: preview.label,
        description: preview.description,
        ariaLabel: `Go to ${sender} message ${index + 1} of ${messages.length}`,
      };
    });

    railTargetsRef.current = targets;
    setRailItems((current) => {
      const unchanged =
        current.length === nextItems.length &&
        current.every(
          (item, index) =>
            item.id === nextItems[index]?.id &&
            item.label === nextItems[index]?.label &&
            item.description === nextItems[index]?.description &&
            item.ariaLabel === nextItems[index]?.ariaLabel,
        );
      return unchanged ? current : nextItems;
    });
    setRailOverflowing(
      viewport.scrollHeight > viewport.clientHeight + 1 && messages.length > 1,
    );
  }, [navigation]);

  const scheduleRailSync = useCallback(() => {
    if (navigation !== "rail") return;
    if (railFrameRef.current) cancelAnimationFrame(railFrameRef.current);
    railFrameRef.current = requestAnimationFrame(() => {
      syncRailItems();
      updateActiveRailItem();
    });
  }, [navigation, syncRailItems, updateActiveRailItem]);

  const updateEndVisibility = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setAwayFromEnd(
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight > followThreshold,
    );
  }, [followThreshold]);

  const cancelScrollAnimation = useCallback(() => {
    scrollAnimationRef.current?.stop();
    scrollAnimationRef.current = null;
    programmaticScrollRef.current = false;
  }, []);

  const scrollViewportTo = useCallback((
    top: number,
    behavior: ScrollBehavior,
    transition: ScrollTransition = DEFAULT_SCROLL,
  ) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    cancelScrollAnimation();
    programmaticScrollRef.current = true;
    // Capture the destination once; content streamed during this jump cannot
    // extend the animation or turn it into automatic output following.
    const destination = Math.max(0, Math.min(top, viewport.scrollHeight - viewport.clientHeight));
    const writePosition = (position: number) => {
      if (typeof viewport.scrollTo === "function") {
        viewport.scrollTo({ top: position, behavior: "instant" });
      } else {
        viewport.scrollTop = position;
      }
    };
    const complete = () => {
      scrollAnimationRef.current = null;
      programmaticScrollRef.current = false;
      updateEndVisibility();
      updateActiveRailItem();
    };

    if (behavior !== "smooth" || Math.abs(destination - viewport.scrollTop) < 1) {
      writePosition(destination);
      complete();
      return;
    }

    scrollAnimationRef.current = animate(viewport.scrollTop, destination, {
      type: "tween",
      duration: transition.duration,
      ease: transition.ease,
      onUpdate: writePosition,
      onComplete: complete,
    });
  }, [cancelScrollAnimation, updateActiveRailItem, updateEndVisibility]);

  const scrollToEnd = useCallback((behavior: ScrollBehavior) => {
    const viewport = viewportRef.current;
    if (viewport) scrollViewportTo(viewport.scrollHeight, behavior);
  }, [scrollViewportTo]);

  const jumpToEnd = useCallback((keyboard: boolean) => {
    readingDisclosureRef.current = false;
    setFollowing(true);
    // Keep keyboard focus in the transcript when the control disappears.
    if (keyboard) viewportRef.current?.focus({ preventScroll: true });
    scrollToEnd(reduce || !smooth ? "instant" : "smooth");
  }, [reduce, scrollToEnd, setFollowing, smooth]);

  const handleScroll = useCallback(() => {
    turnSpacerRef.current?.onScroll(!programmaticScrollRef.current);
    updateEndVisibility();
    const viewport = viewportRef.current;
    if (!viewport || programmaticScrollRef.current || readingDisclosureRef.current) return;

    const distance =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    setFollowing(distance <= followThreshold);
    updateActiveRailItem();
  }, [followThreshold, setFollowing, updateActiveRailItem, updateEndVisibility]);

  const leaveLiveEdge = useCallback(() => {
    readingDisclosureRef.current = false;
    cancelScrollAnimation();
  }, [cancelScrollAnimation]);

  const pauseForDisclosure = useCallback(() => {
    readingDisclosureRef.current = true;
    setFollowing(false);
    cancelScrollAnimation();
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = undefined;
      if (viewportRef.current) initialPositionCallback.current?.(viewportRef.current);
    }
  }, [cancelScrollAnimation, setFollowing]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    const spacer = spacerRef.current;
    if (!viewport || !content || !spacer) return;
    const turnSpacer = createTurnSpacer(viewport, content, spacer);
    turnSpacerRef.current = turnSpacer;
    // Position newly opened history once, independently of live-output following.
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = undefined;
      const target = turnSpacer.start(anchorMessageKeyRef.current);
      if (target === null) scrollToEnd("auto");
      else scrollViewportTo(target, "instant");
      initialPositionCallback.current?.(viewport);
    });
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = undefined;
      turnSpacer.dispose();
      turnSpacerRef.current = null;
    };
  }, [scrollToEnd, scrollViewportTo]);

  useLayoutEffect(() => {
    anchorMessageKeyRef.current = anchorMessageKey;
    // The initial positioning pass also reveals history, so it owns first mount.
    if (frameRef.current !== undefined) return;
    const target = turnSpacerRef.current?.start(anchorMessageKey);
    if (target === undefined || target === null) return;
    readingDisclosureRef.current = false;
    setFollowing(false);
    scrollViewportTo(
      target,
      reduce || !smooth ? "instant" : "smooth",
      TURN_ANCHOR_SCROLL,
    );
  }, [anchorMessageKey, reduce, scrollViewportTo, setFollowing, smooth]);

  useEffect(() => {
    const content = contentRef.current;
    const viewport = viewportRef.current;
    if (!content || !viewport || typeof ResizeObserver === "undefined") return;
    let observedHeight = content.scrollHeight;
    let observedViewportHeight = viewport.clientHeight;

    const observer = new ResizeObserver(() => {
      turnSpacerRef.current?.resize();
      scheduleRailSync();
      const nextHeight = content.scrollHeight;
      const nextViewportHeight = viewport.clientHeight;
      const geometryChanged = nextHeight !== observedHeight || nextViewportHeight !== observedViewportHeight;
      observedHeight = nextHeight;
      observedViewportHeight = nextViewportHeight;
      // ResizeObserver reports once when observation starts. The layout effect
      // already owns that initial jump to the live edge.
      if (geometryChanged && followOutput && followingRef.current) {
        scrollToEnd(reduce || !smooth ? "auto" : "smooth");
      }
      updateEndVisibility();
    });
    // The spacer changes the outer content height. Observe the message group
    // itself so consuming space does not feed back into this ResizeObserver.
    observer.observe(content.querySelector('[data-slot="message-group"]') ?? content);
    observer.observe(viewport);

    return () => observer.disconnect();
  }, [followOutput, reduce, scheduleRailSync, scrollToEnd, smooth, updateEndVisibility]);

  useEffect(() => {
    if (navigation !== "rail") {
      railTargetsRef.current.clear();
      return;
    }

    const content = contentRef.current;
    const viewport = viewportRef.current;
    if (!content || !viewport) return;

    scheduleRailSync();
    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(scheduleRailSync);
    mutationObserver?.observe(content, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleRailSync);
    resizeObserver?.observe(content);
    resizeObserver?.observe(viewport);

    return () => {
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
    };
  }, [navigation, scheduleRailSync]);

  useEffect(
    () => () => {
      scrollAnimationRef.current?.stop();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (railFrameRef.current) cancelAnimationFrame(railFrameRef.current);
    },
    [],
  );

  const scrollToRailItem = useCallback(
    (item: PreviewRailItem) => {
      const viewport = viewportRef.current;
      const target = railTargetsRef.current.get(item.id);
      if (!viewport || !target) return;

      const lastItem = railItems.at(-1)?.id === item.id;
      readingDisclosureRef.current = false;
      setActiveRailId(item.id);
      if (lastItem) {
        setFollowing(true);
        scrollToEnd(reduce || !smooth ? "auto" : "smooth");
        return;
      }

      setFollowing(false);
      const viewportRect = viewport.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const top =
        viewport.scrollTop +
        targetRect.top -
        viewportRect.top -
        (viewport.clientHeight - targetRect.height) / 2;
      scrollViewportTo(top, reduce || !smooth ? "instant" : "smooth");
    },
    [railItems, reduce, scrollToEnd, scrollViewportTo, setFollowing, smooth],
  );

  const viewport = (
    <section
      ref={setViewportRef}
      aria-label={label}
      tabIndex={0}
      {...restViewportProps}
      onScroll={(event) => {
        handleScroll();
        onViewportScroll?.(event);
      }}
      onWheel={(event) => {
        leaveLiveEdge();
        onViewportWheel?.(event);
      }}
      onTouchStart={(event) => {
        leaveLiveEdge();
        onViewportTouchStart?.(event);
      }}
      onKeyDown={(event) => {
        if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
          leaveLiveEdge();
        }
        onViewportKeyDown?.(event);
      }}
      className={cn(
        "h-full overflow-y-auto overscroll-none outline-none [overflow-anchor:none] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        navigation === "rail"
          ? "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : "[scrollbar-gutter:stable]",
        viewportClassName,
      )}
    >
      <div
        ref={contentRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-busy={busy}
        className={contentClassName}
        {...contentProps}
      >
        <TranscriptInteractionContext value={pauseForDisclosure}>
          {children}
        </TranscriptInteractionContext>
        <div ref={spacerRef} data-slot="turn-spacer" aria-hidden="true" className="pointer-events-none shrink-0" />
      </div>
    </section>
  );

  return (
    <div
      data-slot="message-scroller"
      className={cn("relative min-h-0", className)}
      {...props}
    >
      {navigation === "rail" ? (
        <PreviewRail
          items={railOverflowing ? railItems : []}
          label={navigationLabel}
          activeId={activeRailId}
          onItemSelect={scrollToRailItem}
          previewSide="before"
          highlightActive
          itemSize={14}
          className="h-full min-h-0 overflow-hidden"
          previewContainerClassName="right-8 left-3"
          previewClassName="mr-1 w-64 max-w-full [&_[data-slot=preview-rail-card]]:h-20 [&_[data-slot=preview-rail-card]]:overflow-hidden [&_[data-slot=preview-rail-card]]:p-3 [&_[data-slot=preview-rail-title]]:line-clamp-1 [&_[data-slot=preview-rail-title]]:text-xs [&_[data-slot=preview-rail-title]]:leading-4 [&_[data-slot=preview-rail-description]]:line-clamp-2 [&_[data-slot=preview-rail-description]]:text-xs [&_[data-slot=preview-rail-description]]:leading-4"
          railClassName={cn(
            "absolute inset-y-3 right-1 w-7 content-center py-1 max-sm:hidden [&_[data-slot=preview-rail-item]]:w-7 [&_[data-slot=preview-rail-item]]:justify-end [&_[data-slot=preview-rail-tick]]:h-px [&_[data-slot=preview-rail-tick]]:w-4 [&_[data-slot=preview-rail-tick]]:origin-right",
            railOverflowing
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0",
            railClassName,
          )}
        >
          {viewport}
        </PreviewRail>
      ) : (
        viewport
      )}
      <ScrollToBottomButton visible={awayFromEnd} busy={busy} onClick={jumpToEnd} />
    </div>
  );
}
