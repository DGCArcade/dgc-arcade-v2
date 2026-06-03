import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const username = process.argv[2];
const password = process.argv[3];

if (!username || !password) {
  console.error("Usage: pnpm --filter @workspace/scripts run create-admin <username> <password>");
  process.exit(1);
}

async function main() {
  const existing = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(usersTable)
      .set({ role: "admin" })
      .where(eq(usersTable.username, username))
      .returning();
    console.log(`✅ Promoted existing user '${updated.username}' to admin`);
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db
      .insert(usersTable)
      .values({ username, passwordHash, balance: "0", role: "admin" })
      .returning();
    console.log(`✅ Created admin user '${user.username}' (id: ${user.id})`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
