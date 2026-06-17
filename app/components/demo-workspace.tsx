"use client";

import {
  Bot,
  CheckCircle2,
  FileText,
  Loader2,
  Paperclip,
  Send,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";

type Scenario = "initial_discovery" | "document_review" | "change_request";
type Role = "client" | "developer" | "agentic_tool";
type ChatRole = "user" | "assistant" | "system";

type Artifact = {
  kind: string;
  title: string;
  content: string;
  format: "markdown" | "mermaid" | "json";
};

type ClarificationQuestion = {
  id: string;
  question: string;
  reason: string;
  target: Role;
};

type RequirementSuggestion = {
  id: string;
  title: string;
  rationale: string;
  basedOn: "client_intent" | "developer_intent" | "requirement_gap";
  priority: "high" | "medium" | "low";
};

type RequirementItem = {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: string;
};

type RetrievalResult = {
  documentId: string;
  chunkId: string;
  fileName: string;
  text: string;
  score: number;
  index: number;
};

type AgentResponse = {
  projectId: string;
  scenario: Scenario;
  summary: string;
  questions: ClarificationQuestion[];
  suggestions: RequirementSuggestion[];
  requirements: RequirementItem[];
  artifacts: Artifact[];
  nextAction: string;
  provider?: string;
  retrieval?: { used: boolean; results: RetrievalResult[] };
};

type UploadResponse = {
  fileName: string;
  findings: Array<{ id: string; title: string; evidence: string; confidence: string }>;
  rag?: { stored: boolean; chunkCount: number; storeProvider?: string };
};

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  artifacts?: Artifact[];
  retrieval?: RetrievalResult[];
  questions?: ClarificationQuestion[];
  suggestions?: RequirementSuggestion[];
  requirements?: RequirementItem[];
  nextAction?: string;
};

type QuestionAnswerDrafts = Record<string, string>;

type StoredQuestionAnswer = {
  question: ClarificationQuestion;
  answer: string;
};

const maxInterviewQuestions = 10;
const minInterviewQuestions = 5;
const interviewStages = ["Intent", "Users", "Workflow", "Acceptance", "SRS"];

export function DemoWorkspace() {
  const [projectId] = useState("demo-project");
  const [role] = useState<Role>("client");
  const [prompt, setPrompt] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Requirement Agent is ready. Tell me what software you want to build, and I will prepare a short questionnaire before generating the SRS.",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [activeArtifacts, setActiveArtifacts] = useState<Artifact[]>([]);
  const [initialRequest, setInitialRequest] = useState("");
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [questionAnswers, setQuestionAnswers] = useState<QuestionAnswerDrafts>({});
  const [activeQuestions, setActiveQuestions] = useState<ClarificationQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [storedAnswers, setStoredAnswers] = useState<StoredQuestionAnswer[]>([]);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [softwareDiagramGenerated, setSoftwareDiagramGenerated] = useState(false);
  const [finalSrsGenerated, setFinalSrsGenerated] = useState(false);
  const [diagramReady, setDiagramReady] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const hasStartedInterview = messages.some((message) => message.role === "user");
  const activeQuestion = activeQuestions[currentQuestionIndex];
  const progress = calculateInterviewProgress(
    latestAssistant,
    hasStartedInterview,
    storedAnswers.length,
    activeQuestions.length || maxInterviewQuestions,
    finalSrsGenerated,
  );
  const diagramArtifact = activeArtifacts.find((artifact) => artifact.kind === "client_diagram");
  const srsArtifact = activeArtifacts.find((artifact) => artifact.kind === "developer_srs");

  async function parseJsonResponse<T>(response: Response): Promise<T> {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? `Request failed with ${response.status}`);
    return body as T;
  }

  function addMessage(message: Omit<ChatMessage, "id">) {
    setMessages((current) => [...current, { ...message, id: crypto.randomUUID() }]);
  }

  async function uploadFile(file: File) {
    const formData = new FormData();
    formData.append("projectId", projectId);
    formData.append("file", file);

    const response = await fetch("/api/documents", { method: "POST", body: formData });
    return parseJsonResponse<UploadResponse>(response);
  }

  async function downloadSrsPdf() {
    if (!srsArtifact || pdfLoading) return;

    setPdfLoading(true);
    try {
      const response = await fetch("/api/srs/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: srsArtifact.title,
          content: srsArtifact.content,
        }),
      });
      if (!response.ok) throw new Error("Unable to generate SRS PDF.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "software-requirements-specification.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      addMessage({ role: "system", content: error instanceof Error ? error.message : "Unable to generate SRS PDF." });
    } finally {
      setPdfLoading(false);
    }
  }


  async function requestNextQuestion(userContent: string, scenario: Scenario, answers: StoredQuestionAnswer[] = []) {
    const isInitial = answers.length === 0;
    const answerSummary = answers.length ? renderStoredAnswers(answers) : "No answers collected yet.";
    const interviewContext = buildInterviewTranscript(messages, `${userContent}\n\nStored answers:\n${answerSummary}`);
    if (isInitial) addMessage({ role: "user", content: userContent });

    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        role,
        scenario,
        message: `Generate the next expert requirement interview question for this software idea.\n\nOriginal user intent:\n${userContent}\n\nStored answers so far:\n${answerSummary}`,
        existingRequirements: interviewContext,
        developerIntent:
          `Ask exactly one next requirement-engineering interview question that is highly relevant to the original user intent and previous answers. If the user intent is broad, first identify the business domain/type, for example ecommerce, marketplace, healthcare, blood donation, education, booking, CRM, inventory, finance, logistics, or other. Do not repeat already answered topics. Current stored answers: ${answers.length}/${maxInterviewQuestions}.`,
      }),
    });

    const result = await parseJsonResponse<AgentResponse>(response);
    const nextQuestion = pickNextRelevantQuestion(result.questions, answers, userContent);
    setQuestionLoading(false);
    setActiveArtifacts(result.artifacts);
    setActiveQuestions([nextQuestion]);
    setCurrentQuestionIndex(0);
    setQuestionAnswers({});
    setActiveQuestionId(null);
    if (isInitial) {
      setInitialRequest(userContent);
      setStoredAnswers([]);
      setSoftwareDiagramGenerated(false);
      setFinalSrsGenerated(false);
      setDiagramReady(false);
    }
    addMessage({
      role: "assistant",
      content: isInitial
        ? "I will gather the requirements one focused question at a time. Your answers are stored locally and used to decide the next question."
        : "I stored your answer and prepared the next relevant question based on what you already told me.",
      artifacts: result.artifacts,
      retrieval: result.retrieval?.results,
      questions: [nextQuestion],
      suggestions: [],
      requirements: [],
      nextAction: "Answer the current question to continue requirement discovery.",
    });
  }

  async function generateSoftwareDiagram(answers: StoredQuestionAnswer[]) {
    setLoading(true);
    setActiveQuestionId(null);

    const answerSummary = renderStoredAnswers(answers);
    addMessage({ role: "user", content: `Completed questionnaire with ${answers.length} stored answer(s). Create the software understanding diagram.` });

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          role,
          scenario: "initial_discovery",
          message: `Software diagram generation request. Create a client-level Mermaid diagram showing the implementation process of the actual software/product described by these stored answers. Do not create an SRS yet.\n\n${answerSummary}`,
          existingRequirements: buildInterviewTranscript(messages, answerSummary),
          developerIntent:
            "Second phase after questionnaire: generate only a client-level Mermaid diagram showing the implementation process of the requested software. Include user entry, core app modules/screens, data/documents, admin/review flow, notifications/integrations if relevant, and business outcome. This diagram must represent the software being requested, not the SRS process and not the requirement agent workflow. Do not generate the final SRS in this phase.",
        }),
      });
      const result = await parseJsonResponse<AgentResponse>(response);
      setActiveArtifacts(result.artifacts);
      setActiveQuestions([]);
      setCurrentQuestionIndex(0);
      setDiagramReady(false);
      setSoftwareDiagramGenerated(true);
      setFinalSrsGenerated(false);
      addMessage({
        role: "assistant",
        content: "I created a client-level software understanding diagram from your questionnaire answers. Review the diagram first, then create the SRS in the next step.",
        artifacts: result.artifacts,
        retrieval: result.retrieval?.results,
        questions: [],
        suggestions: [],
        requirements: [],
        nextAction: "Review the software diagram, then create the SRS PDF.",
      });
    } catch (error) {
      addMessage({ role: "system", content: error instanceof Error ? error.message : "Something went wrong." });
    } finally {
      setLoading(false);
    }
  }

  async function generateFinalSrs(answers = storedAnswers) {
    if (!answers.length || loading) return;
    setLoading(true);
    setActiveQuestionId(null);

    const answerSummary = renderStoredAnswers(answers);
    addMessage({ role: "user", content: "Create the SRS from the approved software diagram and stored questionnaire answers." });

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          role,
          scenario: "initial_discovery",
          message: `Final SRS generation request. Use the approved software diagram and these stored client answers to generate a developer-ready SRS.\n\n${answerSummary}`,
          existingRequirements: buildInterviewTranscript(messages, answerSummary),
          developerIntent:
            "Third phase after the software diagram: do not ask another clarification question. Generate the final developer_srs artifact with functional requirements, assumptions, open questions, and measurable acceptance criteria from the stored answers and software diagram.",
        }),
      });
      const result = await parseJsonResponse<AgentResponse>(response);
      setActiveArtifacts(result.artifacts);
      setFinalSrsGenerated(true);
      addMessage({
        role: "assistant",
        content: result.summary,
        artifacts: result.artifacts,
        retrieval: result.retrieval?.results,
        questions: [],
        suggestions: result.suggestions,
        requirements: result.requirements,
        nextAction: result.nextAction,
      });
    } catch (error) {
      addMessage({ role: "system", content: error instanceof Error ? error.message : "Something went wrong." });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const message = prompt.trim();
    if (!message && !selectedFile) return;

    setLoading(true);
    setPrompt("");

    try {
      let userContent = message;
      let scenario: Scenario = "initial_discovery";
      if (message) {
        setSoftwareDiagramGenerated(false);
        setFinalSrsGenerated(false);
        setDiagramReady(false);
      }

      if (selectedFile) {
        const upload = await uploadFile(selectedFile);
        scenario = "document_review";
        addMessage({
          role: "system",
          content: `${upload.fileName} attached and indexed in ${upload.rag?.storeProvider ?? "memory"}. ${upload.findings.length} findings detected.`,
        });
        userContent = [
          message || "Review the attached requirements document and prepare the requirement questionnaire.",
          `Attachment: ${upload.fileName}`,
        ].join("\n");
      }

      await requestNextQuestion(userContent, scenario);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      addMessage({ role: "system", content: error instanceof Error ? error.message : "Something went wrong." });
    } finally {
      setLoading(false);
    }
  }

  async function submitQuestionAnswer(question: ClarificationQuestion, selectedAnswer?: string) {
    const answer = (selectedAnswer ?? questionAnswers[question.id] ?? "").trim();
    if (!answer || loading) return;

    const nextAnswers = [...storedAnswers.filter((item) => item.question.id !== question.id), { question, answer }];
    setStoredAnswers(nextAnswers);
    setActiveQuestionId(null);
    setQuestionAnswers((current) => ({ ...current, [question.id]: "" }));

    const shouldFinish = nextAnswers.length >= maxInterviewQuestions || (nextAnswers.length >= minInterviewQuestions && isReadyForDiagram(nextAnswers));
    if (shouldFinish) {
      await generateSoftwareDiagram(nextAnswers);
      return;
    }

    setQuestionLoading(true);
    setActiveQuestions([]);
    try {
      await requestNextQuestion(initialRequest, "initial_discovery", nextAnswers);
    } catch (error) {
      setQuestionLoading(false);
      addMessage({ role: "system", content: error instanceof Error ? error.message : "Something went wrong." });
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
  }

  return (
    <main className="dark-app">
      <section className={`chat-frame interview-frame ${hasStartedInterview ? "interview-active" : "interview-idle"}`}>
        <header className="chat-topbar">
          <div className="brand-lockup">
            <div className="brand-orb"><Sparkles size={18} /></div>
            <div>
              <strong>Requirement Agent</strong>
              <span>Human-in-the-loop client discovery</span>
            </div>
          </div>
          <div className="status-chip">Client Interview Mode</div>
        </header>

        {hasStartedInterview && (
          <aside className="interview-status" aria-label="Requirement discovery progress">
            <div>
              <span className="eyebrow">Session Progress</span>
              <strong>{progress}% requirement clarity</strong>
            </div>
            <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
            <div className="stage-list">
              {interviewStages.map((stage, index) => (
                <div key={stage} className={index < Math.ceil(progress / 20) ? "stage done" : "stage"}>
                  <CheckCircle2 size={14} /> {stage}
                </div>
              ))}
            </div>
          </aside>
        )}

        <div className="message-list interview-thread">
          {messages.map((message) => (
            <article key={message.id} className={`chat-row ${message.role} reveal-message`}>
              <div className="chat-avatar">
                {message.role === "assistant" ? <Bot size={18} /> : message.role === "user" ? <UserRound size={18} /> : <FileText size={18} />}
              </div>
              <div className="chat-bubble interview-bubble">
                <div className="chat-author">{message.role === "assistant" ? "Agent Interviewer" : message.role === "user" ? "Client" : "System"}</div>
                <p>{message.content}</p>

                {message.retrieval?.length ? (
                  <div className="source-strip">Grounded with {message.retrieval.length} retrieved source chunk(s)</div>
                ) : null}

                {hasStartedInterview && message.id === latestAssistant?.id && finalSrsGenerated ? (
                  <div className="clarity-complete">
                    <span>Requirement clarity calculated</span>
                    <strong>{progress}% ready for SRS review</strong>
                    <small>The software diagram is complete. The SRS PDF is ready after phase 3 generation.</small>
                  </div>
                ) : null}

                {hasStartedInterview && message.nextAction ? <div className="next-action">Next: {message.nextAction}</div> : null}
              </div>
            </article>
          ))}
          {loading && (
            <article className="chat-row assistant reveal-message">
              <div className="chat-avatar"><Bot size={18} /></div>
              <div className="chat-bubble loading-bubble thinking-bubble">
                <Loader2 className="spin" size={17} /> {softwareDiagramGenerated && !finalSrsGenerated ? "Creating the SRS from the software diagram..." : "Preparing the questionnaire..."}
              </div>
            </article>
          )}
        </div>

        {hasStartedInterview && !softwareDiagramGenerated && (activeQuestion || questionLoading) && (
          <section className="persistent-questionnaire-card">
            <div className="questionnaire-card-header">
              <div>
                <span>Requirement interview</span>
                <strong>{questionLoading ? "Preparing next question" : `Question ${storedAnswers.length + 1} of up to ${maxInterviewQuestions}`}</strong>
              </div>
              <div className="stored-answer-pill">{storedAnswers.length} stored</div>
            </div>
            {questionLoading || !activeQuestion ? (
              <div className="question-card-loading">
                <Loader2 className="spin" size={18} /> Generating the next relevant question from your previous answer...
              </div>
            ) : (
              <QuestionCard
                question={activeQuestion}
                questionNumber={storedAnswers.length + 1}
                totalQuestions={maxInterviewQuestions}
                activeQuestionId={activeQuestionId}
                answer={questionAnswers[activeQuestion.id] ?? ""}
                loading={loading || questionLoading}
                onChooseOption={(answer) => submitQuestionAnswer(activeQuestion, answer)}
                onOpenOther={() => setActiveQuestionId(activeQuestion.id)}
                onChangeOther={(answer) =>
                  setQuestionAnswers((current) => ({ ...current, [activeQuestion.id]: answer }))
                }
                onSubmitOther={() => submitQuestionAnswer(activeQuestion)}
              />
            )}
          </section>
        )}

        {softwareDiagramGenerated && (
          <section className="deliverables-stack">
            <div className="deliverable-card">
              <div className="deliverables-header">
                <div>
                  <span>Phase 2</span>
                  <strong>{diagramReady ? "Implementation process diagram" : "Creating implementation process diagram"}</strong>
                </div>
              </div>
              <ClientDiagram
                title={diagramArtifact?.title ?? "Implementation Process Diagram"}
                source={diagramArtifact?.content}
                answers={storedAnswers}
                onRendered={() => setDiagramReady(true)}
              />
              {!diagramReady ? (
                <div className="diagram-loading"><Loader2 className="spin" size={16} /> Rendering Mermaid implementation process diagram...</div>
              ) : null}
            </div>

            {diagramReady ? (
              <div className="deliverable-card srs-card">
                <div className="deliverables-header">
                  <div>
                    <span>Phase 3</span>
                    <strong>{finalSrsGenerated ? "SRS PDF is ready" : "Create the SRS PDF"}</strong>
                  </div>
                </div>
                {finalSrsGenerated ? (
                  <div className="final-srs-action">
                    <span>Final document</span>
                    <button type="button" onClick={downloadSrsPdf} disabled={!srsArtifact || pdfLoading}>
                      {pdfLoading ? <Loader2 className="spin" size={16} /> : <FileText size={16} />} Download SRS PDF
                    </button>
                  </div>
                ) : (
                  <div className="final-srs-action">
                    <span>Next step</span>
                    <button type="button" onClick={() => generateFinalSrs()} disabled={loading || !storedAnswers.length}>
                      {loading ? <Loader2 className="spin" size={16} /> : <FileText size={16} />} Create SRS
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </section>
        )}

        <form className="chat-composer" onSubmit={handleSubmit}>
          {selectedFile && (
            <div className="attached-file">
              <Paperclip size={15} />
              <span>{selectedFile.name}</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                aria-label="Remove attachment"
              >
                <X size={14} />
              </button>
            </div>
          )}
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Describe the software requirement, for example: I want a client portal where users upload PDFs and developers get an SRS..."
            rows={4}
          />
          <div className="composer-actions">
            <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={handleFileChange} hidden />
            <button className="icon-action" type="button" onClick={() => fileInputRef.current?.click()}>
              <Paperclip size={18} /> Attach requirements
            </button>
            <button className="send-action" type="submit" disabled={loading || (!prompt.trim() && !selectedFile)}>
              {loading ? <Loader2 className="spin" size={18} /> : <Send size={18} />} Send to agent
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}


function ClientDiagram({
  title,
  source,
  answers,
  onRendered,
}: {
  title: string;
  source?: string;
  answers: StoredQuestionAnswer[];
  onRendered: () => void;
}) {
  const [svg, setSvg] = useState("");
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      setSvg("");
      setRenderError(false);
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: "dark",
          themeVariables: {
            background: "transparent",
            primaryColor: "#e8c468",
            primaryTextColor: "#101418",
            primaryBorderColor: "#f6d982",
            lineColor: "#56d39b",
            secondaryColor: "#111827",
            tertiaryColor: "#162033",
            fontFamily: "Geist, sans-serif",
          },
        });
        const diagramSource = normalizeMermaidSource(source, answers);
        const result = await mermaid.render(`client-understanding-${Date.now()}`, diagramSource);
        if (!cancelled) {
          setSvg(result.svg);
          onRendered();
        }
      } catch {
        if (!cancelled) {
          setRenderError(true);
          onRendered();
        }
      }
    }

    renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [source, answers]);

  return (
    <div className="client-diagram-card">
      <div className="diagram-title">
        <span>Visual understanding</span>
        <strong>{title}</strong>
      </div>
      {svg && !renderError ? (
        <div className="mermaid-output" aria-label="Client-level Mermaid requirement diagram" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : renderError ? (
        <div className="diagram-flow" aria-label="Client-level implementation process diagram fallback">
          <div className="diagram-node primary">User enters app</div>
          <div className="diagram-connector" />
          <div className="diagram-node">Submit or manage request</div>
          <div className="diagram-connector" />
          <div className="diagram-node">Admin reviews workflow</div>
          <div className="diagram-connector" />
          <div className="diagram-node accent">Business outcome delivered</div>
        </div>
      ) : (
        <div className="diagram-skeleton">
          <div />
          <div />
          <div />
        </div>
      )}
    </div>
  );
}

function normalizeMermaidSource(source: string | undefined, answers: StoredQuestionAnswer[]) {
  const cleaned = source?.replace(/```mermaid|```/g, "").trim();
  if (cleaned && /^(flowchart|graph)\s+/i.test(cleaned) && !/SRS PDF|Requirement Agent|Guided questionnaire|SRS process/i.test(cleaned)) {
    return cleaned;
  }

  const appName = inferSoftwareName(answers);
  return [
    "flowchart LR",
    `  User[End User] --> Entry[Open ${appName}]`,
    "  Entry --> Intake[Submit / Search / Request]",
    "  Intake --> Validate[Validate Required Data]",
    "  Validate --> Core[Core Business Workflow]",
    "  Core --> Data[Store Records and Documents]",
    "  Data --> Admin[Admin Review / Operations]",
    "  Admin --> Notify[Notify User of Status]",
    "  Notify --> Outcome[Business Outcome Delivered]",
  ].join("\n");
}

function inferSoftwareName(answers: StoredQuestionAnswer[]) {
  const combined = answers.map((item) => item.answer).join(" ").toLowerCase();
  if (combined.includes("dashboard")) return "AI Dashboard";
  if (combined.includes("portal")) return "Client Portal";
  if (combined.includes("pdf") || combined.includes("document")) return "Document Management System";
  if (combined.includes("ecommerce") || combined.includes("shop")) return "Commerce Platform";
  return "Requested Software";
}

function QuestionCard({
  question,
  questionNumber,
  totalQuestions,
  activeQuestionId,
  answer,
  loading,
  onChooseOption,
  onOpenOther,
  onChangeOther,
  onSubmitOther,
}: {
  question: ClarificationQuestion;
  questionNumber: number;
  totalQuestions: number;
  activeQuestionId: string | null;
  answer: string;
  loading: boolean;
  onChooseOption: (answer: string) => void;
  onOpenOther: () => void;
  onChangeOther: (answer: string) => void;
  onSubmitOther: () => void;
}) {
  const options = buildQuestionOptions(question);
  const isOtherOpen = activeQuestionId === question.id;

  return (
    <div className="question-card question-answer-card single-question-card">
      <div className="question-prompt">
        <span>Question {questionNumber} of {totalQuestions}</span>
        <strong>{question.question}</strong>
        <small>{question.reason}</small>
      </div>
      <div className="option-list">
        {options.map((option) => (
          <button key={option.value} type="button" onClick={() => onChooseOption(option.value)} disabled={loading}>
            {option.recommended ? <span>Recommended</span> : null}
            {option.label}
          </button>
        ))}
        <button type="button" className="other-option" onClick={onOpenOther} disabled={loading}>
          Other: write my own answer
        </button>
      </div>
      {isOtherOpen && (
        <div className="inline-answer">
          <textarea
            value={answer}
            onChange={(event) => onChangeOther(event.target.value)}
            placeholder="Write your own requirement detail or answer here."
            rows={3}
          />
          <button type="button" onClick={onSubmitOther} disabled={loading || !answer.trim()}>
            {loading ? <Loader2 className="spin" size={15} /> : <Send size={15} />} Store answer
          </button>
        </div>
      )}
    </div>
  );
}

function buildQuestionOptions(question: ClarificationQuestion) {
  const text = question.question.toLowerCase();
  const normalizedTopic = text.replace(/[^a-z0-9]+/g, " ").trim();

  if (/business|domain|type|category|industry/.test(text)) {
    return [
      option("Ecommerce or marketplace", "The business is ecommerce/marketplace: users browse products or services, place orders, pay, and admins manage catalog, orders, and fulfillment.", true),
      option("Healthcare or blood donation", "The business is healthcare/blood donation: users register, find eligibility or availability, submit requests/donations, and admins coordinate review, matching, and status updates."),
      option("Booking or service platform", "The business is booking/service based: users search availability, book a service, manage appointments, and admins manage schedules and confirmations."),
      option("Education or training", "The business is education/training: learners access courses or sessions, track progress, and admins manage content, enrollments, and reports."),
    ];
  }

  if (/user|role|who|permission|access/.test(text)) {
    return [
      option("Separate users by permissions", "Define separate roles for public users, registered users, admins, and operations staff. Each role should only access the screens and actions needed for its work.", true),
      option("Two-role MVP", "Start with two roles for MVP: end users who submit/use the service and admins who review, manage, and report on activity."),
      option("Internal team first", "Keep the first version internal-only, then add external client/customer access after the workflow is validated."),
    ];
  }

  if (/goal|outcome|problem|purpose|why/.test(text)) {
    return [
      option("Complete the core user outcome", "The main outcome is that users can complete the core business task end-to-end without manual coordination outside the system.", true),
      option("Reduce manual work", "The product should reduce manual calls, spreadsheets, and back-and-forth by centralizing request capture, review, and status tracking."),
      option("Improve visibility", "The product should give users and admins clear visibility into current status, missing information, and next actions."),
    ];
  }

  if (/workflow|process|step|journey|flow/.test(text)) {
    return [
      option("Submit, review, approve, notify", "The implementation process should support: user submits request, system validates data, admin reviews, status changes, and notifications are sent.", true),
      option("Search, select, complete action", "The workflow should let users search or filter available options, select the right item, submit details, and receive confirmation."),
      option("Upload, extract, verify", "The workflow should support uploading files, extracting key details, asking for missing information, and letting users verify before submission."),
    ];
  }

  if (/screen|page|dashboard|ui|interface/.test(text)) {
    return [
      option("Dashboard plus detail pages", "Include a dashboard for overview, a detail page for each request/item, and forms for creating or updating records.", true),
      option("Simple chat/intake screen", "Start with a single intake screen that guides the user step by step, then add dashboards later."),
      option("Admin control center", "Prioritize an admin control center with queues, filters, approval actions, and export/reporting controls."),
    ];
  }

  if (/data|field|information|record|store|database/.test(text)) {
    return [
      option("Profile, request, status, history", "Store user profile data, request details, current status, timestamps, comments, and activity history.", true),
      option("Only minimum required data", "Collect only the minimum fields needed for the core workflow and defer advanced metadata until later."),
      option("Structured plus attachments", "Store structured form fields together with uploaded documents/images and link them to each request."),
    ];
  }

  if (/notification|email|sms|alert|remind/.test(text)) {
    return [
      option("Status change notifications", "Notify users when their request is submitted, needs more information, is approved, rejected, or completed.", true),
      option("Admin alerts only", "Send alerts only to internal admins for new requests, urgent items, and overdue reviews."),
      option("No notifications in MVP", "Skip notifications for MVP and show all statuses inside the dashboard first."),
    ];
  }

  if (/integration|api|third party|payment|map|calendar/.test(text)) {
    return [
      option("Keep integrations optional", "Design clean API boundaries but avoid third-party integrations in the first demo unless they are required for the core workflow.", true),
      option("External API required", "The system must integrate with an external service for verification, payments, maps, messaging, or document processing."),
      option("Manual import/export", "Use CSV/PDF import-export for the prototype before investing in direct integrations."),
    ];
  }

  if (/success|complete|done|measure|metric|acceptance/.test(text)) {
    return [
      option("Task completed end-to-end", "Success means a user can complete the main workflow end-to-end and an admin can verify the result from the dashboard.", true),
      option("Demo-ready experience", "Success means the prototype clearly demonstrates the business workflow, key screens, and generated SRS for stakeholders."),
      option("Operational metrics", "Success should be measured by completion rate, average review time, number of manual follow-ups reduced, and error rate."),
    ];
  }

  if (/edge|error|exception|fail|missing/.test(text)) {
    return [
      option("Missing information handling", "If required information is missing, the system should save progress, mark the request incomplete, and ask the user for the missing details.", true),
      option("Admin override", "Admins should be able to override or correct invalid submissions with an audit trail."),
      option("Reject invalid submissions", "Invalid or duplicate submissions should be rejected with a clear reason shown to the user."),
    ];
  }

  return [
    option(
      `Recommended for: ${normalizedTopic || "this requirement"}`,
      `For this question, use a practical MVP answer: define the simplest version that supports the core business workflow, then leave advanced rules as future enhancements.`,
      true,
    ),
    option("Make it more complete", "Include admin controls, audit history, notifications, exports, and role-based permissions in the first version."),
    option("Keep it demo focused", "For now, only include the screens and behavior needed to clearly demonstrate the product purpose."),
  ];
}

function option(label: string, value: string, recommended = false) {
  return { label, value, recommended };
}


function pickNextRelevantQuestion(questions: ClarificationQuestion[], answers: StoredQuestionAnswer[], userIntent: string): ClarificationQuestion {
  const answeredText = answers.map((item) => item.question.question.toLowerCase()).join(" ");
  const freshQuestion = questions.find((question) => !answeredText.includes(question.question.toLowerCase().slice(0, 24)));
  if (freshQuestion) return freshQuestion;

  return buildFallbackQuestion(answers, userIntent);
}

function buildFallbackQuestion(answers: StoredQuestionAnswer[], userIntent: string): ClarificationQuestion {
  const domainKnown = answers.some((item) => /ecommerce|marketplace|health|blood|education|booking|crm|inventory|finance|logistics|business type|domain/i.test(item.answer));
  const topics = [
    {
      id: "fq_business_type",
      question: "What type of business or app are you building?",
      reason: "The business domain changes the users, workflows, data, and compliance requirements.",
    },
    {
      id: "fq_primary_users",
      question: "Who are the primary users of this software and what should each one do?",
      reason: "User roles define screens, permissions, and acceptance criteria.",
    },
    {
      id: "fq_core_workflow",
      question: "What is the main workflow users must complete from start to finish?",
      reason: "The core workflow drives the implementation process diagram and SRS scope.",
    },
    {
      id: "fq_data",
      question: "What information, documents, or records must the system collect and manage?",
      reason: "Data requirements shape forms, storage, APIs, and reporting.",
    },
    {
      id: "fq_success",
      question: "How will you decide that this software is successful for the business?",
      reason: "Success criteria make the requirements measurable and testable.",
    },
  ];
  const answeredIds = new Set(answers.map((item) => inferQuestionTopic(item.question.question)));
  const next = topics.find((topic) => !answeredIds.has(inferQuestionTopic(topic.question))) ?? topics[topics.length - 1];
  return {
    id: domainKnown ? next.id : "fq_business_type",
    question: domainKnown ? next.question : domainSpecificQuestion(userIntent),
    reason: domainKnown ? next.reason : "Knowing the business type lets the agent ask relevant requirement questions instead of generic software questions.",
    target: "client",
  };
}

function domainSpecificQuestion(userIntent: string) {
  if (/business|app|software|platform/i.test(userIntent)) {
    return "What type of business are you building this software for?";
  }
  return "What business domain or app category does this software belong to?";
}

function inferQuestionTopic(question: string) {
  const lower = question.toLowerCase();
  if (/business|domain|type/.test(lower)) return "domain";
  if (/user|role|who/.test(lower)) return "users";
  if (/workflow|process|step/.test(lower)) return "workflow";
  if (/data|information|document|record/.test(lower)) return "data";
  if (/success|metric|complete/.test(lower)) return "success";
  return lower.slice(0, 16);
}

function isReadyForDiagram(answers: StoredQuestionAnswer[]) {
  const combined = answers.map((item) => `${item.question.question} ${item.answer}`).join(" ").toLowerCase();
  return [
    /business|domain|ecommerce|marketplace|health|blood|education|booking|crm|inventory|finance|logistics/.test(combined),
    /user|role|admin|client|customer|donor|patient|student|manager/.test(combined),
    /workflow|process|step|submit|request|approve|search|book|donate|order/.test(combined),
    /data|information|document|record|profile|status|history/.test(combined),
    /success|metric|complete|goal|outcome/.test(combined),
  ].filter(Boolean).length >= 4;
}

function calculateInterviewProgress(
  message: ChatMessage | undefined,
  hasStartedInterview: boolean,
  answeredQuestionCount: number,
  totalQuestionCount: number,
  isInterviewComplete: boolean,
) {
  if (!hasStartedInterview || !message) return 0;
  if (isInterviewComplete) return 96;

  const safeTotal = Math.max(totalQuestionCount, 1);
  const answerProgress = Math.min(answeredQuestionCount / safeTotal, 1) * 76;
  return Math.max(12, Math.min(88, Math.round(12 + answerProgress)));
}

function renderStoredAnswers(answers: StoredQuestionAnswer[]) {
  return answers
    .map((item, index) => `${index + 1}. ${item.question.question}\nAnswer: ${item.answer}`)
    .join("\n\n");
}

function buildInterviewTranscript(messages: ChatMessage[], pendingUserContent: string) {
  return [
    ...messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => `${message.role === "user" ? "Client" : "Agent"}: ${message.content}`),
    `Client: ${pendingUserContent}`,
  ]
    .slice(-10)
    .join("\n\n");
}
