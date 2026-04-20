import { StudentVerificationStatus } from "@prisma/client";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { StatusBadge } from "@/components/ui/status-badge";

function tone(status: StudentVerificationStatus) {
  if (status === StudentVerificationStatus.VERIFIED) return "calm";
  if (status === StudentVerificationStatus.EMAIL_PENDING) return "warm";
  if (status === StudentVerificationStatus.MANUAL_REVIEW_REQUIRED) return "danger";
  if (status === StudentVerificationStatus.REJECTED) return "danger";
  return "neutral";
}

function copy(status: StudentVerificationStatus) {
  if (status === StudentVerificationStatus.VERIFIED) {
    return {
      title: "Student status verified",
      description: "You can discover classmates and send invitations normally.",
    };
  }

  if (status === StudentVerificationStatus.EMAIL_PENDING) {
    return {
      title: "School email verification pending",
      description:
        "Confirm your school email before sending invitations. If email delivery is not configured yet, a local fallback link can still be used during development.",
    };
  }

  if (status === StudentVerificationStatus.MANUAL_REVIEW_REQUIRED) {
    return {
      title: "Manual student review required",
      description:
        "A public or unclear email domain was submitted. An admin needs to review your student status before invitations unlock.",
    };
  }

  if (status === StudentVerificationStatus.REJECTED) {
    return {
      title: "Student verification was rejected",
      description:
        "Update your school email or contact an admin reviewer before trying again.",
    };
  }

  return {
    title: "Verify your student status",
    description:
      "You can browse the app now, but invitations unlock only after student verification.",
  };
}

export function StudentVerificationBanner({
  status,
  compact = false,
}: {
  status: StudentVerificationStatus;
  compact?: boolean;
}) {
  const content = copy(status);

  return (
    <Card className={compact ? "space-y-3" : "space-y-4 border-[#e7decd] bg-[#fbf7ef]"}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>{content.title}</CardTitle>
          <CardDescription>{content.description}</CardDescription>
        </div>
        <StatusBadge tone={tone(status)}>
          {status.toLowerCase().replaceAll("_", " ")}
        </StatusBadge>
      </div>

      {status !== StudentVerificationStatus.VERIFIED ? (
        <LinkButton className="w-full" href="/profile" variant="outline">
          Verify in profile
        </LinkButton>
      ) : null}
    </Card>
  );
}
