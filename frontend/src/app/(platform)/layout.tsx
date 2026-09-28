import type { PortalTheme } from "@/components/platform/provider/portal-theme";
import { PortalThemeProvider } from "@/components/platform/provider/PortalThemeProvider";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const initialTheme: PortalTheme = "light";

  return <PortalThemeProvider initialTheme={initialTheme}>{children}</PortalThemeProvider>;
}
