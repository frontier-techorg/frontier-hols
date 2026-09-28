import { redirect } from "next/navigation";

/** Legacy payment URL — membership plans now live on the profile page. */
export default function StudentPaymentRoute() {
  redirect("/student/plans");
}
