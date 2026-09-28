import type { SidebarIconName } from "@/components/platform/provider/sidebar-icons";

export type AdminSettingsSection = "profile" | "plan" | "payout";

export type AdminSettingsNavItem = {
  id: AdminSettingsSection;
  href: string;
  label: string;
  shortLabel: string;
  icon: SidebarIconName;
  exact?: boolean;
};

export const ADMIN_SETTINGS_NAV: readonly AdminSettingsNavItem[] = [
  {
    id: "profile",
    href: "/admin/profile",
    label: "Profile information",
    shortLabel: "Profile",
    icon: "profile",
    exact: true,
  },
  {
    id: "plan",
    href: "/admin/profile/plans",
    label: "Plan",
    shortLabel: "Plan",
    icon: "plans",
  },
  {
    id: "payout",
    href: "/admin/profile/payout",
    label: "Payout hold",
    shortLabel: "Payout",
    icon: "lock",
  },
];
