import Link from "next/link";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  return (
    <Card className="space-y-4 border-border/90 bg-card/95 shadow-soft">
      <CardTitle>Forgot password</CardTitle>
      <CardDescription className="leading-relaxed">
        Email-based password reset isn&apos;t live yet. Contact support or create a new account.
      </CardDescription>
      <Link
        className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
        href="/login"
      >
        Back to login
      </Link>
    </Card>
  );
}
