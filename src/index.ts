import { getImage, handleImageReact } from './library/image';
import {
  getLobbyById,
  getLobbyByCode,
  createNewLobby,
  updateLobbyEntry,
  addImagesToLobby,
  deleteLobbyEntry,
} from './library/lobby';
import { createNewReport } from './library/report';

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

function createRouteMatcher(routes: Route[]) {
	return function matchRoute(method: string, path: string) {
		for (const route of routes) {
			const { method: routeMethod, pathname, action } = route;

			// Convert route path to a regex pattern to handle dynamic segments
			const pattern = new RegExp(`^${pathname.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`);
			const match = path.match(pattern);
			if (match && method === routeMethod) {
				// Extract named parameters
				const params = match.groups || {};
				return action(params);
			}
		}
		return new Response('Not Found', {
			status: 404,
		}); // No match found
	};
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const d1 = env.prod_plurr;
		const r2 = env.IMAGES_BUCKET;
		const r2Images = env.IMAGES;

		const routes: Route[] = [
			{
				method: 'GET',
				pathname: '/image/:lobbyId/:imageId',
				action: (params: { [key: string]: string }) => getImage(request, params.lobbyId, params.imageId, r2, r2Images),
			},
			{
				method: 'PUT',
				pathname: '/image/:id/react',
				action: (params: { [key: string]: string }) => handleImageReact(request, params.id, d1),
			},
			{
				method: 'GET',
				pathname: '/lobby/id/:id',
				action: (params: { [key: string]: string }) => getLobbyById(params.id, d1),
			},
			{
				method: 'GET',
				pathname: '/lobby/code/:code',
				action: (params: { [key: string]: string }) => getLobbyByCode(params.code, d1),
			},
			{
				method: 'POST',
				pathname: '/lobby',
				action: () => createNewLobby(request, d1, r2),
			},
			{
				method: 'PUT',
				pathname: '/lobby/id/:id',
				action: (params: { [key: string]: string }) => updateLobbyEntry(request, params.id, d1, r2),
			},
			{
				method: 'PUT',
				pathname: '/lobby/id/:id/upload',
				action: (params: { [key: string]: string }) => addImagesToLobby(request, params.id, d1, r2),
			},
			{
				method: 'DELETE',
				pathname: '/lobby/id/:id',
				action: (params: { [key: string]: string }) => deleteLobbyEntry(params.id, d1, r2),
			},
			{
				method: 'POST',
				pathname: '/report',
				action: () => createNewReport(request, d1),
			},
		];

		const { pathname } = new URL(request.url);
		const matcher = createRouteMatcher(routes);
		return matcher(request.method, pathname);
	},
} satisfies ExportedHandler<Env>;
