import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import {
  parseResume,
  parseJobDescription,
  generateAdaptiveQuestion,
  evaluateCandidateAnswer,
  generateReadinessReport
} from "./server/gemini";
import {
  UserProfile,
  InterviewSession,
  CandidateResponse,
  ReadinessReport,
  InterviewDifficulty,
  QuestionCategory
} from "./src/types";

// Database File Path
const DB_FILE = path.join(process.cwd(), "db.json");

// Helper to Safely Initialize DB
function initDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, sessions: {} }, null, 2), "utf-8");
  }
}

// Read DB state
function readDB(): { users: Record<string, UserProfile & { password?: string }>; sessions: Record<string, InterviewSession> } {
  initDB();
  try {
    const data = fs.readFileSync(DB_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Failed to read database, resetting...", err);
    return { users: {}, sessions: {} };
  }
}

// Write DB state
function writeDB(data: any) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write to database", err);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize DB on Boot
  initDB();

  // Express Middlewares
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ extended: true, limit: "15mb" }));

  // Helper for Authorization checks (reads 'Authorization' header as e-mail for simplicity and robustness)
  function getAuthenticatedUser(req: express.Request): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    const email = authHeader.trim();
    const db = readDB();
    if (db.users[email]) {
      return email;
    }
    return null;
  }

  // Auth Routes
  app.post("/api/auth/register", (req, res) => {
    try {
      const { email, fullName, password, headline } = req.body;
      if (!email || !fullName || !password) {
        res.status(400).json({ error: "Missing registration fields (email, fullName, password)" });
        return;
      }

      const db = readDB();
      const normalizedEmail = email.toLowerCase().trim();

      if (db.users[normalizedEmail]) {
        res.status(400).json({ error: "An account with this email already exists." });
        return;
      }

      const newUser: UserProfile & { password?: string } = {
        email: normalizedEmail,
        fullName,
        headline: headline || "Software Professional",
        reports: [],
      };
      
      // Store password directly as plain text for simplicity and robustness inside the sandbox environment
      newUser.password = password;

      db.users[normalizedEmail] = newUser;
      writeDB(db);

      // Return profile without password
      const { password: _, ...profileRest } = newUser;
      res.status(201).json({ message: "Registration successful", profile: profileRest, token: normalizedEmail });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required." });
        return;
      }

      const db = readDB();
      const normalizedEmail = email.toLowerCase().trim();
      const user = db.users[normalizedEmail];

      if (!user || user.password !== password) {
        res.status(401).json({ error: "Invalid email or password." });
        return;
      }

      const { password: _, ...profileRest } = user;
      res.status(200).json({ message: "Login successful", profile: profileRest, token: normalizedEmail });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/user/profile", (req, res) => {
    try {
      const email = getAuthenticatedUser(req);
      if (!email) {
        res.status(401).json({ error: "Unauthorized access. Invalid or missing authentication headers." });
        return;
      }

      const db = readDB();
      const { password: _, ...profileRest } = db.users[email];
      res.json({ profile: profileRest });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Resume Parsing Endpoint
  app.post("/api/resume/parse", async (req, res) => {
    try {
      const email = getAuthenticatedUser(req);
      if (!email) {
        res.status(401).json({ error: "Unauthorized access" });
        return;
      }

      const { fileBase64, textContent } = req.body;
      if (!fileBase64 && !textContent) {
        res.status(400).json({ error: "Resume content is material. Provide file base64 or pasted text." });
        return;
      }

      let parsedData;
      if (fileBase64) {
        // Strip out mime type header if present in base64
        const cleanBase64 = fileBase64.includes(";base64,") ? fileBase64.split(";base64,")[1] : fileBase64;
        parsedData = await parseResume(cleanBase64, "pdf_base64");
      } else {
        parsedData = await parseResume(textContent, "text");
      }

      // Save to user profile
      const db = readDB();
      db.users[email].resumeText = textContent || "Pasted / Parsed Resume File";
      db.users[email].resumeData = parsedData;
      writeDB(db);

      res.json({ success: true, resumeData: parsedData });
    } catch (err: any) {
      console.error("Error parsing resume:", err);
      res.status(500).json({ error: err.message || "Failed to analyze resume via AI API." });
    }
  });

  // Job Description Parsing Endpoint
  app.post("/api/jd/parse", async (req, res) => {
    try {
      const email = getAuthenticatedUser(req);
      if (!email) {
        res.status(401).json({ error: "Unauthorized access" });
        return;
      }

      const { text } = req.body;
      if (!text || text.trim().length === 0) {
        res.status(400).json({ error: "Job description text is empty." });
        return;
      }

      const parsedData = await parseJobDescription(text);

      // Save to user profile
      const db = readDB();
      db.users[email].jdText = text;
      db.users[email].jdData = parsedData;
      writeDB(db);

      res.json({ success: true, jdData: parsedData });
    } catch (err: any) {
      console.error("Error parsing job description:", err);
      res.status(500).json({ error: err.message || "Failed to analyze job description." });
    }
  });

  // Start Interview Session
  app.post("/api/session/start", async (req, res) => {
    try {
      const email = getAuthenticatedUser(req);
      if (!email) {
        res.status(401).json({ error: "Unauthorized access" });
        return;
      }

      const { interviewerId, personaInstruction } = req.body;
      if (!interviewerId || !personaInstruction) {
        res.status(400).json({ error: "Missing selected interviewer details." });
        return;
      }

      const db = readDB();
      const user = db.users[email];

      if (!user.resumeData || !user.jdData) {
        res.status(400).json({ error: "Please complete your Resume and Job Description uploads first before initiating the mock interview." });
        return;
      }

      const activeDifficulty: InterviewDifficulty = "Easy";
      const initialCategory: QuestionCategory = "Technical";

      // Create first question
      const firstQuestion = await generateAdaptiveQuestion(
        user.resumeData,
        user.jdData,
        personaInstruction,
        activeDifficulty,
        initialCategory,
        []
      );

      const sessionId = Math.random().toString(36).substring(3, 11);
      const newSession: InterviewSession = {
        id: sessionId,
        userEmail: email,
        candidateName: user.fullName,
        interviewerId,
        resume: user.resumeData,
        jd: user.jdData,
        questions: [firstQuestion],
        currentQuestionIndex: 0,
        responses: [],
        difficulty: activeDifficulty,
        status: "ongoing",
        createdAt: new Date().toISOString(),
      };

      db.sessions[sessionId] = newSession;
      writeDB(db);

      res.status(201).json({ sessionId, session: newSession });
    } catch (err: any) {
      console.error("Failed to start session:", err);
      res.status(500).json({ error: err.message || "Failed starting mock interview session." });
    }
  });

  // Submit Answer & Adaptive Engine Route
  app.post("/api/session/submit-answer", async (req, res) => {
    try {
      const email = getAuthenticatedUser(req);
      if (!email) {
        res.status(401).json({ error: "Unauthorized access" });
        return;
      }

      const { sessionId, answer, timeTaken, personaName, personaInstruction } = req.body;
      if (!sessionId || !answer || typeof timeTaken !== "number" || !personaName || !personaInstruction) {
        res.status(400).json({ error: "Missing submission params (sessionId, answer, timeTaken, persona info)." });
        return;
      }

      const db = readDB();
      const session = db.sessions[sessionId];

      if (!session) {
        res.status(404).json({ error: "Mock session not found." });
        return;
      }

      if (session.status !== "ongoing") {
        res.status(400).json({ error: "This interview session has already concluded." });
        return;
      }

      const currentQuestionIndex = session.currentQuestionIndex;
      const currentQuestion = session.questions[currentQuestionIndex];

      // Evaluate the candidate's response
      const evaluation = await evaluateCandidateAnswer(currentQuestion, answer, timeTaken, personaName);

      // Store Response
      const responseItem: CandidateResponse = {
        questionId: currentQuestion.id,
        userAnswer: answer,
        timeTaken,
        evaluation,
      };
      session.responses.push(responseItem);

      // Adaptive Tuning Rules:
      // Start at Easy questions.
      // Move up to Medium if evaluation score > 60.
      // Move up to Hard if evaluation score > 80.
      // Reduce difficulty if evaluation score < 55 and it's currently hard/medium.
      let nextDifficulty: InterviewDifficulty = session.difficulty;
      const currentScore = evaluation.score;

      if (session.difficulty === "Easy" && currentScore > 60) {
        nextDifficulty = "Medium";
      } else if (session.difficulty === "Medium") {
        if (currentScore > 80) {
          nextDifficulty = "Hard";
        } else if (currentScore < 50) {
          nextDifficulty = "Easy";
        }
      } else if (session.difficulty === "Hard" && currentScore < 55) {
        nextDifficulty = "Medium";
      }

      // Max Interview Limit: 5 questions total
      const totalQuestionsTarget = 5;
      const hasReachedEnd = session.responses.length >= totalQuestionsTarget;

      if (hasReachedEnd) {
        // Automatically compile readiness report and secure it
        session.status = "completed";

        // Map responses back to combined evaluate list
        const historyList = session.questions.map((q, idx) => ({
          question: q,
          answer: session.responses[idx].userAnswer,
          evaluation: session.responses[idx].evaluation!,
        }));

        const reportData = await generateReadinessReport(
          session.candidateName,
          session.userEmail,
          session.jd?.role || "Engineering Core",
          historyList
        );

        const fullReport: ReadinessReport = {
          ...reportData,
          sessionId: session.id,
          createdAt: new Date().toISOString(),
        };

        // Add report to user profile logs
        db.users[email].reports.unshift(fullReport);
        db.sessions[sessionId] = session;
        writeDB(db);

        res.json({
          finished: true,
          evaluation,
          report: fullReport,
          session,
        });
        return;
      }

      // Otherwise, generate the next question
      // Advance Index
      session.currentQuestionIndex = session.responses.length;
      session.difficulty = nextDifficulty;

      // Select dynamic rotation category
      // index 0 was Technical. Let's ask Behavioral on index 1, Scenario on index 2, Technical on index 3, and Scenario/Behavioral blend on index 4.
      const categoryCycle: QuestionCategory[] = ["Technical", "Behavioral", "Scenario", "Technical", "Scenario"];
      const nextCategory = categoryCycle[session.currentQuestionIndex % categoryCycle.length];

      // Package prior history context
      const previousHistory = session.questions.map((q, idx) => {
        const matchingResp = session.responses[idx];
        return {
          question: q.question,
          answer: matchingResp?.userAnswer || "",
          score: matchingResp?.evaluation?.score || 0,
        };
      });

      const nextQuestion = await generateAdaptiveQuestion(
        session.resume!,
        session.jd!,
        personaInstruction,
        nextDifficulty,
        nextCategory,
        previousHistory
      );

      session.questions.push(nextQuestion);
      db.sessions[sessionId] = session;
      writeDB(db);

      res.json({
        finished: false,
        evaluation,
        nextQuestion,
        session,
      });
    } catch (err: any) {
      console.error("Error submitting answer:", err);
      res.status(500).json({ error: err.message || "Failed answering question step." });
    }
  });

  // End Interview Early
  app.post("/api/session/end-early", async (req, res) => {
    try {
      const email = getAuthenticatedUser(req);
      if (!email) {
        res.status(401).json({ error: "Unauthorized access" });
        return;
      }

      const { sessionId } = req.body;
      if (!sessionId) {
        res.status(400).json({ error: "Missing sessionId param." });
        return;
      }

      const db = readDB();
      const session = db.sessions[sessionId];

      if (!session) {
        res.status(404).json({ error: "Session not found." });
        return;
      }

      if (session.status === "completed") {
        const existingReport = db.users[email].reports.find(r => r.sessionId === sessionId);
        if (existingReport) {
          res.json({ success: true, report: existingReport, session });
          return;
        }
      }

      if (session.responses.length === 0) {
        session.status = "completed";
        db.sessions[sessionId] = session;
        writeDB(db);
        res.json({ message: "Interview cancelled. No questions were completed to evaluate.", session });
        return;
      }

      // Finish ongoing session early
      session.status = "completed";

      const historyList = session.responses.map((resp, idx) => ({
        question: session.questions[idx],
        answer: resp.userAnswer,
        evaluation: resp.evaluation!,
      }));

      const reportData = await generateReadinessReport(
        session.candidateName,
        session.userEmail,
        session.jd?.role || "Engineering Core",
        historyList
      );

      const fullReport: ReadinessReport = {
        ...reportData,
        sessionId: session.id,
        createdAt: new Date().toISOString(),
      };

      db.users[email].reports.unshift(fullReport);
      db.sessions[sessionId] = session;
      writeDB(db);

      res.json({ success: true, report: fullReport, session });
    } catch (err: any) {
      console.error("Error ending session early:", err);
      res.status(500).json({ error: err.message || "Failed finalizing early mock report." });
    }
  });

  // Vite Integration setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Hack2Hire Mock Server running successfully on http://0.0.0.0:${PORT}`);
  });
}

startServer();
