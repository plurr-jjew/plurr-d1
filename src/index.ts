import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { getImage, handleImageReact } from './library/image';
import {
	getLobbyIdByCode,
	getLobbyById,
	getLobbyByCode,
	createNewLobby,
	updateLobbyEntry,
	addImagesToLobby,
	deleteLobbyEntry,
} from './library/lobby';
import { createNewReport } from './library/report';

import { getErrorResponse, getImageFileList } from './utils';
import { jsonHeader } from './library/headers';
import { StatusError } from './StatusError';

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


type Bindings = {
	prod_plurr: D1Database;
	IMAGES_BUCKET: R2Bucket;
	IMAGES: any;
}
const app = new Hono<{ Bindings: Bindings }>()


app.use(cors({
	origin: 'http://localhost:8081', // Or a function to dynamically determine origin
	allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
	allowHeaders: ['Content-Type', 'Authorization'],
	maxAge: 3600, // Optional: cache preflight response for 1 hour
	credentials: true // Optional: allow credentials
}));
/**
 *  Image Endpoints
 */
app.get('/image/:lobbyId/:imageId', async (c, next) => {
	try {
		const { IMAGES_BUCKET, IMAGES } = c.env;
		const lobbyId = c.req.param('lobbyId');
		const imageId = c.req.param('imageId');

		const image = await getImage(
			new Headers(c.req.header()),
			lobbyId,
			imageId,
			IMAGES_BUCKET,
			IMAGES
		);

		return image;
	} catch (error) {
		return getErrorResponse(error);
	}
});

app.put('/image/:id/react', async (c, next) => {
	try {
		const { prod_plurr } = c.env;
		const imageId = c.req.param('id');

		const formData = await c.req.formData();
		const userId = await formData.get('userId') as string;
		const newReaction = await formData.get('reaction') as string;

		const updatedReactionString = await handleImageReact(imageId, userId, newReaction, prod_plurr);

		return Response.json(updatedReactionString, {
			status: 200, headers: jsonHeader(),
		});
	} catch (error) {
		return getErrorResponse(error);
	}
});

/**
 *  Lobby Endpoints
 */

app.get('/lobby-id/code/:code', async (c, next) => {
	try {
		const { prod_plurr } = c.env;
		const lobbyCode = c.req.param('code');

		const lobbyId = await getLobbyIdByCode(lobbyCode, prod_plurr);

		return Response.json(lobbyId, {
			status: 200, headers: jsonHeader(),
		});
	} catch (error) {
		return getErrorResponse(error);
	}
});

app.get('/lobby/id/:id', async (c, next) => {
	try {
		const { prod_plurr } = c.env;
		const lobbyId = c.req.param('id');

		const lobbyEntry = await getLobbyById(lobbyId, prod_plurr);

		return Response.json(lobbyEntry, {
			status: 200, headers: jsonHeader(),
		});
	} catch (error) {
		return getErrorResponse(error);
	}
});

app.get('/lobby/code/:code', async (c, next) => {
	try {
		const { prod_plurr } = c.env;
		const lobbyCode = c.req.param('code');

		const lobbyEntry = await getLobbyByCode(lobbyCode, prod_plurr);

		return Response.json(lobbyEntry, {
			status: 200, headers: jsonHeader(),
		});
	} catch (error) {
		return getErrorResponse(error);
	}
});

app.post('/lobby', async (c, next) => {
	try {
		const { prod_plurr, IMAGES_BUCKET } = c.env;

		const formData = await c.req.formData();
		const ownerId = formData.get('ownerId') as string;
		const viewersCanEdit = formData.get('viewersCanEdit') as string;
		const title = formData.get('title') as string;

		if (!ownerId || !viewersCanEdit || !title) {
			throw new StatusError('Missing Form Data', 400);
		}

		const imageFiles = await getImageFileList(formData);

		const res = await createNewLobby(ownerId, title, imageFiles, viewersCanEdit, prod_plurr, IMAGES_BUCKET);

		return new Response(JSON.stringify(res), {
			status: 200,
			headers: jsonHeader(),
		});
	} catch (error) {
		return getErrorResponse(error);
	}
});

app.put('/lobby/id/:id', async (c, next) => {
	try {
		const { prod_plurr, IMAGES_BUCKET } = c.env;
		const lobbyId = c.req.param('id');

		// fields to be changed
		const propertyNames = ['images', 'title', 'viewersCanEdit'];
		const editedFields: { property: string, value: string }[] = [];
		// get edited fields
		const formData = await c.req.formData();
		console.log(formData);
		for (const pair of formData.entries()) {
			if (propertyNames.includes(pair[0])) {
				editedFields.push({
					property: pair[0],
					value: pair[1] as string,
				});
			}
		}

		const deletedImages = formData.get('deletedImages');
		const deletedImageList = typeof deletedImages === 'string' ? JSON.parse(deletedImages) : [];

		await updateLobbyEntry(lobbyId, editedFields, deletedImageList, prod_plurr, IMAGES_BUCKET);

		return new Response('Updated Lobby Entry', {
			status: 200, headers: jsonHeader(),
		});
	} catch (error) {
		return getErrorResponse(error);
	}
});

app.put('/lobby/id/:id/upload', async (c, next) => {
	try {
		const { prod_plurr, IMAGES_BUCKET } = c.env;
		const lobbyId = c.req.param('id');

		const formData = await c.req.formData();
		console.log(lobbyId)

		const imageFiles = await getImageFileList(formData);

		const newImageList = await addImagesToLobby(lobbyId, imageFiles, prod_plurr, IMAGES_BUCKET);

		return Response.json(newImageList, {
			status: 200, headers: jsonHeader(),
		});
	} catch (error) {
		return getErrorResponse(error);
	}
});

app.delete('/lobby/id/:id', async (c, next) => {
	try {
		const { prod_plurr, IMAGES_BUCKET } = c.env;
		const lobbyId = c.req.param('id');

		await deleteLobbyEntry(lobbyId, prod_plurr, IMAGES_BUCKET);

		return new Response('Deleted lobby entry', {
			status: 200, headers: jsonHeader(),
		});
	} catch (error) {
		return getErrorResponse(error);
	}
});

/**
 *  Report Endpoints
 */

app.post('/report', async (c, next) => {
	try {
		const { prod_plurr } = c.env;
		const formData = await c.req.formData();
		const lobbyId = formData.get('lobbyId') as string;
		const creatorId = formData.get('creatorId') as string;
		const email = formData.get('email') as string;
		const msg = formData.get('msg') as string;

		await createNewReport(lobbyId, creatorId, email, msg, prod_plurr);

		return new Response('Created new report', {
			status: 200, headers: jsonHeader(),
		});
	} catch (error) {
		return getErrorResponse(error);
	}
})

export default {
	fetch: app.fetch,
	// scheduled: async (batch, env) => { },
};
