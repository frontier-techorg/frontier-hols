export type ChatHealth = {
  ok: boolean;
  vectors: number;
};

export type ChatInfo = {
  name: string;
  status: string;
  collection: string;
  chat_model: string;
  embed_model: string;
  flow_version: string;
};

export type QuestionOption = string | { value: string; label: string };

export type FlowQuestion = {
  id: string;
  text: string;
  type: "number" | "select" | "multiselect" | "textarea" | "text";
  options?: QuestionOption[];
  required?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
  show_if?: Record<string, string>;
};

export type FlowStage = {
  id: string;
  title: string;
  description?: string;
  dynamic?: boolean;
  questions?: FlowQuestion[];
  branches?: Record<string, FlowQuestion[]>;
};

export type QuestionnaireFlow = {
  version: string;
  consent: {
    text: string;
    confirm_label: string;
  };
  stages: FlowStage[];
  goal_branches: Record<string, { id: string; label: string }>;
};

export type IntakeAnswers = Record<string, unknown>;

export type IntakeEvaluation = {
  safety?: {
    hard_stops?: string[];
    cautions?: string[];
    flags?: string[];
    intake_blocked?: boolean;
    bmi?: number;
  };
  primary_goal?: string;
  secondary_goal?: string | null;
  recommendations?: Array<{
    name: string;
    best_when?: string;
    evidence?: string;
    tags?: string[];
    score?: number;
  }>;
  labs?: string[];
  stacks?: string[];
  disclaimer?: string;
  [key: string]: unknown;
};

export type BoardConfidence = "conservative" | "balanced" | "aggressive";

export type RecommendationBoardPeptide = {
  rank: number;
  name: string;
  description?: string;
  why?: string[];
  advantages?: string[];
  disadvantages?: string[];
  evidence?: string;
  fit?: string;
  score?: number | null;
  tags?: string[];
};

export type RecommendationBoard = {
  primary_goal?: string | null;
  secondary_goal?: string | null;
  confidence: BoardConfidence | string;
  preferred?: string | null;
  ranked: RecommendationBoardPeptide[];
  labs: string[];
  stacks: string[];
  safety: {
    status: "clear" | "caution" | "blocked" | string;
    hard_stops?: string[];
    cautions?: string[];
    flags?: string[];
  };
  reply: string;
  chips: string[];
  suggested_questions?: string[];
  disclaimer?: string;
};

export type PatientSummary = {
  patient_id: string;
  display_name: string;
  status: "draft" | "recommended" | "chatting";
  primary_goal?: string | null;
  has_recommendation: boolean;
  message_count: number;
  created_at: string;
  updated_at: string;
};

export type StoredChatMessage = {
  message_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  kind?: string;
  suggested_questions?: string[] | null;
};

export type ChatReply = {
  answer: string;
  suggested_questions: string[];
};

export type ChatMessagesPagination = {
  total: number;
  limit: number;
  has_older: boolean;
  oldest_message_id?: string | null;
  newest_message_id?: string | null;
};

export type PatientMessagesData = {
  messages: StoredChatMessage[];
  pagination: ChatMessagesPagination;
};

export type PatientDetail = {
  patient_id: string;
  display_name: string;
  status: "draft" | "recommended" | "chatting";
  intake_answers: IntakeAnswers;
  evaluation?: IntakeEvaluation | null;
  recommendation?: string | null;
  recommendation_board?: RecommendationBoard | null;
  sources?: Array<Record<string, string>>;
  primary_goal?: string | null;
  message_count?: number;
  turns_used?: number;
  turns_max?: number;
  messages: StoredChatMessage[];
  messages_pagination?: ChatMessagesPagination | null;
  created_at: string;
  updated_at: string;
};

export type PatientListParams = {
  page?: number;
  limit?: number;
  q?: string;
  status?: "all" | "progress" | "chat";
  sort?: "newest" | "oldest";
};

export type PatientListPagination = {
  page: number;
  limit: number;
  total: number;
  total_pages?: number;
  has_next: boolean;
  has_previous?: boolean;
  next_page?: number | null;
  previous_page?: number | null;
};

export type PatientListData = {
  patients: PatientSummary[];
  total: number;
  pagination: PatientListPagination;
};

export type AdviserBootstrapData = {
  info: ChatInfo;
  flow: QuestionnaireFlow;
  patients: PatientSummary[];
  total: number;
  pagination?: PatientListPagination | null;
  active_patient?: PatientDetail | null;
  active_patient_id?: string | null;
};
