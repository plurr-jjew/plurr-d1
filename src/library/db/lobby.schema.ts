import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const lobbies = sqliteTable('Lobbies', {
  _id: text('_id').primaryKey(),
  lobbyCode: text('lobby_code').notNull().unique(),
  createdOn: integer('created_on', { mode: 'timestamp_ms' })
    .notNull(),
  firstUploadOn: integer('first_upload_on', { mode: 'timestamp_ms' }),
  owner_id: text('owner_id').notNull(),
  title: text('title').notNull(),
  viewersCanEdit: integer('viewers_can_edit').notNull(),
  images: text('images').notNull(),
});

export const images = sqliteTable('Images', {
  _id: text('_id').primaryKey(),
  lobbyId: text('lobby_id')
    .notNull()
    .references(() => lobbies._id, { onDelete: 'cascade' }),
  uploadedOn: integer('uploaded_on', { mode: 'timestamp_ms' }).notNull(),
  uploaderId: text('uploader_id').notNull(),
  reactionString: text('reaction_string').notNull(),
});

export const reactions = sqliteTable('Reactions', {
  _id: text('_id').primaryKey(),
  userId: text('user_id').notNull(),
  lobbyId: text('lobby_id')
    .notNull()
    .references(() => lobbies._id, { onDelete: 'cascade' }),
  imageId: text('image_id')
    .notNull()
    .references(() => images._id, { onDelete: 'cascade' }),
  createdOn: integer('created_on', { mode: 'timestamp_ms' })
    .notNull(),
  reaction: text('reaction').notNull(),
});

export const reports = sqliteTable('Reports', {
  _id: text('_id').primaryKey().notNull(),
  status: text('status').notNull(),
  lobbyId: text('lobby_id')
    .notNull()
    .references(() => lobbies._id),
  creatorId: text('creator_id').notNull(),
  email: text('email').notNull(),
  msg: text('msg').notNull(),
});
