import { createContext, useContext } from "react";

export type AnimatedSidebarContextValue = {
  isMobile: boolean;
  layoutId: string;
  open: boolean;
  openMobile: boolean;
  reduce: boolean;
  setOpen: (open: boolean) => void;
  setOpenMobile: (open: boolean) => void;
  state: "expanded" | "collapsed";
  toggleSidebar: () => void;
  trigger: HTMLButtonElement | null;
  registerTrigger: (node: HTMLButtonElement | null) => void;
};

export const AnimatedSidebarContext =
  createContext<AnimatedSidebarContextValue | null>(null);

export function useAnimatedSidebar() {
  const context = useContext(AnimatedSidebarContext);
  if (!context) {
    throw new Error(
      "useAnimatedSidebar must be used inside AnimatedSidebarProvider.",
    );
  }
  return context;
}
