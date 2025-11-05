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
import lobby from "./lobby";
import image from "./image";

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const { pathname } = new URL(request.url);
		try {
			if (pathname.match(/^\/lobby\//)) {
				return lobby(request, pathname, env);
			}
			if (pathname.match(/^\/lobbies\//)) {

			}
			if (pathname.match(/^\/image\//)) {
				return image(request, pathname, env);
			}
		} catch (error: any) {
			console.error(error);
			return new Response('Internal Server Error', {
				status: 500,
				statusText: error.message ? error.message : '',
			})
		}

		return new Response('Hello World!');
	},
} satisfies ExportedHandler<Env>;
