import { portalIcons, type PortalNavItem } from "@/components/platform/provider/PortalShell";

export const affiliateNav: PortalNavItem[] = [
  { label: "Dashboard", href: "/affiliate", icon: portalIcons.dashboard, exact: true },
  { label: "Customers", href: "/affiliate/customers", icon: portalIcons.referrals },
  { label: "Payout", href: "/affiliate/payout", icon: portalIcons.payment },
  { label: "Profile", href: "/affiliate/profile", icon: portalIcons.profile },
];
