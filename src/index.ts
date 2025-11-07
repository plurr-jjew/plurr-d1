import _routes from './routes';

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
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,DELETE,OPTIONS',
			'Access-Control-Max-Age': '86400',
		};

		const d1 = env.prod_plurr;
		const r2 = env.IMAGES_BUCKET;
		const r2Images = env.IMAGES;

		const routes = _routes(request, d1, r2, r2Images);
		const matcher = createRouteMatcher(routes);

		async function handleOptions(request: Request) {
			// Handle Preflight Requests
			return new Response(null, {
				status: 204,
				headers: {
					'Access-Control-Allow-Credentials': 'true',
					'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Headers': 'Content-Type'
				}
			});
		}

		const url = new URL(request.url);
		if (request.method === 'OPTIONS') {
			// Handle CORS preflight requests
			return handleOptions(request);
		} else if (
			request.method === 'GET' ||
			request.method === 'HEAD' ||
			request.method === 'POST' ||
			request.method === 'PUT' ||
			request.method === 'DELETE'
		) {
			// Handle requests to the API server
			return matcher(request.method, url.pathname);
		} else {
			return new Response(null, {
				status: 405,
				statusText: 'Method Not Allowed',
			});
		}

	},
} satisfies ExportedHandler<Env>;
