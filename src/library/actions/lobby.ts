import { R2Bucket} from "@cloudflare/workers-types";
import { eq, and, desc } from 'drizzle-orm';
import { DrizzleD1Database } from "drizzle-orm/d1";

import { StatusError } from "../../StatusError";
import { generateSecureId, getTimestamp } from "../../utils";
import {
  joinedLobbies as db_joinedLobbies,
  images as db_images,
  lobbies as db_lobbies,
  reactions as db_reactions,
} from "../db";

/**
 * Takes lobby row from db and creates an object representing lobby entry.
 * 
 * @param lobbyRes row of lobby data from db
 * @param currentUserId id of user requesting lobby entry
 * @param db Drizzle D1 database instance
 * @returns lobby entry object
 */
const getLobbyEntry = async (
  lobbyRes: { [key: string]: any },
  currentUserId: string | undefined,
  db: DrizzleD1Database
): Promise<LobbyEntry> => {
  const {
    _id: lobbyId,
    lobbyCode,
    createdOn,
    firstUploadOn,
    ownerId,
    title,
    backgroundColor,
    viewersCanEdit,
    images,
  } = lobbyRes;
  const imageResults = await db.select({ _id: db_images._id, reactionString: db_images.reactionString })
    .from(db_images).where(eq(db_images.lobbyId, lobbyId));

  let reactionResults: { imageId: string, reaction: string }[] = [];
  let joinedResults: { _id: string }[] = [];

  if (currentUserId) {
    reactionResults = await db.select({
      imageId: db_reactions.imageId, reaction: db_reactions.reaction
    }).from(db_reactions).where(and(
      eq(db_reactions.lobbyId, lobbyId),
      eq(db_reactions.userId, currentUserId),
    ));
    joinedResults = await db.select({ _id: db_joinedLobbies._id })
      .from(db_joinedLobbies).where(and(
        eq(db_joinedLobbies.lobbyId, lobbyId),
        eq(db_joinedLobbies.userId, currentUserId),
      ));
  }

  const imageEntries = images.map((imageId: string) => {
    const foundReaction = reactionResults.find((reaction) => reaction.imageId === imageId);
    return ({
      _id: imageId,
      reactionString: imageResults.find((imageRes) => imageRes._id === imageId)?.reactionString,
      currentUserReaction: foundReaction ? foundReaction.reaction : null,
    });
  });

  return ({
    _id: lobbyId,
    lobbyCode,
    createdOn,
    firstUploadOn,
    isJoined: joinedResults.length !== 0,
    ownerId,
    title,
    backgroundColor,
    viewersCanEdit: viewersCanEdit === 'true',
    images: imageEntries,
  });
};

/**
 * Gets lobby _id given a corresponding 6 character code
 * 
 * @param lobbyCode 6 char code for lobby_code
 * @param db D1 database instance
 * @returns _id value for the corresponding lobby entry
 */
export async function getLobbyIdByCode(lobbyCode: string, db: DrizzleD1Database) {
  const results = await db.select({ _id: db_lobbies._id })
    .from(db_lobbies).where(eq(db_lobbies.lobbyCode, lobbyCode));

  if (results.length === 0) {
    throw new StatusError('Lobby not found', 404);
  }

  return results[0]._id;
}

/**
 * Gets lobby entry which matches _id
 * 
 * @param lobbyId id of lobby
 * @param currentUserId id of current session's user
 * @param db Drizzle D1 instance
 * @returns Object representing lobby entry
 */
export async function getLobbyById(
  lobbyId: string,
  currentUserId: string | undefined,
  db: DrizzleD1Database
) {
  const results = await db.select()
    .from(db_lobbies).where(and(
      eq(db_lobbies._id, lobbyId),
      eq(db_lobbies.isDraft, false),
    ));

  if (results.length === 0) {
    throw new StatusError('Lobby not found', 404);
  }

  return await getLobbyEntry(results[0], currentUserId, db);
}

/**
 * Gets lobby entry which matches lobby_code
 * 
 * @param lobbyCode 6 character code for the lobby
 * @param currentUserId id of user requesting lobby
 * @param db Drizzle D1 instance
 * @returns Object representing lobby entry
 */
export async function getLobbyByCode(
  lobbyCode: string,
  currentUserId: string | undefined,
  db: DrizzleD1Database
) {
  const results = await db.select()
    .from(db_lobbies).where(and(
      eq(db_lobbies.lobbyCode, lobbyCode),
      eq(db_lobbies.isDraft, false),
    ));

  if (results.length === 0) {
    throw new StatusError('Lobby not found', 404);
  }

  return await getLobbyEntry(results[0], currentUserId, db);
};

/**
 * Gets lobby entry which matches lobby_code
 * 
 * @param userId 6 character code for the lobby
 * @param db Drizzle D1 instance
 * @returns HTTP response with object with fields representing lobby entry
 */
export async function getLobbiesByUser(userId: string, db: DrizzleD1Database) {
  const results = await db.select({
    _id: db_lobbies._id,
    createdOn: db_lobbies.createdOn,
    title: db_lobbies.title,
    images: db_lobbies.images,
  }).from(db_lobbies)
    .where(and(
      eq(db_lobbies.ownerId, userId),
      eq(db_lobbies.isDraft, false),
    ))
    .orderBy(desc(db_lobbies.createdOn));

  return results.map(({ _id, createdOn, title, images }) => {
    return {
      _id,
      createdOn,
      title,
      firstImageId: images[0],
    };
  });
};

/**
 * Creates a entry for a new lobby
 * 
 * @param ownerId _id of user that created draft
 * @param title title created by user
 * @param backgroundColor hex color chosen by user for background color gradient
 * @param viewersCanEdit determines if non owner users can upload/edit lobby
 * @param isDraft flag for lobby is draft or not
 * @param db D1 Drizzle db object
 * @returns id of the created draft lobby entry
 */
export async function createNewLobby(
  ownerId: string,
  title: string,
  backgroundColor: string,
  viewersCanEdit: string,
  isDraft: boolean,
  db: DrizzleD1Database,
) {
  const res = await db.insert(db_lobbies).values({
    _id: generateSecureId(),
    lobbyCode: generateSecureId(6),
    createdOn: getTimestamp(),
    firstUploadOn: isDraft ? getTimestamp() : null,
    ownerId,
    title,
    backgroundColor,
    isDraft,
    viewersCanEdit: viewersCanEdit === 'true',
    images: [],
  }).onConflictDoUpdate({
    target: db_lobbies.lobbyCode,
    set: { lobbyCode: generateSecureId(6) }
  }).returning({ newId: db_lobbies._id });

  return res[0].newId;
}

/**
 * Updates fields of lobby entry which matches _id and deletes images.
 * 
 * @param lobbyId string to be matched with _id
 * @param currentUserId id of user making request
 * @param changes fields to be changed in lobby entry
 * @param deletedImageList list of _id's of images to be deleted
 * @param db D1 instance
 * @param imagesBucket R2 instance
 * @returns true if update is successful
 */
export async function updateLobbyEntry(
  lobbyId: string,
  currentUserId: string,
  changes: { [key: string]: string | boolean | string[] },
  addedImages: string[],
  deletedImages: string[],
  db: DrizzleD1Database,
  imagesBucket: R2Bucket
) {
  const lobbyEntry = await db.select().from(db_lobbies)
    .where(eq(db_lobbies._id, lobbyId)).get();

  if (!lobbyEntry) {
    throw new StatusError('Lobby Not Found', 400);
  }
  const { ownerId, images } = lobbyEntry;
  if (ownerId !== currentUserId) {
    throw new StatusError('Unauthorized', 403);
  }

  if (addedImages.length > 0) {
    changes.images = [...images, ...addedImages];
  }

  if (deletedImages?.length > 0) {
    const deletePromises = deletedImages.map(async (imageId: string) => {
      await imagesBucket.delete(`${lobbyId}/${imageId}`);
    });
    await Promise.all(deletePromises);
  }

  const updateRes = await db.update(db_lobbies)
    .set(changes)
    .where(eq(db_lobbies._id, lobbyId))
    .returning({
      _id: db_lobbies._id,
      title: db_lobbies.title,
      images: db_lobbies.images,
      backgroundColor: db_lobbies.backgroundColor,
      viewersCanEdit: db_lobbies.viewersCanEdit,
    });

  return updateRes;
}

/**
 * Deletes lobby entry with matching _id, also deletes associated images in R2 bucket
 * 
 * @param lobbyId string to be matched to _id
 * @param currentUserId _id of current session's user
 * @param db Drizzle D1 instance
 * @param imagesBucket R2 images bucket
 * @returns boolean
 */
export async function deleteLobbyEntry(
  lobbyId: string,
  currentUserId: string,
  db: DrizzleD1Database,
  imagesBucket: R2Bucket
) {
  const results = await db.select({ ownerId: db_lobbies.ownerId })
    .from(db_lobbies).where(eq(db_lobbies._id, lobbyId));

  if (results.length === 0) {
    throw new StatusError('Lobby Not Found', 400);
  }

  const { ownerId } = results[0];
  if (ownerId !== currentUserId) {
    throw new StatusError('Unauthorized', 403);
  }

  const listed = await imagesBucket.list({ prefix: `${lobbyId}` });
  await Promise.all(listed.objects.map(
    (object: { key: string }) => imagesBucket.delete(object.key)
  ));

  await db.delete(db_lobbies).where(eq(db_lobbies._id, lobbyId));

  return true;
}
