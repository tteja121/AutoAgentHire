/**
 * Recruiter ID Generator & Validator for AutoAgentHire
 * 
 * Generates an authoritative 8-character Recruiter ID:
 * Pattern: ^[0-9][A-Z][0-9]{5}[A-Z]$ (DLD DDDDL)
 * 
 * Example:
 * Rahul Sharma, 14/08/1998 -> 0R00111A
 */

export interface RecruiterIdCalculationResult {
  isValid: boolean;
  recruiterId: string;
  error?: string;
  debugDetails?: {
    D: number;
    N: number;
    L: number;
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
    firstInitial: string;
    lastFinal: string;
  };
}

/**
 * Normalizes string to standard uppercase English letters (A-Z).
 * Strips accents, spaces, hyphens, and non-alphabetic characters.
 */
export function extractEnglishLetters(text: string): string {
  if (!text) return "";
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/[^A-Za-z]/g, "")       // keep only A-Z, a-z
    .toUpperCase();
}

/**
 * Extracts exactly 8 digits representing DDMMYYYY from a given date string.
 * Supports DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, or raw DDMMYYYY.
 */
export function parseDobDigits(dobStr: string): { digits: string; error?: string } {
  if (!dobStr || !dobStr.trim()) {
    return { digits: "", error: "Date of birth is required." };
  }

  const clean = dobStr.trim();

  // Pattern 1: ISO YYYY-MM-DD (standard browser HTML <input type="date" />)
  const isoMatch = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) {
      return { digits: "", error: "Date of birth contains invalid day, month, or year values." };
    }
    const dd = String(day).padStart(2, "0");
    const mm = String(month).padStart(2, "0");
    const yyyy = String(year).padStart(4, "0");
    return { digits: `${dd}${mm}${yyyy}` };
  }

  // Pattern 2: DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) {
      return { digits: "", error: "Date of birth contains invalid day, month, or year values." };
    }
    const dd = String(day).padStart(2, "0");
    const mm = String(month).padStart(2, "0");
    const yyyy = String(year).padStart(4, "0");
    return { digits: `${dd}${mm}${yyyy}` };
  }

  // Pattern 3: Exactly 8 raw digits DDMMYYYY
  if (/^\d{8}$/.test(clean)) {
    const day = parseInt(clean.substring(0, 2), 10);
    const month = parseInt(clean.substring(2, 4), 10);
    const year = parseInt(clean.substring(4, 8), 10);
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) {
      return { digits: "", error: "Invalid date values in DOB digits." };
    }
    return { digits: clean };
  }

  return { digits: "", error: "Invalid date format. Expected DD/MM/YYYY." };
}

/**
 * Calculates the exact 8-character Recruiter ID:
 *   a + firstNameInitial + b + c + d + e + f + lastNameFinal
 */
export function calculateRecruiterId(
  firstName: string,
  lastName: string,
  dateOfBirth: string
): RecruiterIdCalculationResult {
  const fnLetters = extractEnglishLetters(firstName);
  if (!fnLetters) {
    return {
      isValid: false,
      recruiterId: "",
      error: "Please enter a valid First Name with alphabet characters.",
    };
  }

  const lnLetters = extractEnglishLetters(lastName);
  if (!lnLetters) {
    return {
      isValid: false,
      recruiterId: "",
      error: "Please enter a valid Last Name with alphabet characters.",
    };
  }

  const { digits: dobDigits, error: dobError } = parseDobDigits(dateOfBirth);
  if (dobError || !dobDigits || dobDigits.length !== 8) {
    return {
      isValid: false,
      recruiterId: "",
      error: dobError || "Valid Date of Birth (DD/MM/YYYY) is required.",
    };
  }

  // Step A: DOB digit sum
  let D = 0;
  for (let i = 0; i < dobDigits.length; i++) {
    D += parseInt(dobDigits[i], 10);
  }

  // Step B: Combined full name letters, alphabet sum (A=1...Z=26), and letter count
  const fullNameLetters = fnLetters + lnLetters;
  const L = fullNameLetters.length;
  let N = 0;
  for (let i = 0; i < fullNameLetters.length; i++) {
    N += fullNameLetters.charCodeAt(i) - 64; // 'A' is 65, so 65 - 64 = 1
  }

  // Step C: Six digits modulo 10
  const a = D % 10;
  const b = N % 10;
  const c = (D + N) % 10;
  const d = (D + L) % 10;
  const e = (N + L) % 10;
  const f = (D + N + L) % 10;

  // Step D: Construct ID
  const firstInitial = fnLetters[0];
  const lastFinal = lnLetters[lnLetters.length - 1];
  const recruiterId = `${a}${firstInitial}${b}${c}${d}${e}${f}${lastFinal}`;

  const pattern = /^[0-9][A-Z][0-9]{5}[A-Z]$/;
  if (!pattern.test(recruiterId) || recruiterId.length !== 8) {
    return {
      isValid: false,
      recruiterId: "",
      error: "Calculation did not produce a valid 8-character Recruiter ID.",
    };
  }

  return {
    isValid: true,
    recruiterId,
    debugDetails: {
      D,
      N,
      L,
      a,
      b,
      c,
      d,
      e,
      f,
      firstInitial,
      lastFinal,
    },
  };
}
