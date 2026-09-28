"use client";

import { createContext, useContext } from "react";
import type { PortalTheme } from "@/components/platform/provider/portal-theme";
import {
  getPortalThemeMemory,
  setPortalThemeMemory,
} from "@/components/platform/provider/portal-theme-store";

const PortalThemeContext = createContext<PortalTheme>("light");

export function PortalThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: PortalTheme;
  children: React.ReactNode;
}) {
  // Seed once from the cookie/SSR theme so hydration matches first paint.
  if (getPortalThemeMemory() === null) {
    setPortalThemeMemory(initialTheme);
  }

  return (
    <PortalThemeContext.Provider value={initialTheme}>{children}</PortalThemeContext.Provider>
  );
}

/** Cookie/SSR theme so PortalShell first paint matches light mode on refresh. */
export function useServerPortalTheme(): PortalTheme {
  return useContext(PortalThemeContext);
}
