import { requireOnboardedUser } from "@/lib/auth/guards";
import { ensureUserCalendarCategories } from "@/lib/calendar/default-user-calendar-categories";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { calendarCategoryCreateSchema } from "@/lib/validators/calendar";

export async function GET() {
  try {
    const user = await requireOnboardedUser();
    await ensureUserCalendarCategories(prisma, user.id);
    const rows = await prisma.userCalendarCategory.findMany({
      where: { userId: user.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        color: true,
        sortOrder: true,
        presetKey: true,
      },
    });
    return ok(rows);
  } catch (cause) {
    console.error(cause);
    return error("Could not load calendar categories.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const body = await parseJson(request, calendarCategoryCreateSchema);
    const last = await prisma.userCalendarCategory.findFirst({
      where: { userId: user.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const sortOrder = (last?.sortOrder ?? -1) + 1;
    const row = await prisma.userCalendarCategory.create({
      data: {
        userId: user.id,
        name: body.name,
        color: body.color,
        sortOrder,
        presetKey: null,
      },
      select: {
        id: true,
        name: true,
        color: true,
        sortOrder: true,
        presetKey: true,
      },
    });
    return ok(row, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Could not create calendar category.");
  }
}
