import { redirect } from "next/navigation";

/** Legacy URL — profile setup is optional under Me; new signups land on /home. */
export default function OnboardingPage() {
  redirect("/home");
}
