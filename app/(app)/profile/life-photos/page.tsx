import { redirect } from "next/navigation";

/** Life photos are edited inline on the Me tab; keep route as a stable redirect. */
export default function ProfileLifePhotosPage() {
  redirect("/profile");
}
