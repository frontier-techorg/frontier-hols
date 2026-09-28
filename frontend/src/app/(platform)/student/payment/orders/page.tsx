import { redirect } from "next/navigation";

/** Legacy payment orders URL */
export default function StudentPaymentOrdersRoute() {
  redirect("/student/profile/orders");
}
