import { Prisma } from "@prisma/client";

export async function safeDbQuery<T>(query: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      return fallback;
    }

    throw error;
  }
}
