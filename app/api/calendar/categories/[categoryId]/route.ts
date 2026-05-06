import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { calendarCategoryPatchSchema } from "@/lib/validators/calendar";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ categoryId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { categoryId } = await params;
    const body = await parseJson(request, calendarCategoryPatchSchema);
    if (body.name === undefined && body.color === undefined) {
      return error("Nothing to update.");
    }

    const existing = await prisma.userCalendarCategory.findFirst({
      where: { id: categoryId, userId: user.id },
      select: { id: true },
    });
    if (!existing) {
      return error("Category not found.", 404);
    }

    const row = await prisma.userCalendarCategory.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
      },
      select: {
        id: true,
        name: true,
        color: true,
        sortOrder: true,
        presetKey: true,
      },
    });
    return ok(row);
  } catch (cause) {
    console.error(cause);
    return error("Could not update category.");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ categoryId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { categoryId } = await params;

    const existing = await prisma.userCalendarCategory.findFirst({
      where: { id: categoryId, userId: user.id },
      select: { id: true, presetKey: true },
    });
    if (!existing) {
      return error("Category not found.", 404);
    }
    if (existing.presetKey) {
      return error("Built-in categories cannot be deleted. You can rename or change their color.");
    }

    await prisma.userCalendarCategory.delete({
      where: { id: existing.id },
    });
    return ok({ ok: true });
  } catch (cause) {
    console.error(cause);
    return error("Could not delete category.");
  }
}
