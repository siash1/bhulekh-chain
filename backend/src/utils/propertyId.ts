/**
 * Property ID utilities for BhulekhChain.
 *
 * Property ID format:
 *   {StateCode}-{DistrictCode}-{TehsilCode}-{VillageCode}-{SurveyNo}(-{SubSurveyNo})?
 *
 * Examples:
 *   AP-GNT-TNL-SKM-142-3        (with sub-survey)
 *   TG-HYD-SEC-AMR-567-0        (no sub-survey, explicit 0)
 *   GJ-AMD-CTY-NAR-89-2A        (alphanumeric sub-survey)
 *   MH-PUN-HVL-KTJ-1234-0      (4-digit survey)
 *
 * The property ID is deterministic from location data —
 * no separate ID generation sequence is needed.
 */

/**
 * Regex for validating property ID format.
 *
 * State code: exactly 2 uppercase letters
 * District code: 2-4 uppercase letters
 * Tehsil code: 2-4 uppercase letters
 * Village code: 2-4 uppercase letters
 * Survey number: 1 or more digits
 * Sub-survey: optional, alphanumeric (letters + digits)
 */
const PROPERTY_ID_REGEX = /^[A-Z]{2}-[A-Z]{2,4}-[A-Z]{2,4}-[A-Z]{2,4}-\d+(-[\w]+)?$/;

/**
 * Individual component validation patterns.
 */
const STATE_CODE_REGEX = /^[A-Z]{2}$/;
const LOCATION_CODE_REGEX = /^[A-Z]{2,4}$/;
const SURVEY_NUMBER_REGEX = /^\d+$/;
const SUB_SURVEY_REGEX = /^[\w]+$/;

/**
 * Parsed components of a property ID.
 */
export interface ParsedPropertyId {
  stateCode: string;
  districtCode: string;
  tehsilCode: string;
  villageCode: string;
  surveyNumber: string;
  subSurveyNumber: string | null;
  /** The original full property ID string */
  raw: string;
}

/**
 * Generate a BhulekhChain property ID from its constituent parts.
 *
 * All codes are normalized to uppercase. The survey number is used
 * as-is (digits only). The sub-survey number is optional.
 *
 * @param stateCode - 2-letter state code (e.g., "AP")
 * @param districtCode - 2-4 letter district code (e.g., "GNT")
 * @param tehsilCode - 2-4 letter tehsil code (e.g., "TNL")
 * @param villageCode - 2-4 letter village code (e.g., "SKM")
 * @param surveyNo - Survey/khasra number (digits only, e.g., "142")
 * @param subSurveyNo - Optional sub-survey/sub-division (e.g., "3", "2A")
 * @returns Formatted property ID string
 * @throws Error if any component fails validation
 */
export function generatePropertyId(
  stateCode: string,
  districtCode: string,
  tehsilCode: string,
  villageCode: string,
  surveyNo: string,
  subSurveyNo?: string
): string {
  // Normalize to uppercase
  const state = stateCode.toUpperCase();
  const district = districtCode.toUpperCase();
  const tehsil = tehsilCode.toUpperCase();
  const village = villageCode.toUpperCase();

  // Validate each component
  if (!STATE_CODE_REGEX.test(state)) {
    throw new Error(`Invalid state code '${state}': must be exactly 2 uppercase letters`);
  }

  if (!LOCATION_CODE_REGEX.test(district)) {
    throw new Error(`Invalid district code '${district}': must be 2-4 uppercase letters`);
  }

  if (!LOCATION_CODE_REGEX.test(tehsil)) {
    throw new Error(`Invalid tehsil code '${tehsil}': must be 2-4 uppercase letters`);
  }

  if (!LOCATION_CODE_REGEX.test(village)) {
    throw new Error(`Invalid village code '${village}': must be 2-4 uppercase letters`);
  }

  if (!SURVEY_NUMBER_REGEX.test(surveyNo)) {
    throw new Error(`Invalid survey number '${surveyNo}': must be digits only`);
  }

  // Build the ID
  let propertyId = `${state}-${district}-${tehsil}-${village}-${surveyNo}`;

  if (subSurveyNo && subSurveyNo.length > 0) {
    const subSurvey = subSurveyNo.toUpperCase();
    if (!SUB_SURVEY_REGEX.test(subSurvey)) {
      throw new Error(`Invalid sub-survey number '${subSurvey}': must be alphanumeric`);
    }
    propertyId += `-${subSurvey}`;
  }

  return propertyId;
}

/**
 * Validate a property ID string against the expected format.
 *
 * @param id - Property ID to validate
 * @returns true if valid, false otherwise
 */
export function validatePropertyId(id: string): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }
  return PROPERTY_ID_REGEX.test(id);
}

/**
 * Parse a property ID into its constituent components.
 *
 * @param id - Property ID to parse
 * @returns Parsed components
 * @throws Error if the property ID format is invalid
 */
export function parsePropertyId(id: string): ParsedPropertyId {
  if (!validatePropertyId(id)) {
    throw new Error(
      `Invalid property ID format: '${id}'. ` +
        `Expected format: {StateCode}-{DistrictCode}-{TehsilCode}-{VillageCode}-{SurveyNo}(-{SubSurveyNo})`
    );
  }

  const parts = id.split('-');

  // Parts will be at least 5: state, district, tehsil, village, survey
  // and optionally 6 with sub-survey
  const stateCode = parts[0]!;
  const districtCode = parts[1]!;
  const tehsilCode = parts[2]!;
  const villageCode = parts[3]!;
  const surveyNumber = parts[4]!;
  const subSurveyNumber = parts.length >= 6 ? parts[5]! : null;

  return {
    stateCode,
    districtCode,
    tehsilCode,
    villageCode,
    surveyNumber,
    subSurveyNumber,
    raw: id,
  };
}

/**
 * Extract the state code from a property ID.
 * Useful for routing requests to the correct Fabric channel.
 *
 * @param propertyId - Full property ID
 * @returns 2-letter state code
 */
export function extractStateCode(propertyId: string): string {
  const parsed = parsePropertyId(propertyId);
  return parsed.stateCode;
}

/**
 * Convert a survey number with slash notation (e.g., "142/3")
 * to the property ID component format (survey "142", subSurvey "3").
 *
 * @param surveyWithSlash - Survey number in "X/Y" or "X" format
 * @returns Tuple of [surveyNumber, subSurveyNumber | undefined]
 */
export function parseSurveyNumber(surveyWithSlash: string): [string, string | undefined] {
  const parts = surveyWithSlash.split('/');
  const survey = parts[0]?.trim();
  const subSurvey = parts[1]?.trim();

  if (!survey) {
    throw new Error(`Invalid survey number: '${surveyWithSlash}'`);
  }

  return [survey, subSurvey && subSurvey.length > 0 ? subSurvey : undefined];
}
