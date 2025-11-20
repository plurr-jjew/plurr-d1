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
    isJoined: string;
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
 * Converts string from camel to snake case
 * 
 * @param str input camel case string
 * @returns {string} converted snake case string
 */
export const camelToSnake = (str: string): string => {
  return str
    .replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
    .replace(/^_/, ''); // Remove leading underscore if present
};

/**
 * Converts string from snake case to camel case
 * 
 * @param str input snake case string
 * @returns {string} converted camel case string
 */
export const snakeToCamel = (str: string): string =>
  str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

/**
 * Generates random id using Math.random()
 * @param length 
 * @returns {string} random string with length of length
 */
export const generateRandomId = (length = 6): string => {
  return Math.random().toString(36).substring(2, length + 2);
};

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
 * Gets current time in format of SQL timestamp
 * @returns {string} timestamp in YYYY-MM-DD HH:MI:SS format
 */
export const getTimestamp = (): string => new Date().toISOString().slice(0, 19).replace('T', ' ');

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
 * Gets list of image files from form data 
 * 
 * @param formData formdata from HTTP request
 * @returns list of image files to be uploaded
 */
export const getImageFileList = (formData: FormData): File[] => {
  const imageFiles: File[] = [];
  let imageCount = 0;
  let image = formData.get('image0') as File;
  while (image) {
    if (image.type !== 'image/jpeg') {
      throw new StatusError('Non JPEG Image file', 400);
    }
    if (image.size / (1024 * 1024) > 10) {
      throw new StatusError('File Size Too Large', 400);
    }
    imageFiles.push(image as File);
    imageCount++;
    image = formData.get(`image${imageCount}`) as File;
  }

  return imageFiles;
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
