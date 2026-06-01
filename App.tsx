import React, { useState, useEffect } from "react";
import { UserProfile, ResumeData, JobDescriptionData, InterviewSession, ReadinessReport } from "./types";
import { INTERVIEWER_PERSONAS } from "./data";
import Navbar from "./components/Navbar";
import Auth from "./components/Auth";
import ResumeUpload from "./components/ResumeUpload";
import JobDescription from "./components/JobDescription";
import Dashboard from "./components/Dashboard";
import InterviewPanel from "./components/InterviewPanel";
import ReportPanel from "./components/ReportPanel";
import { Cpu, Award, Star, Calendar, Bookmark, Briefcase } from "lucide-react";

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("h2h_authToken"));
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<"home" | "profile">("home");
  const [currentView, setCurrentView] = useState<"dashboard" | "interview" | "report">("dashboard");

  // Interview session contexts
  const [activeSession, setActiveSession] = useState<InterviewSession | null>(null);
  const [activeReport, setActiveReport] = useState<ReadinessReport | null>(null);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("sarah");

  // Loading flags
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingStart, setLoadingStart] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Load profile details when token transitions
  useEffect(() => {
    if (token) {
      fetchProfile();
    } else {
      setProfile(null);
    }
  }, [token]);

  const fetchProfile = async () => {
    setLoadingProfile(true);
    setErrorText(null);
    try {
      const response = await fetch("/api/user/profile", {
        method: "GET",
        headers: {
          "Authorization": token || "",
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Session expired. Please log in again.");
      }
      setProfile(data.profile);
    } catch (err: any) {
      setErrorText(err.message);
      handleLogout();
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleAuthSuccess = (newToken: string, userProfile: UserProfile) => {
    localStorage.setItem("h2h_authToken", newToken);
    setToken(newToken);
    setProfile(userProfile);
    setCurrentView("dashboard");
  };

  const handleLogout = () => {
    localStorage.removeItem("h2h_authToken");
    setToken(null);
    setProfile(null);
    setActiveSession(null);
    setActiveReport(null);
    setCurrentView("dashboard");
    setActiveTab("home");
  };

  const handleResumeSuccess = (resumeData: ResumeData) => {
    if (profile) {
      setProfile({
        ...profile,
        resumeData,
      });
    }
  };

  const handleJdSuccess = (jdData: JobDescriptionData) => {
    if (profile) {
      setProfile({
        ...profile,
        jdData,
      });
    }
  };

  const handleStartInterview = async (interviewerId: string, personaInstruction: string) => {
    setLoadingStart(true);
    setErrorText(null);
    setSelectedPersonaId(interviewerId);

    try {
      const response = await fetch("/api/session/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token || "",
        },
        body: JSON.stringify({
          interviewerId,
          personaInstruction,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed initializing interview questions.");
      }

      setActiveSession(data.session);
      setCurrentView("interview");
    } catch (err: any) {
      setErrorText(err.message || "An issue occurred initiating the live session.");
    } finally {
      setLoadingStart(false);
    }
  };

  const handleSessionFinished = (report: ReadinessReport) => {
    // Save report
    setActiveReport(report);
    setCurrentView("report");
    // Refetch the profile data in background to synchronize database reports log
    fetchProfile();
  };

  const handleViewReport = (report: ReadinessReport) => {
    setActiveReport(report);
    setCurrentView("report");
  };

  const handleNavigateHome = () => {
    setCurrentView("dashboard");
    setActiveTab("home");
  };

  if (!token || !profile) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  // Active persona configurations for active views
  const activePersonaDetail = INTERVIEWER_PERSONAS.find((p) => p.id === (activeSession?.interviewerId || selectedPersonaId)) || INTERVIEWER_PERSONAS[0];

  return (
    <div className="min-h-screen bg-[#fcfcfd] flex flex-col font-sans" id="app-root">
      {/* Master Navbar */}
      <Navbar
        userEmail={profile.email}
        userName={profile.fullName}
        onLogout={handleLogout}
        onNavigateHome={handleNavigateHome}
        onViewProfile={() => {
          setActiveTab("profile");
          setCurrentView("dashboard");
        }}
        activeTab={activeTab}
      />

      {/* Global Errors Banner */}
      {errorText && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-5">
          <div className="rounded-xl border border-rose-100 bg-rose-50 text-rose-800 text-xs p-4 flex items-center justify-between gap-4 shadow-xs" id="global-error">
            <span>⚠️ <b>Warning details:</b> {errorText}</span>
            <button
              onClick={() => setErrorText(null)}
              className="text-xs font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Primary viewport switchboard */}
      <main className="flex-1 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 w-full">
        {currentView === "dashboard" && activeTab === "home" && (
          <div className="space-y-8" id="dashboard-tab-home">
            {/* Header intro */}
            <div className="space-y-1.5 bg-white border border-gray-100 rounded-2xl p-6 shadow-xs relative overflow-hidden">
              <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-indigo-50/20 blur-3xl"></div>
              <h1 className="font-display text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
                Ready to Hack Your Next Interview?
              </h1>
              <p className="max-w-2xl text-xs text-gray-500 leading-relaxed font-light">
                Follow our 3-step setup sandbox to parse your specifications, align targets, and start the adaptive simulation to get precise hiring statistics models.
              </p>
            </div>

            {/* Profile upload pairs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="upload-stage-pairs">
              <ResumeUpload
                authToken={token}
                onUploadSuccess={handleResumeSuccess}
                initialData={profile.resumeData}
              />
              <JobDescription
                authToken={token}
                onParseSuccess={handleJdSuccess}
                initialData={profile.jdData}
              />
            </div>

            {/* Main Interactive Launchboard */}
            <Dashboard
              profile={profile}
              onStartInterview={handleStartInterview}
              onViewReport={handleViewReport}
              loadingStart={loadingStart}
            />
          </div>
        )}

        {/* Profile History Tab */}
        {currentView === "dashboard" && activeTab === "profile" && (
          <div className="space-y-6" id="profile-audit-screen">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-xs space-y-4">
              <h2 className="font-display text-base font-bold text-gray-950">
                User Profile & Credentials
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2">
                <div>
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">Full Name</span>
                  <span className="text-sm font-semibold text-gray-800 mt-1.5 block">{profile.fullName}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">Registered Email</span>
                  <span className="text-sm font-semibold text-gray-800 mt-1.5 block">{profile.email}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">Headline</span>
                  <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md inline-block mt-1">
                    {profile.headline}
                  </span>
                </div>
              </div>
            </div>

            {/* Comprehensive Report history list */}
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-xs space-y-4" id="historical-appraisal-dashboard">
              <h3 className="font-display text-base font-bold text-gray-950 flex items-center gap-2">
                <Bookmark className="h-4.5 w-4.5 text-indigo-600" />
                Comprehensive Diagnostics History
              </h3>

              {profile.reports.length > 0 ? (
                <div className="overflow-x-auto border border-gray-100 rounded-xl" id="profile-history-table">
                  <table className="min-w-full divide-y divide-gray-100 text-xs">
                    <thead className="bg-[#fcfcfd]">
                      <tr>
                        <th className="px-4 py-3 text-left font-bold text-gray-400 uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-left font-bold text-gray-400 uppercase tracking-wider">Position</th>
                        <th className="px-4 py-3 text-left font-bold text-gray-400 uppercase tracking-wider">Score</th>
                        <th className="px-4 py-3 text-left font-bold text-gray-400 uppercase tracking-wider">Hiring Verdict</th>
                        <th className="px-4 py-3 text-right font-bold text-gray-400 uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {profile.reports.map((rep) => (
                        <tr key={rep.sessionId} className="hover:bg-neutral-50/50">
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-gray-500">
                            {new Date(rep.createdAt).toLocaleDateString()}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-semibold text-gray-800">
                            {rep.role}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono">
                            <span className="rounded-sm bg-indigo-50 px-2 py-0.5 font-bold text-indigo-700 font-mono">
                              {rep.overallScore}%
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              rep.hiringRecommendation === "Strong Hire"
                                ? "bg-emerald-50 text-emerald-700"
                                : rep.hiringRecommendation === "Hire with Reservations"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-rose-50 text-rose-700"
                            }`}>
                              {rep.hiringRecommendation}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            <button
                              onClick={() => handleViewReport(rep)}
                              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                            >
                              Expand Report &rarr;
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-gray-400" id="profile-history-empty">
                  No mock interviews logs recorded for this account profile.
                </div>
              )}
            </div>
          </div>
        )}

        {currentView === "interview" && activeSession && (
          <InterviewPanel
            authToken={token}
            session={activeSession}
            selectedPersona={activePersonaDetail}
            onSessionFinished={handleSessionFinished}
            onExit={handleNavigateHome}
          />
        )}

        {currentView === "report" && activeReport && (
          <ReportPanel
            report={activeReport}
            onNavigateHome={handleNavigateHome}
          />
        )}
      </main>
    </div>
  );
}
