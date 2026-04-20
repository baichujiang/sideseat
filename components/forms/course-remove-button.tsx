"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/forms/form-message";

export function CourseRemoveButton({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={async () => {
          setError("");
          setPending(true);
          const response = await fetch(`/api/courses/${courseId}`, { method: "DELETE" });
          const payload = await response.json().catch(() => ({}));
          setPending(false);

          if (!response.ok) {
            setError(
              typeof payload.error === "string" ? payload.error : "Could not remove this course.",
            );
            return;
          }

          router.push("/courses");
          router.refresh();
        }}
      >
        {pending ? "Removing..." : "Remove from my courses"}
      </Button>
      <FormMessage message={error} />
    </div>
  );
}
