import { redirect } from "next/navigation";

/** Legacy URL; all editing is under `/profile`. */
export default function ProfileEditRedirectPage() {
  redirect("/profile");
}
