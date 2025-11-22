import { DrizzleD1Database } from "drizzle-orm/d1";
import { eq, and, desc, inArray } from 'drizzle-orm';
import {
  joinedLobbies as db_joinedLobbies,
  lobbies as db_lobbies,
} from "../db";
import { generateSecureId, getTimestamp } from "../../utils";

export const joinLobby = async (lobbyId: string, userId: string, d1: D1Database) => {
  const { results } = await d1.prepare(
    "SELECT * FROM JoinedLobbies WHERE lobby_id = ? AND user_id = ?"
  ).bind(lobbyId, userId).run();

  if (results.length === 0) {
    const joinId = generateSecureId();
    await d1.prepare(`
      INSERT INTO JoinedLobbies
      (_id, lobby_id, user_id, joined_on)
      VALUES (?, ?, ?, ?)
    `).bind(joinId, lobbyId, userId, getTimestamp()).run();
    return true;
  } else {
    await d1.prepare(
      "DELETE FROM JoinedLobbies WHERE lobby_id = ? AND user_id = ?"
    ).bind(lobbyId, userId).run();
    return false;
  }
};

/**
 * Gets list of joined lobbies of a user with corresponding id.
 * 
 * @param userId user id to get joined lobbies of
 * @param db Drizzle D1 instace
 * @returns list of lobbies that the user has joined
 */
export const getJoinedLobbies = async (userId: string, db: DrizzleD1Database) => {
  const joinedLobbiesResults = await db.select({ lobbyId: db_joinedLobbies.lobbyId })
    .from(db_joinedLobbies).where(eq(db_joinedLobbies.userId, userId));

  const lobbyResults = await db.select({
    _id: db_lobbies._id,
    title: db_lobbies.title,
    images: db_lobbies.images,
    createdOn: db_lobbies.createdOn,
  }).from(db_lobbies)
    .where(inArray(
      db_lobbies._id,
      joinedLobbiesResults.map((joinedLobby) => joinedLobby.lobbyId)
    ));

  return lobbyResults.map((lobbyEntry) => {
    const { images } = lobbyEntry;
    const imageList = JSON.parse(images as string);
    return {
      ...lobbyEntry,
      firstImageId: imageList[0],
    };
  });
};

