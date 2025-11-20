import { generateSecureId, getTimestamp } from "../../utils";

export const joinLobby = async (lobbyId: string, userId: string, d1: D1Database) => {
  const { results } = await d1.prepare(
    "SELECT * FROM JoinedLobbies WHERE lobby_id = ? AND user_id = ?"
  ).bind(lobbyId, userId).run();

  if (results.length === 0) {
    const joinId = generateSecureId();
    await d1.prepare(`
      INSERT INTO JoinedLobbies
      (_id, lobby_id, user_id, joined_on)
      VALUES (?, ?, ?, ?)
    `).bind(joinId, lobbyId, userId, getTimestamp()).run();
    return true;
  } else {
    await d1.prepare(
      "DELETE FROM JoinedLobbies WHERE lobby_id = ? AND user_id = ?"
    ).bind(lobbyId, userId).run();
    return false;
  }

};

export const getJoinedLobbies = async (userId: string, d1: D1Database) => {
  const { results } = await d1.prepare(
    "SELECT lobby_id FROM JoinedLobbies WHERE user_id = ?"
  ).bind(userId).run();

  const { results: lobbyResults } = await d1.prepare(`
    SELECT _id, title, images, created_on
    FROM Lobbies
    WHERE _id IN (${results.map((res) => `"${res.lobby_id}"`).join()})
  `).run();

  return lobbyResults.map(({ _id, created_on, title, images }) => {
    const imageList = JSON.parse(images as string);
    return {
      _id: _id,
      createdOn: created_on,
      title: title,
      firstImageId: imageList[0],
    };
  });
};

