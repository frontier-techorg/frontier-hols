import { PortalGate } from "@/components/platform/provider/PortalGate";
import { StudentOrderInvoicePage } from "@/components/platform/provider/student/payment/StudentOrderInvoicePage";

export default async function StudentOrderInvoiceRoute({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return (
    <PortalGate role="student">
      <StudentOrderInvoicePage orderId={decodeURIComponent(orderId)} />
    </PortalGate>
  );
}
