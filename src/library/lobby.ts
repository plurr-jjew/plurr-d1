import { StatusError } from "../StatusError";
import {
  camelToSnake,
  generateRandomId,
  generateSecureId,
  getTimestamp
} from "../utils";

import { jsonHeader } from "./headers";

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

    const file = image;
    await r2.put(`${lobbyId}/${imageId}.jpeg`, file);
    return imageId;
  });

  return await Promise.all(uploadPromises);
}

/**
 * Takes lobby row from db and creates an object representing lobby entry.
 * 
 * @param lobbyRes row of lobby data from db
 * @param hostname hostname of request
 * @param d1 D1 database instance
 * @returns lobby entry object
 */
const getLobbyEntry = async (
  lobbyRes: { [key: string]: any },
  d1: D1Database
): Promise<LobbyEntry> => {
  const {
    _id: lobbyId,
    lobby_code,
    created_on,
    first_upload_on,
    owner_id,
    title,
    viewers_can_edit,
    images,
  } = lobbyRes;
  const imageList = typeof images === 'string' ? JSON.parse(images) : [];

  const { results: imageResults } = await d1.prepare(
    "SELECT _id, reaction_string from Images WHERE lobby_id = ?"
  ).bind(lobbyId).run();

  const imageEntries = imageList.map((imageId: string) => ({
    _id: imageId,
    // url: hostname ? `${hostname}/image/${lobbyId}/${imageId}` : `/image/${lobbyId}/${imageId}`,
    reactionString: imageResults.find((imageRes) => imageRes._id === imageId)?.reaction_string,
  }));

  return ({
    _id: lobbyId,
    lobbyCode: lobby_code,
    createdOn: created_on,
    firstUploadOn: first_upload_on,
    ownerId: owner_id,
    title,
    viewersCanEdit: viewers_can_edit === 'true',
    images: imageEntries,
  });
};

/**
 * Gets lobby _id given a corresponding 6 character code
 * 
 * @param lobbyCode 6 char code for lobby_code
 * @param d1 D1 database instance
 * @returns _id value for the corresponding lobby entry
 */
export async function getLobbyIdByCode(lobbyCode: string, d1: D1Database) {
  const { results } = await d1.prepare(
    "SELECT _id FROM Lobbies WHERE lobby_code = ?",
  ).bind(lobbyCode).run();

  if (results.length === 0) {
    throw new StatusError('Lobby not found', 404);
  }

  return results[0]._id;
}

/**
 * Gets lobby entry which matches _id
 * 
 * @param lobbyId id of lobby
 * @param d1 d1 instance
 * @returns HTTP response with object with fields representing lobby entry
 */
export async function getLobbyById(lobbyId: string, d1: D1Database) {
  // TODO: add auth
  const { results } = await d1.prepare(
    "SELECT * FROM Lobbies WHERE _id = ?",
  ).bind(lobbyId).run();

  if (results.length === 0) {
    throw new StatusError('Lobby not found', 404);
  }

  return await getLobbyEntry(results[0], d1);
}

/**
 * Gets lobby entry which matches lobby_code
 * 
 * @param lobbyCode 6 character code for the lobby
 * @param d1 D1 instance
 * @returns HTTP response with object with fields representing lobby entry
 */
export async function getLobbyByCode(lobbyCode: string, d1: D1Database) {
  // TODO: add auth

  const { results } = await d1.prepare(
    "SELECT * FROM Lobbies WHERE lobby_code = ?",
  ).bind(lobbyCode).run();

  if (results.length === 0) {
    throw new StatusError('Lobby not found', 404);
  }

  return await getLobbyEntry(results[0], d1);
};

/**
 * Creates a new lobby entry
 * 
 * @param request HTTP request object
 * @param d1 D1 instance
 * @param r2 R2 instance
 * @returns HTTP response with lobby code and lobby id
 */
export async function createNewLobby(
  ownerId: string,
  title: string,
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
  } while (found)

  const imageList: string[] = await uploadImagesToR2(
    lobbyId,
    ownerId,
    imageFiles,
    d1,
    r2
  );

  await d1.prepare(`
    INSERT INTO Lobbies
    (_id, lobby_code, created_on, first_upload_on, owner_id, title, viewers_can_edit, images) VALUES
    (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    lobbyId,
    lobbyCode,
    getTimestamp(),
    imageList.length > 0 ? getTimestamp() : null,
    ownerId,
    title,
    viewersCanEdit,
    JSON.stringify(imageList),
  ).run();

  return { lobbyId, lobbyCode };
}

/**
 * Updates fields of lobby entry which matches _id and deletes images.
 * 
 * @param lobbyId string to be matched with _id
 * @param editedFields fields to be changed in lobby entry
 * @param deletedImageList list of _id's of images to be deleted
 * @param d1 D1 instance
 * @param r2 R2 instance
 * @returns HTTP response object
 */
export async function updateLobbyEntry(
  lobbyId: string,
  editedFields: { property: string, value: string }[],
  deletedImageList: string[],
  d1: D1Database,
  r2: R2Bucket
) {
  const { results } = await d1.prepare(
    "SELECT * FROM Lobbies WHERE _id = ?",
  ).bind(lobbyId).run();

  if (results.length === 0) {
    throw new StatusError('Lobby Not Found', 400);
  }
  const { ownerId } = results[0];
  // TODO: add auth

  const deletePromises = deletedImageList.map(async (imageId: string) => {
    await r2.delete(`${lobbyId}/${imageId}`);
  });
  await Promise.all(deletePromises);

  const setString = editedFields.map((field, idx) =>
    `${camelToSnake(field.property)} = '${field.value}'`).join(',');
  console.log(setString)

  await d1.prepare(`
    UPDATE Lobbies
    SET ${setString}
    WHERE _id = ?
  `).bind(lobbyId).run();

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
