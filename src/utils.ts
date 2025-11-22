import { jsonHeader } from './library/headers';
import { StatusError } from './StatusError';

declare global {
  interface Route {
    method: 'GET' | 'POST' | 'DELETE' | 'PUT';
    pathname: string;
    action: ((params: { [key: string]: string }) => Promise<Response>) | (() => Promise<Response>);
  }

  interface LobbyEntry {
    _id: string;
    lobbyCode: string;
    createdOn: string;
    firstUploadOn: string;
    ownerId: string;
    title: string;
    isJoined: boolean;
    backgroundColor: string;
    viewersCanEdit: boolean;
    images: string[] | { [key: string]: any }[];
  }

  interface ImageEntry {
    _id: string;
    lobbyId: string;
    uploadedOn: string;
    uploaderId: string;
    reactionString: string;
  }

  interface ReactionEntry {
    _id: string;
    userId: string;
    lobbyId: string;
    imageId: string;
    createdOn: string;
    reaction: string;
  }
}

/**
 * Generates random id
 * @param length 
 * @returns {string} random id with length of length
 */
export const generateSecureId = (length = 16): string => {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(36)).join('').substring(0, length);
}

/**
 * Gets current time as date string
 * @returns {string} timestamp in ISO format
 */
export const getTimestamp = (): string => new Date().toISOString();

/**
 * Gets display string of an image entry's reactions
 * @param reactions list of reactions from an image entry
 * @returns {string} display string representing number of reactions and the first 3 emojis reactions
 */
export const getReactionDisplayString = (reactions: string[]): string => {
  if (reactions.length === 0) {
    return '0';
  }
  const displayReactions: string[] = [];
  for (let i = 0; i < reactions.length && displayReactions.length < 4; i++) {
    if (
      !displayReactions.includes(reactions[i]) &&
      reactions[i] !== 'like'
    ) {
      displayReactions.push(reactions[i]);
    }
  }
  return `${reactions.length} ${displayReactions.join('')}`;
};

/**
 * Takes error object and creates a corresponding HTTP response
 * 
 * @param error Error object
 * @returns HTTP response object with corresponding message and status code
 */
export const getErrorResponse = (error: unknown): Response => {
  let msg = 'Internal Server Error';
  let status = 500;
  
  if (error instanceof StatusError) {
    msg = error.message;
    status = error.statusCode;
  }

  console.error(error);
  return new Response(msg, {
    status,
    headers: jsonHeader(),
  });
}
