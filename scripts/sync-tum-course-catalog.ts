import { syncTumCourseCatalog } from "../lib/courses/tum-catalog-sync";
import { prisma } from "../lib/db/prisma";

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

async function main() {
  const result = await syncTumCourseCatalog({
    semesterLabel: argumentValue("--semester-label"),
    semesterKey: argumentValue("--semester-key"),
    trigger: "MANUAL",
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((cause) => {
    console.error(cause);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
