import { portalIcons, type PortalNavItem } from "@/components/platform/provider/PortalShell";

export const adminNav: PortalNavItem[] = [
  { label: "Dashboard", href: "/admin", icon: portalIcons.dashboard, exact: true },
  { label: "Students", href: "/admin/students", icon: portalIcons.users },
  { label: "Affiliates", href: "/admin/affiliates", icon: portalIcons.referrals },
  { label: "Payout", href: "/admin/payout", icon: portalIcons.payment },
  { label: "Report", href: "/admin/reports", icon: portalIcons.reports },
  { label: "Webinars", href: "/admin/webinars", icon: portalIcons.webinars },
  { label: "Settings", href: "/admin/profile", icon: portalIcons.profile },
];
