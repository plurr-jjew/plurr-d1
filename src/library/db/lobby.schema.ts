import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from './auth.schema';

export const lobbies = sqliteTable('Lobbies', {
  _id: text('_id').primaryKey().unique(),
  lobbyCode: text('lobby_code').notNull().unique(),
  createdOn: text('created_on').notNull(),
  firstUploadOn: text('first_upload_on'),
  ownerId: text('owner_id').notNull(),
  title: text('title').notNull(),
  backgroundColor: text('background_color').notNull().default('#e69c09'),
  viewersCanEdit: integer('viewers_can_edit', { mode: 'boolean' }).default(false).notNull(),
  isDraft: integer('is_draft', { mode: 'boolean' }).default(true).notNull(),
  images: text('images').notNull(),
});

export const images = sqliteTable('Images', {
  _id: text('_id').primaryKey().unique(),
  lobbyId: text('lobby_id')
    .notNull()
    .references(() => lobbies._id, { onDelete: 'cascade' }),
  uploadedOn: text('uploaded_on').notNull(),
  uploaderId: text('uploader_id').notNull(),
  reactionString: text('reaction_string').notNull(),
});

export const joinedLobbies = sqliteTable('JoinedLobbies', {
  _id: text('_id').primaryKey().unique(),
  lobbyId: text('lobby_id')
    .notNull()
    .references(() => lobbies._id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  joinedOn: text('joined_on').notNull(),
});

export const reactions = sqliteTable('Reactions', {
  _id: text('_id').primaryKey().unique(),
  userId: text('user_id').notNull(),
  lobbyId: text('lobby_id')
    .notNull()
    .references(() => lobbies._id, { onDelete: 'cascade' }),
  imageId: text('image_id')
    .notNull()
    .references(() => images._id, { onDelete: 'cascade' }),
  createdOn: text('created_on')
    .notNull(),
  reaction: text('reaction').notNull(),
});

export const reports = sqliteTable('Reports', {
  _id: text('_id').primaryKey().notNull().unique(),
  status: text('status').notNull(),
  lobbyId: text('lobby_id')
    .notNull()
    .references(() => lobbies._id),
  creatorId: text('creator_id').notNull(),
  createdOn: text('created_on').notNull(),
  email: text('email').notNull(),
  msg: text('msg').notNull(),
});
