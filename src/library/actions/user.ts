import { DrizzleD1Database } from 'drizzle-orm/d1';
import { eq, and, inArray } from 'drizzle-orm';

import {
  joinedLobbies as db_joinedLobbies,
  lobbies as db_lobbies,
} from '../db';
import { generateSecureId, getTimestamp } from '../../utils';

/**
 * Toggles entry for user in JoinedLobbies table, removes entry if there is a match, adds if not.
 * 
 * @param lobbyId _id of lobby to be joined
 * @param userId id of user that is joining lobby
 * @param db Drizzle D1 instance
 * @returns 
 */
export const joinLobby = async (lobbyId: string, userId: string, db: DrizzleD1Database) => {
  const results = await db.select()
    .from(db_joinedLobbies).where(and(
      eq(db_joinedLobbies.lobbyId, lobbyId),
      eq(db_joinedLobbies.userId, userId),
    ));

  if (results.length === 0) {
    await db.insert(db_joinedLobbies).values({
      _id: generateSecureId(),
      lobbyId,
      userId,
      joinedOn: getTimestamp(),
    });
    return true;
  } else {
    await db.delete(db_joinedLobbies)
      .where(eq(db_joinedLobbies.lobbyId, lobbyId));
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

  return lobbyResults.map(({ _id, title, images, createdOn, }) => ({
    _id,
    title,
    createdOn,
    firstImageId: images[0],
  }));
};
