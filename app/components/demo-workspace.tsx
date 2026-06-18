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

type ClarificationAnswerOption = {
  label: string;
  value: string;
  recommended?: boolean;
};

type ClarificationQuestion = {
  id: string;
  question: string;
  reason: string;
  target: Role;
  options: ClarificationAnswerOption[];
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
  action?: "confirm_diagram" | "diagram_result";
};

type QuestionAnswerDrafts = Record<string, string>;

type StoredQuestionAnswer = {
  question: ClarificationQuestion;
  answer: string;
};

const maxInterviewQuestions = 5;
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
  const [diagramGenerating, setDiagramGenerating] = useState(false);
  const [diagramConfirmationResolved, setDiagramConfirmationResolved] = useState(false);
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
    const answeredTopics = answers.length ? renderAnsweredTopics(answers) : "None yet.";
    const interviewContext = buildInterviewTranscript(messages, `${userContent}\n\nStored answers:\n${answerSummary}\n\nAlready answered topics:\n${answeredTopics}`);
    if (isInitial) addMessage({ role: "user", content: userContent });

    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        role,
        scenario,
        message: `Generate the next expert requirement interview question for this software idea.\n\nOriginal user intent:\n${userContent}\n\nStored answers so far:\n${answerSummary}\n\nAlready answered question topics that must not be asked again:\n${answeredTopics}`,
        existingRequirements: interviewContext,
        developerIntent:
          `Ask exactly one next requirement-engineering interview question. It must advance the interview beyond the stored answers and must not ask for any topic, fact, or decision already answered. Treat the answered topics list as forbidden topics for the next question. If business domain/type has already been answered, move to the next missing area such as target users, core workflow, data, permissions, integrations, success criteria, constraints, edge cases, reporting, or MVP scope. Current stored answers: ${answers.length}/${maxInterviewQuestions}.`,
      }),
    });

    const result = await parseJsonResponse<AgentResponse>(response);
    const nextQuestion = result.questions[0];
    if (!nextQuestion) throw new Error("The LLM did not return the next requirement question. Please retry.");
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
      setDiagramConfirmationResolved(false);
    }
    if (isInitial) {
      addMessage({
        role: "assistant",
        content: "I will gather the requirements one focused question at a time. Your answers stay in the interview card and guide each next question.",
        artifacts: result.artifacts,
        retrieval: result.retrieval?.results,
        questions: [nextQuestion],
        suggestions: [],
        requirements: [],
        nextAction: "Answer the current question to continue requirement discovery.",
      });
    }
  }

  async function generateSoftwareDiagram(answers: StoredQuestionAnswer[]) {
    setLoading(true);
    setDiagramGenerating(true);
    setActiveQuestionId(null);

    const answerSummary = renderStoredAnswers(answers);

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
        content: "I created the client-level implementation process diagram from your questionnaire answers. Review it here, then continue to SRS generation when ready.",
        action: "diagram_result",
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
      setDiagramGenerating(false);
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

  async function handleDiagramDecision(shouldContinue: boolean) {
    if (loading || diagramGenerating || diagramConfirmationResolved) return;

    setDiagramConfirmationResolved(true);
    addMessage({ role: "user", content: shouldContinue ? "Yes, continue to diagramming." : "No, stop before diagramming." });
    if (!shouldContinue) {
      setActiveQuestions([]);
      setQuestionLoading(false);
      addMessage({
        role: "assistant",
        content: "Diagram generation stopped. Your questionnaire answers are stored in this session, and you can start a new requirement prompt whenever needed.",
      });
      return;
    }

    await generateSoftwareDiagram(storedAnswers);
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
        setDiagramConfirmationResolved(false);
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

    const nextAnswers = [...storedAnswers, { question, answer }];
    setStoredAnswers(nextAnswers);
    setActiveQuestionId(null);
    setQuestionAnswers((current) => ({ ...current, [question.id]: "" }));

    const shouldFinish = nextAnswers.length >= maxInterviewQuestions;
    if (shouldFinish) {
      setActiveQuestions([]);
      setCurrentQuestionIndex(0);
      addMessage({
        role: "assistant",
        content: "The requirement interview is complete. The next phase is diagramming: I can create a client-level implementation process diagram from your answers. Would you like to continue?",
        action: "confirm_diagram",
        nextAction: "Choose Yes to generate the diagram, or No to stop here.",
      });
      setDiagramConfirmationResolved(false);
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

                {message.action === "confirm_diagram" ? (
                  <div className="thread-action-card">
                    <span>Continue to phase 2?</span>
                    <div>
                      <button type="button" onClick={() => handleDiagramDecision(true)} disabled={loading || diagramGenerating || softwareDiagramGenerated || diagramConfirmationResolved || message.id !== latestAssistant?.id}>
                        Yes, generate diagram
                      </button>
                      <button type="button" className="secondary" onClick={() => handleDiagramDecision(false)} disabled={loading || diagramGenerating || softwareDiagramGenerated || diagramConfirmationResolved || message.id !== latestAssistant?.id}>
                        No, stop here
                      </button>
                    </div>
                  </div>
                ) : null}

                {message.action === "diagram_result" && message.artifacts?.find((artifact) => artifact.kind === "client_diagram") ? (
                  <div className="thread-diagram-box">
                    <ClientDiagram
                      title={message.artifacts.find((artifact) => artifact.kind === "client_diagram")?.title ?? "Implementation Process Diagram"}
                      source={message.artifacts.find((artifact) => artifact.kind === "client_diagram")?.content}
                      answers={storedAnswers}
                      onRendered={() => setDiagramReady(true)}
                    />
                    {!diagramReady ? (
                      <div className="diagram-loading"><Loader2 className="spin" size={16} /> Rendering Mermaid implementation process diagram...</div>
                    ) : null}
                  </div>
                ) : null}

                {message.action === "diagram_result" && message.artifacts?.find((artifact) => artifact.kind === "client_diagram") && diagramReady ? (
                  <div className="final-srs-action thread-srs-action">
                    <span>Phase 3</span>
                    {finalSrsGenerated ? (
                      <button type="button" onClick={downloadSrsPdf} disabled={!srsArtifact || pdfLoading}>
                        {pdfLoading ? <Loader2 className="spin" size={16} /> : <FileText size={16} />} Download SRS PDF
                      </button>
                    ) : (
                      <button type="button" onClick={() => generateFinalSrs()} disabled={loading || !storedAnswers.length}>
                        {loading ? <Loader2 className="spin" size={16} /> : <FileText size={16} />} Create SRS
                      </button>
                    )}
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
                <Loader2 className="spin" size={17} /> {diagramGenerating ? "Generating the implementation process diagram..." : softwareDiagramGenerated && !finalSrsGenerated ? "Creating the SRS from the software diagram..." : "Preparing the questionnaire..."}
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
        const diagramSource = normalizeMermaidSource(source);
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
        <div className="diagram-render-error">
          The LLM returned a Mermaid diagram that could not be rendered. Please regenerate the diagram.
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

function normalizeMermaidSource(source: string | undefined) {
  const cleaned = source?.replace(/```mermaid|```/g, "").trim();
  if (!cleaned || !/^(flowchart|graph)\s+/i.test(cleaned)) {
    throw new Error("Missing valid LLM-generated Mermaid diagram.");
  }
  if (/SRS PDF|Requirement Agent|Guided questionnaire|SRS process/i.test(cleaned)) {
    throw new Error("LLM diagram describes the wrong process.");
  }
  return cleaned;
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
  const options = getQuestionOptions(question);
  const isOtherOpen = activeQuestionId === question.id;

  return (
    <div className="question-card question-answer-card single-question-card">
      <div className="question-prompt">
        <span>Question {questionNumber} of {totalQuestions}</span>
        <strong>{question.question}</strong>
        <small>{question.reason}</small>
      </div>
      <div className="option-list">
        {options.map((option) => {
          const isOther = /other|custom|different|own/i.test(`${option.label} ${option.value}`);
          return (
            <button
              key={`${option.label}-${option.value}`}
              type="button"
              className={isOther ? "other-option" : undefined}
              onClick={() => (isOther ? onOpenOther() : onChooseOption(option.value))}
              disabled={loading}
            >
              {option.recommended ? <span>Recommended</span> : null}
              {option.label}
            </button>
          );
        })}
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


function getQuestionOptions(question: ClarificationQuestion) {
  return question.options;
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

function renderAnsweredTopics(answers: StoredQuestionAnswer[]) {
  return answers
    .map((item, index) => `${index + 1}. Already answered question: ${item.question.question}\nConfirmed answer: ${item.answer}`)
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
