import { generateRandomId, generateSecureId } from "./utils";

/**
 * API endpoints for /lobby
 * 
 * @param request request object of HTTP request
 * @param pathname pathname of HTTP request
 * @param env cloudflare env object
 * @returns {Response} HTTP response object for corresponding request
 */
const lobby = async (
  request: Request,
  pathname: string,
  env: Env
): Promise<Response> => {

  /**
   * Uploads images to R2, adds image entreis and returns ids of image
   * @param lobbyId id of lobby that images are being added to
   * @param uploaderId id of user that uploaded image
   * @param imageFiles list of image files to be uploaded
   * @returns list of ids of image entries
   */
  const uploadImagesToR2 = async (
    lobbyId: string,
    uploaderId: string,
    imageFiles: File[],
  ): Promise<string[]> => {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const uploadPromises = imageFiles.map(async (image: File) => {
      let imageId = '';
      let found = false;
      // check if image id exists
      do {
        imageId = generateSecureId(8);
        const { results } = await env.prod_plurr.prepare(
          "SELECT * FROM Images WHERE _id = ?",
        ).bind(imageId).run();
        found = results.length !== 0;
      } while (found)

      await env.prod_plurr.prepare(
        'INSERT INTO Images(_id, lobbyId, uploadedOn, uploaderId) VALUES (?, ?, ?, ?)'
      ).bind(
        imageId,
        lobbyId,
        timestamp,
        uploaderId,
      ).run();

      const myHeaders = new Headers();
      myHeaders.append("Content-Type", "image/jpeg");

      const file = image;
      await env.IMAGES_BUCKET.put(`${lobbyId}/${imageId}.jpeg`, file, {
        onlyIf: request.headers,
        httpMetadata: request.headers,
      });
      return imageId;
    });

    return await Promise.all(uploadPromises);
  }

  switch (request.method) {
    case 'GET': {
      /**
       * GET /lobby/lobby-id/{lobbyId}
       * Get lobby entry with the specified lobby id.
       */
      if (pathname.match(/^\/lobby\/lobby-id\/[^\/]+$/)) {
        // TODO: add auth

        const lobbyId = pathname.replace('/lobby/lobby-id/', '');
        const { results } = await env.prod_plurr.prepare(
          "SELECT * FROM Lobbies WHERE _id = ?",
        ).bind(lobbyId).run();

        if (results.length === 0) {
          return Response.json('Lobby not found', {
            status: 404,
          });
        }
        return Response.json({
          ...results[0],
          images: JSON.parse(results[0].images),
        });
      }
      /**
       * GET /lobby/lobby-code/{lobbyCode}
       * Get lobby entry with the specified lobby code.
       */
      if (pathname.match(/^\/lobby\/lobby-code\/[^\/]+$/)) {
        // TODO: add auth

        const lobbyCode = pathname.replace('/lobby/lobby-code/', '');
        const { results } = await env.prod_plurr.prepare(
          "SELECT * FROM Lobbies WHERE lobbyCode = ?",
        ).bind(lobbyCode).run();

        if (results.length === 0) {
          return Response.json('Lobby not found', {
            status: 404,
          });
        }
        return Response.json({
          ...results[0],
          images: JSON.parse(results[0].images),
        });
      }
    }
    case 'POST': {
      /**
       * POST /lobby/new-lobby
       * Creates a new lobby
       */
      if (pathname === '/lobby/new-lobby') {
        // TODO: add auth

        const formData = await request.formData();
        const ownerId = formData.get('ownerId') as string;
        const viewersCanEdit = formData.get('viewersCanEdit');
        const title = formData.get('title') as string;

        if (!ownerId || !viewersCanEdit || !title) {
          return new Response('Missing Form Data', {
            status: 400,
            headers: {
              Allow: 'POST',
            }
          });
        }

        // get image fields from formData
        const imageFiles: File[] = [];
        let imageCount = 0;
        let image = formData.get('image0') as File;
        while (image) {
          if (image.type !== 'image/jpeg') {
            return new Response('Non JPEG Image File', {
              status: 400,
              headers: {
                Allow: 'POST'
              }
            });
          }
          if (image.size / (1024 * 1024) > 10) {
            return new Response('File Size Too Large', {
              status: 400,
              headers: {
                Allow: 'POST'
              }
            });
          }
          imageFiles.push(image as File);
          imageCount++;
          image = formData.get(`image${imageCount}`) as File;
        }

        let lobbyId = '';
        let lobbyCode = '';
        let found = false;
        // check if lobby code or lobby id exists
        do {
          lobbyId = generateSecureId();
          lobbyCode = generateRandomId();
          const { results } = await env.prod_plurr.prepare(
            "SELECT * FROM Lobbies WHERE _id = ? OR lobbyCode = ?",
          ).bind(lobbyId, lobbyCode).run();
          found = results.length !== 0;
        } while (found)

        const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

        const imageList: string[] = await uploadImagesToR2(
          lobbyId,
          ownerId,
          imageFiles,
        );

        await env.prod_plurr.prepare(`
          INSERT INTO Lobbies
          (_id, lobbyCode, createdOn, firstUploadOn, ownerId, title, viewersCanEdit, images) VALUES
          (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          lobbyId,
          lobbyCode,
          timestamp,
          imageList.length > 0 ? timestamp : null,
          ownerId,
          title,
          viewersCanEdit,
          JSON.stringify(imageList),
        ).run();

        return new Response(JSON.stringify({
          message: 'Created New Lobby',
          lobbyId,
          lobbyCode,
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        });
      }
    }
    case 'PUT': {
      /**
       * PUT /lobby/lobby-id/{lobby-id}
       * Updates fields of lobby entry and deletes image files if necessary.
       */
      if (pathname.match(/^\/lobby\/lobby-id\/[^\/]+$/)) {
        const propertyNames = ['images', 'title', 'viewersCanEdit'];
        const editedFields: { property: string, value: string }[] = [];

        // get edited fields
        const formData = await request.formData();
        for (const pair of formData.entries()) {
          if (propertyNames.includes(pair[0])) {
            editedFields.push({
              property: pair[0],
              value: pair[1] as string,
            });
          }
        }

        const lobbyId = pathname.replace('/lobby/lobby-id/', '');
        const { results } = await env.prod_plurr.prepare(
          "SELECT * FROM Lobbies WHERE _id = ?",
        ).bind(lobbyId).run();

        if (results.length === 0) {
          return new Response('Lobby Not Found', {
            status: 400
          });
        }
        const { ownerId } = results[0];
        // TODO: add auth

        const deletedImages = formData.get('deletedImages');
        const deletedImageList = typeof deletedImages === 'string' ? JSON.parse(deletedImages) : [];

        const deletePromises = deletedImageList.map(async (imageId: string) => {
          await env.IMAGES_BUCKET.delete(`${lobbyId}/${imageId}`);
        });
        await Promise.all(deletePromises);

        await env.prod_plurr.prepare(`
          UPDATE Lobbies
          SET ${editedFields.map((field, idx) => `${field.property} = '${field.value}'${idx !== editedFields.length - 1 ? ',' : ''}`)}
          WHERE _id = '${lobbyId}'
        `).run();

        return new Response('Updated Lobby Entry', {
          status: 200,
        });
      }
      /**
       * PUT /lobby/lobby-id/{lobbyId}/add-images
       * Uploads new images and updates lobby entry.
       */
      const addImagesRegex = /^\/lobby\/lobby-id\/([^/]+)\/add-images$/;
      const match = pathname.match(addImagesRegex);
      if (match) {
        const lobbyId = match[1];
        const { results } = await env.prod_plurr.prepare(
          "SELECT * FROM Lobbies WHERE _id = ?",
        )
          .bind(lobbyId)
          .run();
        if (results.length === 0) {
          return new Response('Lobby Not Found', {
            status: 400
          });
        }
        const { ownerId, viewersCanEdit, images } = results[0];
        // TODO: add auth (check ownerId and viewersCanEdit)

        const formData = await request.formData();
        const imageFiles: File[] = [];
        let imageCount = 0;
        let image = formData.get('image0') as File;
        while (image) {
          if (image.type !== 'image/jpeg') {
            return new Response('Non JPEG Image File', {
              status: 400,
              headers: {
                Allow: 'POST'
              }
            });
          }
          if (image.size / (1024 * 1024) > 10) {
            return new Response('File Size Too Large', {
              status: 400,
              headers: {
                Allow: 'POST'
              }
            });
          }
          imageFiles.push(image as File);
          imageCount++;
          image = formData.get(`image${imageCount}`) as File;
        }

        const newImageList = await uploadImagesToR2(
          lobbyId,
          ownerId,
          imageFiles,
        );
        const updatedImageList = JSON.stringify([...JSON.parse(images), ...newImageList]);

        await env.prod_plurr.prepare(`
          UPDATE Lobbies
          SET images = '${updatedImageList}'
          WHERE _id = '${lobbyId}'
        `).run();

        return new Response('Added Images to Lobby', {
          status: 200,
        });
      }
    }
    case 'DELETE': {
      /**
       * DELETE /lobby/lobbyId/{lobbyId}
       * Deletes lobby entry, image entries and images associated with the lobby
       */
      if (pathname.match(/^\/lobby\/lobby-id\/[^\/]+$/)) {
        const lobbyId = pathname.replace('/lobby/lobby-id/', '');

        const { results } = await env.prod_plurr.prepare(
          "SELECT * FROM Lobbies WHERE _id = ?",
        )
          .bind(lobbyId)
          .run();
        if (results.length === 0) {
          return new Response('Lobby Not Found', {
            status: 400
          });
        }
        const { ownerId } = results[0];
        // TODO: add auth
        const listed = await env.IMAGES_BUCKET.list({ prefix: `${lobbyId}` });
        await Promise.all(listed.objects.map(
          (object: { key: string }) => env.IMAGES_BUCKET.delete(object.key)
        ));

        await env.prod_plurr.prepare('DELETE FROM Images WHERE lobbyId = ?')
          .bind(lobbyId).run();
        await env.prod_plurr.prepare('DELETE FROM Lobbies WHERE _id = ?')
          .bind(lobbyId).run();

        return new Response('Deleted lobby', {
          status: 200
        });
      }

    }
    default:
      return new Response("Method Not Allowed", {
        status: 405,
        headers: {
          Allow: 'GET, POST, PUT, DELETE'
        }
      });
  }
};

export default lobby;
