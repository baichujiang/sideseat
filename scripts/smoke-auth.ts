import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const appUrl = process.env.SMOKE_APP_URL ?? "http://127.0.0.1:3001";
const email = process.env.SMOKE_EMAIL ?? "lin@example.com";
const password = process.env.SMOKE_PASSWORD ?? "Password123";

function extractCookie(response: Response) {
  const cookie = response.headers.get("set-cookie");

  if (!cookie) {
    throw new Error("Login response did not return a session cookie.");
  }

  return cookie.split(";")[0];
}

async function expectPage(path: string, cookie: string, expectedText: string) {
  const response = await fetch(`${appUrl}${path}`, {
    headers: {
      Cookie: cookie,
    },
    redirect: "manual",
  });

  const body = await response.text();

  if (response.status !== 200) {
    throw new Error(`Expected ${path} to return 200, got ${response.status}.`);
  }

  if (!body.includes(expectedText)) {
    throw new Error(`Expected ${path} to include "${expectedText}".`);
  }

  console.log(`PASS ${path} -> 200 and found "${expectedText}"`);
}

async function main() {
  const loginResponse = await fetch(`${appUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ identifier: email, password }),
    redirect: "manual",
  });

  if (loginResponse.status !== 200) {
    const body = await loginResponse.text();
    throw new Error(`Login failed with ${loginResponse.status}: ${body}`);
  }

  const cookie = extractCookie(loginResponse);
  const connection = await prisma.connection.findFirst({
    where: {
      status: "ACTIVE",
      OR: [
        { userA: { email } },
        { userB: { email } },
      ],
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!connection) {
    throw new Error(`No active connection found for ${email}.`);
  }

  await expectPage("/home", cookie, "Welcome back");
  await expectPage("/courses", cookie, "My courses");
  await expectPage("/discover", cookie, "Discover people in your circle");
  await expectPage("/inbox", cookie, "Inbox");
  await expectPage("/reports", cookie, "My reports");
  await expectPage(`/connections/${connection.id}`, cookie, "Conversation");
  await expectPage("/admin/reports", cookie, "Moderation queue");

  console.log("Smoke test passed for authenticated core paths.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
