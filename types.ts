/**
 * Shared Type Definitions for Hack2Hire Mock Interview Platform
 */

export interface ContactInfo {
  name: string;
  email: string;
  phone?: string;
}

export interface ResumeData {
  contact: ContactInfo;
  skills: string[];
  education: string[];
  projects: string[];
  experience: string[];
}

export interface JobDescriptionData {
  role: string;
  skills: string[];
  experienceLevel: string;
  summary: string;
}

export type QuestionCategory = "Technical" | "Behavioral" | "Scenario";
export type InterviewDifficulty = "Easy" | "Medium" | "Hard";

export interface Question {
  id: string;
  question: string;
  category: QuestionCategory;
  difficulty: InterviewDifficulty;
  idealPoints: string[];
  timeLimit: number; // in seconds, e.g. 90
}

export interface AnswerBreakdown {
  accuracy: number;
  relevance: number;
  clarity: number;
  depth: number;
  communication: number;
}

export interface AnswerEvaluation {
  score: number;
  feedback: string;
  breakdown: AnswerBreakdown;
  idealAnswer: string;
}

export interface InterviewerPersona {
  id: string;
  name: string;
  role: string;
  avatar: string;
  description: string;
  systemInstructionAdd: string;
}

export interface CandidateResponse {
  questionId: string;
  userAnswer: string;
  timeTaken: number; // in seconds
  evaluation?: AnswerEvaluation;
}

export interface InterviewSession {
  id: string;
  userEmail: string;
  candidateName: string;
  interviewerId: string;
  resume?: ResumeData;
  jd?: JobDescriptionData;
  questions: Question[];
  currentQuestionIndex: number;
  responses: CandidateResponse[];
  difficulty: InterviewDifficulty;
  status: "setup" | "ongoing" | "completed";
  createdAt: string;
}

export interface ReadinessReport {
  sessionId: string;
  userEmail: string;
  candidateName: string;
  role: string;
  overallScore: number;
  difficultyAverage: string;
  categoryScores: {
    Technical: number;
    Behavioral: number;
    Scenario: number;
  };
  metricsAverage: AnswerBreakdown;
  hiringRecommendation: "Strong Hire" | "Hire with Reservations" | "No Hire";
  summary: string;
  strengths: string[];
  growthAreas: string[];
  createdAt: string;
}

export interface UserProfile {
  email: string;
  fullName: string;
  headline?: string;
  resumeText?: string;
  resumeData?: ResumeData;
  jdText?: string;
  jdData?: JobDescriptionData;
  reports: ReadinessReport[];
}
