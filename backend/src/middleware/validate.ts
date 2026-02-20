import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError, type ZodType } from 'zod';
import { createServiceLogger } from '../config/logger.js';

const log = createServiceLogger('validation-middleware');

/**
 * Structured validation error for consistent API responses.
 */
class ZodValidationError extends Error {
  public readonly code = 'VALIDATION_ERROR';
  public readonly statusCode = 400;
  public readonly validationErrors: Record<string, string[]>;

  constructor(zodError: ZodError) {
    const flattened = zodError.flatten();

    // Combine field errors into a readable message
    const fieldMessages: string[] = [];
    for (const [field, errors] of Object.entries(flattened.fieldErrors)) {
      if (errors && errors.length > 0) {
        fieldMessages.push(`${field}: ${errors.join(', ')}`);
      }
    }

    // Include form-level errors (non-field-specific)
    if (flattened.formErrors.length > 0) {
      fieldMessages.push(...flattened.formErrors);
    }

    const message =
      fieldMessages.length > 0
        ? `Validation failed: ${fieldMessages.join('; ')}`
        : 'Request validation failed';

    super(message);
    this.name = 'ZodValidationError';

    // Store structured errors for the error handler to include in the response
    this.validationErrors = {};
    for (const [field, errors] of Object.entries(flattened.fieldErrors)) {
      if (errors && errors.length > 0) {
        this.validationErrors[field] = errors;
      }
    }
    if (flattened.formErrors.length > 0) {
      this.validationErrors['_form'] = flattened.formErrors;
    }
  }
}

/**
 * Middleware factory for validating request body against a Zod schema.
 *
 * On success: replaces req.body with the parsed (and transformed) result,
 *             ensuring downstream handlers receive correctly typed data.
 * On failure: passes a ZodValidationError to the error handler with
 *             detailed field-level error messages.
 *
 * Usage:
 *   import { TransferInitSchema } from '../schemas/transfer.schema.js';
 *   router.post('/transfer/initiate', validateBody(TransferInitSchema), controller.initiate);
 *
 * @param schema - Zod schema to validate against
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      log.debug(
        {
          path: req.path,
          method: req.method,
          errors: result.error.flatten(),
        },
        'Body validation failed'
      );
      next(new ZodValidationError(result.error));
      return;
    }

    // Replace body with parsed/transformed data
    req.body = result.data;
    next();
  };
}

/**
 * Middleware factory for validating query parameters against a Zod schema.
 *
 * Query params from Express are always strings (or string arrays),
 * so Zod transforms (e.g., .transform(Number)) are commonly used
 * in the schema to convert to the correct types.
 *
 * Usage:
 *   import { LandSearchSchema } from '../schemas/land.schema.js';
 *   router.get('/land/search', validateQuery(LandSearchSchema), controller.search);
 *
 * @param schema - Zod schema to validate against
 */
export function validateQuery(schema: ZodType<unknown, any, any>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      log.debug(
        {
          path: req.path,
          method: req.method,
          errors: result.error.flatten(),
        },
        'Query validation failed'
      );
      next(new ZodValidationError(result.error));
      return;
    }

    // Replace query with parsed/transformed data
    // Cast is necessary because Express types query as ParsedQs
    (req as any).query = result.data;
    next();
  };
}

/**
 * Middleware factory for validating route parameters against a Zod schema.
 *
 * Used for path params like :propertyId, :transferId, :encumbranceId.
 *
 * Usage:
 *   import { PropertyIdSchema } from '../schemas/land.schema.js';
 *   router.get('/land/:propertyId', validateParams(PropertyIdSchema), controller.getById);
 *
 * @param schema - Zod schema to validate against
 */
export function validateParams(schema: ZodType<unknown, any, any>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      log.debug(
        {
          path: req.path,
          method: req.method,
          errors: result.error.flatten(),
        },
        'Params validation failed'
      );
      next(new ZodValidationError(result.error));
      return;
    }

    // Replace params with parsed data
    req.params = result.data as Record<string, string>;
    next();
  };
}
