export const generateRandomId = (length = 6) => {
  return Math.random().toString(36).substring(2, length + 2);
};

export const generateSecureId = (length = 16) => {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(36)).join('').substring(0, length);
}

export const getTimestamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
