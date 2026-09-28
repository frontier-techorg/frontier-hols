import { redirect } from "next/navigation";

/** Orders now live on the profile page. */
export default function StudentOrdersRoute() {
  redirect("/student/profile/orders");
}
