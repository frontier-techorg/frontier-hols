import type { SidebarIconName } from "@/components/platform/provider/sidebar-icons";

export type SettingsSection = "profile" | "plan" | "order";

export type SettingsNavItem = {
  id: SettingsSection;
  href: string;
  label: string;
  shortLabel: string;
  icon: SidebarIconName;
  exact?: boolean;
};

export const SETTINGS_NAV: readonly SettingsNavItem[] = [
  {
    id: "profile",
    href: "/student/profile",
    label: "Profile",
    shortLabel: "Profile",
    icon: "profile",
    exact: true,
  },
  {
    id: "plan",
    href: "/student/profile/plans",
    label: "Plan",
    shortLabel: "Plan",
    icon: "plans",
  },
  {
    id: "order",
    href: "/student/profile/orders",
    label: "Orders",
    shortLabel: "Orders",
    icon: "orders",
  },
];
