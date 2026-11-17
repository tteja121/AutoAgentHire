import { apiClient } from '@/lib/api';

export interface CandidateProfile {
  candidate_name: string;
  email: string;
  phone: string;
  location: string;
  skills: string[];
  skills_string: string;
  experience: string;
  experience_list: any[];
  education: any[];
  summary: string;
  headline: string;
  resume_name?: string;
  updated_at?: string;
}

export interface AppliedJobRecord {
  id: number | string;
  title: string;
  company: string;
  url: string;
  status: string;
  applied_date: string;
  match_score: number;
  candidate_name?: string;
  candidate_email?: string;
  candidate_phone?: string;
  experience?: string;
  location?: string;
  resume_filename?: string;
  resume_url?: string;
  reference_id?: string;
  delivery_status?: string;
}

/**
 * Extract candidate profile details from any parsed resume response WITHOUT mutating profile state.
 * Returns in-memory profile representation for preview, matching, or review.
 */
export function extractResumeProfileData(data: any, fileName?: string): CandidateProfile {
  if (!data) {
    return getCandidateProfile();
  }

  const parsed = data.parsed_data || data;
  const contact = parsed.contact || data.contact || {};
  const expList = parsed.experience || data.experience || data.employment_history || [];
  const eduList = parsed.education || data.education || [];

  // 1. Resolve skills
  let extractedSkills: string[] = [];
  if (Array.isArray(data.all_skills) && data.all_skills.length > 0) {
    extractedSkills = data.all_skills;
  } else if (Array.isArray(data.skills)) {
    extractedSkills = data.skills;
  } else if (data.skills && typeof data.skills === 'object') {
    const tech = data.skills.technical || [];
    const prof = data.skills.professional || [];
    const domain = data.skills.domain || [];
    extractedSkills = [...tech, ...prof, ...domain];
  } else if (Array.isArray(parsed.skills)) {
    extractedSkills = parsed.skills;
  }
  // Deduplicate and trim skills
  extractedSkills = Array.from(new Set(extractedSkills.map((s: any) => String(s).trim()))).filter(Boolean);

  // 2. Resolve Name
  const name = (
    data.candidate_name ||
    contact.name ||
    parsed.candidate_name ||
    parsed.name ||
    data.name ||
    ''
  ).trim();

  // 3. Resolve Email
  const email = (
    data.email ||
    contact.email ||
    parsed.email ||
    ''
  ).trim().toLowerCase();

  // 4. Resolve Phone
  const phone = (
    data.phone ||
    contact.phone ||
    parsed.phone ||
    ''
  ).trim();

  // 5. Resolve Location
  const location = (
    data.location ||
    contact.location ||
    contact.city ||
    parsed.location ||
    ''
  ).trim();

  // 6. Resolve Experience
  let experienceStr = data.total_experience || parsed.total_experience || '';
  if (!experienceStr && expList.length > 0) {
    const firstRole = expList[0];
    const roleTitle = typeof firstRole === 'object' ? firstRole.title || '' : '';
    experienceStr = roleTitle ? `${roleTitle} (${expList.length} role${expList.length > 1 ? 's' : ''})` : `${expList.length} roles`;
  }

  // 7. Resolve Headline / Job Title
  let headline = data.suitable_job_title || parsed.suitable_job_title || '';
  if (!headline && expList.length > 0 && typeof expList[0] === 'object' && expList[0].title) {
    headline = expList[0].title;
  }
  if (!headline && extractedSkills.length > 0) {
    headline = `${extractedSkills.slice(0, 2).join(' / ')} Specialist`;
  }

  // 8. Resolve Summary
  const summary = (
    data.professional_summary ||
    parsed.summary ||
    parsed.professional_summary ||
    data.summary ||
    ''
  ).trim();

  const skillsString = extractedSkills.join(', ');

  return {
    candidate_name: name,
    email: email,
    phone: phone,
    location: location,
    skills: extractedSkills,
    skills_string: skillsString,
    experience: experienceStr,
    experience_list: expList,
    education: eduList,
    summary: summary,
    headline: headline,
    resume_name: fileName || data.filename || 'resume.pdf',
    updated_at: new Date().toISOString(),
  };
}

/**
 * Explicitly update chosen candidate profile fields when the user confirms.
 * Guarantees that only explicitly selected fields are updated, preserving all others.
 */
export async function applyExplicitProfileUpdate(updates: Partial<CandidateProfile>): Promise<CandidateProfile> {
  const current = getCandidateProfile();
  const merged: CandidateProfile = {
    ...current,
    ...updates,
    updated_at: new Date().toISOString(),
  };

  try {
    if (updates.candidate_name !== undefined) localStorage.setItem('candidate_name', updates.candidate_name);
    if (updates.phone !== undefined) localStorage.setItem('candidate_phone', updates.phone);
    if (updates.location !== undefined) localStorage.setItem('candidate_location', updates.location);
    if (updates.skills !== undefined && Array.isArray(updates.skills)) {
      localStorage.setItem('candidate_skills', JSON.stringify(updates.skills));
      localStorage.setItem('candidate_skills_str', updates.skills.join(', '));
      merged.skills_string = updates.skills.join(', ');
    }
    if (updates.experience !== undefined) localStorage.setItem('candidate_experience', updates.experience);
    if (updates.summary !== undefined) localStorage.setItem('candidate_summary', updates.summary);
    if (updates.headline !== undefined) localStorage.setItem('candidate_headline', updates.headline);
    if (updates.resume_name !== undefined) localStorage.setItem('candidate_resume_name', updates.resume_name);
    localStorage.setItem('candidate_profile', JSON.stringify(merged));
  } catch (err) {
    console.warn('Could not save candidate profile to localStorage:', err);
  }

  // Asynchronously synchronize with backend user profile via explicit endpoint
  try {
    const payload: Record<string, any> = {};
    if (updates.candidate_name !== undefined) payload.full_name = updates.candidate_name;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.location !== undefined) payload.location = updates.location;
    if (updates.skills !== undefined) payload.skills = updates.skills;
    if (updates.experience !== undefined) payload.experience = updates.experience;
    if (updates.headline !== undefined) payload.job_role = updates.headline;
    if (updates.summary !== undefined) payload.bio = updates.summary;
    if (updates.education !== undefined && Array.isArray(updates.education) && updates.education.length > 0) {
      payload.education = typeof updates.education[0] === 'string'
        ? updates.education[0]
        : (updates.education[0].degree || updates.education[0].institution || '');
    }

    await apiClient.post('/api/candidate/profile/sync-from-resume', {
      selected_fields: payload
    });
  } catch (apiErr) {
    console.debug('Profile sync note:', apiErr);
  }

  // Dispatch global profile update event
  try {
    window.dispatchEvent(new CustomEvent('candidateProfileUpdated', { detail: merged }));
  } catch (evErr) {
    console.debug('CustomEvent dispatch note:', evErr);
  }

  return merged;
}

/**
 * Backward-compatible helper: extracts candidate profile details from resume response.
 * CRITICAL ISOLATION: By default, does NOT overwrite candidate profile.
 * Only overwrites if persist is explicitly set to true.
 */
export function applyProfileFromResume(data: any, fileName?: string, persist: boolean = false): CandidateProfile {
  const profile = extractResumeProfileData(data, fileName);
  if (persist) {
    applyExplicitProfileUpdate(profile);
  }
  return profile;
}

/**
 * Retrieve candidate profile from localStorage with fallback defaults.
 */
export function getCandidateProfile(): CandidateProfile {
  try {
    const raw = localStorage.getItem('candidate_profile');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as CandidateProfile;
      }
    }
  } catch (e) {
    console.warn('Error reading candidate_profile from localStorage:', e);
  }

  let skillsArr: string[] = [];
  try {
    const rawSkills = localStorage.getItem('candidate_skills');
    if (rawSkills) {
      skillsArr = JSON.parse(rawSkills);
    }
  } catch {}

  const skillsStr = localStorage.getItem('candidate_skills_str') || skillsArr.join(', ');

  return {
    candidate_name: localStorage.getItem('candidate_name') || '',
    email: localStorage.getItem('candidate_email') || '',
    phone: localStorage.getItem('candidate_phone') || '',
    location: localStorage.getItem('candidate_location') || 'Remote',
    skills: skillsArr,
    skills_string: skillsStr,
    experience: localStorage.getItem('candidate_experience') || '',
    experience_list: [],
    education: [],
    summary: localStorage.getItem('candidate_summary') || '',
    headline: localStorage.getItem('candidate_headline') || 'Software Engineer',
    resume_name: localStorage.getItem('candidate_resume_name') || 'resume.pdf',
  };
}

export function getClientAppliedStorageKey(): string {
  const email = (
    localStorage.getItem('candidate_email') ||
    localStorage.getItem('user_email') ||
    ''
  ).trim().toLowerCase();
  return email ? `client_applied_applications_${email}` : 'client_applied_applications_guest';
}

/**
 * Store applied job into client local storage and dispatch update event.
 */
export function saveClientAppliedJob(job: Partial<AppliedJobRecord>): AppliedJobRecord {
  const profile = getCandidateProfile();
  const currentEmail = (
    localStorage.getItem('candidate_email') ||
    localStorage.getItem('user_email') ||
    profile.email ||
    ''
  ).trim().toLowerCase();

  const appId = job.id || Date.now();
  const effectiveEmail = (job.candidate_email || currentEmail || '').trim().toLowerCase();

  const record: AppliedJobRecord = {
    id: appId,
    title: job.title || 'Software Engineer',
    company: job.company || 'AutoAgentHire Partner',
    url: job.url || '/candidate/jobs',
    status: job.status || 'applied',
    applied_date: job.applied_date || new Date().toISOString(),
    match_score: job.match_score || 92,
    candidate_name: job.candidate_name || profile.candidate_name || 'Candidate',
    candidate_email: effectiveEmail,
    candidate_phone: job.candidate_phone || profile.phone || '',
    location: job.location || profile.location || 'Remote',
    resume_filename: job.resume_filename || profile.resume_name || 'resume.pdf',
    resume_url: job.resume_url || undefined,
  };

  try {
    const storageKey = effectiveEmail ? `client_applied_applications_${effectiveEmail}` : getClientAppliedStorageKey();
    const existingRaw = localStorage.getItem(storageKey);
    let existingList: AppliedJobRecord[] = [];
    if (existingRaw) {
      try {
        existingList = JSON.parse(existingRaw);
      } catch {
        existingList = [];
      }
    }

    // Filter out duplicate by id or title+company
    existingList = existingList.filter(
      (item) => String(item.id) !== String(record.id) &&
        !(item.title === record.title && item.company === record.company)
    );

    // Prepend newest application
    existingList.unshift(record);

    localStorage.setItem(storageKey, JSON.stringify(existingList));

    // Clear legacy un-isolated storage key to avoid cross-account leakage
    try {
      localStorage.removeItem('client_applied_applications');
    } catch {}

    // Dispatch event so Applications page and other active components update in real-time
    window.dispatchEvent(new CustomEvent('applicationSubmitted', { detail: record }));
  } catch (err) {
    console.warn('Could not save client applied application to localStorage:', err);
  }

  return record;
}

/**
 * Retrieve list of client applied applications from local storage (scoped strictly to current account).
 */
export function getClientAppliedJobs(): AppliedJobRecord[] {
  const currentEmail = (
    localStorage.getItem('candidate_email') ||
    localStorage.getItem('user_email') ||
    ''
  ).trim().toLowerCase();

  // If user is not logged in with an official email, return empty list immediately to guarantee privacy!
  if (!currentEmail) return [];

  const storageKey = `client_applied_applications_${currentEmail}`;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // STRICT isolation: ONLY return applications where candidate_email is explicitly defined AND matches current logged in user
        return parsed.filter(item => {
          if (!item || !item.candidate_email) return false;
          return item.candidate_email.trim().toLowerCase() === currentEmail;
        });
      }
    }
  } catch (e) {
    console.warn('Error reading client_applied_applications from localStorage:', e);
  }
  return [];
}
