import { getTimestamp, generateSecureId, getReactionDisplayString } from "./utils";

/**
 * API endpoints for /image
 * 
 * @param request request object of HTTP request
 * @param pathname pathname of HTTP request
 * @param env env cloudflare env object
 * @returns {Response} HTTP response object for corresponding request
 */
const image = async (
  request: Request,
  pathname: string,
  env: Env
): Promise<Response> => {
  switch (request.method) {
    case 'GET': {
      /**
       * GET /image/{lobbyId}/{imageId}
       * gets image from R2 with the following key: '{lobbyId}/{imageId}'
       */
      const addImagesRegex = /^\/image\/([^\/]+)\/([^\/]+)$/;
      const match = pathname.match(addImagesRegex);
      if (match) {
        const lobbyId = match[1];
        const imageId = match[2];

        const object = await env.IMAGES_BUCKET.get(`${lobbyId}/${imageId}.jpeg`, {
          onlyIf: request.headers,
          range: request.headers,
        });

        if (object === null) {
          return new Response("Object Not Found", { status: 404 });
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);

        const imageResponse = (await env.IMAGES.input(object.body)
          .transform({ quality: 50 })
          .output({ format: 'image/jpeg' })
        ).response();
        return imageResponse;
      }
    }
    case 'PUT': {
      /**
       * PUT /image/{imageId}/react
       * Toggles react from user
       */
      const reactMatch = pathname.match(/^\/image\/([^\/]+)\/react$/);
      if (reactMatch) {
        const formData = await request.formData();
        const userId = await formData.get('userId');
        const newReaction = await formData.get('reaction');

        if (userId === undefined || newReaction === undefined) {
          return new Response('Missing Form Data.', {
            status: 400,
          });
        }

        const imageId = reactMatch[1];
        const { results: imageResults } = await env.prod_plurr.prepare(
          "SELECT * FROM Images WHERE _id = ?"
        ).bind(imageId).run();

        if (imageResults.length === 0) {
          return new Response('Image Not Found,', {
            status: 400,
          });
        }
        const { lobbyId } = imageResults[0];

        const { results: reactionResults } = await env.prod_plurr.prepare(
          "SELECT * FROM Reactions WHERE imageId = ? AND userId = ?"
        ).bind(imageId, userId).run();

        if (reactionResults.length === 0) {
          await env.prod_plurr.prepare(`
            INSERT INTO Reactions
            (_id, userId, lobbyId, imageId, createdOn, reaction) VALUES
            (?, ?, ?, ?, ?, ?)
          `).bind(generateSecureId(12), userId, lobbyId, imageId, getTimestamp(), newReaction).run();
        } else {
          const { _id, reaction } = reactionResults[0];

          if (reaction === newReaction || newReaction === 'like') {
            await env.prod_plurr.prepare(
              "DELETE FROM Reactions WHERE _id = ?"
            ).bind(_id).run();
            reactionResults
          } else {
            await env.prod_plurr.prepare(`
              UPDATE Reactions
              SET reaction = ?
              WHERE _id = ?
            `).bind(newReaction, _id).run();
          }
        }

        const { results: newReactionResults } = await env.prod_plurr.prepare(
          "SELECT * FROM Reactions WHERE imageId = ? "
        ).bind(imageId).run();

        const reactionString = getReactionDisplayString(newReactionResults);

        await env.prod_plurr.prepare(`
          UPDATE Images
          SET reactionString = ?
          WHERE _id = ?
        `).bind(reactionString, imageId).run();
        return Response.json({
          reactionString
        }, { status: 200 });
      }
    }
    default:
      return new Response("Method Not Allowed", {
        status: 405,
        headers: {
          Allow: 'GET'
        }
      });
  }
};

export default image;
