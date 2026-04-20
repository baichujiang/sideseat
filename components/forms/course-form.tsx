"use client";

import { CourseIntent } from "@prisma/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FormMessage } from "@/components/forms/form-message";
import { courseSchema } from "@/lib/validators/course";

type CourseValues = z.infer<typeof courseSchema>;

const intentions = Object.values(CourseIntent);

export function CourseForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CourseValues>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      name: "",
      code: "",
      semesterLabel: "",
      location: "",
      schedule: "",
      intentions: [CourseIntent.STUDY_TOGETHER],
    },
  });

  const selectedIntentions = watch("intentions");

  const toggleIntention = (intention: CourseIntent) => {
    const next = selectedIntentions.includes(intention)
      ? selectedIntentions.filter((entry) => entry !== intention)
      : [...selectedIntentions, intention];

    setValue("intentions", next, { shouldValidate: true });
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerError("");
    const response = await fetch("/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const payload = await response.json();

    if (!response.ok) {
      setServerError(payload.error ?? "Unable to add course.");
      return;
    }

    router.push(`/courses/${payload.data.courseId}`);
    router.refresh();
  });

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,7rem)_1fr]">
        <div className="space-y-2">
          <label className="text-sm font-medium">Course code</label>
          <Input
            {...register("code")}
            autoCapitalize="characters"
            placeholder="IN2064"
          />
          <FormMessage message={errors.code?.message} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Course name</label>
          <Input {...register("name")} placeholder="Machine Learning" />
          <FormMessage message={errors.name?.message} />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Semester</label>
        <Input {...register("semesterLabel")} placeholder="WS 2026/27" />
        <FormMessage message={errors.semesterLabel?.message} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">Location</label>
          <Input {...register("location")} placeholder="MI HS 1" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Schedule</label>
          <Input {...register("schedule")} placeholder="Tue 14:00" />
        </div>
      </div>

      <div className="space-y-3 rounded-3xl border border-border bg-card p-4">
        <p className="text-sm font-medium">What are you open to in this course?</p>
        <div className="space-y-3">
          {intentions.map((intention) => (
            <Checkbox
              key={intention}
              checked={selectedIntentions.includes(intention)}
              onChange={() => toggleIntention(intention)}
              label={intention.toLowerCase().replaceAll("_", " ")}
            />
          ))}
        </div>
      </div>

      <FormMessage message={serverError || (errors.intentions?.message as string | undefined)} />

      <Button className="w-full" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Adding..." : "Add course"}
      </Button>
    </form>
  );
}
