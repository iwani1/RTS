/**
 * Saved views.
 *
 * A saved view is a named set of filters for a list — "this week's late
 * trips", "unapproved bookings for Sikaman". They belong to the person who
 * made them and to the list they were made on, so two people can work the
 * same screen without inheriting each other's filters by accident.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { savedViews } from "@/db/schema";

export type SavedView = {
  id: number;
  name: string;
  scope: string;
  filters: Record<string, string>;
  createdAt: Date;
};

/** Every saved view a user has for one list. */
export async function listViews(userId: number, scope: string): Promise<SavedView[]> {
  const rows = await db
    .select()
    .from(savedViews)
    .where(and(eq(savedViews.userId, userId), eq(savedViews.scope, scope)))
    .orderBy(asc(savedViews.name));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    scope: row.scope,
    filters: (row.filters ?? {}) as Record<string, string>,
    createdAt: row.createdAt,
  }));
}

/** Save a view. Re-saving the same name replaces the filters. */
export async function saveView(input: {
  userId: number;
  name: string;
  scope: string;
  filters: Record<string, string>;
}): Promise<SavedView> {
  const [existing] = await db
    .select()
    .from(savedViews)
    .where(
      and(
        eq(savedViews.userId, input.userId),
        eq(savedViews.scope, input.scope),
        eq(savedViews.name, input.name),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(savedViews)
      .set({ filters: input.filters })
      .where(eq(savedViews.id, existing.id));
    return {
      id: existing.id,
      name: existing.name,
      scope: existing.scope,
      filters: input.filters,
      createdAt: existing.createdAt,
    };
  }

  const [created] = await db
    .insert(savedViews)
    .values({
      userId: input.userId,
      name: input.name,
      scope: input.scope,
      filters: input.filters,
    })
    .returning();
  return {
    id: created.id,
    name: created.name,
    scope: created.scope,
    filters: (created.filters ?? {}) as Record<string, string>,
    createdAt: created.createdAt,
  };
}

/** Delete a view. Scoped to the owner, so nobody can delete another's. */
export async function deleteView(userId: number, id: number): Promise<boolean> {
  const rows = await db
    .delete(savedViews)
    .where(and(eq(savedViews.id, id), eq(savedViews.userId, userId)))
    .returning({ id: savedViews.id });
  return rows.length > 0;
}

/**
 * The query parameters that make up a view, with the page reset — a saved
 * view always lands on the first page of its results.
 */
export function viewParams(filters: Record<string, string>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value) params[key] = value;
  }
  return params;
}
