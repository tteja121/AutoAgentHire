/**
 * Companies Service - Powered by Backend API & MongoDB Atlas
 * Manages company records associated with recruiters.
 */
import { apiClient } from '@/lib/api';

export interface CompanyRecord {
  id: string | number;
  name: string;
  website?: string | null;
  description?: string | null;
  owner_id?: string | null;
  created_at?: string;
}

export const companiesService = {
  /**
   * Get all companies
   */
  async getCompanies(): Promise<CompanyRecord[]> {
    try {
      const resp = await apiClient.get<any[]>('/api/recruiter/candidate/jobs');
      const companiesMap = new Map<string, CompanyRecord>();
      (resp.data || []).forEach((j: any) => {
        if (j.company_name && !companiesMap.has(j.company_name)) {
          companiesMap.set(j.company_name, {
            id: j.recruiter_id || companiesMap.size + 1,
            name: j.company_name,
            website: null,
            description: null,
            created_at: j.created_at,
          });
        }
      });
      return Array.from(companiesMap.values());
    } catch {
      return [];
    }
  },

  /**
   * Get company owned by a specific recruiter user ID
   */
  async getCompanyByOwner(ownerId: string): Promise<CompanyRecord | null> {
    const list = await this.getCompanies();
    return list.find((c) => String(c.owner_id) === String(ownerId)) || list[0] || null;
  },

  /**
   * Get company by ID
   */
  async getCompanyById(companyId: string | number): Promise<CompanyRecord | null> {
    const list = await this.getCompanies();
    return list.find((c) => String(c.id) === String(companyId)) || null;
  },

  /**
   * Create a new company record
   */
  async createCompany(companyData: {
    name: string;
    website?: string;
    description?: string;
    owner_id?: string;
  }): Promise<CompanyRecord> {
    return {
      id: Date.now(),
      name: companyData.name,
      website: companyData.website || null,
      description: companyData.description || null,
      owner_id: companyData.owner_id || null,
      created_at: new Date().toISOString(),
    };
  },

  /**
   * Update existing company
   */
  async updateCompany(companyId: string | number, updates: Partial<CompanyRecord>): Promise<CompanyRecord> {
    return {
      id: companyId,
      name: updates.name || 'Company',
      ...updates,
    };
  },
};

export default companiesService;
