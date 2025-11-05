DROP TABLE IF EXISTS Lobbies;
DROP TABLE IF EXISTS Reactions;
CREATE TABLE IF NOT EXISTS Lobbies (_id TEXT PRIMARY KEY, lobbyCode TEXT, createdOn TIMESTAMP, firstUploadOn TIMESTAMP, ownerId TEXT, title TEXT, viewersCanEdit BOOLEAN, images TEXT[]);
CREATE TABLE IF NOT EXISTS Images (_id TEXT PRIMARY KEY, lobbyId TEXT, uploadedOn TIMESTAMP, uploaderId TEXT);
CREATE TABLE IF NOT EXISTS Reactions (_id TEXT PRIMARY KEY, userId TEXT, lobbyId TEXT, imageId TEXT, createdOn TIMESTAMP, reaction TEXT);
CREATE TABLE IF NOT EXISTS Users (_id TEXT PRIMARY KEY, joinedLobbies TEXT[]);
INSERT INTO Lobbies (_id, lobbyCode, createdOn, firstUploadOn, ownerId, viewersCanEdit, images) VALUES (1, '666420', '2025-11-04 11:54:00', NULL, 'testId', TRUE, '[]');