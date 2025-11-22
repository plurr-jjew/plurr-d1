import { R2Bucket, ReadableStream, ImagesBinding } from "@cloudflare/workers-types";
import { eq, and } from 'drizzle-orm';
import { DrizzleD1Database } from "drizzle-orm/d1";

import { StatusError } from "../../StatusError";
import { getTimestamp, generateSecureId, getReactionDisplayString } from "../../utils";
import { images, reactions } from "../db";

/**
 * Gets image matching lobby and image id and transforms with CF worker.
 * 
 * @param headers HTTP request headers
 * @param lobbyId string that matches to lobby _id
 * @param imageId string that matches to image _id
 * @param imagesBucket R2 instance
 * @param imagesWorker cloudflare image worker
 * @returns image response with finished image
 */
export async function getImage(
  headers: Headers,
  lobbyId: string,
  imageId: string,
  imagesBucket: R2Bucket,
  imagesWorker: ImagesBinding,
) {
  const object = await imagesBucket.get(`${lobbyId}/${imageId}.jpeg`, {
    onlyIf: headers,
    range: headers,
  });

  if (object === null || !('body' in object)) {
    throw new StatusError('Object Not Found', 404);
  }

  const _headers = new Headers();
  object.writeHttpMetadata(_headers);
  headers.set("etag", object.httpEtag);

  const imageResponse = (await imagesWorker.input(object.body)
    .transform({ quality: 50, } as ImageTransform)
    .output({ format: 'image/jpeg' })
  ).response();
  return imageResponse;
}

/**
 *  Uploads single image to images bucket and creates entry in Images table.
 * 
 * @param lobbyId _id of corresponding lobby entry
 * @param uploaderId id of user that uploaded image
 * @param file image file to be uploaded
 * @param db Drizzle D1 db object
 * @param imageBucket R2 images bucket object
 * @returns 
 */
export async function uploadImage(
  lobbyId: string,
  uploaderId: string,
  file: ReadableStream<any>,
  db: DrizzleD1Database,
  imagesBucket: R2Bucket,
) {
  const res = await db.insert(images).values({
    _id: generateSecureId(10),
    lobbyId,
    uploadedOn: getTimestamp(),
    uploaderId,
    reactionString: '0',
  }).returning({ imageId: images._id });

  const imageId = res[0].imageId;
  await imagesBucket.put(`${lobbyId}/${imageId}.jpeg`, file);

  return imageId;
};

/**
 * Handles reaction for an image entry change from user
 * 
 * @param imageId _id of image to be handled
 * @param userId user id of user doing the action
 * @param newReaction new reaction value
 * @param imageId string to be matched to image _id
 * @param db D1 database instance
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
  db: DrizzleD1Database,
) {
  if (userId === undefined || newReaction === undefined) {
    throw new StatusError('Missing Form Data.', 400);
  }

  // Look if image with corresponding _id exists
  const imageResults = await db.select({ lobbyId: images.lobbyId })
    .from(images).where(eq(images._id, imageId));

  if (imageResults.length === 0) {
    throw new StatusError('Image Not Found', 400);
  }

  const { lobbyId } = imageResults[0];
  let userReaction = null;

  const reactionResults = await db.select({ _id: reactions._id, reaction: reactions.reaction })
    .from(reactions).where(and(
      eq(reactions.imageId, imageId),
      eq(reactions.userId, userId),
    ));

  // Reaction entry does not exist, add row for new reaction
  if (reactionResults.length === 0) {
    await db.insert(reactions).values({
      _id: generateSecureId(10),
      userId,
      lobbyId,
      imageId,
      createdOn: getTimestamp(),
      reaction: newReaction,
    });
    userReaction = newReaction;
  } else {
    const { _id, reaction } = reactionResults[0];

    // Remove reaction entry if new reaction is a like or new reaction is the same as the current
    if (reaction === newReaction || newReaction === 'like') {
      await db.delete(reactions).where(eq(reactions._id, _id));

    } else {
      await db.update(reactions)
        .set({ reaction: newReaction })
        .where(eq(reactions._id, _id));
      userReaction = newReaction;
    }
  }

  const newReactionResults = await db.select({ _id: reactions._id, reaction: reactions.reaction })
    .from(reactions)
    .where(eq(reactions.imageId, imageId)
    );

  // Create updated reaction string to be displayed
  const updatedReactionString = getReactionDisplayString(
    newReactionResults.map(({ reaction }) =>
      typeof reaction === 'string' ? reaction : null
    ).filter((n) => n !== null)
  );

  await db.update(images)
    .set({ reactionString: updatedReactionString })
    .where(eq(images._id, imageId));
  
  return { updatedReactionString, userReaction };
}
