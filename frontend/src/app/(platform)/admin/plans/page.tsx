import { redirect } from "next/navigation";

/** Plans now live in admin settings. */
export default function AdminPlansRoute() {
  redirect("/admin/profile/plans");
}
