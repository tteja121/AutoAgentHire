import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Mail, Phone, GraduationCap, Briefcase, MapPin,
  Sparkles, Edit3, CheckCircle2, ShieldCheck, Camera,
  Calendar, Award, BookOpen, Save, X, ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiClient, API_ENDPOINTS } from "@/lib/api";
import { getCandidateProfile } from "@/utils/profileSync";

interface UserProfileData {
  id?: number | string;
  email: string;
  full_name: string;
  phone: string;
  avatar_url?: string;
  education?: string;
  qualification?: string;
  job_role?: string;
  location?: string;
  company_name?: string;
  skills?: string[] | string;
  bio?: string;
  role?: string;
  approval_status?: string;
  custom_user_id?: string;
}

const DEFAULT_AVATARS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=256&h=256&fit=crop&crop=faces",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=256&h=256&fit=crop&crop=faces",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=256&h=256&fit=crop&crop=faces",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=256&h=256&fit=crop&crop=faces",
  "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=256&h=256&fit=crop&crop=faces",
  "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=256&h=256&fit=crop&crop=faces",
];

export default function ProfilePage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [profile, setProfile] = useState<UserProfileData>({
    email: "",
    full_name: "",
    phone: "",
    avatar_url: "",
    education: "",
    qualification: "",
    job_role: "",
    location: "",
    company_name: "",
    skills: [],
    bio: "",
    role: "candidate",
  });

  const [editForm, setEditForm] = useState<UserProfileData>({
    email: "",
    full_name: "",
    phone: "",
    avatar_url: "",
    education: "",
    qualification: "",
    job_role: "",
    location: "",
    company_name: "",
    skills: [],
    bio: "",
  });

  // Load profile from Backend / localStorage
  const loadProfile = async () => {
    setLoading(true);
    try {
      const resp = await apiClient.get(API_ENDPOINTS.settings.profile);
      const data = resp.data || {};
      const cached = getCandidateProfile();

      const resolved: UserProfileData = {
        id: data.id,
        email: data.email || cached.email || localStorage.getItem("candidate_email") || "",
        full_name: data.full_name || cached.candidate_name || localStorage.getItem("candidate_name") || "",
        phone: data.phone || cached.phone || localStorage.getItem("candidate_phone") || "",
        avatar_url: data.avatar_url || localStorage.getItem("candidate_avatar_url") || DEFAULT_AVATARS[0],
        education: data.education || (cached.education && cached.education[0]?.degree) || "Bachelor of Technology in Computer Science",
        qualification: data.qualification || "Graduate (Computer Science & Engineering)",
        job_role: data.job_role || cached.headline || "Full Stack Software Engineer",
        location: data.location || cached.location || "Bengaluru / Remote",
        company_name: data.company_name || "",
        skills: data.skills || cached.skills || ["React", "TypeScript", "Python", "FastAPI", "Tailwind CSS"],
        bio: data.bio || cached.summary || "Passionate engineer eager to contribute to innovative products.",
        role: data.role || "candidate",
        approval_status: data.approval_status || "approved",
        custom_user_id: data.custom_user_id || "",
      };

      setProfile(resolved);
      setEditForm(resolved);
    } catch (err) {
      console.warn("Could not fetch remote profile, falling back to local:", err);
      const cached = getCandidateProfile();
      const resolved: UserProfileData = {
        email: cached.email || localStorage.getItem("candidate_email") || "candidate@autoagenthire.com",
        full_name: cached.candidate_name || localStorage.getItem("candidate_name") || "Alex Rivera",
        phone: cached.phone || localStorage.getItem("candidate_phone") || "+1 (555) 234-5678",
        avatar_url: localStorage.getItem("candidate_avatar_url") || DEFAULT_AVATARS[0],
        education: "Bachelor of Technology in Computer Science",
        qualification: "B.Tech CSE / Software Engineering",
        job_role: cached.headline || "Full Stack Developer",
        location: cached.location || "San Francisco, CA / Remote",
        skills: cached.skills?.length ? cached.skills : ["React", "TypeScript", "Node.js", "Python"],
        bio: cached.summary || "Experienced software engineer dedicated to building seamless digital experiences.",
        role: "candidate",
      };
      setProfile(resolved);
      setEditForm(resolved);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleOpenEdit = () => {
    setEditForm({ ...profile });
    setIsEditModalOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const skillsArray = typeof editForm.skills === "string"
        ? editForm.skills.split(",").map(s => s.trim()).filter(Boolean)
        : editForm.skills;

      const payload = {
        email: editForm.email,
        full_name: editForm.full_name,
        phone: editForm.phone,
        avatar_url: editForm.avatar_url,
        education: editForm.education,
        qualification: editForm.qualification,
        job_role: editForm.job_role,
        location: editForm.location,
        company_name: editForm.company_name,
        bio: editForm.bio,
        skills: skillsArray,
      };

      await apiClient.post(API_ENDPOINTS.settings.updateProfile, payload);

      // Persist to local cache
      if (editForm.full_name) localStorage.setItem("candidate_name", editForm.full_name);
      if (editForm.email) localStorage.setItem("candidate_email", editForm.email);
      if (editForm.phone) localStorage.setItem("candidate_phone", editForm.phone);
      if (editForm.location) localStorage.setItem("candidate_location", editForm.location);
      if (editForm.job_role) localStorage.setItem("candidate_headline", editForm.job_role);
      if (editForm.avatar_url) localStorage.setItem("candidate_avatar_url", editForm.avatar_url);

      const updated: UserProfileData = {
        ...profile,
        ...editForm,
        skills: skillsArray,
      };
      setProfile(updated);
      setIsEditModalOpen(false);

      toast({
        title: "Profile Updated Successfully! ✨",
        description: "Your details have been saved to your account across all portal views.",
      });
    } catch (err: any) {
      toast({
        title: "Update Failed",
        description: err?.response?.data?.detail || err?.message || "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const parsedSkillsList: string[] = Array.isArray(profile.skills)
    ? profile.skills
    : typeof profile.skills === "string"
    ? (profile.skills as string).split(",").map(s => s.trim()).filter(Boolean)
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-muted-foreground font-medium">Loading candidate profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-primary/40 text-primary px-2.5 py-0.5 text-xs">
              <ShieldCheck className="w-3.5 h-3.5 mr-1" />
              Verified Candidate
            </Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1 text-foreground">
            My Candidate Profile
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Manage your personal profile, contact information, qualifications, and job preferences.
          </p>
        </div>

        <Button
          onClick={handleOpenEdit}
          className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 gap-2 shrink-0"
        >
          <Edit3 className="w-4 h-4" />
          <span>Edit Profile</span>
        </Button>
      </div>

      {/* Main Profile Presentation Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Photo & Key Badges */}
        <Card variant="glass" className="border-primary/20 bg-gradient-to-b from-primary/10 via-card to-card text-center p-6 space-y-5">
          <div className="relative mx-auto w-32 h-32">
            <img
              src={profile.avatar_url || DEFAULT_AVATARS[0]}
              alt={profile.full_name}
              className="w-32 h-32 rounded-3xl object-cover border-2 border-primary/40 shadow-xl shadow-primary/20 mx-auto"
            />
            <button
              onClick={handleOpenEdit}
              className="absolute -bottom-2 -right-2 p-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-transform hover:scale-110"
              title="Change Photo"
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-bold text-foreground">{profile.full_name || "Candidate Name"}</h2>
            <p className="text-sm font-medium text-primary">{profile.job_role || "Job Role Not Set"}</p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 pt-1">
              <MapPin className="w-3.5 h-3.5" />
              <span>{profile.location || "Location Not Specified"}</span>
            </p>
          </div>

          <div className="pt-2 border-t border-white/10 space-y-2 text-xs">
            <div className="flex items-center justify-between py-1">
              <span className="text-muted-foreground">Account Status:</span>
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                Active & Verified
              </Badge>
            </div>
            {profile.custom_user_id && (
              <div className="flex items-center justify-between py-1">
                <span className="text-muted-foreground">Candidate ID:</span>
                <span className="font-mono font-semibold text-primary">{profile.custom_user_id}</span>
              </div>
            )}
            <div className="flex items-center justify-between py-1">
              <span className="text-muted-foreground">Portal Role:</span>
              <span className="capitalize font-medium text-foreground">{profile.role || "Candidate"}</span>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={handleOpenEdit}
            className="w-full gap-2 border-white/15 hover:bg-white/5"
          >
            <Edit3 className="w-3.5 h-3.5 text-primary" />
            <span>Update Details</span>
          </Button>
        </Card>

        {/* Right Column: Detailed Sections (Names, Mobile, Email, Education, Qualification, Job Role) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Identity & Contact Details */}
          <Card variant="glass">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                Contact & Identity Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <span className="text-muted-foreground block uppercase font-mono text-[10px]">Full Name</span>
                  <span className="text-sm font-semibold text-foreground block">
                    {profile.full_name || "Not provided"}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <span className="text-muted-foreground block uppercase font-mono text-[10px] flex items-center gap-1">
                    <Mail className="w-3 h-3 text-primary" />
                    Email Address
                  </span>
                  <span className="text-sm font-medium text-foreground truncate block">
                    {profile.email || "Not provided"}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <span className="text-muted-foreground block uppercase font-mono text-[10px] flex items-center gap-1">
                    <Phone className="w-3 h-3 text-emerald-400" />
                    Mobile Number
                  </span>
                  <span className="text-sm font-semibold text-foreground font-mono block">
                    {profile.phone || "Not provided"}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <span className="text-muted-foreground block uppercase font-mono text-[10px] flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-amber-400" />
                    Location / City
                  </span>
                  <span className="text-sm font-medium text-foreground block">
                    {profile.location || "Not specified"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Education & Qualifications */}
          <Card variant="glass">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-purple-400" />
                Education & Qualifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-1">
                  <span className="text-purple-300 block uppercase font-mono text-[10px] flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    Education Degree & College
                  </span>
                  <span className="text-sm font-semibold text-foreground block">
                    {profile.education || "Bachelor of Technology in Computer Science"}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-1">
                  <span className="text-purple-300 block uppercase font-mono text-[10px] flex items-center gap-1">
                    <Award className="w-3 h-3" />
                    Education Qualification
                  </span>
                  <span className="text-sm font-semibold text-foreground block">
                    {profile.qualification || "B.Tech CSE / Graduate"}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1 sm:col-span-2">
                  <span className="text-muted-foreground block uppercase font-mono text-[10px] flex items-center gap-1">
                    <Briefcase className="w-3 h-3 text-blue-400" />
                    Target Job Role / Designation
                  </span>
                  <span className="text-sm font-bold text-primary block">
                    {profile.job_role || "Software Engineer"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Skills & Bio Summary */}
          <Card variant="glass">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                Skills & Professional Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <span className="text-[11px] font-semibold text-muted-foreground uppercase block mb-2">
                  Key Technical & Domain Skills
                </span>
                <div className="flex flex-wrap gap-2">
                  {parsedSkillsList.length > 0 ? (
                    parsedSkillsList.map((skill, idx) => (
                      <Badge
                        key={idx}
                        variant="secondary"
                        className="bg-primary/10 text-primary border border-primary/20 px-3 py-1 text-xs"
                      >
                        {skill}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground italic">No skills listed yet</span>
                  )}
                </div>
              </div>

              {profile.bio && (
                <div className="pt-3 border-t border-white/10">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase block mb-1">
                    Professional Summary
                  </span>
                  <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                    {profile.bio}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* EDIT PROFILE MODAL: Centered Dialog ("Pop up on the middle of screen") */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-2xl bg-card border-white/10 text-foreground max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-primary" />
              Edit Profile Details
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Update your photo, personal details, contact info, qualifications, and job preferences.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveProfile} className="space-y-5 pt-2">
            {/* 1. Photo Section */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
              <Label className="text-xs font-semibold uppercase text-muted-foreground block">
                1. Profile Photo / Avatar *
              </Label>
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <img
                  src={editForm.avatar_url || DEFAULT_AVATARS[0]}
                  alt="Preview"
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-primary/40 shadow-md shrink-0"
                />
                <div className="w-full space-y-2">
                  <Input
                    placeholder="Paste image URL (https://...)"
                    value={editForm.avatar_url || ""}
                    onChange={(e) => setEditForm(prev => ({ ...prev, avatar_url: e.target.value }))}
                    className="text-xs"
                  />
                  <div className="flex items-center gap-2 overflow-x-auto py-1">
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">Presets:</span>
                    {DEFAULT_AVATARS.map((url, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setEditForm(prev => ({ ...prev, avatar_url: url }))}
                        className={`w-7 h-7 rounded-lg overflow-hidden border-2 transition-transform hover:scale-110 ${
                          editForm.avatar_url === url ? "border-primary scale-105" : "border-transparent opacity-70"
                        }`}
                      >
                        <img src={url} alt={`Preset ${i}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Names, Mobile Number, Email */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium mb-1 block">Full Name *</Label>
                  <Input
                    placeholder="e.g. Jane Doe"
                    value={editForm.full_name}
                    onChange={(e) => setEditForm(prev => ({ ...prev, full_name: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs font-medium block">Mobile Number *</Label>
                    <span className="text-[10px] text-primary">All country formats allowed</span>
                  </div>
                  <Input
                    placeholder="e.g. +91 98765 43210, +1 (555) 000-0000, +44 7911 123456"
                    value={editForm.phone}
                    onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                    required
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Enter with country code (e.g. +91 for India, +1 for US, +44 for UK, +61 for Aus)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium mb-1 block">Email Address *</Label>
                  <Input
                    type="email"
                    placeholder="jane@example.com"
                    value={editForm.email}
                    onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label className="text-xs font-medium mb-1 block">Location / City</Label>
                  <Input
                    placeholder="e.g. San Francisco, CA / Remote"
                    value={editForm.location || ""}
                    onChange={(e) => setEditForm(prev => ({ ...prev, location: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* 3. Education, Qualification, Job Role */}
            <div className="space-y-3 p-4 rounded-2xl bg-purple-500/5 border border-purple-500/20">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium mb-1 block text-purple-200">
                    Education (Degree / University) *
                  </Label>
                  <Input
                    placeholder="e.g. B.Tech Computer Science"
                    value={editForm.education || ""}
                    onChange={(e) => setEditForm(prev => ({ ...prev, education: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label className="text-xs font-medium mb-1 block text-purple-200">
                    Education Qualification *
                  </Label>
                  <Input
                    placeholder="e.g. Graduate / Postgraduate"
                    value={editForm.qualification || ""}
                    onChange={(e) => setEditForm(prev => ({ ...prev, qualification: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-medium mb-1 block text-purple-200">
                  Target Job Role / Designation *
                </Label>
                <Input
                  placeholder="e.g. Full Stack Developer, AI Engineer, Project Lead"
                  value={editForm.job_role || ""}
                  onChange={(e) => setEditForm(prev => ({ ...prev, job_role: e.target.value }))}
                  required
                />
              </div>
            </div>

            {/* 4. Skills & Bio */}
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-medium mb-1 block">
                  Skills (comma-separated)
                </Label>
                <Input
                  placeholder="React, TypeScript, Python, Node.js, AWS"
                  value={Array.isArray(editForm.skills) ? editForm.skills.join(", ") : (editForm.skills || "")}
                  onChange={(e) => setEditForm(prev => ({ ...prev, skills: e.target.value }))}
                />
              </div>

              <div>
                <Label className="text-xs font-medium mb-1 block">
                  About Me / Professional Bio
                </Label>
                <Textarea
                  rows={3}
                  placeholder="Tell recruiters about your background, achievements, and technical expertise..."
                  value={editForm.bio || ""}
                  onChange={(e) => setEditForm(prev => ({ ...prev, bio: e.target.value }))}
                  className="resize-none text-xs"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditModalOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Changes</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
