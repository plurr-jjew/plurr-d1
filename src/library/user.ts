/**
 * API endpoints for /user/
 * 
 * @param request request object of HTTP request
 * @param pathname pathname of HTTP request
 * @param env cloudflare env object
 * @returns {Response} HTTP response object for corresponding request
 */
const user = async (
  request: Request,
  pathname: string,
  env: Env,
): Promise<Response> => {
  switch (request.method) {
    case 'GET': {
      if (pathname === '/user/lobbies') {
        const userId = 'test';

        const { results } = await env.prod_plurr.prepare(
          "SELECT * FROM Lobbies WHERE owner_id = ?"
        ).bind(userId).run();

        return Response.json({ results }, {
          status: 200,
        });
      }
      if (pathname === '/user/joined-lobbies') {
        const userId = 'test';

        const { results } = await env.prod_plurr.prepare(
          "SELECT joined_lobbies from Users where _id = ?"
        ).bind(userId).run();

        if (results.length == 0) {
          return new Response('Bad request', {
            status: 400,
          });
        }
        
        const { joined_lobbies: joinedLobbies } = results[0];
        const joinedLobbiesList = typeof joinedLobbies === 'string' ? JSON.parse(joinedLobbies) : [];
        const inString = joinedLobbiesList.map((lobby: LobbyEntry, idx: number) =>
          `${lobby._id}${idx !== joinedResults.length - 1 ? ',' : ''}`);
        const { results: joinedResults } = await env.prod_plurr.prepare(`
            SELECT owner_id, first_upload_on, title, images
            FROM Lobbies
            WHERE _id IN (${inString})
        `).run();

        return Response.json(joinedResults, {
          status: 200,
        });
      }
      break;
    }
    case 'PUT': {
      if (pathname === '/user/join-lobby/') {

      }
      if (pathname === '/user/leave-lobby') {

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
  return new Response('Not Found', {
    status: 404,
  });
}

export default user;
