"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Icon,
  Copy,
} from "@/components/icons";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { MarkdownContent } from "@/components/platform/provider/student/adviser/MarkdownContent";
import { lectureVialSrc } from "@/components/platform/provider/student/lectures/courseCover";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { ChatMessagesSkeleton } from "@/components/platform/provider/student/DashboardSkeletons";
import { ApiRequestError } from "@/lib/integrate/client";
import {
  getPatientMessages,
  sendPatientMessage,
  type ChatMessagesPagination,
  type PatientDetail,
  type RecommendationBoard,
  type RecommendationBoardPeptide,
  type StoredChatMessage,
} from "@/lib/integrate/provider/student/chat";
import { cn } from "@/lib/utils";

type AdviserChatPanelProps = {
  patient: PatientDetail;
  onPatientChange?: (patient: PatientDetail) => void;
};

type DisplayMessage = StoredChatMessage & {
  pending?: boolean;
};

const TEMP_USER_PREFIX = "temp-user-";
const TEMP_ASSISTANT_PREFIX = "temp-assistant-";
const DEFAULT_CHAT_MAX_TURNS = 50;

function createTempUserMessage(content: string): DisplayMessage {
  return {
    message_id: `${TEMP_USER_PREFIX}${Date.now()}`,
    role: "user",
    content,
    created_at: new Date().toISOString(),
    kind: "message",
    pending: true,
  };
}

function createTypingMessage(): DisplayMessage {
  return {
    message_id: `${TEMP_ASSISTANT_PREFIX}${Date.now()}`,
    role: "assistant",
    content: "",
    created_at: new Date().toISOString(),
    kind: "message",
    pending: true,
  };
}

function shortQuestion(question: string) {
  const words = question.replace(/\s+/g, " ").trim().replace(/\?+$/, "").split(" ").filter(Boolean);
  if (words.length === 0) return question.trim();
  return `${words.slice(0, 6).join(" ")}?`;
}

function suggestedQuestions(board: RecommendationBoard | null) {
  const source = board?.suggested_questions?.length ? board.suggested_questions : board?.chips ?? [];
  return source.map(shortQuestion).filter(Boolean).slice(0, 3);
}

function peptideReasons(peptide: RecommendationBoardPeptide, summary: string) {
  const why = (peptide.why ?? []).filter(Boolean);
  if (why.length > 0) return why;
  const fit = peptide.fit?.trim();
  if (fit && fit !== summary) return [fit];
  return [];
}

function rankLabel(rank: number) {
  if (rank === 1) return "Top pick";
  if (rank === 2) return "Alternative";
  if (rank === 3) return "Supporting";
  return `Option ${rank}`;
}

export function AdviserChatPanel({
  patient,
  onPatientChange,
}: AdviserChatPanelProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [board, setBoard] = useState<RecommendationBoard | null>(
    patient.recommendation_board ?? null,
  );
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [pagination, setPagination] = useState<ChatMessagesPagination | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const lastMessageIdRef = useRef<string | null>(null);
  const initializedPatientRef = useRef<string | null>(null);

  useEffect(() => {
    setBoard(patient.recommendation_board ?? null);
  }, [patient.patient_id, patient.recommendation_board]);

  useEffect(() => {
    if (initializedPatientRef.current === patient.patient_id) return;

    let cancelled = false;
    initializedPatientRef.current = patient.patient_id;

    const seedMessages = patient.messages ?? [];
    const seedPagination = patient.messages_pagination ?? null;

    async function initializeThread() {
      if (seedMessages.length > 0) {
        setMessages(seedMessages);
        setPagination(seedPagination);
        return;
      }

      setIsLoadingMessages(true);
      try {
        const page = await getPatientMessages(patient.patient_id);
        if (cancelled) return;
        setMessages(page.messages);
        setPagination(page.pagination);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiRequestError ? err.message : "Could not load chat messages.",
        );
      } finally {
        if (!cancelled) setIsLoadingMessages(false);
      }
    }

    void initializeThread();

    return () => {
      cancelled = true;
    };
  }, [patient.patient_id]);

  useEffect(() => {
    const incoming = (patient.messages ?? []).find((item) => item.kind === "recommendation");
    if (!incoming?.content) return;
    setMessages((current) =>
      current.map((item) =>
        item.kind === "recommendation" ? { ...item, content: incoming.content } : item,
      ),
    );
  }, [patient.messages, patient.patient_id]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    const lastId = last?.message_id ?? null;
    const replyArrived =
      last != null &&
      last.role === "assistant" &&
      !last.pending &&
      last.kind !== "board_update" &&
      lastId !== lastMessageIdRef.current;
    if (isSending || replyArrived) {
      shouldStickToBottomRef.current = true;
    }
    lastMessageIdRef.current = lastId;

    if (!shouldStickToBottomRef.current) return;

    const container = scrollContainerRef.current;
    const inner = container?.firstElementChild;
    if (!container) return;

    const jump = () => {
      if (!shouldStickToBottomRef.current) return;
      container.scrollTop = container.scrollHeight;
    };

    jump();
    const raf = requestAnimationFrame(() => {
      jump();
      requestAnimationFrame(jump);
    });
    const ro = inner ? new ResizeObserver(jump) : null;
    if (inner) ro?.observe(inner);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [messages, isSending, board]);

  const loadOlderMessages = useCallback(async () => {
    if (!pagination?.has_older || !pagination.oldest_message_id || isLoadingOlder) return;

    setIsLoadingOlder(true);
    shouldStickToBottomRef.current = false;
    const container = scrollContainerRef.current;
    const previousHeight = container?.scrollHeight ?? 0;

    try {
      const page = await getPatientMessages(patient.patient_id, {
        before: pagination.oldest_message_id,
      });
      setMessages((current) => [...page.messages, ...current]);
      setPagination((current) =>
        current
          ? {
              ...current,
              has_older: page.pagination.has_older,
              oldest_message_id: page.pagination.oldest_message_id,
            }
          : page.pagination,
      );

      requestAnimationFrame(() => {
        const nextContainer = scrollContainerRef.current;
        if (!nextContainer) return;
        nextContainer.scrollTop = nextContainer.scrollHeight - previousHeight;
      });
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Could not load older messages.",
      );
    } finally {
      setIsLoadingOlder(false);
    }
  }, [isLoadingOlder, pagination, patient.patient_id]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    function handleContainerScroll() {
      const el = scrollContainerRef.current;
      if (!el) return;

      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      shouldStickToBottomRef.current = distanceFromBottom < 96;

      if (el.scrollTop <= 48) {
        void loadOlderMessages();
      }
    }

    container.addEventListener("scroll", handleContainerScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleContainerScroll);
  }, [loadOlderMessages]);

  const sendQuestion = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      const used =
        patient.turns_used ??
        messages.filter((message) => message.role === "user" && (message.kind ?? "message") === "message")
          .length;
      if (!trimmed || isSending || !patient.recommendation || used >= (patient.turns_max ?? DEFAULT_CHAT_MAX_TURNS)) return;

      const optimisticMessage = createTempUserMessage(trimmed);
      const typingMessage = createTypingMessage();

      setInput("");
      setError(null);
      setIsSending(true);
      shouldStickToBottomRef.current = true;
      setMessages((current) => [...current, optimisticMessage, typingMessage]);

      if (composerRef.current) {
        composerRef.current.style.height = "auto";
      }

      try {
        const reply = await sendPatientMessage(patient.patient_id, trimmed);
        const suggestions = (reply.suggested_questions ?? []).map(shortQuestion).filter(Boolean).slice(0, 3);
        setMessages((current) =>
          current
            .filter((message) => message.message_id !== typingMessage.message_id)
            .map((message) =>
              message.message_id === optimisticMessage.message_id
                ? { ...message, pending: false }
                : message,
            )
            .concat({
              message_id: `${TEMP_ASSISTANT_PREFIX}reply-${Date.now()}`,
              role: "assistant",
              content: reply.answer,
              created_at: new Date().toISOString(),
              kind: "message",
              suggested_questions: suggestions,
            }),
        );
        onPatientChange?.({
          ...patient,
          status: "chatting",
          turns_used: used + 1,
          messages: undefined as unknown as PatientDetail["messages"],
        });
      } catch (err) {
        setMessages((current) =>
          current.filter(
            (message) =>
              message.message_id !== optimisticMessage.message_id &&
              message.message_id !== typingMessage.message_id,
          ),
        );
        setInput(trimmed);
        setError(err instanceof ApiRequestError ? err.message : "Could not send message.");
      } finally {
        setIsSending(false);
        composerRef.current?.focus();
      }
    },
    [
      isSending,
      messages,
      onPatientChange,
      patient,
    ],
  );

  const sendMessage = useCallback(async () => {
    await sendQuestion(input);
  }, [input, sendQuestion]);

  /** Cap composer to ~3 lines of body text, then scroll. */
  const COMPOSER_MAX_LINES = 3;
  const COMPOSER_LINE_HEIGHT_PX = 24;
  const COMPOSER_VERTICAL_PAD_PX = 20;
  const COMPOSER_MAX_HEIGHT =
    COMPOSER_LINE_HEIGHT_PX * COMPOSER_MAX_LINES + COMPOSER_VERTICAL_PAD_PX;

  const resizeComposer = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.overflowY = "hidden";
    const fullHeight = el.scrollHeight;
    if (fullHeight > COMPOSER_MAX_HEIGHT) {
      el.style.height = `${COMPOSER_MAX_HEIGHT}px`;
      el.style.overflowY = "auto";
    } else {
      el.style.height = `${fullHeight}px`;
    }
  };

  const handleComposerInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    resizeComposer(event.target);
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter") return;

    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const el = event.currentTarget;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const next = `${input.slice(0, start)}\n${input.slice(end)}`;
        setInput(next);
        requestAnimationFrame(() => {
          el.selectionStart = el.selectionEnd = start + 1;
          resizeComposer(el);
        });
      }
      return;
    }

    event.preventDefault();
    void sendMessage();
  };

  const copyMessage = useCallback(async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(messageId);
      window.setTimeout(() => setCopiedId((current) => (current === messageId ? null : current)), 1600);
    } catch {
      setError("Could not copy message.");
    }
  }, []);

  const turnsUsed =
    patient.turns_used ??
    messages.filter((message) => message.role === "user" && (message.kind ?? "message") === "message")
      .length;
  const turnsMax = patient.turns_max ?? DEFAULT_CHAT_MAX_TURNS;
  const turnsLeft = Math.max(0, turnsMax - turnsUsed);
  const atTurnLimit = turnsLeft <= 0;
  const composerLocked = isSending || atTurnLimit || !patient.recommendation;
  const composerPlaceholder = atTurnLimit ? "Turn limit reached" : "Ask about this case...";
  const starterQuestions = suggestedQuestions(board);
  const latestAnswerId = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && !message.pending && message.kind !== "recommendation")
    ?.message_id;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={scrollContainerRef}
        className="adviser-chat-transcript min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 md:px-11"
        data-lenis-prevent
      >
        <div className="mx-auto flex w-full max-w-[54rem] flex-col gap-4 pb-8 pt-[37px]">
          {pagination?.has_older ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => void loadOlderMessages()}
                disabled={isLoadingOlder}
                className="dashboard-pill-soft font-sans inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-4 text-brand-caption font-medium text-[color:var(--dash-muted)] transition hover:text-[color:var(--dash-text)] disabled:opacity-60"
              >
                {isLoadingOlder ? (
                  <>
                    <SidebarSvgIcon name="spinner" size={14} strokeWidth={2.2} className="animate-spin" />
                    Loading earlier…
                  </>
                ) : (
                  "Load earlier messages"
                )}
              </button>
            </div>
          ) : null}

          {isLoadingMessages ? <ChatMessagesSkeleton /> : null}

          {!isLoadingMessages && messages.length === 0 ? (
            <div className="adviser-chat-empty adviser-chat-card flex flex-col items-center justify-center rounded-2xl px-5 py-10 text-center sm:py-12">
              <p className="font-sans text-base font-semibold text-[color:var(--dash-text)]">
                Ask about this case
              </p>
              <p className="text-brand-caption mt-1.5 max-w-[20rem] text-[color:var(--dash-muted)]">
                Ask a question about this case. The reply covers the full shortlist.
              </p>
            </div>
          ) : null}

          {messages.map((message) => (
            <ChatMessageRow
              key={message.message_id}
              message={message}
              copied={copiedId === message.message_id}
              board={message.kind === "recommendation" ? board : null}
              patientName={patient.display_name}
              questions={
                message.kind === "recommendation"
                  ? latestAnswerId
                    ? []
                    : starterQuestions.slice(0, 3)
                  : message.message_id === latestAnswerId
                    ? (message.suggested_questions ?? []).map(shortQuestion).filter(Boolean).slice(0, 3)
                    : []
              }
              questionsDisabled={composerLocked}
              onAsk={(question) => void sendQuestion(question)}
              onCopy={() => void copyMessage(message.message_id, message.content)}
            />
          ))}

          {error ? (
            <div className="py-2">
              <AuthAlert variant="error">{error}</AuthAlert>
            </div>
          ) : null}
        </div>
      </div>

      <footer className="adviser-chat-composer-bar shrink-0 px-4 pb-[max(31px,env(safe-area-inset-bottom))] pt-2 sm:px-6 md:px-11">
        <div className="mx-auto w-full max-w-[54rem]">
          <form
            className="adviser-chat-composer flex w-full items-center gap-2 overflow-hidden rounded-full"
            onSubmit={(event) => {
              event.preventDefault();
              if (!composerLocked) void sendMessage();
            }}
          >
            <div className="adviser-chat-composer-field min-w-0 flex-1">
              <textarea
                ref={composerRef}
                value={input}
                onChange={handleComposerInput}
                onKeyDown={handleComposerKeyDown}
                disabled={composerLocked}
                rows={1}
                placeholder={composerPlaceholder}
                spellCheck={false}
                className="adviser-chat-composer-input w-full resize-none border-0 bg-transparent shadow-none outline-none ring-0 focus:border-0 focus:shadow-none focus:outline-none focus:ring-0 disabled:opacity-60"
                aria-describedby="adviser-composer-hint"
              />
            </div>
            <span id="adviser-composer-hint" className="sr-only">
              Press Enter to send. Press Ctrl+Enter for a new line.
            </span>
            <button
              type="submit"
              disabled={composerLocked || !input.trim()}
              aria-label="Send message"
              className={cn(
                "adviser-chat-composer-send-btn flex shrink-0 items-center justify-center rounded-full transition",
                input.trim() && !composerLocked
                  ? "adviser-chat-composer-send"
                  : "adviser-chat-composer-send-idle",
              )}
            >
              {isSending ? (
                <SidebarSvgIcon name="spinner" size={16} strokeWidth={2.4} className="animate-spin" />
              ) : (
                <SidebarSvgIcon name="send" size={20} strokeWidth={2.25} />
              )}
            </button>
          </form>
        </div>
      </footer>
    </div>
  );
}

function ChatMessageRow({
  message,
  copied,
  board,
  patientName,
  questions,
  questionsDisabled,
  onAsk,
  onCopy,
}: {
  message: DisplayMessage;
  copied: boolean;
  board?: RecommendationBoard | null;
  patientName?: string;
  questions?: string[];
  questionsDisabled?: boolean;
  onAsk?: (question: string) => void;
  onCopy: () => void;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="adviser-chat-row adviser-chat-row--user">
        <div className="adviser-chat-bubble-wrap adviser-chat-bubble-wrap--user">
          <p className="adviser-chat-role adviser-chat-role--user">You</p>
          <div
            className={cn(
              "adviser-chat-user",
              message.pending && "adviser-chat-user--pending",
            )}
          >
            <p className="adviser-chat-user-text whitespace-pre-wrap break-words">{message.content}</p>
          </div>
        </div>
      </div>
    );
  }

  if (message.kind === "board_update") {
    return <p className="adviser-chat-system">Selection updated</p>;
  }

  if (message.kind === "recommendation") {
    const ranked = (board?.ranked ?? []).slice(0, 3);
    const goal = board?.primary_goal ? String(board.primary_goal) : null;
    return (
      <div className="adviser-chat-row adviser-chat-row--assistant">
        <AssistantFrame board>
          <div className="adviser-chat-ai-block grid gap-3">
            <RecommendationTable
              peptides={ranked}
              goal={goal}
              message={message.content}
              patientName={patientName}
              disabled={questionsDisabled}
              onSelect={
                onAsk
                  ? (name) => onAsk(`Tell me the details of ${name} for this case.`)
                  : undefined
              }
            />
            {questions && questions.length > 0 ? (
              <SuggestedQuestions
                questions={questions}
                disabled={questionsDisabled}
                onAsk={onAsk}
              />
            ) : null}
          </div>
        </AssistantFrame>
      </div>
    );
  }

  if (message.pending) {
    return (
      <div className="adviser-chat-row adviser-chat-row--assistant">
        <AssistantFrame>
          <AdviserThinkingIndicator />
        </AssistantFrame>
      </div>
    );
  }

  return (
    <div className="adviser-chat-row adviser-chat-row--assistant">
      <AssistantFrame>
        <div className="adviser-chat-ai">
          <div className="adviser-chat-ai-body break-words">
            <MarkdownContent content={message.content} className="adviser-chat-markdown" />
          </div>
          <div className="adviser-chat-ai-actions">
            <MessageActionButton label={copied ? "Copied" : "Copy"} onClick={onCopy}>
              {copied ? (
                <SidebarSvgIcon name="check" size={16} strokeWidth={1.6} />
              ) : (
                <Icon icon={Copy} size={16} strokeWidth={1.6} />
              )}
              {copied ? <span>Copied</span> : null}
            </MessageActionButton>
          </div>
          {questions && questions.length > 0 ? (
            <SuggestedQuestions
              questions={questions}
              disabled={questionsDisabled}
              onAsk={onAsk}
            />
          ) : null}
        </div>
      </AssistantFrame>
    </div>
  );
}

function AssistantFrame({
  children,
  board = false,
}: {
  children: React.ReactNode;
  board?: boolean;
}) {
  return (
    <div className="adviser-assistant">
      <span className="adviser-assistant-ball" aria-hidden>
        <img src="/assets/ball/ball.png" alt="" width={37} height={37} />
      </span>
      <p className="adviser-assistant-label">AI Assistant</p>
      <div className={cn("adviser-assistant-card", board && "adviser-assistant-card--board")}>
        {children}
      </div>
    </div>
  );
}

function SuggestedQuestions({
  questions,
  disabled,
  onAsk,
}: {
  questions: string[];
  disabled?: boolean;
  onAsk?: (question: string) => void;
}) {
  return (
    <div className="adviser-suggested">
      <p className="adviser-suggested-label">Suggested questions</p>
      <div className="adviser-suggested-row">
        {questions.map((question) => (
          <button
            key={question}
            type="button"
            disabled={disabled}
            onClick={() => onAsk?.(question)}
            className="adviser-suggested-card"
          >
            <SuggestedQuestionIcon />
            <span>{question}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SuggestedQuestionIcon() {
  return (
    <svg className="adviser-suggested-icon" viewBox="0 0 28 28" width="16" height="16" aria-hidden>
      <path
        d="M7.2 6.2h12.2c1.3 0 2.4 1.1 2.4 2.4v7.1c0 1.3-1.1 2.4-2.4 2.4h-6.1L8.4 22.2v-4.1H7.2c-1.3 0-2.4-1.1-2.4-2.4V8.6c0-1.3 1.1-2.4 2.4-2.4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AdviserThinkingIndicator() {
  return (
    <div
      className="adviser-chat-thinking"
      aria-live="polite"
      aria-label="AI assistant is thinking"
    >
      <svg
        className="adviser-chat-thinking-dots"
        viewBox="0 0 40 12"
        width="40"
        height="12"
        aria-hidden
      >
        <circle className="adviser-chat-thinking-dot" cx="6" cy="6" r="3.2" />
        <circle className="adviser-chat-thinking-dot" cx="20" cy="6" r="3.2" />
        <circle className="adviser-chat-thinking-dot" cx="34" cy="6" r="3.2" />
      </svg>
      <span className="adviser-chat-thinking-label">Thinking</span>
    </div>
  );
}

function RecommendationVial({ name, size }: { name: string; size: "feature" | "thumb" }) {
  const src = lectureVialSrc(name);
  if (!src) return null;

  return (
    <div className={cn("adviser-board-vial", size === "feature" ? "adviser-board-vial--feature" : "adviser-board-vial--thumb")} aria-hidden>
      <img src={src} alt="" />
    </div>
  );
}

function CheckIcon({ soft = false }: { soft?: boolean }) {
  return (
    <svg className={cn("adviser-board-icon", soft ? "adviser-board-icon--soft" : "adviser-board-icon--check")} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="7" />
      <path d="M5 8.2 7.1 10.2 11 6" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="adviser-board-icon adviser-board-icon--info" viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="7" />
      <path d="M8 7.2V11" />
      <path d="M8 5.1h.01" />
    </svg>
  );
}

function NoteList({ items, tone }: { items: string[]; tone: "pro" | "watch" }) {
  if (items.length === 0) return null;
  return (
    <ul className="adviser-board-notes">
      {items.map((item) => (
        <li key={item}>
          {tone === "pro" ? <CheckIcon /> : <InfoIcon />}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function DetailsButton({
  name,
  disabled,
  onSelect,
}: {
  name: string;
  disabled?: boolean;
  onSelect?: (name: string) => void;
}) {
  if (!onSelect) return null;
  return (
    <button
      type="button"
      className="adviser-board-details"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(name);
      }}
    >
      View Details
      <span aria-hidden>→</span>
    </button>
  );
}

function RecommendationTable({
  peptides,
  goal,
  message,
  patientName,
  disabled = false,
  onSelect,
}: {
  peptides: RecommendationBoardPeptide[];
  goal?: string | null;
  message: string;
  patientName?: string;
  disabled?: boolean;
  onSelect?: (name: string) => void;
}) {
  const lead = peptides[0];
  const rest = peptides.slice(1, 3);
  const titleName = (patientName || "").trim() || "this case";

  return (
      <section className="adviser-board" aria-label="Recommended peptides">
      <header className="adviser-board-head">
        <div className="adviser-board-intro">
          <h2>Recommendations for {titleName}</h2>
          <p>
            {peptides.length > 0
              ? "Based on your profile, goals and medical history, here are the best peptide options for this case."
              : message}
          </p>
        </div>
        {goal ? <p className="adviser-board-goal">{goal}</p> : null}
      </header>

      {lead ? (
        <FeatureCard peptide={lead} disabled={disabled} onSelect={onSelect} />
      ) : null}

      {rest.length > 0 ? (
        <div className="adviser-board-grid">
          {rest.map((peptide) => (
            <OptionCard key={`${peptide.rank}-${peptide.name}`} peptide={peptide} disabled={disabled} onSelect={onSelect} />
          ))}
        </div>
      ) : null}
      </section>
  );
}

function FeatureCard({
  peptide,
  disabled,
  onSelect,
}: {
  peptide: RecommendationBoardPeptide;
  disabled?: boolean;
  onSelect?: (name: string) => void;
}) {
  const summary = (peptide.description || peptide.fit || "").trim();
  const reasons = peptideReasons(peptide, summary);
  const fit = reasons[0] || summary;
  const pros = (peptide.advantages ?? []).filter(Boolean).slice(0, 2);
  const cons = (peptide.disadvantages ?? []).filter(Boolean).slice(0, 2);
  const evidence = peptide.evidence?.trim();
  const clickable = Boolean(onSelect) && !disabled;

  return (
    <article
      className={cn("adviser-feature", clickable && "adviser-feature--clickable")}
      onClick={clickable ? () => onSelect?.(peptide.name) : undefined}
    >
      <RecommendationVial name={peptide.name} size="feature" />
      <div className="adviser-feature-body">
        <span className="adviser-badge adviser-badge--top">{rankLabel(peptide.rank)}</span>
        <div className="adviser-feature-title">
          <h3>{peptide.name}</h3>
          {evidence ? (
            <span className="adviser-evidence">
              <CheckIcon soft />
              {evidence}
            </span>
          ) : null}
        </div>
        {fit ? <p className="adviser-feature-fit">{fit}</p> : null}
        <div className="adviser-feature-split">
          <div>
            <h4>Pros</h4>
            <NoteList items={pros} tone="pro" />
          </div>
          <div>
            <h4>Watch-outs</h4>
            <NoteList items={cons} tone="watch" />
          </div>
        </div>
        <DetailsButton name={peptide.name} disabled={disabled} onSelect={onSelect} />
      </div>
    </article>
  );
}

function OptionCard({
  peptide,
  disabled,
  onSelect,
}: {
  peptide: RecommendationBoardPeptide;
  disabled?: boolean;
  onSelect?: (name: string) => void;
}) {
  const summary = (peptide.description || peptide.fit || "").trim();
  const reasons = peptideReasons(peptide, summary);
  const fit = reasons[0] || summary;
  const pros = (peptide.advantages ?? []).filter(Boolean).slice(0, 2);
  const cons = (peptide.disadvantages ?? []).filter(Boolean).slice(0, 2);
  const evidence = peptide.evidence?.trim();
  const clickable = Boolean(onSelect) && !disabled;

  return (
    <article
      className={cn("adviser-option", clickable && "adviser-option--clickable")}
      onClick={clickable ? () => onSelect?.(peptide.name) : undefined}
    >
      <div className="adviser-option-top">
        <RecommendationVial name={peptide.name} size="thumb" />
        <div className="adviser-option-heading">
          <span className="adviser-badge">{rankLabel(peptide.rank)}</span>
          <h3>{peptide.name}</h3>
          {evidence ? (
            <span className="adviser-evidence">
              <CheckIcon soft />
              {evidence}
            </span>
          ) : null}
        </div>
      </div>
      {fit ? (
        <div className="adviser-option-block">
          <h4>Why it fits</h4>
          <p>{fit}</p>
        </div>
      ) : null}
      {pros.length > 0 ? (
        <div className="adviser-option-block">
          <h4>Pros</h4>
          <NoteList items={pros} tone="pro" />
        </div>
      ) : null}
      {cons.length > 0 ? (
        <div className="adviser-option-block">
          <h4>Watch-outs</h4>
          <NoteList items={cons} tone="watch" />
        </div>
      ) : null}
      <DetailsButton name={peptide.name} disabled={disabled} onSelect={onSelect} />
    </article>
  );
}

function MessageActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="adviser-chat-ai-action inline-flex items-center gap-[3px]"
    >
      {children}
    </button>
  );
}
