import { z } from 'zod';

/**
 * Property ID regex pattern.
 *
 * Format: {StateCode}-{DistrictCode}-{TehsilCode}-{VillageCode}-{SurveyNo}(-{SubSurveyNo})?
 *
 * Examples:
 *   AP-GNT-TNL-SKM-142-3        (with sub-survey)
 *   TG-HYD-SEC-AMR-567-0        (no sub-survey, explicit 0)
 *   GJ-AMD-CTY-NAR-89-2A        (alphanumeric sub-survey)
 *   MH-PUN-HVL-KTJ-1234-0       (4-digit survey)
 *
 * State code: 2 uppercase letters
 * District/Tehsil/Village codes: 2-4 uppercase letters
 * Survey number: 1+ digits
 * Sub-survey: optional, alphanumeric
 */
export const PROPERTY_ID_REGEX = /^[A-Z]{2}-[A-Z]{2,4}-[A-Z]{2,4}-[A-Z]{2,4}-\d+(-[\w]+)?$/;

/**
 * Schema for validating propertyId in route params.
 */
export const PropertyIdSchema = z.object({
  propertyId: z
    .string()
    .regex(PROPERTY_ID_REGEX, 'Invalid property ID format. Expected: XX-XXX-XXX-XXX-NNN(-SS)')
    .describe('BhulekhChain property identifier'),
});

export type PropertyIdInput = z.infer<typeof PropertyIdSchema>;

/**
 * Land search query parameters schema.
 *
 * stateCode is mandatory — all searches must be scoped to a state
 * to match Fabric's per-state channel architecture.
 */
export const LandSearchSchema = z.object({
  stateCode: z
    .string()
    .length(2, 'State code must be exactly 2 uppercase letters')
    .regex(/^[A-Z]{2}$/, 'State code must be uppercase letters')
    .describe('2-letter state code (mandatory)'),

  surveyNo: z
    .string()
    .max(20, 'Survey number too long')
    .optional()
    .describe('Survey/khasra number'),

  district: z
    .string()
    .max(100, 'District name too long')
    .optional()
    .describe('District name (partial match)'),

  tehsil: z
    .string()
    .max(100, 'Tehsil name too long')
    .optional()
    .describe('Tehsil/taluka name (partial match)'),

  village: z
    .string()
    .max(100, 'Village name too long')
    .optional()
    .describe('Village name (partial match)'),

  ownerName: z
    .string()
    .max(200, 'Owner name too long')
    .optional()
    .describe('Owner name (partial match)'),

  page: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive().max(10000))
    .default('1')
    .describe('Page number (1-based)'),

  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive().max(100))
    .default('20')
    .describe('Results per page (max 100)'),
});

export type LandSearchInput = z.infer<typeof LandSearchSchema>;

/**
 * Schema for registering a new property.
 *
 * This is used by Registrars to onboard properties into the system,
 * either during initial data migration or new registrations.
 */
export const RegisterPropertySchema = z.object({
  surveyNumber: z
    .string()
    .min(1, 'Survey number is required')
    .max(20, 'Survey number too long')
    .describe('Survey/khasra number'),

  subSurveyNumber: z
    .string()
    .max(10, 'Sub-survey number too long')
    .default('')
    .describe('Sub-survey/sub-division number'),

  location: z.object({
    stateCode: z.string().length(2).regex(/^[A-Z]{2}$/),
    stateName: z.string().min(1).max(100),
    districtCode: z.string().min(2).max(4).regex(/^[A-Z]+$/),
    districtName: z.string().min(1).max(100),
    tehsilCode: z.string().min(2).max(4).regex(/^[A-Z]+$/),
    tehsilName: z.string().min(1).max(100),
    villageCode: z.string().min(2).max(4).regex(/^[A-Z]+$/),
    villageName: z.string().min(1).max(100),
    pinCode: z.string().regex(/^\d{6}$/, 'PIN code must be 6 digits'),
  }),

  area: z.object({
    value: z.number().positive('Area must be positive'),
    unit: z.enum(['SQ_METERS', 'ACRES', 'HECTARES', 'BIGHA', 'GUNTHA', 'KANAL', 'MARLA', 'CENT']),
    localValue: z.number().positive('Local area value must be positive'),
    localUnit: z.enum(['SQ_METERS', 'ACRES', 'HECTARES', 'BIGHA', 'GUNTHA', 'KANAL', 'MARLA', 'CENT']),
  }),

  boundaries: z.object({
    north: z.string().min(1).max(200),
    south: z.string().min(1).max(200),
    east: z.string().min(1).max(200),
    west: z.string().min(1).max(200),
    geoJson: z
      .object({
        type: z.literal('Polygon'),
        coordinates: z.array(z.array(z.array(z.number()).length(2))).min(1),
      })
      .nullable()
      .default(null),
  }),

  currentOwner: z.object({
    ownerType: z.enum(['INDIVIDUAL', 'JOINT', 'COMPANY', 'TRUST', 'GOVERNMENT']),
    owners: z
      .array(
        z.object({
          aadhaarHash: z
            .string()
            .regex(/^sha256:[a-f0-9]{64}$/, 'Aadhaar hash must be sha256-prefixed hex'),
          name: z.string().min(1).max(200),
          fatherName: z.string().max(200).default(''),
          sharePercentage: z.number().int().min(0).max(100),
          isMinor: z.boolean().default(false),
        })
      )
      .min(1, 'At least one owner is required')
      .refine(
        (owners) => {
          const totalShare = owners.reduce((sum, o) => sum + o.sharePercentage, 0);
          return totalShare === 100;
        },
        { message: 'Owner share percentages must total 100%' }
      ),
    ownershipType: z.enum(['FREEHOLD', 'LEASEHOLD', 'GOVERNMENT', 'TRUST']),
    acquisitionType: z.enum([
      'SALE',
      'INHERITANCE',
      'GIFT',
      'PARTITION',
      'GOVERNMENT_GRANT',
      'COURT_DECREE',
      'EXCHANGE',
    ]),
    acquisitionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
    acquisitionDocumentHash: z.string().default(''),
  }),

  landUse: z.enum([
    'AGRICULTURAL',
    'RESIDENTIAL',
    'COMMERCIAL',
    'INDUSTRIAL',
    'MIXED',
    'GOVERNMENT',
    'FOREST',
    'WASTELAND',
  ]),

  landClassification: z
    .enum([
      'IRRIGATED_WET',
      'IRRIGATED_DRY',
      'RAIN_FED',
      'GARDEN',
      'PLANTATION',
      'URBAN',
      'BARREN',
    ])
    .optional(),

  registrationInfo: z
    .object({
      registrationNumber: z.string().max(50).default(''),
      bookNumber: z.string().max(10).default(''),
      subRegistrarOffice: z.string().max(100).default(''),
      registrationDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format')
        .default(''),
    })
    .optional(),

  taxInfo: z
    .object({
      /** Annual land revenue in paisa */
      annualLandRevenue: z.number().int().nonnegative().default(0),
      lastPaidDate: z.string().default(''),
      paidUpToYear: z.string().default(''),
    })
    .optional(),
});

export type RegisterPropertyInput = z.infer<typeof RegisterPropertySchema>;
