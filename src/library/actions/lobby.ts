import { D1Database, R2Bucket, ReadableStream } from "@cloudflare/workers-types";
import { eq, and, desc } from 'drizzle-orm';
import { DrizzleD1Database } from "drizzle-orm/d1";

import { StatusError } from "../../StatusError";
import {
  camelToSnake,
  generateRandomId,
  generateSecureId,
  getTimestamp
} from "../../utils";
import {
  joinedLobbies as db_joinedLobbies,
  images as db_images,
  lobbies as db_lobbies,
  reactions as db_reactions,
} from "../db";

/**
 * Uploads images to R2, adds image entreis and returns ids of image
 * 
 * @param lobbyId id of lobby that images are being added to
 * @param uploaderId id of user that uploaded image
 * @param imageFiles list of image files to be uploaded
 * @returns list of ids of image entries
 */
const uploadImagesToR2 = async (
  lobbyId: string,
  uploaderId: string,
  imageFiles: File[],
  d1: D1Database,
  r2: R2Bucket,
): Promise<string[]> => {
  const uploadPromises = imageFiles.map(async (image: File) => {
    let imageId = '';
    let found = false;
    // assign unique id to image
    do {
      imageId = generateSecureId(8);
      const { results } = await d1.prepare(
        "SELECT 1 FROM Images WHERE _id = ?",
      ).bind(imageId).run();
      found = results.length !== 0;
    } while (found)

    await d1.prepare(`
        INSERT INTO Images
        (_id, lobby_id, uploaded_on, uploader_id, reaction_string)
        VALUES (?, ?, ?, ?, ?)
    `).bind(
      imageId,
      lobbyId,
      getTimestamp(),
      uploaderId,
      '0',
    ).run();

    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "image/jpeg");
    console.log(image);
    const file = new Blob([image], { type: 'image/jpeg' });
    await r2.put(`${lobbyId}/${imageId}.jpeg`, image);
    return imageId;
  });

  return await Promise.all(uploadPromises);
}

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
  const imageList = typeof images === 'string' ? JSON.parse(images) : [];

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

  const imageEntries = imageList.map((imageId: string) => {
    const foundReaction = reactionResults.find((reaction) => reaction.imageId === imageId);
    return ({
      _id: imageId,
      reactionString: imageResults.find((imageRes) => imageRes._id === imageId)?.reactionString,
      currentUserReaction: foundReaction ? foundReaction.reaction : null,
    });
  });

  return ({
    _id: lobbyId,
    lobbyCode: lobbyCode,
    createdOn: createdOn,
    firstUploadOn: firstUploadOn,
    isJoined: joinedResults.length !== 0,
    ownerId: ownerId,
    title,
    backgroundColor: backgroundColor,
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

  return results.map((lobbyEntry) => {
    const { images } = lobbyEntry;
    const imageList = JSON.parse(images as string);
    return {
      ...lobbyEntry,
      firstImageId: imageList[0],
    };
  });
};

/**
 * Creates a draft entry for a new lobby
 * 
 * @param ownerId _id of user that created draft
 * @param title title created by user
 * @param backgroundColor hex color chosen by user for background color gradient
 * @param viewersCanEdit determines if non owner users can upload/edit lobby
 * @param db D1 Drizzle db object
 * @returns id of the created draft lobby entry
 */
export async function createDraftLobby(
  ownerId: string,
  title: string,
  backgroundColor: string,
  viewersCanEdit: string,
  db: DrizzleD1Database,
) {
  const res = await db.insert(db_lobbies).values({
    _id: generateSecureId(),
    lobbyCode: generateSecureId(6),
    createdOn: getTimestamp(),
    firstUploadOn: null,
    ownerId,
    title,
    backgroundColor,
    isDraft: true,
    viewersCanEdit: viewersCanEdit === 'true',
    images: '[]',
  }).onConflictDoUpdate({
    target: db_lobbies.lobbyCode,
    set: { lobbyCode: generateSecureId(6) }
  }).returning({ newId: db_lobbies._id });

  return res[0].newId;
}

/**
 * Creates a new lobby entry in db
 * 
 * @param ownerId 
 * @param title 
 * @param backgroundColor 
 * @param imageFiles 
 * @param viewersCanEdit 
 * @param d1 
 * @param r2 
 * @returns lobby id and lobby code of new lobby
 */
export async function createNewLobby(
  ownerId: string,
  title: string,
  backgroundColor: string,
  imageFiles: File[],
  viewersCanEdit: string,
  d1: D1Database,
  r2: R2Bucket
) {
  // TODO: add auth

  let lobbyId = '';
  let lobbyCode = '';
  let found = false;
  // check if lobby code or lobby id exists
  do {
    lobbyId = generateSecureId();
    lobbyCode = generateRandomId();

    const { results } = await d1.prepare(
      "SELECT 1 FROM Lobbies WHERE _id = ? OR lobby_code = ?",
    ).bind(lobbyId, lobbyCode).run();
    found = results.length !== 0;
    if (!found) {
      await d1.prepare(`
        INSERT INTO Lobbies
        (_id, lobby_code, created_on, first_upload_on, owner_id, title, background_color, viewers_can_edit, images) VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        lobbyId,
        lobbyCode,
        getTimestamp(),
        null,
        ownerId,
        title,
        backgroundColor,
        viewersCanEdit,
        '[]',
      ).run();
    }
  } while (found)

  const imageList: string[] = await uploadImagesToR2(
    lobbyId,
    ownerId,
    imageFiles,
    d1,
    r2
  );

  await d1.prepare(`
    UPDATE Lobbies
    SET images = '${JSON.stringify(imageList)}'
    WHERE _id = ?
  `).bind(lobbyId).run();

  return { lobbyId, lobbyCode };
}

/**
 * Updates fields of lobby entry which matches _id and deletes images.
 * 
 * @param lobbyId string to be matched with _id
 * @param currentUserId id of user making request
 * @param editedFields fields to be changed in lobby entry
 * @param deletedImageList list of _id's of images to be deleted
 * @param db D1 instance
 * @param imagesBucket R2 instance
 * @returns HTTP response object
 */
export async function updateLobbyEntry(
  lobbyId: string,
  currentUserId: string,
  editedFields: { [key: string]: string | boolean },
  deletedImageList: string[],
  db: DrizzleD1Database,
  imagesBucket: R2Bucket
) {
  const results = await db.select().from(db_lobbies).where(eq(db_lobbies._id, lobbyId));

  if (results.length === 0) {
    throw new StatusError('Lobby Not Found', 400);
  }
  const { ownerId } = results[0];
  if (ownerId !== currentUserId) {
    throw new StatusError('Unauthorized', 403);
  }

  const deletePromises = deletedImageList.map(async (imageId: string) => {
    await imagesBucket.delete(`${lobbyId}/${imageId}`);
  });
  await Promise.all(deletePromises);

  await db.update(db_lobbies)
    .set(editedFields).where(eq(db_lobbies._id, lobbyId));

  return true;
}

/**
 * Add images to existing lobby and uploads to r2
 * 
 * @param request HTTP request object
 * @param lobbyId string to be matched with _id
 * @param d1 D1 instance
 * @param r2 R2 instance
 * @returns new list of image _id's with uploaded images
 */
export async function addImagesToLobby(
  lobbyId: string,
  imageFiles: File[],
  d1: D1Database,
  r2: R2Bucket,
) {
  const { results } = await d1.prepare(
    "SELECT * FROM Lobbies WHERE _id = ?",
  ).bind(lobbyId).run();

  if (results.length === 0) {
    throw new StatusError('Lobby Not Found', 400);
  }
  const { ownerId, viewersCanEdit, images } = results[0];
  // TODO: add auth (check ownerId and viewersCanEdit)

  const newImageList = await uploadImagesToR2(
    lobbyId,
    ownerId ? ownerId as string : 'test',
    imageFiles,
    d1,
    r2
  );
  const originalImages = typeof images === 'string' ? JSON.parse(images) : [];
  const updatedImageList = JSON.stringify([...originalImages, ...newImageList]);

  await d1.prepare(`
    UPDATE Lobbies
    SET images = '${updatedImageList}'
    WHERE _id = '${lobbyId}'
  `).run();

  return newImageList;
}

/**
 * Deletes lobby entry with matching _id
 * 
 * @param lobbyId string to be matched to _id
 * @param d1 D1 instance
 * @param r2 R2 instance
 * @returns boolean
 */
export async function deleteLobbyEntry(lobbyId: string, d1: D1Database, r2: R2Bucket) {

  const { results } = await d1.prepare(
    "SELECT * FROM Lobbies WHERE _id = ?",
  )
    .bind(lobbyId)
    .run();

  if (results.length === 0) {
    throw new StatusError('Lobby Not Found', 400);
  }

  const { ownerId } = results[0];
  // TODO: add auth
  const listed = await r2.list({ prefix: `${lobbyId}` });
  await Promise.all(listed.objects.map(
    (object: { key: string }) => r2.delete(object.key)
  ));

  await d1.prepare('DELETE FROM Images WHERE lobby_id = ?')
    .bind(lobbyId).run();
  await d1.prepare('DELETE FROM Lobbies WHERE _id = ?')
    .bind(lobbyId).run();

  return true;
}
