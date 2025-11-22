import { DrizzleD1Database } from "drizzle-orm/d1";

import { reports as db_reports } from "../db";
import { StatusError } from "../../StatusError";
import { generateSecureId, getTimestamp } from "../../utils";

/**
 * Creates new report entry in database
 * 
 * @param lobbyId _id of lobby the report is associated with
 * @param creatorId id of user that created report
 * @param email email assigned to the report entry
 * @param msg text message for the report
 * @param db Drizzle D1 database instance
 * @returns HTTP response object
 */
export async function createNewReport(
  lobbyId: string,
  creatorId: string,
  email: string,
  msg: string,
  db: DrizzleD1Database,
) {
  if (!lobbyId || !email || !msg) {
    throw new StatusError('Missing Required Fields', 400);
  }

  await db.insert(db_reports).values({
    _id: generateSecureId(10),
    lobbyId,
    status: 'open',
    createdOn: getTimestamp(),
    creatorId,
    email,
    msg,
  });

  return true;
}
