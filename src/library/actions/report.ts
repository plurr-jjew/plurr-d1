import { D1Database } from "@cloudflare/workers-types";

import { StatusError } from "../../StatusError";
import { generateSecureId } from "../../utils";

/**
 * Creates new report entry in database
 * 
 * @param lobbyId _id of lobby the report is associated with
 * @param creatorId id of user that created report
 * @param email email assigned to the report entry
 * @param msg text message for the report
 * @param d1 D1 database instance
 * @returns HTTP response object
 */
export async function createNewReport(
  lobbyId: string,
  creatorId: string,
  email: string,
  msg: string,
  d1: D1Database
) {
  if (!lobbyId || !email || !msg) {
    throw new StatusError('Missing Required Fields', 400);
  }

  await d1.prepare(`
    INSERT INTO Reports
    (_id, status, lobby_id, creator_id, email, msg) VALUES
    (?, 'open', ?, ?, ?, ?)
  `).bind(generateSecureId(12), lobbyId, creatorId, email, msg).run();

  return true;
}

