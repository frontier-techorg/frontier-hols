import {
  PORTAL_THEME_CHANGE_EVENT,
  PORTAL_THEME_KEY,
  type PortalTheme,
} from "@/components/platform/provider/portal-theme";

/** Portals are light-only — memory kept for soft navigations / existing subscribers. */
let portalThemeMemory: PortalTheme | null = "light";

export function getPortalThemeMemory() {
  return portalThemeMemory;
}

export function setPortalThemeMemory(_theme: PortalTheme | null) {
  portalThemeMemory = "light";
}

export function readStoredPortalTheme(): PortalTheme {
  return "light";
}

export function subscribePortalTheme(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(PORTAL_THEME_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(PORTAL_THEME_CHANGE_EVENT, onStoreChange);
  };
}

export function getPortalThemeSnapshot(): PortalTheme {
  return "light";
}

/** Dark mode removed — always persist light. */
export function writePortalTheme(_next?: PortalTheme) {
  portalThemeMemory = "light";
  try {
    localStorage.setItem(PORTAL_THEME_KEY, "light");
  } catch {
    // Ignore storage write errors.
  }
  try {
    document.documentElement.setAttribute("data-portal-theme", "light");
    document.cookie = `${PORTAL_THEME_KEY}=light; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // Ignore document write errors.
  }
  window.dispatchEvent(new Event(PORTAL_THEME_CHANGE_EVENT));
}
