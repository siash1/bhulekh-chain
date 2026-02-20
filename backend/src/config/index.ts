import { z } from 'zod';

/**
 * Environment configuration schema using Zod for runtime validation.
 * All environment variables are validated at startup — missing or
 * malformed values cause an immediate, descriptive failure.
 */
const envSchema = z.object({
  // --- Hyperledger Fabric ---
  FABRIC_MSP_ID: z.string().min(1),
  FABRIC_CHANNEL_NAME: z.string().min(1),
  FABRIC_CHAINCODE_NAME: z.string().min(1),
  FABRIC_GATEWAY_PEER: z.string().min(1),
  FABRIC_CERT_PATH: z.string().min(1),
  FABRIC_TLS_CERT_PATH: z.string().min(1),

  // --- Algorand ---
  ALGORAND_NETWORK: z.enum(['localnet', 'testnet', 'mainnet']),
  ALGORAND_ALGOD_URL: z.string().url(),
  ALGORAND_INDEXER_URL: z.string().url(),
  ALGORAND_APP_ID: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().int().nonnegative()),
  ALGORAND_ANCHOR_ACCOUNT_MNEMONIC: z.string().min(1),

  // --- Polygon ---
  POLYGON_RPC_URL: z.string().url(),
  POLYGON_TITLE_DEED_CONTRACT: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  POLYGON_DEPLOYER_PRIVATE_KEY: z.string().min(1),

  // --- Database ---
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  // --- IPFS ---
  IPFS_API_URL: z.string().url(),
  IPFS_GATEWAY_URL: z.string().url(),

  // --- Auth ---
  AADHAAR_API_URL: z.string().url(),
  AADHAAR_LICENSE_KEY: z.string().min(1),
  AADHAAR_HASH_SALT: z.string().min(32),
  KEYCLOAK_URL: z.string().url(),
  KEYCLOAK_REALM: z.string().min(1),
  JWT_PUBLIC_KEY_PATH: z.string().min(1),
  JWT_PRIVATE_KEY_PATH: z.string().min(1),
  JWT_ACCESS_TOKEN_EXPIRY: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().int().positive()).default('900'),
  JWT_REFRESH_TOKEN_EXPIRY: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().int().positive()).default('604800'),

  // --- General ---
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().int().positive().max(65535)).default('3001'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGINS: z.string().transform((val) => val.split(',').map((s) => s.trim())).default('http://localhost:3000'),
});

export type EnvConfig = z.infer<typeof envSchema>;

function loadConfig(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    const missingVars: string[] = [];

    for (const [key, value] of Object.entries(formatted)) {
      if (key === '_errors') continue;
      const fieldErrors = value as { _errors?: string[] };
      if (fieldErrors._errors && fieldErrors._errors.length > 0) {
        missingVars.push(`  ${key}: ${fieldErrors._errors.join(', ')}`);
      }
    }

    const errorMessage = [
      '',
      '========================================',
      ' BhulekhChain: Environment Validation Failed',
      '========================================',
      '',
      'The following environment variables are missing or invalid:',
      '',
      ...missingVars,
      '',
      'Copy .env.example to .env and fill in the required values.',
      '========================================',
      '',
    ].join('\n');

    // eslint-disable-next-line no-console
    console.error(errorMessage);
    process.exit(1);
  }

  return result.data;
}

/**
 * Validated, typed configuration object.
 * Accessing any property is guaranteed to return the correct type.
 */
export const config = loadConfig();

/**
 * Derived configuration helpers for convenience.
 */
export const isProduction = config.NODE_ENV === 'production';
export const isDevelopment = config.NODE_ENV === 'development';
export const isStaging = config.NODE_ENV === 'staging';
