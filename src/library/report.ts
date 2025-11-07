import { generateSecureId } from "../utils";

/**
 * Creates new report entry in database
 * 
 * @param request HTTP request object
 * @param d1 D1 database instance
 * @returns HTTP response object
 */
export async function createNewReport(request: Request, d1: D1Database) {
  const formData = await request.formData()
  const lobbyId = formData.get('lobbyId');
  const creatorId = formData.get('creatorId');
  const email = formData.get('email');
  const msg = formData.get('msg');

  if (!lobbyId || !email || !msg) {
    return new Response('Missing Required Fields', {
      status: 400,
    });
  }

  await d1.prepare(`
    INSERT INTO Reports
    (_id, status, lobby_id, creator_id, email, msg) VALUES
    (?, 'open', ?, ?, ?, ?)
  `).bind(generateSecureId(12), lobbyId, creatorId, email, msg).run();

  // const { results } = await d1.prepare("SELECT * FROM Reports").run();
  // console.log(results);

  return new Response('Created New Report', {
    status: 200,
  });
}
