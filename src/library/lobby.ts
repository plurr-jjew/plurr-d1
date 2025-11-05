import {
  camelToSnake,
  generateRandomId,
  generateSecureId,
  getTimestamp
} from "../utils";

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
    return Response.json('Lobby not found', {
      status: 404,
    });
  }
  const { images } = results[0];
  const imageList = typeof images === 'string' ? JSON.parse(images) : [];

  const { results: imageResults } = await d1.prepare(
    "SELECT _id, reaction_string from Images WHERE lobby_id = ?"
  ).bind(lobbyId).run();

  // order images in the order from images property of entry
  imageResults.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
    const indexA = imageList.indexOf(a._id);
    const indexB = imageList.indexOf(b._id);

    return indexA - indexB;
  });

  return Response.json({
    ...results[0],
    images: imageResults,
  }, { status: 200 });
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
    return Response.json('Lobby not found', {
      status: 404,
    });
  }
  const { _id: lobbyId, images } = results[0];
  const imageList = typeof images === 'string' ? JSON.parse(images) : [];

  const { results: imageResults } = await d1.prepare(
    "SELECT _id, reaction_string from Images WHERE lobby_id = ?"
  ).bind(lobbyId).run();

  // order images in the order from images property of entry
  imageResults.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
    const indexA = imageList.indexOf(a._id);
    const indexB = imageList.indexOf(b._id);

    return indexA - indexB;
  });

  return Response.json({
    ...results[0],
    images: imageResults,
  }, { status: 200 });
};

/**
 * Creates a new lobby entry
 * 
 * @param request HTTP request object
 * @param d1 D1 instance
 * @param r2 R2 instance
 * @returns HTTP response with lobby code and lobby id
 */
export async function createNewLobby(request: Request, d1: D1Database, r2: R2Bucket) {
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

  // get image fields from formData in format of 'image{n}'
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

/**
 * Updates fields of lobby entry which matches _id and deletes images.
 * 
 * @param request HTTP request object
 * @param lobbyId string to be matched with _id
 * @param d1 D1 instance
 * @param r2 R2 instance
 * @returns HTTP response object
 */
export async function updateLobbyEntry(
  request: Request,
  lobbyId: string,
  d1: D1Database,
  r2: R2Bucket
) {
  // fields to be changed
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

  const { results } = await d1.prepare(
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
    await r2.delete(`${lobbyId}/${imageId}`);
  });
  await Promise.all(deletePromises);

  const setString = editedFields.map((field, idx) =>
    `${camelToSnake(field.property)} = '${field.value}'${idx !== editedFields.length - 1 ? ',' : ''}`);

  await d1.prepare(`
    UPDATE Lobbies
    SET ${setString}
    WHERE _id = ?
  `).bind(lobbyId).run();

  return new Response('Updated Lobby Entry', {
    status: 200,
  });
}

/**
 * Add images to existing lobby and uploads to r2
 * 
 * @param request HTTP request object
 * @param lobbyId string to be matched with _id
 * @param d1 D1 instance
 * @param r2 R2 instance
 * @returns 
 */
export async function addImagesToLobby(
  request: Request,
  lobbyId: string,
  d1: D1Database,
  r2: R2Bucket,
) {
  const { results } = await d1.prepare(
    "SELECT * FROM Lobbies WHERE _id = ?",
  ).bind(lobbyId).run();

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

  // get image fields from formData in format of 'image{n}'
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

  return new Response('Added Images to Lobby', {
    status: 200,
  });
}

/**
 * Deletes lobby entry with matching _id
 * 
 * @param lobbyId string to be matched to _id
 * @param d1 D1 instance
 * @param r2 R2 instance
 * @returns Http response object
 */
export async function deleteLobbyEntry(lobbyId: string, d1: D1Database, r2: R2Bucket) {

  const { results } = await d1.prepare(
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
  const listed = await r2.list({ prefix: `${lobbyId}` });
  await Promise.all(listed.objects.map(
    (object: { key: string }) => r2.delete(object.key)
  ));

  await d1.prepare('DELETE FROM Images WHERE lobby_id = ?')
    .bind(lobbyId).run();
  await d1.prepare('DELETE FROM Lobbies WHERE _id = ?')
    .bind(lobbyId).run();

  return new Response('Deleted lobby', {
    status: 200
  });
}
