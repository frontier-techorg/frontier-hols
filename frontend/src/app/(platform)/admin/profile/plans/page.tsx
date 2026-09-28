import { PortalGate } from "@/components/platform/provider/PortalGate";
import { AdminSettingsPage } from "@/components/platform/provider/admin/profile/AdminSettingsPage";

export default function AdminPlansSettingsRoute() {
  return (
    <PortalGate role="admin">
      <AdminSettingsPage section="plan" />
    </PortalGate>
  );
}
