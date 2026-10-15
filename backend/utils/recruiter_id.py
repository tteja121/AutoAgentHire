"""
Recruiter ID Generator for AutoAgentHire
Generates authoritative 8-character Recruiter IDs adhering to:
^[0-9][A-Z][0-9]{5}[A-Z]$ (Format: DLD DDDDL)
"""

import re
import unicodedata
from typing import Tuple, Dict, Any


def normalize_to_ascii_letters(text: str) -> str:
    """Normalize unicode text to standard ASCII English letters only."""
    if not text:
        return ""
    # Normalize unicode accents (e.g. é -> e, ñ -> n)
    normalized = unicodedata.normalize("NFKD", text)
    ascii_text = normalized.encode("ASCII", "ignore").decode("ASCII")
    # Keep only alphabetical letters
    return re.sub(r"[^A-Za-z]", "", ascii_text)


def parse_dob_to_digits(dob_str: str) -> str:
    """
    Parse date of birth into exactly 8 digits representing DDMMYYYY.
    Accepts:
      - 'DD/MM/YYYY', 'DD-MM-YYYY', 'DD.MM.YYYY'
      - 'YYYY-MM-DD' (standard ISO/HTML date input)
      - 'DDMMYYYY' (raw 8 digits)
    Raises ValueError on invalid date format.
    """
    if not dob_str or not isinstance(dob_str, str):
        raise ValueError("Date of birth is required.")

    clean_dob = dob_str.strip()

    # Pattern 1: ISO format YYYY-MM-DD
    iso_match = re.match(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$", clean_dob)
    if iso_match:
        year, month, day = int(iso_match.group(1)), int(iso_match.group(2)), int(iso_match.group(3))
        if not (1 <= day <= 31 and 1 <= month <= 12 and 1900 <= year <= 2100):
            raise ValueError(f"Invalid date values in DOB: {clean_dob}")
        return f"{day:02d}{month:02d}{year:04d}"

    # Pattern 2: DD/MM/YYYY or DD-MM-YYYY
    dmy_match = re.match(r"^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$", clean_dob)
    if dmy_match:
        day, month, year = int(dmy_match.group(1)), int(dmy_match.group(2)), int(dmy_match.group(3))
        if not (1 <= day <= 31 and 1 <= month <= 12 and 1900 <= year <= 2100):
            raise ValueError(f"Invalid date values in DOB: {clean_dob}")
        return f"{day:02d}{month:02d}{year:04d}"

    # Pattern 3: Exactly 8 continuous digits DDMMYYYY
    if re.match(r"^\d{8}$", clean_dob):
        day = int(clean_dob[0:2])
        month = int(clean_dob[2:4])
        year = int(clean_dob[4:8])
        if not (1 <= day <= 31 and 1 <= month <= 12 and 1900 <= year <= 2100):
            raise ValueError(f"Invalid date values in DOB digits: {clean_dob}")
        return clean_dob

    raise ValueError(f"Invalid Date of Birth format: '{dob_str}'. Expected DD/MM/YYYY.")


def calculate_recruiter_id(
    first_name: str,
    last_name: str,
    date_of_birth: str,
) -> Tuple[str, Dict[str, Any]]:
    """
    Calculate the exact 8-character Recruiter ID:
      Pattern: ^[0-9][A-Z][0-9]{5}[A-Z]$

    Formulas:
      Step A: D = sum of 8 digits in DDMMYYYY
      Step B: N = sum of alphabet values (A=1...Z=26) in combined full name
              L = count of letters in combined full name
      Step C: a = D % 10
              b = N % 10
              c = (D + N) % 10
              d = (D + L) % 10
              e = (N + L) % 10
              f = (D + N + L) % 10
      Step D: RecruiterID = f"{a}{first_initial}{b}{c}{d}{e}{f}{last_final}"

    Returns:
      (recruiter_id, debug_details)
    """
    fn_letters = normalize_to_ascii_letters(first_name)
    if not fn_letters:
        raise ValueError("First name must contain at least one valid alphabet letter.")

    ln_letters = normalize_to_ascii_letters(last_name)
    if not ln_letters:
        raise ValueError("Last name must contain at least one valid alphabet letter.")

    dob_digits = parse_dob_to_digits(date_of_birth)
    if len(dob_digits) != 8:
        raise ValueError("Date of birth must resolve to exactly 8 digits (DDMMYYYY).")

    # Step A: DOB digit sum
    D = sum(int(ch) for ch in dob_digits)

    # Step B: Combined full name alphabet sum and letter count
    full_name_letters = fn_letters.upper() + ln_letters.upper()
    L = len(full_name_letters)
    N = sum((ord(ch) - ord("A") + 1) for ch in full_name_letters)

    # Step C: Single digits 0-9
    a = D % 10
    b = N % 10
    c = (D + N) % 10
    d = (D + L) % 10
    e = (N + L) % 10
    f = (D + N + L) % 10

    # Step D: Initials
    first_initial = fn_letters[0].upper()
    last_final = ln_letters[-1].upper()

    recruiter_id = f"{a}{first_initial}{b}{c}{d}{e}{f}{last_final}"

    # Verify constraint
    if not re.match(r"^[0-9][A-Z][0-9]{5}[A-Z]$", recruiter_id) or len(recruiter_id) != 8:
        raise ValueError(f"Generated Recruiter ID '{recruiter_id}' does not match required format.")

    details = {
        "D": D,
        "N": N,
        "L": L,
        "a": a,
        "b": b,
        "c": c,
        "d": d,
        "e": e,
        "f": f,
        "first_initial": first_initial,
        "last_final": last_final,
        "recruiter_id": recruiter_id,
    }
    return recruiter_id, details
