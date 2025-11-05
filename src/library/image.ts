import { getTimestamp, generateSecureId, getReactionDisplayString } from "../utils";

/**
 * Gets image matching lobby and image id and transforms 
 * 
 * @param request HTTP request object
 * @param lobbyId string that matches to lobby _id
 * @param imageId string that matches to image _id
 * @param r2 R2 instance
 * @param r2Images cloudflare image worker
 * @returns image response with finished image
 */
export async function getImage(
  request: Request,
  lobbyId: string,
  imageId: string,
  r2: R2Bucket,
  r2Images: any,
) {
  const object = await r2.get(`${lobbyId}/${imageId}.jpeg`, {
    onlyIf: request.headers,
    range: request.headers,
  });

  if (object === null || !('body' in object)) {
    return new Response("Object Not Found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
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
 * @param request HTTP request object
 * @param imageId string to be matched to image _id
 * @param d1 D1 database instance
 * @returns new string representing the number and type of reactions
 * 
 * If reaction entry does not exist, reaction entry is added with reaction and userId
 * If there is a matching reaction entry with userId and reaction value, reaction entry is deleted
 * If there is a matching reaction entry with userId and new reaction is like, reaction entry is deleted
 * If there is a matching reaction entry with userId and different reaction value, reaction entry's value is updated
 * Once reaction table is updated, reaction display string is generated and image entry is updated
 */
export async function handleImageReact(
  request: Request,
  imageId: string,
  d1: D1Database,
) {
  const formData = await request.formData();
  const userId = await formData.get('userId');
  const newReaction = await formData.get('reaction');

  if (userId === undefined || newReaction === undefined) {
    return new Response('Missing Form Data.', {
      status: 400,
    });
  }

  const { results: imageResults } = await d1.prepare(
    "SELECT lobby_id FROM Images WHERE _id = ?"
  ).bind(imageId).run();

  if (imageResults.length === 0) {
    return new Response('Image Not Found,', {
      status: 400,
    });
  }
  const { lobby_id: lobbyId } = imageResults[0];

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
  } else {
    const { _id, reaction } = reactionResults[0];

    if (reaction === newReaction || newReaction === 'like') {
      await d1.prepare(
        "DELETE FROM Reactions WHERE _id = ?"
      ).bind(_id).run();
      reactionResults
    } else {
      await d1.prepare(`
        UPDATE Reactions
        SET reaction = ?
        WHERE _id = ?
      `).bind(newReaction, _id).run();
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

  await d1.prepare(`
    UPDATE Images
    SET reaction_string = ?
    WHERE _id = ?
  `).bind(reactionString, imageId).run();
  return Response.json({
    reactionString
  }, { status: 200 });
}
