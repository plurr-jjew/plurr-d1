import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1';
import { R2Bucket, ImagesBinding, ReadableStream } from "@cloudflare/workers-types";

import { createAuth } from './library/auth';
import { getImage, handleImageReact, uploadImage } from './library/actions/image';
import {
	getLobbyIdByCode,
	getLobbyById,
	getLobbyByCode,
	getLobbiesByUser,
	createNewLobby,
	updateLobbyEntry,
	addImagesToLobby,
	deleteLobbyEntry,
	createDraftLobby,
} from './library/actions/lobby';
import { getJoinedLobbies, joinLobby } from './library/actions/user';
import { createNewReport } from './library/actions/report';

import { getErrorResponse, getImageFileList } from './utils';
import { jsonHeader } from './library/headers';
import { StatusError } from './StatusError';
import { CloudflareBindings } from './library/env';

/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

type Variables = {
	auth: ReturnType<typeof createAuth>;
	db: DrizzleD1Database;
	imagesBucket: R2Bucket;
	imagesWorker: ImagesBinding;
};

const app = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

app.use(cors({
	origin: 'http://localhost:8081', // Or a function to dynamically determine origin
	allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
	allowHeaders: ['Content-Type', 'Authorization'],
	maxAge: 3600, // Optional: cache preflight response for 1 hour
	credentials: true // Optional: allow credentials
}));

// Middleware to initialize auth instance for each request
app.use('*', async (c, next) => {
	const auth = createAuth(c.env, (c.req.raw as any).cf || {});
	const db = drizzle(c.env.dev_plurr);
	const imagesBucket = c.env.IMAGES_BUCKET as R2Bucket;
	const imagesWorker = c.env.IMAGES as ImagesBinding;

	c.set('auth', auth);
	c.set('db', db);
	c.set('imagesBucket', imagesBucket);
	c.set('imagesWorker', imagesWorker);

	await next();
});

// Handle all auth routes
app.all('/api/auth/*', async c => {
	const auth = c.get('auth');
	// console.log(c.req.raw);

	return auth.handler(c.req.raw);
});

/* -------------------------------------------------------------------------- */
/*                             Image Endpoints.                               */
/* -------------------------------------------------------------------------- */

/**
 *  Gets image that matches lobby _id and image _id
 */
app.get('/image/:lobbyId/:imageId', async (c, next) => {
	try {
		const imagesBucket = c.get('imagesBucket');
		const imagesWorker = c.get('imagesWorker');
		const lobbyId = c.req.param('lobbyId');
		const imageId = c.req.param('imageId');

		const image = await getImage(
			new Headers(c.req.header()),
			lobbyId,
			imageId,
			imagesBucket,
			imagesWorker,
		);

		if (!image) {
			throw new Error('Failed to get image');
		}

		return image as Response;
	} catch (error) {
		return getErrorResponse(error);
	}
});

/**
 *  Uploads image and assigns it to lobby with matching _id
 */
app.post('/image/lobby-id/:lobbyId', async (c, next) => {
	try {
		const auth = c.get('auth');
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});

		if (!session) {
			return new Response('Unauthorized', {
				status: 403, headers: jsonHeader(),
			});
		}

		const db = c.get('db');
		const imagesBucket = c.get('imagesBucket');

		const lobbyId = c.req.param('lobbyId') as string;
		const formData = await c.req.formData();
		const image = formData.get('image') as unknown as ReadableStream<any>;

		const uploadRes = await uploadImage(
			lobbyId,
			session.user.id,
			image,
			db,
			imagesBucket,
		);

		return new Response(uploadRes, {
			status: 200, headers: jsonHeader(),
		});
	} catch (error) {
		return getErrorResponse(error);
	}
});

/**
 *  Handles reaction action from user on an image
 */
app.put('/image/:id/react', async (c, next) => {
	try {
		const auth = c.get('auth');
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});

		if (!session) {
			return new Response('Unauthorized', {
				status: 403, headers: jsonHeader(),
			});
		}

		const db = c.get('db');

		const { dev_plurr } = c.env;
		const imageId = c.req.param('id');

		const formData = await c.req.formData();
		const userId = await formData.get('userId') as string;
		const newReaction = await formData.get('reaction') as string;

		const reactionRes = await handleImageReact(
			imageId,
			userId,
			newReaction,
			db
		);

		return Response.json(reactionRes, {
			status: 200, headers: jsonHeader(),
		});
	} catch (error) {
		return getErrorResponse(error);
	}
});

/* -------------------------------------------------------------------------- */
/*                             Lobby Endpoints.                               */
/* -------------------------------------------------------------------------- */

/**
 * Gets _id of corresponding lobby with matching lobbyCode.
 */
app.get('/lobby-id/code/:code', async (c, next) => {
	try {
		const db = c.get('db');
		const lobbyCode = c.req.param('code');

		const lobbyId = await getLobbyIdByCode(lobbyCode, db);

		return Response.json(lobbyId, {
			status: 200, headers: jsonHeader(),
		});
	} catch (error) {
		return getErrorResponse(error);
	}
});

/**
 * Gets lobby entry of corresponding lobby with matching _id.
 */
app.get('/lobby/id/:id', async (c, next) => {
	try {
		const auth = c.get('auth');
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});
		const userId = session?.user.id;

		const db = c.get('db');
		const lobbyId = c.req.param('id');

		const lobbyEntry = await getLobbyById(lobbyId, userId, db);

		return Response.json(lobbyEntry, {
			status: 200, headers: jsonHeader(),
		});
	} catch (error) {
		return getErrorResponse(error);
	}
});

/**
 * Gets lobby entry of corresponding lobby with matching lobby_code.
 */
app.get('/lobby/code/:code', async (c, next) => {
	try {
		const auth = c.get('auth');
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});
		const userId = session?.user.id;

		const db = c.get('db');
		const lobbyCode = c.req.param('code');

		const lobbyEntry = await getLobbyByCode(lobbyCode, userId, db);

		return Response.json(lobbyEntry, {
			status: 200, headers: jsonHeader(),
		});
	} catch (error) {
		return getErrorResponse(error);
	}
});

/**
 * Gets list of corresponding lobby entries with matching user_id.
 */
app.get('/lobby/user/:userId', async (c, next) => {
	try {
		const auth = c.get('auth');
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});
		const userId = c.req.param('userId');

		if (!session || session?.user.id !== userId) {
			return new Response('Unauthorized', {
				status: 403, headers: jsonHeader(),
			});
		}

		const db = c.get('db');

		const lobbyEntries = await getLobbiesByUser(userId, db);

		return Response.json(lobbyEntries, {
			status: 200, headers: jsonHeader(),
		});
	} catch (error) {
		return getErrorResponse(error);
	}
});

/**
 * Gets joined lobbies of corresponding user with matching id.
 */
app.get('/joined-lobbies', async (c, next) => {
	try {
		const auth = c.get('auth');
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});
		if (!session) {
			return new Response('Unauthorized', {
				status: 403, headers: jsonHeader(),
			})
		}
		const userId = session.user.id;
		const db = c.get('db');

		const lobbyEntries = await getJoinedLobbies(userId, db);

		return Response.json(lobbyEntries, {
			status: 200, headers: jsonHeader(),
		});
	} catch (error) {
		console.error(error);
		return getErrorResponse(error);
	}
});

/**
 * Creates a new lobby entry as a draft.
 */
app.post('/lobby/draft', async (c, next) => {
	try {
		const auth = c.get('auth');
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});
		if (!session) {
			return new Response('Unauthorized', {
				status: 403, headers: jsonHeader(),
			})
		}

		const db = c.get('db');
		const formData = await c.req.formData();
		const ownerId = formData.get('ownerId') as string;
		const title = formData.get('title') as string;
		const backgroundColor = formData.get('backgroundColor') as string;
		const viewersCanEdit = formData.get('viewersCanEdit') as string;

		const lobbyId = await createDraftLobby(
			ownerId,
			title,
			backgroundColor,
			viewersCanEdit,
			db,
		);

		return new Response(lobbyId, {
			status: 200, headers: jsonHeader(),
		});

	} catch (error) {
		return getErrorResponse(error);
	}
});

app.post('/lobby', async (c, next) => {
	const auth = c.get('auth');
	const session = await auth.api.getSession({
		headers: c.req.raw.headers,
	});
	if (!session) {
		return new Response('Unauthorized', {
			status: 403, headers: jsonHeader(),
		})
	}

	try {
		const { dev_plurr, IMAGES_BUCKET } = c.env;

		const formData = await c.req.formData();
		const ownerId = formData.get('ownerId') as string;
		const viewersCanEdit = formData.get('viewersCanEdit') as string;
		const title = formData.get('title') as string;
		const backgroundColor = formData.get('backgroundColor') as string;

		if (!ownerId || !viewersCanEdit || !title) {
			throw new StatusError('Missing Form Data', 400);
		}

		const imageFiles = await getImageFileList(formData);

		const res = await createNewLobby(
			ownerId,
			title,
			backgroundColor,
			imageFiles,
			viewersCanEdit,
			dev_plurr,
			IMAGES_BUCKET
		);

		return new Response(JSON.stringify(res), {
			status: 200,
			headers: jsonHeader(),
		});
	} catch (error) {
		return getErrorResponse(error);
	}
});

/**
 * Updates entry of lobby with corresponding _id.
 */
app.put('/lobby/id/:id', async (c, next) => {
	try {
		const auth = c.get('auth');
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});

		if (!session) {
			return new Response('Unauthorized', {
				status: 403, headers: jsonHeader(),
			});
		}
		const currentUserId = session.user.id;

		const db = c.get('db');
		const imagesBucket = c.get('imagesBucket');
		const lobbyId = c.req.param('id');

		// fields to be changed
		const editableFields = ['title', 'backgroundColor', 'viewersCanEdit', 'isDraft', 'images'];
		const body = await c.req.json();

		for (let key in body.changes) {
			if (!editableFields.includes(key)) {
				return new Response('Bad request', {
					status: 400, headers: jsonHeader(),
				});
			}
		}

		const addedImages = body.addedImages?.length !== 0 ? body.addedImages : [];
		const deletedImages = body.deletedImages?.length !== 0 ? body.deletedImages : [];
		const changes = body.changes ? body.changes : null;

		const updateRes = await updateLobbyEntry(
			lobbyId,
			currentUserId,
			changes,
			addedImages,
			deletedImages,
			db,
			imagesBucket,
		);

		return Response.json(updateRes, {
			status: 200, headers: jsonHeader(),
		});
	} catch (error) {
		return getErrorResponse(error);
	}
});

app.put('/lobby/id/:id/upload', async (c, next) => {
	const auth = c.get('auth');
	const session = await auth.api.getSession({
		headers: c.req.raw.headers,
	});

	if (!session) {
		return new Response('Unauthorized', {
			status: 403, headers: jsonHeader(),
		});
	}

	try {
		const { dev_plurr, IMAGES_BUCKET } = c.env;
		const lobbyId = c.req.param('id');

		const formData = await c.req.formData();

		const imageFiles = await getImageFileList(formData);

		const newImageList = await addImagesToLobby(lobbyId, imageFiles, dev_plurr, IMAGES_BUCKET);

		return Response.json(newImageList, {
			status: 200, headers: jsonHeader(),
		});
	} catch (error) {
		return getErrorResponse(error);
	}
});

/**
 * Toggles joined lobby for user for lobby with corresponding id.
 */
app.put('/lobby/id/:id/join', async (c, next) => {
	try {
		const auth = c.get('auth');
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});
		if (!session) {
			return new Response('Unauthorized', {
				status: 403, headers: jsonHeader(),
			})
		}
		const userId = session?.user.id;

		const db = c.get('db');
		const lobbyId = c.req.param('id');

		const joinedLobbyEntries = await joinLobby(lobbyId, userId, db);

		return Response.json(joinedLobbyEntries, {
			status: 200, headers: jsonHeader(),
		});
	} catch (error) {
		return getErrorResponse(error);
	}
});

/**
 * Deletes lobby entry with matching _id and corresponding images from R2 bucket
 */
app.delete('/lobby/id/:id', async (c, next) => {
	try {
		const auth = c.get('auth');
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});

		if (!session) {
			return new Response('Unauthorized', {
				status: 403, headers: jsonHeader(),
			});
		}
		const currentUserId = session.user.id;

		const db = c.get('db');
		const imagesBucket = c.get('imagesBucket');
		const lobbyId = c.req.param('id');

		await deleteLobbyEntry(lobbyId, currentUserId, db, imagesBucket);

		return new Response('Deleted lobby entry', {
			status: 200, headers: jsonHeader(),
		});
	} catch (error) {
		return getErrorResponse(error);
	}
});

/* -------------------------------------------------------------------------- */
/*                             Report Endpoints.                              */
/* -------------------------------------------------------------------------- */

app.post('/report', async (c, next) => {
	try {
		const { dev_plurr } = c.env;
		const formData = await c.req.formData();
		const lobbyId = formData.get('lobbyId') as string;
		const creatorId = formData.get('creatorId') as string;
		const email = formData.get('email') as string;
		const msg = formData.get('msg') as string;

		await createNewReport(lobbyId, creatorId, email, msg, dev_plurr);

		return new Response('Created new report', {
			status: 200, headers: jsonHeader(),
		});
	} catch (error) {
		return getErrorResponse(error);
	}
});

// Simple health check
app.get('/health', c => {
	return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default {
	fetch: app.fetch,
	// scheduled: async (batch, env) => { },
};
