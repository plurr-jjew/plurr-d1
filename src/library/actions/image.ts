import { D1Database, R2Bucket } from "@cloudflare/workers-types";

import { StatusError } from "../../StatusError";
import { getTimestamp, generateSecureId, getReactionDisplayString } from "../../utils";

/**
 * Gets image matching lobby and image id and transforms 
 * 
 * @param headers HTTP request headers
 * @param lobbyId string that matches to lobby _id
 * @param imageId string that matches to image _id
 * @param r2 R2 instance
 * @param r2Images cloudflare image worker
 * @returns image response with finished image
 */
export async function getImage(
  headers: Headers,
  lobbyId: string,
  imageId: string,
  r2: R2Bucket,
  r2Images: any,
) {
  const object = await r2.get(`${lobbyId}/${imageId}.jpeg`, {
    onlyIf: headers,
    range: headers,
  });

  if (object === null || !('body' in object)) {
    throw new StatusError('Object Not Found', 404);
  }

  const _headers = new Headers();
  object.writeHttpMetadata(_headers);
  headers.set("etag", object.httpEtag);

  const imageResponse = (await r2Images.input(object.body)
    .transform({ quality: 50 })
    .output({ format: 'image/jpeg' })
  ).response();
  return imageResponse;
}

/**
 * Handles reaction for an image entry change from user
 * 
 * @param imageId _id of image to be handled
 * @param userId user id of user doing the action
 * @param newReaction new reaction value
 * @param imageId string to be matched to image _id
 * @param d1 D1 database instance
 * @returns new string representing the number and type of reactions and new user reaction
 * 
 * If reaction entry does not exist, reaction entry is added with reaction and userId
 * If there is a matching reaction entry with userId and reaction value, reaction entry is deleted
 * If there is a matching reaction entry with userId and new reaction is like, reaction entry is deleted
 * If there is a matching reaction entry with userId and different reaction value, reaction entry's value is updated
 * Once reaction table is updated, reaction display string is generated and image entry is updated
 */
export async function handleImageReact(
  imageId: string,
  userId: string,
  newReaction: string,
  d1: D1Database,
) {
  if (userId === undefined || newReaction === undefined) {
    throw new StatusError('Missing Form Data.', 400);
  }

  const { results: imageResults } = await d1.prepare(
    "SELECT lobby_id FROM Images WHERE _id = ?"
  ).bind(imageId).run();

  if (imageResults.length === 0) {
    throw new StatusError('Image Not Found', 400);
  }

  const { lobby_id: lobbyId } = imageResults[0];
  let userReaction = null;

  const { results: reactionResults } = await d1.prepare(
    "SELECT * FROM Reactions WHERE image_id = ? AND user_id = ?"
  ).bind(imageId, userId).run();
  // reaction entry does not exist, add row for reaction
  if (reactionResults.length === 0) {
    await d1.prepare(`
      INSERT INTO Reactions
      (_id, user_id, lobby_id, image_id, created_on, reaction) VALUES
      (?, ?, ?, ?, ?, ?)
    `).bind(generateSecureId(12), userId, lobbyId, imageId, getTimestamp(), newReaction)
      .run();
      userReaction = newReaction;
  } else {
    const { _id, reaction } = reactionResults[0];

    if (reaction === newReaction || newReaction === 'like') {
      await d1.prepare(
        "DELETE FROM Reactions WHERE _id = ?"
      ).bind(_id).run();

    } else {
      await d1.prepare(`
        UPDATE Reactions
        SET reaction = ?
        WHERE _id = ?
      `).bind(newReaction, _id).run();
      userReaction = newReaction;
    }
  }

  const { results: newReactionResults } = await d1.prepare(
    "SELECT _id, reaction FROM Reactions WHERE image_id = ? "
  ).bind(imageId).run();

  const reactionString = getReactionDisplayString(
    newReactionResults.map(({ reaction }) => 
      typeof reaction === 'string' ? reaction : null
    ).filter((n) => n !== null)
  );
  console.log('new Reaction string:', imageId, reactionString)

  await d1.prepare(`
    UPDATE Images
    SET reaction_string = ?
    WHERE _id = ?
  `).bind(reactionString, imageId).run();
  return { reactionString, userReaction } ;
}
