import * as authSchema from './auth.schema';
import * as lobbySchema from './lobby.schema';

export const schema = {
    ...authSchema,
    ...lobbySchema,
} as const;
