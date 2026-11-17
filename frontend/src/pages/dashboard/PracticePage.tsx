import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap,
  Sparkles,
  Play,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Code2,
  Database,
  MessageSquare,
  HelpCircle,
  Trophy,
  TrendingUp,
  Mic,
  MicOff,
  Send,
  Eye,
  Trash2,
  Award,
  Zap,
  Check,
  ListChecks,
  ChevronRight,
  Lightbulb,
  FileText,
  Terminal,
  Upload,
  Plus,
  X,
  Sliders,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  practiceService,
  PracticeProfile,
  InterviewQuestion,
  StartInterviewResponse,
  InterviewEvaluation,
  TechnicalTestQuestion,
  TestResultItem,
  PracticeSessionSummary,
  PracticeAnalytics,
} from "@/services/practiceService";

export const TECHNICAL_DOMAINS = [
  "Frontend Development",
  "Backend Development",
  "Full Stack Development",
  "DevOps & Cloud Engineering",
  "Artificial Intelligence & Machine Learning",
  "Data Engineering & Big Data",
  "Mobile App Development",
  "Cybersecurity & Information Security",
  "Quality Assurance & Test Automation",
  "System Design & Distributed Systems",
  "Embedded Systems & IoT",
  "Database Administration & Architecture",
  "Blockchain & Web3",
];

export const PRACTICE_TYPES = [
  { id: 'ai_technical', label: 'AI Technical', desc: 'Mock interview simulation with STAR feedback', kind: 'interview' },
  { id: 'hr', label: 'HR / Behavioral', desc: 'STAR situational and leadership interview', kind: 'interview' },
  { id: 'resume_based', label: 'Resume-Based', desc: 'Tailored questions on verified resume projects & experience', kind: 'interview' },
  { id: 'coding', label: 'Coding Test', desc: 'Algorithmic challenges & coding implementations', kind: 'test' },
  { id: 'mcq', label: 'Multiple Choice (MCQ)', desc: 'Knowledge tests graded against answer keys', kind: 'test' },
  { id: 'sql', label: 'SQL Queries', desc: 'Database querying, aggregation & query tuning', kind: 'test' },
  { id: 'debugging', label: 'Code Debugging', desc: 'Find & resolve syntax and logical bugs in code', kind: 'test' },
  { id: 'domain_specific', label: 'Domain-Specific', desc: 'Architecture and technical specialization assessment', kind: 'test' },
];

export const EXPERIENCE_TIERS = ["Fresher", "0–1 yrs", "1–2 yrs", "2–3 yrs", "3–5 yrs", "5+ yrs"];
export const DIFFICULTY_LEVELS = ["Beginner", "Intermediate", "Advanced", "Expert"];
export const QUESTION_COUNTS = [10, 20, 30];
export const DURATIONS = [15, 30, 45, 60];
export const POPULAR_PRACTICE_SKILLS = [
  "Python", "React", "FastAPI", "SQL", "TypeScript", "Node.js", "Docker",
  "System Design", "AWS", "Machine Learning", "Data Structures", "Git"
];

export default function PracticePage() {
  // Page Mode: 'hub' | 'interview' | 'test' | 'test_review' | 'interview_review'
  const [mode, setMode] = useState<"hub" | "interview" | "test" | "test_review" | "interview_review">("hub");
  const [activeTab, setActiveTab] = useState<"launchpad" | "history">("launchpad");

  // Profile & Analytics
  const [profile, setProfile] = useState<PracticeProfile | null>(null);
  const [analytics, setAnalytics] = useState<PracticeAnalytics | null>(null);
  const [sessionsHistory, setSessionsHistory] = useState<PracticeSessionSummary[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Option A (Upload Resume)
  const [practiceResumeFile, setPracticeResumeFile] = useState<File | null>(null);
  const [isUploadingPracticeResume, setIsUploadingPracticeResume] = useState(false);
  const [uploadedResumeData, setUploadedResumeData] = useState<{
    status: string;
    filename: string;
    skills: string[];
    total_experience: string;
    projects: any[];
    education: any[];
    technical_domains: string[];
    suggested_designations: any[];
    summary: string;
  } | null>(null);

  // Option B (Customize Practice) - MUST start with empty fields
  const [customSkills, setCustomSkills] = useState<string[]>([]);
  const [customSkillInput, setCustomSkillInput] = useState<string>('');
  const [customDomain, setCustomDomain] = useState<string>('Full Stack Development');
  const [customDesignation, setCustomDesignation] = useState<string>('');
  const [customExperienceTier, setCustomExperienceTier] = useState<string>('Fresher');
  const [customDifficulty, setCustomDifficulty] = useState<string>('Intermediate');

  // Practice Configuration Matrix
  const [launchOption, setLaunchOption] = useState<'resume' | 'customize'>('customize');
  const [configuredPracticeType, setConfiguredPracticeType] = useState<string>('ai_technical');
  const [configuredQuestionCount, setConfiguredQuestionCount] = useState<number>(10);
  const [configuredDurationMins, setConfiguredDurationMins] = useState<number>(15);

  // Modal Review
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // ─── INTERVIEW CONFIG & STATE ────────────────────────────────────────────────
  const [interviewCategory, setInterviewCategory] = useState<string>("mixed");
  const [interviewDifficulty, setInterviewDifficulty] = useState<string>("medium");
  const [interviewTotalQuestions, setInterviewTotalQuestions] = useState<number>(5);
  const [startingInterview, setStartingInterview] = useState(false);

  // Active Interview Running State
  const [activeInterviewSessionId, setActiveInterviewSessionId] = useState<number | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<InterviewQuestion | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(1);
  const [totalInterviewQuestions, setTotalInterviewQuestions] = useState<number>(5);
  const [candidateAnswerText, setCandidateAnswerText] = useState<string>("");
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [latestEvaluation, setLatestEvaluation] = useState<InterviewEvaluation | null>(null);
  const [showEvaluationCard, setShowEvaluationCard] = useState(false);
  const [pendingNextQuestion, setPendingNextQuestion] = useState<InterviewQuestion | null>(null);
  const [interviewSummaryReport, setInterviewSummaryReport] = useState<any>(null);

  // Speech Recognition
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  // ─── TECHNICAL TEST CONFIG & STATE ──────────────────────────────────────────
  const [testFormat, setTestFormat] = useState<string>("mcq");
  const [testDomain, setTestDomain] = useState<string>("Full Stack Development");
  const [testDifficulty, setTestDifficulty] = useState<string>("medium");
  const [testDurationMins, setTestDurationMins] = useState<number>(15);
  const [startingTest, setStartingTest] = useState(false);

  // Active Test Running State
  const [activeTestSessionId, setActiveTestSessionId] = useState<number | null>(null);
  const [testQuestions, setTestQuestions] = useState<TechnicalTestQuestion[]>([]);
  const [currentTestIndex, setCurrentTestIndex] = useState<number>(0);
  const [testAnswers, setTestAnswers] = useState<Record<number, string>>({});
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number>(900);
  const [submittingTest, setSubmittingTest] = useState(false);
  const [testScorecard, setTestScorecard] = useState<any>(null);
  const timerIntervalRef = useRef<any>(null);

  // Load initial data
  const loadHubData = async () => {
    try {
      setLoadingInitial(true);
      const [profData, analyticsData, sessionsData] = await Promise.allSettled([
        practiceService.getProfile(),
        practiceService.getAnalytics(),
        practiceService.listSessions({ limit: 15 }),
      ]);

      if (profData.status === "fulfilled") setProfile(profData.value);
      if (analyticsData.status === "fulfilled") setAnalytics(analyticsData.value);
      if (sessionsData.status === "fulfilled") setSessionsHistory(sessionsData.value.sessions || []);
    } catch (err) {
      console.error("Failed to load practice hub data:", err);
    } finally {
      setLoadingInitial(false);
    }
  };

  useEffect(() => {
    loadHubData();
    restoreActiveSession();
  }, []);

  // Speech Recognition Setup
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setCandidateAnswerText((prev) => (prev ? `${prev} ${transcript}` : transcript));
      };

      recognition.onerror = (e: any) => {
        console.warn("Speech recognition error:", e);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleSpeechRecording = () => {
    if (!recognitionRef.current) {
      toast.error("Speech recognition is not supported in this browser. Please type your response.");
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
      toast.info("Voice recording stopped.");
    } else {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
        toast.success("Listening... Speak your interview answer clearly.");
      } catch (err) {
        console.error("Speech recognition start failed:", err);
        setIsRecording(false);
      }
    }
  };

  // ─── OPTION A & OPTION B UNIFIED LAUNCH HANDLERS ─────────────────────────
  const handleUploadResumeForPractice = async (file: File) => {
    setIsUploadingPracticeResume(true);
    try {
      const data = await practiceService.uploadResume(file);
      setPracticeResumeFile(file);
      setUploadedResumeData(data);
      setLaunchOption('resume');
      toast.success("Resume parsed for practice! Your candidate profile remains completely untouched.");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to analyze resume for practice.");
    } finally {
      setIsUploadingPracticeResume(false);
    }
  };

  const handleAddCustomSkill = (skillToAdd?: string) => {
    const val = (skillToAdd || customSkillInput).trim();
    if (!val) return;
    if (!customSkills.some((s) => s.toLowerCase() === val.toLowerCase())) {
      setCustomSkills((prev) => [...prev, val]);
    }
    setCustomSkillInput('');
  };

  const handleRemoveCustomSkill = (skillToRemove: string) => {
    setCustomSkills((prev) => prev.filter((s) => s !== skillToRemove));
  };

  const handleLaunchConfiguredSession = async () => {
    const practiceConfig = PRACTICE_TYPES.find((p) => p.id === configuredPracticeType) || PRACTICE_TYPES[0];
    if (practiceConfig.kind === 'interview') {
      try {
        setStartingInterview(true);
        const isResume = launchOption === 'resume' && uploadedResumeData;
        const res = await practiceService.startInterview({
          category: configuredPracticeType === 'hr' ? 'hr' : configuredPracticeType === 'resume_based' ? 'resume' : 'technical',
          practice_type: configuredPracticeType,
          mode: isResume ? 'resume' : 'custom',
          domain: isResume ? (uploadedResumeData.technical_domains[0] || 'Software Engineering') : customDomain,
          target_designation: isResume ? (uploadedResumeData.suggested_designations[0]?.title || 'Software Engineer') : (customDesignation || 'Software Engineer'),
          experience_level: isResume ? uploadedResumeData.total_experience : customExperienceTier,
          difficulty: customDifficulty.toLowerCase(),
          total_questions: configuredQuestionCount,
          duration_minutes: configuredDurationMins,
          selected_skills: isResume ? uploadedResumeData.skills : customSkills,
        });
        setActiveInterviewSessionId(res.session_id);
        try {
          localStorage.setItem("autoagenthire_active_practice_session", JSON.stringify({ id: res.session_id, type: "interview" }));
        } catch (_) {}
        setCurrentQuestion(res.question);
        setCurrentQuestionIndex(1);
        setTotalInterviewQuestions(res.total_questions || configuredQuestionCount);
        setCandidateAnswerText("");
        setLatestEvaluation(null);
        setShowEvaluationCard(false);
        setPendingNextQuestion(null);
        setInterviewSummaryReport(null);
        setMode("interview");
        toast.success(`Started ${res.title}. Good luck!`);
      } catch (err: any) {
        toast.error(err.response?.data?.detail || "Failed to start interview session.");
      } finally {
        setStartingInterview(false);
      }
    } else {
      try {
        setStartingTest(true);
        const isResume = launchOption === 'resume' && uploadedResumeData;
        const testFormatMap: Record<string, string> = {
          coding: 'coding',
          mcq: 'mcq',
          sql: 'sql',
          debugging: 'debugging',
          domain_specific: 'domain_assessment',
        };
        const res = await practiceService.startTechnicalTest({
          test_type: testFormatMap[configuredPracticeType] || configuredPracticeType,
          practice_type: configuredPracticeType,
          mode: isResume ? 'resume' : 'custom',
          domain: isResume ? (uploadedResumeData.technical_domains[0] || 'Software Engineering') : customDomain,
          difficulty: customDifficulty.toLowerCase(),
          selected_skills: isResume ? uploadedResumeData.skills : customSkills,
          total_questions: configuredQuestionCount,
          duration_minutes: configuredDurationMins,
        });
        setActiveTestSessionId(res.session_id);
        try {
          localStorage.setItem("autoagenthire_active_practice_session", JSON.stringify({ id: res.session_id, type: "test" }));
        } catch (_) {}
        setTestQuestions(res.questions);
        setCurrentTestIndex(0);
        setTestAnswers({});
        setTimeRemainingSeconds(res.duration_minutes * 60);
        setTestScorecard(null);
        setMode("test");

        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = setInterval(() => {
          setTimeRemainingSeconds((prev) => {
            if (prev <= 1) {
              clearInterval(timerIntervalRef.current);
              handleAutoSubmitTest(res.session_id);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        toast.success(`Started ${res.title}! You have ${res.duration_minutes} minutes.`);
      } catch (err: any) {
        toast.error(err.response?.data?.detail || "Failed to start technical test.");
      } finally {
        setStartingTest(false);
      }
    }
  };

  // ─── INTERVIEW FLOW HANDLERS ────────────────────────────────────────────────

  const handleStartInterview = async (customCategory?: string) => {
    try {
      setStartingInterview(true);
      const categoryToUse = customCategory || interviewCategory;
      const res: StartInterviewResponse = await practiceService.startInterview({
        category: categoryToUse,
        difficulty: interviewDifficulty,
        total_questions: interviewTotalQuestions,
        domain: profile?.target_designation,
        experience_level: profile?.experience_level,
      });

      setActiveInterviewSessionId(res.session_id);
      try {
        localStorage.setItem("autoagenthire_active_practice_session", JSON.stringify({ id: res.session_id, type: "interview" }));
      } catch (_) {}
      setCurrentQuestion(res.question);
      setCurrentQuestionIndex(1);
      setTotalInterviewQuestions(res.total_questions);
      setCandidateAnswerText("");
      setLatestEvaluation(null);
      setShowEvaluationCard(false);
      setPendingNextQuestion(null);
      setInterviewSummaryReport(null);
      setMode("interview");
      toast.success(`Started ${res.title}. Good luck!`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to start interview session.");
    } finally {
      setStartingInterview(false);
    }
  };

  const handleSubmitInterviewAnswer = async () => {
    if (!candidateAnswerText.trim()) {
      toast.error("Please articulate or type your response before submitting.");
      return;
    }
    if (!activeInterviewSessionId || !currentQuestion) return;

    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }

    try {
      setSubmittingAnswer(true);
      const res = await practiceService.submitInterviewAnswer(activeInterviewSessionId, {
        question_id: currentQuestion.id,
        candidate_answer: candidateAnswerText.trim(),
        time_spent_seconds: 45,
      });

      setLatestEvaluation(res.evaluation);
      setShowEvaluationCard(true);

      if (res.is_completed) {
        setInterviewSummaryReport(res.summary_report);
        setPendingNextQuestion(null);
        toast.success("Interview completed! Generating comprehensive evaluation report...");
      } else {
        setPendingNextQuestion(res.next_question || null);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to evaluate answer.");
    } finally {
      setSubmittingAnswer(false);
    }
  };

  const handleProceedToNextQuestion = () => {
    if (pendingNextQuestion) {
      setCurrentQuestion(pendingNextQuestion);
      setCurrentQuestionIndex((prev) => prev + 1);
      setCandidateAnswerText("");
      setShowEvaluationCard(false);
      setLatestEvaluation(null);
      setPendingNextQuestion(null);
    } else if (interviewSummaryReport) {
      // Completed, transition to summary view
      try {
        localStorage.removeItem("autoagenthire_active_practice_session");
      } catch (_) {}
      setMode("interview_review");
    }
  };

  const handleExitInterview = async () => {
    try {
      localStorage.removeItem("autoagenthire_active_practice_session");
    } catch (_) {}
    if (activeInterviewSessionId && !interviewSummaryReport) {
      try {
        await practiceService.finishInterview(activeInterviewSessionId);
      } catch (e) {
        console.warn("Session finish notice:", e);
      }
    }
    setMode("hub");
    loadHubData();
  };

  // ─── TECHNICAL TEST FLOW HANDLERS ──────────────────────────────────────────

  const handleStartTechnicalTest = async () => {
    try {
      setStartingTest(true);
      const res = await practiceService.startTechnicalTest({
        test_type: testFormat,
        domain: testDomain,
        difficulty: testDifficulty,
        total_questions: 5,
        duration_minutes: testDurationMins,
      });

      setActiveTestSessionId(res.session_id);
      try {
        localStorage.setItem("autoagenthire_active_practice_session", JSON.stringify({ id: res.session_id, type: "test" }));
      } catch (_) {}
      setTestQuestions(res.questions);
      setCurrentTestIndex(0);
      setTestAnswers({});
      setTimeRemainingSeconds(res.duration_minutes * 60);
      setTestScorecard(null);
      setMode("test");

      // Start Countdown Timer
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = setInterval(() => {
        setTimeRemainingSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current);
            handleAutoSubmitTest(res.session_id);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      toast.success(`Assessment started: ${res.total_questions} questions. Time limit: ${res.duration_minutes}m.`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to generate assessment.");
    } finally {
      setStartingTest(false);
    }
  };

  const handleSelectOptionAnswer = (questionId: number, answerText: string) => {
    setTestAnswers((prev) => ({
      ...prev,
      [questionId]: answerText,
    }));
    if (activeTestSessionId) {
      practiceService.saveTestAnswer(activeTestSessionId, {
        question_id: questionId,
        candidate_answer: answerText,
      }).catch(console.warn);
    }
  };

  const handleCodeAnswerChange = (questionId: number, codeText: string) => {
    setTestAnswers((prev) => ({
      ...prev,
      [questionId]: codeText,
    }));
  };

  const handleAutoSubmitTest = async (sessionId?: number) => {
    toast.warning("Time limit expired! Automatically grading your assessment...");
    await handleSubmitTest(sessionId);
  };

  const handleSubmitTest = async (overrideSessionId?: number) => {
    const sId = overrideSessionId || activeTestSessionId;
    if (!sId) return;

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    try {
      setSubmittingTest(true);
      const payloadAnswers = testQuestions.map((q) => ({
        question_id: q.id,
        candidate_answer: testAnswers[q.id] || "",
      }));

      const res = await practiceService.submitTechnicalTest(sId, {
        answers: payloadAnswers,
        time_spent_seconds: testDurationMins * 60 - timeRemainingSeconds,
      });

      setTestScorecard(res);
      try {
        localStorage.removeItem("autoagenthire_active_practice_session");
      } catch (_) {}
      setMode("test_review");
      toast.success(`Assessment scored! You earned ${res.overall_score}%.`);
      loadHubData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to submit assessment.");
    } finally {
      setSubmittingTest(false);
    }
  };

  // ─── REVIEW MODAL ──────────────────────────────────────────────────────────

  const handleOpenSessionReview = async (sessionId: number) => {
    try {
      setLoadingDetail(true);
      setReviewModalOpen(true);
      const data = await practiceService.getSessionDetail(sessionId);
      setSelectedSessionDetail(data);
    } catch (err: any) {
      toast.error("Failed to load session details.");
      setReviewModalOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleDeleteSession = async (sessionId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await practiceService.deleteSession(sessionId);
      try {
        const saved = localStorage.getItem("autoagenthire_active_practice_session");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.id === sessionId) {
            localStorage.removeItem("autoagenthire_active_practice_session");
          }
        }
      } catch (_) {}
      toast.success("Session removed from history.");
      setSessionsHistory((prev) => prev.filter((s) => s.id !== sessionId));
      loadHubData();
    } catch (err: any) {
      toast.error("Failed to delete session.");
    }
  };

  // Restore Active Session on Refresh
  const restoreActiveSession = async () => {
    const saved = localStorage.getItem("autoagenthire_active_practice_session");
    if (!saved) return;
    try {
      const { id, type } = JSON.parse(saved);
      if (!id) return;
      const data = await practiceService.getSessionDetail(id);
      if (!data || !data.session || data.session.status !== "in_progress") {
        localStorage.removeItem("autoagenthire_active_practice_session");
        return;
      }

      if (type === "interview") {
        setActiveInterviewSessionId(data.session.id);
        setTotalInterviewQuestions(data.session.total_questions || 5);

        const transcript = data.transcript || [];
        const unanswered = transcript.find((item: any) => !item.candidate_answer);

        if (unanswered) {
          setCurrentQuestion({
            id: unanswered.question_id,
            question_index: unanswered.question_index,
            question_type: unanswered.question_type,
            skill: unanswered.skill,
            domain: unanswered.domain || data.session.domain || "Software Engineering",
            difficulty: unanswered.difficulty || "medium",
            question_text: unanswered.question_text,
            code_snippet: unanswered.code_snippet,
            max_marks: unanswered.max_marks || 10,
          });
          setCurrentQuestionIndex(unanswered.question_index);
        } else if (transcript.length > 0) {
          const last = transcript[transcript.length - 1];
          setCurrentQuestion({
            id: last.question_id,
            question_index: last.question_index,
            question_type: last.question_type,
            skill: last.skill,
            domain: last.domain || data.session.domain || "Software Engineering",
            difficulty: last.difficulty || "medium",
            question_text: last.question_text,
            code_snippet: last.code_snippet,
            max_marks: last.max_marks || 10,
          });
          setCurrentQuestionIndex(last.question_index);
        }

        setInterviewCategory(data.session.interview_category || "technical");
        setMode("interview");
        toast.info("Resumed active interview session.");
      } else if (type === "test") {
        setActiveTestSessionId(data.session.id);
        const transcript = data.transcript || [];
        const questions: TechnicalTestQuestion[] = transcript.map((item: any) => ({
          id: item.question_id,
          question_index: item.question_index,
          question_type: item.question_type,
          skill: item.skill,
          difficulty: item.difficulty,
          question_text: item.question_text,
          code_snippet: item.code_snippet,
          options: item.options,
          max_marks: item.max_marks || 10,
        }));
        setTestQuestions(questions);

        const answersMap: Record<number, string> = {};
        transcript.forEach((item: any) => {
          if (item.candidate_answer) {
            answersMap[item.question_id] = item.candidate_answer;
          }
        });
        setTestAnswers(answersMap);

        const createdAt = data.session.created_at ? new Date(data.session.created_at).getTime() : Date.now();
        const elapsedSeconds = Math.floor((Date.now() - createdAt) / 1000);
        const totalSeconds = (data.session.duration_minutes || 15) * 60;
        const remaining = Math.max(0, totalSeconds - elapsedSeconds);

        setTimeRemainingSeconds(remaining);
        setMode("test");

        if (remaining > 0) {
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = setInterval(() => {
            setTimeRemainingSeconds((prev) => {
              if (prev <= 1) {
                clearInterval(timerIntervalRef.current);
                handleAutoSubmitTest(data.session.id);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
          toast.info(`Resumed active assessment with ${Math.ceil(remaining / 60)} minutes remaining.`);
        } else {
          handleAutoSubmitTest(data.session.id);
        }
      }
    } catch (err) {
      console.warn("Could not restore previous active session:", err);
      localStorage.removeItem("autoagenthire_active_practice_session");
    }
  };

  // Format MM:SS
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // ═════════════════════════════════════════════════════════════════════════════
  // VIEW: ACTIVE INTERVIEW SIMULATION
  // ═════════════════════════════════════════════════════════════════════════════

  if (mode === "interview" && currentQuestion) {
    const progressPercent = Math.round((currentQuestionIndex / totalInterviewQuestions) * 100);

    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-12 animate-in fade-in duration-300">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                AI Interview Simulation
              </h2>
              <p className="text-xs text-muted-foreground">
                Question {currentQuestionIndex} of {totalInterviewQuestions} • {currentQuestion.domain}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleExitInterview} className="text-xs">
            Save & Exit
          </Button>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground font-medium">
            <span>Interview Progress</span>
            <span>{progressPercent}% Complete</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        {/* Question Canvas */}
        <Card className="border border-border shadow-sm bg-card overflow-hidden">
          <CardHeader className="bg-muted/30 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="bg-background text-xs uppercase tracking-wider font-semibold">
                {currentQuestion.skill || "Technical"}
              </Badge>
              <Badge variant="secondary" className="text-xs capitalize">
                {currentQuestion.difficulty}
              </Badge>
              <Badge variant="outline" className="text-xs text-muted-foreground">
                {currentQuestion.max_marks} Marks
              </Badge>
            </div>
            <CardTitle className="text-lg leading-relaxed font-semibold text-foreground">
              {currentQuestion.question_text}
            </CardTitle>
          </CardHeader>

          {currentQuestion.code_snippet && (
            <div className="px-6 py-3 bg-zinc-950 text-zinc-100 font-mono text-xs overflow-x-auto border-t border-b border-zinc-800">
              <pre>{currentQuestion.code_snippet}</pre>
            </div>
          )}

          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-primary" />
                Your Structured Answer
              </label>
              <Button
                type="button"
                variant={isRecording ? "destructive" : "outline"}
                size="sm"
                onClick={toggleSpeechRecording}
                className="text-xs flex items-center gap-1.5"
              >
                {isRecording ? (
                  <>
                    <MicOff className="w-3.5 h-3.5 animate-pulse" />
                    Listening... Click to Stop
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5 text-primary" />
                    Speak Response (Voice)
                  </>
                )}
              </Button>
            </div>

            <Textarea
              rows={6}
              disabled={showEvaluationCard || submittingAnswer}
              value={candidateAnswerText}
              onChange={(e) => setCandidateAnswerText(e.target.value)}
              placeholder="Structure your answer clearly using the STAR framework (Situation, Task, Action, Result) or detailing architectural trade-offs..."
              className="resize-none font-sans text-sm focus-visible:ring-primary leading-relaxed"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{candidateAnswerText.trim().split(/\s+/).filter(Boolean).length} words</span>
              <span>Speak or type freely. AI will evaluate technical precision and depth.</span>
            </div>

            {!showEvaluationCard && (
              <Button
                disabled={submittingAnswer || !candidateAnswerText.trim()}
                onClick={handleSubmitInterviewAnswer}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 mt-2 font-medium"
              >
                {submittingAnswer ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
                    Gemini AI is Evaluating Answer...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Submit Answer & Get Instant Feedback
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Immediate AI Feedback Drawer / Card */}
        <AnimatePresence>
          {showEvaluationCard && latestEvaluation && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <Card className="border border-primary/30 shadow-md bg-gradient-to-br from-background to-primary/5">
                <CardHeader className="pb-3 border-b border-border/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                      <CardTitle className="text-base font-bold">AI Interview Evaluation</CardTitle>
                    </div>
                    <Badge
                      className={`text-sm px-3 py-1 font-bold ${
                        latestEvaluation.score >= 8
                          ? "bg-emerald-600 text-white"
                          : latestEvaluation.score >= 6
                          ? "bg-amber-600 text-white"
                          : "bg-rose-600 text-white"
                      }`}
                    >
                      Score: {latestEvaluation.score} / 10
                    </Badge>
                  </div>
                  <CardDescription className="text-xs text-foreground/80 mt-1">
                    {latestEvaluation.evaluation}
                  </CardDescription>
                </CardHeader>

                <CardContent className="pt-4 space-y-4 text-xs">
                  {/* Strengths */}
                  {latestEvaluation.strengths?.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="font-semibold text-emerald-700 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Strengths Identified:
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-muted-foreground pl-1">
                        {latestEvaluation.strengths.map((str, i) => (
                          <li key={i}>{str}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Areas for Improvement */}
                  {(latestEvaluation.missing_concepts?.length > 0 || latestEvaluation.mistakes?.length > 0) && (
                    <div className="space-y-1.5">
                      <p className="font-semibold text-amber-700 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" /> What Could Be Improved:
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-muted-foreground pl-1">
                        {[...latestEvaluation.missing_concepts, ...latestEvaluation.mistakes].map((imp, i) => (
                          <li key={i}>{imp}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Model Benchmark Answer */}
                  {latestEvaluation.better_answer_example && (
                    <div className="p-3 bg-muted/50 rounded-lg border border-border/80 space-y-1">
                      <p className="font-semibold text-foreground flex items-center gap-1.5">
                        <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                        Model Benchmark Answer:
                      </p>
                      <p className="text-muted-foreground leading-relaxed italic">
                        "{latestEvaluation.better_answer_example}"
                      </p>
                    </div>
                  )}

                  {/* Adaptive Follow-up question hint */}
                  {latestEvaluation.follow_up_question && (
                    <div className="p-2.5 bg-primary/10 rounded-lg text-primary space-y-0.5">
                      <span className="font-semibold">Adaptive Follow-Up to Consider: </span>
                      <span>{latestEvaluation.follow_up_question}</span>
                    </div>
                  )}
                </CardContent>

                <CardFooter className="pt-2 border-t border-border/50 flex justify-end">
                  <Button
                    onClick={handleProceedToNextQuestion}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs flex items-center gap-1.5"
                  >
                    {pendingNextQuestion ? (
                      <>
                        Next Question <ChevronRight className="w-4 h-4" />
                      </>
                    ) : (
                      <>
                        View Comprehensive Report <Trophy className="w-4 h-4 ml-1" />
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // VIEW: INTERVIEW FINAL REPORT SUMMARY
  // ═════════════════════════════════════════════════════════════════════════════

  if (mode === "interview_review" && interviewSummaryReport) {
    const rep = interviewSummaryReport;

    return (
      <div className="max-w-3xl mx-auto space-y-6 pb-12 animate-in fade-in duration-300">
        <Card className="border border-border shadow-lg bg-card overflow-hidden">
          <div className="bg-gradient-to-r from-primary to-primary/85 text-primary-foreground p-8 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-2">
              <Trophy className="w-8 h-8 text-amber-300" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Interview Performance Report</h1>
            <p className="text-xs text-primary-foreground/80 max-w-md mx-auto">
              Evaluation synthesized across technical accuracy, communication structure, and depth.
            </p>
            <div className="inline-block mt-2">
              <Badge className="text-base px-4 py-1.5 bg-white text-primary font-bold shadow-sm">
                Score: {rep.overall_percentage}% • {rep.rating_tier}
              </Badge>
            </div>
          </div>

          <CardContent className="p-6 space-y-6">
            {/* Strengths */}
            {rep.strengths?.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Key Strengths Observed
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {rep.strengths.map((str: string, i: number) => (
                    <div key={i} className="p-3 rounded-lg bg-emerald-50/50 border border-emerald-200/60 text-xs text-foreground">
                      {str}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Areas for Improvement */}
            {rep.areas_for_improvement?.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  Areas to Polish
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {rep.areas_for_improvement.map((imp: string, i: number) => (
                    <div key={i} className="p-3 rounded-lg bg-amber-50/50 border border-amber-200/60 text-xs text-foreground">
                      {imp}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Items */}
            {rep.action_items?.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  Recommended Next Steps
                </h3>
                <ul className="list-disc list-inside space-y-1.5 text-xs text-muted-foreground pl-1">
                  {rep.action_items.map((act: string, i: number) => (
                    <li key={i}>{act}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>

          <CardFooter className="bg-muted/30 p-6 flex items-center justify-between border-t border-border">
            <Button variant="outline" onClick={() => setMode("hub")}>
              Back to Practice Hub
            </Button>
            <Button
              onClick={() => handleStartInterview()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Start Another Simulation <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // VIEW: ACTIVE TECHNICAL ASSESSMENT
  // ═════════════════════════════════════════════════════════════════════════════

  if (mode === "test" && testQuestions.length > 0) {
    const currentQ = testQuestions[currentTestIndex];
    const isLastQuestion = currentTestIndex === testQuestions.length - 1;
    const answeredCount = Object.keys(testAnswers).length;

    const timerColorClass =
      timeRemainingSeconds < 60
        ? "text-rose-600 animate-pulse font-bold"
        : timeRemainingSeconds < 300
        ? "text-amber-600 font-semibold"
        : "text-foreground font-medium";

    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-12 animate-in fade-in duration-300">
        {/* Header Bar with Clock & Progress */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Code2 className="w-5 h-5 text-primary" />
              Technical Assessment Arena
            </h2>
            <p className="text-xs text-muted-foreground">
              {testDomain} • {testQuestions.length} Questions • {answeredCount} Answered
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-1.5 text-sm bg-muted/50 px-3 py-1.5 rounded-lg border border-border ${timerColorClass}`}>
              <Clock className="w-4 h-4" />
              <span>Time Left: {formatTime(timeRemainingSeconds)}</span>
            </div>
            <Button
              variant="default"
              size="sm"
              disabled={submittingTest}
              onClick={() => handleSubmitTest()}
              className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
            >
              {submittingTest ? "Grading..." : "Submit Test"}
            </Button>
          </div>
        </div>

        {/* Question Palette / Navigator */}
        <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 rounded-xl border border-border">
          <span className="text-xs font-semibold text-muted-foreground mr-1">Questions:</span>
          {testQuestions.map((q, idx) => {
            const isAnswered = Boolean(testAnswers[q.id]);
            const isCurrent = idx === currentTestIndex;

            return (
              <button
                key={q.id}
                onClick={() => setCurrentTestIndex(idx)}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                  isCurrent
                    ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2"
                    : isAnswered
                    ? "bg-emerald-600 text-white"
                    : "bg-background border border-border text-foreground hover:bg-muted"
                }`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>

        {/* Question Canvas */}
        <Card className="border border-border shadow-sm bg-card overflow-hidden">
          <CardHeader className="bg-muted/30 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="bg-background text-xs uppercase font-semibold">
                Question {currentTestIndex + 1}
              </Badge>
              <Badge variant="secondary" className="text-xs uppercase">
                {currentQ.question_type}
              </Badge>
              <Badge variant="outline" className="text-xs text-muted-foreground">
                {currentQ.skill}
              </Badge>
            </div>
            <CardTitle className="text-base font-semibold leading-relaxed text-foreground">
              {currentQ.question_text}
            </CardTitle>
          </CardHeader>

          {currentQ.code_snippet && (
            <div className="px-6 py-4 bg-zinc-950 text-zinc-100 font-mono text-xs overflow-x-auto border-t border-b border-zinc-800">
              <pre>{currentQ.code_snippet}</pre>
            </div>
          )}

          <CardContent className="pt-6 space-y-4">
            {/* MCQ Options */}
            {currentQ.question_type === "mcq" && currentQ.options ? (
              <div className="space-y-2.5">
                {currentQ.options.map((opt, oIdx) => {
                  const letter = String.fromCharCode(65 + oIdx);
                  const isSelected = testAnswers[currentQ.id] === opt;

                  return (
                    <div
                      key={oIdx}
                      onClick={() => handleSelectOptionAnswer(currentQ.id, opt)}
                      className={`p-3.5 rounded-xl border text-sm cursor-pointer transition-all flex items-center gap-3 ${
                        isSelected
                          ? "border-primary bg-primary/5 text-foreground font-semibold shadow-sm ring-1 ring-primary"
                          : "border-border bg-background text-foreground hover:bg-muted/40"
                      }`}
                    >
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {letter}
                      </div>
                      <span className="flex-1">{opt}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Coding / SQL / Debugging Text Editor */
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5 text-primary" />
                  Your Implementation / Solution Code:
                </label>
                <Textarea
                  rows={8}
                  value={testAnswers[currentQ.id] || ""}
                  onChange={(e) => handleCodeAnswerChange(currentQ.id, e.target.value)}
                  placeholder="Write your code or query solution here..."
                  className="font-mono text-xs resize-none bg-zinc-950 text-zinc-100 border-zinc-800 focus-visible:ring-primary leading-relaxed"
                />
              </div>
            )}
          </CardContent>

          <CardFooter className="bg-muted/20 border-t border-border p-4 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={currentTestIndex === 0}
              onClick={() => setCurrentTestIndex((prev) => prev - 1)}
              className="text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Previous
            </Button>

            <div className="flex items-center gap-2">
              {isLastQuestion ? (
                <Button
                  size="sm"
                  disabled={submittingTest}
                  onClick={() => handleSubmitTest()}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
                >
                  {submittingTest ? "Grading..." : "Submit Test"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setCurrentTestIndex((prev) => prev + 1)}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
                >
                  Next <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              )}
            </div>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // VIEW: TECHNICAL TEST REVIEW & SCORECARD
  // ═════════════════════════════════════════════════════════════════════════════

  if (mode === "test_review" && testScorecard) {
    const card = testScorecard;

    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-12 animate-in fade-in duration-300">
        <Card className="border border-border shadow-lg bg-card overflow-hidden">
          <div className="bg-primary text-primary-foreground p-8 text-center space-y-2">
            <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-1">
              <Award className="w-7 h-7 text-amber-300" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Assessment Scorecard</h1>
            <p className="text-xs text-primary-foreground/80">
              Results graded securely against backend validation keys and AI rubrics.
            </p>
            <div className="pt-2">
              <Badge className="text-base px-4 py-1.5 bg-white text-primary font-bold shadow-sm">
                Final Score: {card.overall_score}% • {card.summary_feedback?.rating_tier}
              </Badge>
            </div>
          </div>

          <CardContent className="p-6 space-y-6">
            <h3 className="text-sm font-bold text-foreground">Detailed Question Review & Explanations</h3>

            <div className="space-y-4">
              {card.results?.map((res: TestResultItem, i: number) => (
                <div
                  key={res.question_id || i}
                  className={`p-4 rounded-xl border text-xs space-y-2.5 ${
                    res.is_correct
                      ? "border-emerald-200 bg-emerald-50/30"
                      : "border-rose-200 bg-rose-50/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground flex items-center gap-1.5">
                      {res.is_correct ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-600" />
                      )}
                      Question {res.question_index}: {res.skill}
                    </span>
                    <Badge variant={res.is_correct ? "default" : "destructive"}>
                      {res.score} / {res.max_marks} pts
                    </Badge>
                  </div>

                  <p className="text-foreground font-medium">{res.question_text}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs pt-1">
                    <div className="p-2.5 rounded-lg bg-background border border-border">
                      <span className="font-semibold block text-muted-foreground mb-1">Your Answer:</span>
                      <p className="text-foreground font-mono whitespace-pre-wrap">
                        {res.candidate_answer || "(No answer submitted)"}
                      </p>
                    </div>

                    <div className="p-2.5 rounded-lg bg-background border border-border">
                      <span className="font-semibold block text-emerald-700 mb-1">Correct Solution:</span>
                      <p className="text-foreground font-mono whitespace-pre-wrap">
                        {res.correct_answer}
                      </p>
                    </div>
                  </div>

                  {res.explanation && (
                    <div className="p-2.5 bg-muted/60 rounded-lg text-muted-foreground leading-relaxed">
                      <span className="font-semibold text-foreground">Explanation: </span>
                      {res.explanation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>

          <CardFooter className="bg-muted/30 p-6 flex items-center justify-between border-t border-border">
            <Button variant="outline" onClick={() => setMode("hub")}>
              Back to Practice Hub
            </Button>
            <Button
              onClick={handleStartTechnicalTest}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Take Another Assessment <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // VIEW: MAIN PRACTICE HUB & LAUNCHPAD
  // ═════════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-8 pb-16">
      {/* Page Heading */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20 font-semibold">
              <Sparkles className="w-3 h-3 mr-1 text-primary" /> Gemini AI Powered
            </Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Interview & Technical Practice
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Simulate realistic technical and behavioral interviews, take timed coding assessments, and benchmark your readiness.
          </p>
        </div>
      </div>

      {/* Key Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border border-border shadow-sm bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Completed Sessions</p>
              <h3 className="text-xl font-bold text-foreground">
                {analytics?.total_sessions ?? profile?.stats?.total_sessions ?? 0}
              </h3>
            </div>
          </div>
        </Card>

        <Card className="border border-border shadow-sm bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Average Score</p>
              <h3 className="text-xl font-bold text-foreground">
                {analytics?.average_score ?? profile?.stats?.avg_score ?? 0}%
              </h3>
            </div>
          </div>
        </Card>

        <Card className="border border-border shadow-sm bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Readiness Index</p>
              <h3 className="text-xl font-bold text-foreground">
                {analytics?.skill_readiness_index ?? 72}/100
              </h3>
            </div>
          </div>
        </Card>

        <Card className="border border-border shadow-sm bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Practice Time</p>
              <h3 className="text-xl font-bold text-foreground">
                {analytics?.total_practice_minutes ?? profile?.stats?.time_spent_mins ?? 0}m
              </h3>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Mode Tabs */}
      <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)}>
        <TabsList className="grid w-full max-w-md grid-cols-2 bg-muted/60">
          <TabsTrigger value="launchpad" className="text-xs font-semibold">
            Launch New Session
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs font-semibold">
            Practice History ({sessionsHistory.length})
          </TabsTrigger>
        </TabsList>

        {/* ─── TAB 1: LAUNCHPAD ──────────────────────────────────────────────── */}
        <TabsContent value="launchpad" className="space-y-6 pt-4">
          {/* Option Selector: Option A (Resume Upload) vs Option B (Customize Practice) */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl border border-border bg-card shadow-xs">
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Sliders className="w-4 h-4 text-primary" />
                <span>Select Preparation Mode</span>
              </h3>
              <p className="text-xs text-muted-foreground">
                Choose between uploading a resume for automatic skill extraction or manually customizing your practice track.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-muted/60 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setLaunchOption('resume')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  launchOption === 'resume'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Option A: Upload Resume</span>
              </button>

              <button
                type="button"
                onClick={() => setLaunchOption('customize')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  launchOption === 'customize'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Option B: Customize Practice</span>
              </button>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════════
              OPTION A: UPLOAD RESUME (PDF/DOCX/TXT)
             ═══════════════════════════════════════════════════════════════════════ */}
          {launchOption === 'resume' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <Card className="border border-border shadow-sm bg-card">
                <CardHeader className="pb-3 border-b border-border/40">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-bold flex items-center gap-2">
                        <Upload className="w-4 h-4 text-primary" />
                        <span>Option A: Upload Resume for Assessment Calibration</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Extract skills, experience, projects, education, technical domains, and suggested designations for targeted practice.
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="text-[11px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Zero Profile Overwrite</span>
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="pt-5 space-y-4">
                  {/* File Upload Dropzone */}
                  <div className="flex flex-col sm:flex-row items-center gap-4 p-5 rounded-xl border-2 border-dashed border-primary/25 bg-primary/[0.02] hover:bg-primary/[0.04] transition-colors">
                    <label className="w-full sm:w-auto">
                      <input
                        type="file"
                        accept=".pdf,.docx,.txt"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleUploadResumeForPractice(e.target.files[0]);
                          }
                        }}
                      />
                      <Button
                        type="button"
                        disabled={isUploadingPracticeResume}
                        className="w-full sm:w-auto bg-primary text-primary-foreground pointer-events-none text-xs font-semibold h-10 gap-2"
                      >
                        {isUploadingPracticeResume ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Extracting Intelligence...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4" />
                            <span>{practiceResumeFile ? "Upload Different Resume" : "Upload Resume (PDF, DOCX, TXT)"}</span>
                          </>
                        )}
                      </Button>
                    </label>

                    {practiceResumeFile && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-background px-3 py-2 rounded-lg border border-border">
                        <FileText className="w-4 h-4 text-primary" />
                        <span className="font-semibold text-foreground">{practiceResumeFile.name}</span>
                        <span>•</span>
                        <span>{(practiceResumeFile.size / 1024).toFixed(1)} KB</span>
                      </div>
                    )}
                  </div>

                  {/* Candidate Profile Isolation Notice */}
                  <div className="p-3 rounded-lg bg-muted/40 border border-border/60 text-xs text-muted-foreground flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      <strong>Candidate Profile Isolation:</strong> Analysis from this uploaded resume is used solely to calibrate your interview questions and test problems. It does not overwrite your candidate profile.
                    </span>
                  </div>

                  {/* Extracted Intelligence Display */}
                  {uploadedResumeData && (
                    <div className="p-4 rounded-xl border border-primary/20 bg-primary/[0.03] space-y-3.5">
                      <div className="flex items-center justify-between pb-2 border-b border-primary/15">
                        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-primary" />
                          <span>Extracted Resume Intelligence</span>
                        </span>
                        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary font-mono">
                          {uploadedResumeData.total_experience || "Verified Experience"}
                        </Badge>
                      </div>

                      {/* Extracted Skills */}
                      <div className="space-y-1.5 text-xs">
                        <span className="font-semibold text-foreground">Competencies & Skills ({uploadedResumeData.skills?.length || 0}):</span>
                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 bg-background rounded-lg border border-border">
                          {uploadedResumeData.skills?.map((sk, idx) => (
                            <Badge key={idx} variant="secondary" className="text-[10px] py-0.5 px-2">
                              {sk}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Technical Domains & Suggested Designations */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                        <div>
                          <span className="font-semibold text-foreground block mb-1">Matched Technical Domains:</span>
                          <div className="flex flex-wrap gap-1">
                            {uploadedResumeData.technical_domains?.map((d, i) => (
                              <Badge key={i} variant="outline" className="text-[10px] bg-background">
                                {d}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        <div>
                          <span className="font-semibold text-foreground block mb-1">Suggested Designations:</span>
                          <div className="flex flex-wrap gap-1">
                            {uploadedResumeData.suggested_designations?.map((des, i) => (
                              <Badge key={i} variant="outline" className="text-[10px] bg-background text-primary">
                                {typeof des === 'string' ? des : des.title}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════════
              OPTION B: CUSTOMIZE PRACTICE (MANUAL - STARTS EMPTY)
             ═══════════════════════════════════════════════════════════════════════ */}
          {launchOption === 'customize' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <Card className="border border-border shadow-sm bg-card">
                <CardHeader className="pb-3 border-b border-border/40">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-bold flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-primary" />
                        <span>Option B: Customize Practice (No Resume Required)</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Independently tailor your test by choosing skills, technical domain, job role, experience tier, and difficulty.
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="text-[11px] bg-primary/10 text-primary border-primary/30">
                      Independent Manual Track
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="pt-5 space-y-6">
                  {/* SECTION 1: SKILLS */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <label className="font-semibold text-foreground flex items-center gap-1.5">
                        <ListChecks className="w-3.5 h-3.5 text-primary" />
                        <span>Section 1: Targeted Technical Skills ({customSkills.length} added)</span>
                      </label>
                      <span className="text-muted-foreground text-[11px]">Type skill & press Enter</span>
                    </div>

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          placeholder="Enter a skill (e.g., Python, React, SQL, Docker, FastAPI, System Design)..."
                          value={customSkillInput}
                          onChange={(e) => setCustomSkillInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCustomSkill();
                            }
                          }}
                          className="text-xs h-9 pr-8"
                        />
                        {customSkillInput && (
                          <button
                            type="button"
                            onClick={() => setCustomSkillInput('')}
                            className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <Button
                        type="button"
                        onClick={() => handleAddCustomSkill()}
                        disabled={!customSkillInput.trim()}
                        className="h-9 px-3 text-xs font-semibold gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </Button>
                    </div>

                    {/* Skill Tags */}
                    <div className="flex flex-wrap gap-1.5 min-h-9 items-center p-2 rounded-lg bg-muted/40 border border-border/60">
                      {customSkills.length === 0 ? (
                        <span className="text-xs text-muted-foreground italic">
                          No custom skills added yet. Type a skill above or click any recommendation below.
                        </span>
                      ) : (
                        customSkills.map((sk) => (
                          <Badge
                            key={sk}
                            className="bg-primary/15 text-primary border border-primary/30 text-xs py-0.5 px-2 flex items-center gap-1 hover:bg-primary/20"
                          >
                            <span>{sk}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveCustomSkill(sk)}
                              className="text-primary/70 hover:text-destructive"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))
                      )}
                    </div>

                    {/* Popular Quick Suggestions */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                      <span className="text-muted-foreground">Quick Add:</span>
                      {POPULAR_PRACTICE_SKILLS.filter(
                        (s) => !customSkills.some((cs) => cs.toLowerCase() === s.toLowerCase())
                      ).slice(0, 10).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleAddCustomSkill(s)}
                          className="px-2 py-0.5 rounded-full bg-background border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                        >
                          + {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* SECTION 2: TECHNICAL DOMAINS (13 Categories) */}
                  <div className="space-y-2.5 pt-3 border-t border-border/50">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <GraduationCap className="w-3.5 h-3.5 text-primary" />
                      <span>Section 2: Technical Domain Track (13 Specializations)</span>
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">
                      {TECHNICAL_DOMAINS.map((dom) => (
                        <button
                          key={dom}
                          type="button"
                          onClick={() => setCustomDomain(dom)}
                          className={`p-2 rounded-lg border text-left truncate transition-all ${
                            customDomain === dom
                              ? 'border-primary bg-primary/10 text-primary font-bold ring-1 ring-primary'
                              : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                          }`}
                          title={dom}
                        >
                          {dom}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* SECTION 3: JOB DESIGNATION & EXPERIENCE & DIFFICULTY */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-border/50 text-xs">
                    {/* Job Designation */}
                    <div className="space-y-1.5">
                      <label className="font-semibold text-foreground">Job Designation</label>
                      <Input
                        placeholder="e.g. Senior Backend Engineer"
                        value={customDesignation}
                        onChange={(e) => setCustomDesignation(e.target.value)}
                        className="text-xs h-9"
                      />
                    </div>

                    {/* Experience Tier */}
                    <div className="space-y-1.5">
                      <label className="font-semibold text-foreground">Experience Tier</label>
                      <div className="grid grid-cols-3 gap-1">
                        {EXPERIENCE_TIERS.map((tier) => (
                          <button
                            key={tier}
                            type="button"
                            onClick={() => setCustomExperienceTier(tier)}
                            className={`p-1.5 rounded-md border text-center text-[11px] font-medium transition-all ${
                              customExperienceTier === tier
                                ? 'border-primary bg-primary/10 text-primary font-bold ring-1 ring-primary'
                                : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                            }`}
                          >
                            {tier}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Difficulty */}
                    <div className="space-y-1.5">
                      <label className="font-semibold text-foreground">Target Difficulty</label>
                      <div className="grid grid-cols-2 gap-1">
                        {DIFFICULTY_LEVELS.map((diff) => (
                          <button
                            key={diff}
                            type="button"
                            onClick={() => setCustomDifficulty(diff)}
                            className={`p-1.5 rounded-md border text-center text-[11px] font-medium transition-all ${
                              customDifficulty === diff
                                ? 'border-primary bg-primary/10 text-primary font-bold ring-1 ring-primary'
                                : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                            }`}
                          >
                            {diff}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════════
              TEST CONFIGURATION MATRIX (PRACTICE TYPES, QUESTIONS, DURATIONS)
             ═══════════════════════════════════════════════════════════════════════ */}
          <Card className="border border-border shadow-sm bg-card">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                <span>Assessment Configuration Matrix</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Select assessment format, number of questions (10, 20, 30), and allocated time limit (15, 30, 45, 60 mins).
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-4 space-y-5 text-xs">
              {/* Practice Type Grid */}
              <div className="space-y-2">
                <label className="font-semibold text-foreground block">
                  1. Practice Format & Assessment Track (8 Options)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                  {PRACTICE_TYPES.map((pt) => {
                    const isSelected = configuredPracticeType === pt.id;
                    return (
                      <div
                        key={pt.id}
                        onClick={() => setConfiguredPracticeType(pt.id)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all space-y-1 ${
                          isSelected
                            ? 'border-primary bg-primary/10 ring-1 ring-primary shadow-xs'
                            : 'border-border bg-background hover:bg-muted/40'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`font-bold ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                            {pt.label}
                          </span>
                          <Badge variant="outline" className="text-[9px] uppercase tracking-wider">
                            {pt.kind}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-2">
                          {pt.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Question Counts & Durations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-border/40">
                {/* Question Count (10, 20, 30) */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground flex items-center gap-1.5">
                    <ListChecks className="w-3.5 h-3.5 text-primary" />
                    <span>2. Number of Questions</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {QUESTION_COUNTS.map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setConfiguredQuestionCount(cnt)}
                        className={`p-2.5 rounded-lg border text-center font-bold transition-all ${
                          configuredQuestionCount === cnt
                            ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                            : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                        }`}
                      >
                        {cnt} Questions
                      </button>
                    ))}
                  </div>
                </div>

                {/* Duration Limit (15, 30, 45, 60 mins) */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-primary" />
                    <span>3. Time Duration</span>
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {DURATIONS.map((dur) => (
                      <button
                        key={dur}
                        type="button"
                        onClick={() => setConfiguredDurationMins(dur)}
                        className={`p-2.5 rounded-lg border text-center font-bold transition-all ${
                          configuredDurationMins === dur
                            ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                            : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                        }`}
                      >
                        {dur}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>

            <CardFooter className="pt-3 border-t border-border/40 bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">
                Configured: <strong className="text-foreground">{configuredQuestionCount} Questions</strong> • <strong className="text-foreground">{configuredDurationMins} Mins</strong> • <strong className="text-foreground">{customDifficulty}</strong> • <strong className="text-foreground">{launchOption === 'resume' ? 'Resume-Based' : customDomain}</strong>
              </div>

              <Button
                onClick={handleLaunchConfiguredSession}
                disabled={startingInterview || startingTest}
                className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold px-6 h-10 gap-2 shadow-xs"
              >
                {startingInterview || startingTest ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generating Gemini Assessment...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Start Practice Session</span>
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* ─── TAB 2: HISTORY ────────────────────────────────────────────────── */}
        <TabsContent value="history" className="space-y-4 pt-4">
          {sessionsHistory.length === 0 ? (
            <Card className="p-8 text-center border-dashed border-2 border-border">
              <GraduationCap className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-50" />
              <h3 className="text-sm font-semibold text-foreground">No practice sessions recorded yet</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                Launch your first AI mock interview or technical assessment above to track your skill progression.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {sessionsHistory.map((s) => (
                <Card
                  key={s.id}
                  onClick={() => handleOpenSessionReview(s.id)}
                  className="p-4 border border-border shadow-sm hover:border-primary/40 cursor-pointer transition-all flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                        s.session_type === "interview"
                          ? "bg-primary/10 text-primary"
                          : "bg-emerald-500/10 text-emerald-600"
                      }`}
                    >
                      {s.session_type === "interview" ? (
                        <MessageSquare className="w-4 h-4" />
                      ) : (
                        <Code2 className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-foreground">{s.title}</h4>
                      <p className="text-xs text-muted-foreground">
                        {s.domain || "General"} • {s.total_questions} Questions •{" "}
                        {s.completed_at ? new Date(s.completed_at).toLocaleDateString() : "In Progress"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {s.overall_score !== null ? (
                      <Badge
                        className={`text-xs font-bold ${
                          s.overall_score >= 80
                            ? "bg-emerald-600 text-white"
                            : s.overall_score >= 60
                            ? "bg-amber-600 text-white"
                            : "bg-rose-600 text-white"
                        }`}
                      >
                        {s.overall_score}%
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        Incomplete
                      </Badge>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => handleDeleteSession(s.id, e)}
                      className="text-muted-foreground hover:text-destructive h-8 w-8"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Historical Session Detail Modal */}
      <Dialog open={reviewModalOpen} onOpenChange={setReviewModalOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              {selectedSessionDetail?.session?.title || "Session Review"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Score: {selectedSessionDetail?.session?.overall_score ?? 0}% •{" "}
              {selectedSessionDetail?.session?.summary_feedback?.rating_tier || "Completed Session"}
            </DialogDescription>
          </DialogHeader>

          {loadingDetail ? (
            <div className="p-8 text-center">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Loading session transcript...</p>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              {selectedSessionDetail?.transcript?.map((item: any, i: number) => (
                <div key={i} className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground">
                      Question {item.question_index}: {item.skill || item.question_type}
                    </span>
                    <Badge variant={item.score > 0 ? "default" : "secondary"}>
                      Score: {item.score} / {item.max_marks}
                    </Badge>
                  </div>
                  <p className="text-foreground">{item.question_text}</p>
                  <div className="p-2.5 rounded bg-background border border-border font-mono text-xs">
                    <span className="font-semibold block text-muted-foreground mb-0.5">Your Response:</span>
                    {item.candidate_answer || "(No response)"}
                  </div>
                  {item.evaluation && (
                    <p className="text-muted-foreground leading-relaxed">
                      <span className="font-semibold text-foreground">Evaluation: </span>
                      {item.evaluation}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
