import type { D1Database, IncomingRequestCfProperties } from '@cloudflare/workers-types';
import { betterAuth } from 'better-auth';
import { withCloudflare } from 'better-auth-cloudflare';
import { anonymous, phoneNumber } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import { schema } from '../db';
import type { CloudflareBindings } from '../env';

// Single auth configuration that handles both CLI and runtime scenarios
function createAuth(env?: CloudflareBindings, cf?: IncomingRequestCfProperties) {
  // Use actual DB for runtime, empty object for CLI
  const db = env ? drizzle(env.dev_plurr, { schema, logger: true }) : ({} as any);

  return betterAuth({
    ...withCloudflare(
      {
        autoDetectIpAddress: true,
        geolocationTracking: true,
        cf: cf || {},
        d1: env
          ? {
            db,
            options: {
              usePlural: true,
              debugLogs: true,
            },
          }
          : undefined,
        kv: env?.KV_USERS,
      },
      {
        emailAndPassword: {
          enabled: false,
        },
        basePath: "/api/auth",
        plugins: [
          phoneNumber({
            sendOTP: async ({ phoneNumber, code }, request) => {
              // Implement sending OTP code via SMS
              console.log(phoneNumber, code);
            },
            signUpOnVerification: {
              getTempEmail: (phoneNumber) => {
                console.log('temp email', phoneNumber);
                return `${phoneNumber}@plurr.it`
              },
              //optionally, you can also pass `getTempName` function to generate a temporary name for the user
              getTempName: (phoneNumber) => {
                console.log('temp name', phoneNumber)
                return phoneNumber //by default, it will use the phone number as the name
              }
            }
          }),
        ],
        rateLimit: {
          enabled: false,
          window: 60, // Minimum KV TTL is 60s
          max: 100, // reqs/window
          customRules: {
            '/phone-number/send-otp': {
              window: 60,
              max: 100,
            },
            '/phone-number/verify': {
              window: 60,
              max: 100,
            },
          },
        },
      },
    ),
    // Only add database adapter for CLI schema generation
    ...(env
      ? {}
      : {
        database: drizzleAdapter({} as D1Database, {
          provider: 'sqlite',
          usePlural: true,
          debugLogs: true,
        }),
      }),
  });
}

// Export for CLI schema generation
export const auth = createAuth();

// Export for runtime usage
export { createAuth };