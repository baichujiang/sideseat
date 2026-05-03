import { prisma } from "@/lib/db/prisma";

const COURSE_CODE = "IN2064";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000);

async function main() {
  const course = await prisma.course.findFirst({
    where: { code: COURSE_CODE },
  });
  if (!course) {
    throw new Error(`Course with code ${COURSE_CODE} not found. Did you run prisma db seed?`);
  }

  const members = await prisma.userCourse.findMany({
    where: { courseId: course.id },
    include: { user: true },
  });
  if (!members.length) {
    throw new Error(`No enrolled members for ${COURSE_CODE}.`);
  }

  const byUsername = new Map(members.map((m) => [m.user.username, m.user]));
  const pick = (u: string) => byUsername.get(u);

  const lucas = pick("lucas");
  const amira = pick("amira");
  const jonas = pick("jonas");
  const nina = pick("nina");
  const sofia = pick("sofia");
  const kai = pick("kai");
  const lena = pick("lena");
  const marco = pick("marco");

  const rows: Array<{ senderId: string; body: string; minutesAgo: number }> = [];
  if (lucas) {
    rows.push({
      senderId: lucas.id,
      body: "Did anyone manage to finish problem set 4? Stuck on question 3 (d).",
      minutesAgo: 55,
    });
  }
  if (amira) {
    rows.push({
      senderId: amira.id,
      body: "Same — the KKT conditions don't line up with the slides, let me know if you figure it out.",
      minutesAgo: 52,
    });
  }
  if (jonas) {
    rows.push({
      senderId: jonas.id,
      body: "I think slide 23 has a typo. The professor fixed it in office hours last week.",
      minutesAgo: 48,
    });
  }
  if (nina) {
    rows.push({
      senderId: nina.id,
      body: "Study group tomorrow 18:00 at the library top floor — open to anyone.",
      minutesAgo: 40,
    });
  }
  if (sofia) {
    rows.push({
      senderId: sofia.id,
      body: "I can bring coffee if we meet in the main hall instead.",
      minutesAgo: 34,
    });
  }
  if (kai) {
    rows.push({
      senderId: kai.id,
      body: "Can someone share the notes from last Friday? I missed the tutorial.",
      minutesAgo: 28,
    });
  }
  if (lena) {
    rows.push({
      senderId: lena.id,
      body: "Uploaded mine to the shared drive — link in the pinned message wishlist.",
      minutesAgo: 20,
    });
  }
  if (marco) {
    rows.push({
      senderId: marco.id,
      body: "New to the group — hi everyone, looking forward to studying together.",
      minutesAgo: 12,
    });
  }
  if (jonas) {
    rows.push({
      senderId: jonas.id,
      body: "Welcome Marco! Feel free to jump into any of the subgroups.",
      minutesAgo: 6,
    });
  }

  if (!rows.length) {
    throw new Error("No known test users found in this course. Run seed first.");
  }

  await prisma.courseRoomMessage.createMany({
    data: rows.map((r) => ({
      courseId: course.id,
      senderId: r.senderId,
      body: r.body,
      createdAt: minutesAgo(r.minutesAgo),
    })),
  });

  console.log(`Inserted ${rows.length} messages into ${course.name} (${COURSE_CODE}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
