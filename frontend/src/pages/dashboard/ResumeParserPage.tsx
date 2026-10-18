import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Upload, FileText, CheckCircle, CheckCircle2, AlertCircle, Loader2, 
  ExternalLink, Sparkles, User, Briefcase, GraduationCap, 
  Award, Eye, RefreshCw, Download, Calendar
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { API_BASE_URL, getAuthenticatedFileUrl, apiClient, API_ENDPOINTS } from '@/lib/api';
import { applicationService } from '@/services/applicationService';
import { applyProfileFromResume } from '@/utils/profileSync';

interface ParsedContact {
  name?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
}

interface ParsedExperience {
  title?: string;
  company?: string;
  duration?: string;
  description?: string;
}

interface ParsedEducation {
  degree?: string;
  institution?: string;
  year?: string;
}

interface ParsedData {
  contact?: ParsedContact;
  skills?: string[];
  experience?: ParsedExperience[];
  education?: ParsedEducation[];
  summary?: string;
}


export default function ResumeParserPage() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parseProgress, setParseProgress] = useState<number>(0);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [rawText, setRawText] = useState<string>('');
  const [textLength, setTextLength] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);
  const [savedResumes, setSavedResumes] = useState<any[]>([]);
  const [isSavedToProfile, setIsSavedToProfile] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    loadUserResumes();
  }, []);

  const loadUserResumes = async () => {
    try {
      const data = await applicationService.getUserResumes();
      if (data && data.resumes) {
        setSavedResumes(data.resumes);
      }
    } catch (err) {
      console.warn('Could not load user resumes:', err);
    }
  };

  const saveResumeToProfile = async (targetFile: File) => {
    setIsSaving(true);
    try {
      const uploadForm = new FormData();
      uploadForm.append('file', targetFile);
      const savedEmail = localStorage.getItem('candidate_email');
      if (savedEmail) uploadForm.append('user_email', savedEmail);

      const resp = await apiClient.postFormData('/api/upload-resume', uploadForm);
      if (resp.data) {
        setIsSavedToProfile(true);
        loadUserResumes();
        toast({
          title: 'Saved to Profile! 📁',
          description: 'Resume & extracted skills permanently saved to your candidate account.',
        });
      }
    } catch (saveErr) {
      console.warn('Could not auto-save to database:', saveErr);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileSelect = (selectedFile: File) => {
    setError(null);
    setIsSavedToProfile(false);
    const ext = '.' + selectedFile.name.split('.').pop()?.toLowerCase();
    if (!['.pdf', '.docx', '.txt'].includes(ext)) {
      setError('Please upload a PDF, DOCX, or TXT file.');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File size exceeds 10MB limit.');
      return;
    }

    setFile(selectedFile);
    // Create object URL for in-browser opening/previewing
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);

    // Auto extract details on selection
    parseResumeFile(selectedFile);
  };

  const parseResumeFile = async (targetFile: File) => {
    setIsParsing(true);
    setError(null);
    setParseProgress(20);

    const formData = new FormData();
    formData.append('file', targetFile);

    const progressTimer = setInterval(() => {
      setParseProgress(prev => Math.min(prev + 15, 90));
    }, 250);

    try {
      const resp = await apiClient.postFormData(API_ENDPOINTS.ats.parseResume, formData);

      clearInterval(progressTimer);
      setParseProgress(100);

      const res = resp.data || {};
      setRawText(res.text || '');
      setTextLength(res.length || 0);

      const data: ParsedData = res.parsed_data || {};
      setParsedData(data);

      // Apply extracted details across entire candidate profile everywhere in the site
      applyProfileFromResume(res, targetFile.name);

      toast({
        title: 'Resume Parsed & Profile Updated! ✨',
        description: `Extracted ${data.skills?.length || 0} skills. Applied details across your profile and job matching.`,
      });

      // Automatically persist to profile
      saveResumeToProfile(targetFile);
    } catch (err: any) {
      clearInterval(progressTimer);
      console.error('Resume parse error:', err);
      const detail = err?.response?.data?.detail || err?.message || 'Could not parse resume.';
      setError(detail);
      toast({
        title: 'Parse Failed',
        description: detail,
        variant: 'destructive',
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleOpenResume = () => {
    if (!previewUrl) return;
    if (file?.type === 'application/pdf') {
      // Direct browser open in a new tab
      window.open(previewUrl, '_blank');
    } else {
      setShowPreviewModal(true);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="w-8 h-8 text-primary" />
            Resume Intelligence & Parser
          </h1>
          <p className="text-muted-foreground mt-1">
            Extract candidate details, skills, experience, and view resumes directly in the browser.
          </p>
        </div>
      </motion.div>

      {/* Upload & Actions Area */}
      <Card variant="glass">
        <CardHeader>
          <CardTitle>Select or Upload Resume</CardTitle>
          <CardDescription>
            Supports PDF, DOCX, and TXT files up to 10MB
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <label className="w-full sm:w-auto">
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />
              <div className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium cursor-pointer hover:bg-primary/90 transition-colors shadow">
                <Upload className="w-5 h-5" />
                <span>Upload & Parse Resume</span>
              </div>
            </label>

            {file && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleOpenResume}
                  className="flex items-center gap-2"
                >
                  <Eye className="w-4 h-4 text-primary" />
                  <span>Open Resume</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                </Button>

                <Button
                  variant="ghost"
                  onClick={() => file && parseResumeFile(file)}
                  disabled={isParsing}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${isParsing ? 'animate-spin' : ''}`} />
                  <span>Re-parse</span>
                </Button>

                {isSavedToProfile ? (
                  <Badge variant="outline" className="h-9 px-3 border-emerald-500/40 text-emerald-400 bg-emerald-500/10 flex items-center gap-1.5 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Saved to Profile</span>
                  </Badge>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => file && saveResumeToProfile(file)}
                    disabled={isSaving || isParsing}
                    className="flex items-center gap-1.5 border-primary/30 text-primary"
                  >
                    {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    <span>Save to Profile</span>
                  </Button>
                )}
              </div>
            )}
          </div>

          {file && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 p-3 rounded-md">
              <FileText className="w-4 h-4 text-primary" />
              <span className="font-medium text-foreground">{file.name}</span>
              <span>•</span>
              <span>{(file.size / 1024).toFixed(1)} KB</span>
              <span>•</span>
              <span className="capitalize">{file.name.split('.').pop()}</span>
            </div>
          )}

          {isParsing && (
            <div className="space-y-2 pt-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  Extracting text and structured details...
                </span>
                <span>{parseProgress}%</span>
              </div>
              <Progress value={parseProgress} className="h-2" />
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Stored Resumes in Candidate Profile */}
      {savedResumes && savedResumes.length > 0 && (
        <Card variant="glass" className="border-white/10">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Stored Profile Resumes ({savedResumes.length})
                </CardTitle>
                <CardDescription className="text-xs">
                  Active resumes stored in your candidate profile history
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {savedResumes.map((r: any) => (
                <div
                  key={r.id}
                  className="p-3.5 rounded-xl bg-card/60 border border-white/10 hover:border-primary/40 transition-all flex flex-col justify-between space-y-2.5"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-xs text-foreground truncate max-w-[180px]">{r.filename}</span>
                      {r.is_active && (
                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                          Active
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Calendar className="w-3 h-3 text-primary" />
                      <span>{r.created_at ? new Date(r.created_at).toLocaleDateString() : "Saved"}</span>
                      <span>•</span>
                      <span>{(r.file_size_bytes / 1024).toFixed(1)} KB</span>
                    </div>
                  </div>

                  {r.skills && r.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {r.skills.slice(0, 3).map((sk: string) => (
                        <span key={sk} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                          {sk}
                        </span>
                      ))}
                      {r.skills.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{r.skills.length - 3}</span>
                      )}
                    </div>
                  )}

                  <div className="pt-2 border-t border-white/5 flex items-center justify-end">
                    <Button variant="ghost" size="sm" asChild className="h-7 text-xs gap-1 text-primary hover:text-primary">
                      <a href={getAuthenticatedFileUrl(r.url)} target="_blank" rel="noopener noreferrer">
                        <Download className="w-3.5 h-3.5" />
                        <span>View / Download</span>
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Extracted Details Container */}
      {parsedData && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Summary / Contact Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Contact Information */}
            <Card variant="glass" className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  Extracted Contact
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <span className="text-muted-foreground block text-xs">Name</span>
                  <span className="font-semibold text-base">{parsedData.contact?.name || 'Not detected'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Email</span>
                  <span className="font-medium">{parsedData.contact?.email || 'Not detected'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Phone</span>
                  <span className="font-medium">{parsedData.contact?.phone || 'Not detected'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Location</span>
                  <span className="font-medium">
                    {[parsedData.contact?.city, parsedData.contact?.state].filter(Boolean).join(', ') || 'Not detected'}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Professional Summary */}
            <Card variant="glass" className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Professional Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {parsedData.summary || 'Summary not explicitly defined in resume header.'}
                </p>
                <div className="mt-4 pt-4 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Character count: <strong>{textLength}</strong></span>
                  <span>Skills detected: <strong>{parsedData.skills?.length || 0}</strong></span>
                  <span>Experience entries: <strong>{parsedData.experience?.length || 0}</strong></span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Extracted Skills */}
          <Card variant="glass">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" />
                Extracted Skills & Competencies ({parsedData.skills?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {parsedData.skills && parsedData.skills.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {parsedData.skills.map((skill, index) => (
                    <Badge key={index} variant="secondary" className="px-3 py-1 text-sm bg-primary/10 text-primary hover:bg-primary/20">
                      {skill}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No specific skills parsed.</p>
              )}
            </CardContent>
          </Card>

          {/* Experience & Education */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Experience */}
            <Card variant="glass">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-primary" />
                  Work Experience ({parsedData.experience?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {parsedData.experience && parsedData.experience.length > 0 ? (
                  parsedData.experience.map((exp, idx) => (
                    <div key={idx} className="p-3.5 rounded-lg border border-border bg-card/50 space-y-1">
                      <div className="flex justify-between items-start">
                        <h4 className="font-semibold text-sm">{exp.title || 'Position'}</h4>
                        {exp.duration && (
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            {exp.duration}
                          </span>
                        )}
                      </div>
                      {exp.company && (
                        <p className="text-xs font-medium text-primary">{exp.company}</p>
                      )}
                      {exp.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{exp.description}</p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No experience history extracted.</p>
                )}
              </CardContent>
            </Card>

            {/* Education */}
            <Card variant="glass">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-primary" />
                  Education ({parsedData.education?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {parsedData.education && parsedData.education.length > 0 ? (
                  parsedData.education.map((edu, idx) => (
                    <div key={idx} className="p-3.5 rounded-lg border border-border bg-card/50 space-y-1">
                      <div className="flex justify-between items-start">
                        <h4 className="font-semibold text-sm">{edu.degree || 'Degree'}</h4>
                        {edu.year && (
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            {edu.year}
                          </span>
                        )}
                      </div>
                      {edu.institution && (
                        <p className="text-xs font-medium text-primary">{edu.institution}</p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No education history extracted.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Full Extracted Raw Text */}
          {rawText && (
            <Card variant="glass">
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Full Extracted Text Preview</span>
                  <span className="text-xs font-normal text-muted-foreground">{textLength} characters</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="p-4 rounded-lg bg-black/40 border border-white/5 text-xs text-muted-foreground max-h-64 overflow-y-auto font-mono whitespace-pre-wrap">
                  {rawText}
                </pre>
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}

      {/* Modal for In-browser Resume Preview (for DOCX/TXT or iframe) */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              {file?.name || 'Resume Preview'}
            </DialogTitle>
            <DialogDescription>
              Viewing parsed content of your uploaded resume
            </DialogDescription>
          </DialogHeader>

          {file?.type === 'application/pdf' && previewUrl ? (
            <iframe
              src={previewUrl}
              className="w-full h-[65vh] rounded-md border"
              title="Resume PDF"
            />
          ) : (
            <div className="space-y-4">
              <pre className="p-4 bg-muted/60 rounded-md text-xs font-mono whitespace-pre-wrap max-h-[60vh] overflow-y-auto">
                {rawText || 'No text extracted yet.'}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
