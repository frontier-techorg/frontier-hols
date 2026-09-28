from typing import Any, List, Optional

from pydantic import BaseModel, Field

from models.common import ApiSuccessResponse
from models.users import PaginationMeta


class Source(BaseModel):
    course_name: str
    l1_name: str = ""
    l2_name: str = ""
    lesson_id: str = ""
    preview: str = ""


class IntakeRequest(BaseModel):
    answers: dict = Field(..., description="All questionnaire answers keyed by question id")
    top_k: Optional[int] = Field(default=None, ge=1, le=20)


class IntakeResponse(BaseModel):
    evaluation: dict
    answer: str
    sources: List[Source] = []


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=8000)


class FollowUpRequest(BaseModel):
    answers: dict
    evaluation: dict
    recommendation: str = Field(..., min_length=1)
    messages: List[ChatMessage] = Field(default_factory=list)
    question: str = Field(..., min_length=1, max_length=2000)
    top_k: Optional[int] = Field(default=None, ge=1, le=20)


class FollowUpResponse(BaseModel):
    answer: str
    sources: List[Source] = []


class CreatePatientRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=120)


class SaveIntakeRequest(BaseModel):
    answers: dict = Field(default_factory=dict)
    display_name: Optional[str] = Field(default=None, max_length=120)


class SendMessageRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)


class ChatReplyData(BaseModel):
    answer: str
    suggested_questions: List[str] = Field(default_factory=list, max_length=3)


class PatientSummary(BaseModel):
    patient_id: str
    display_name: str
    status: str
    primary_goal: Optional[str] = None
    has_recommendation: bool = False
    message_count: int = 0
    created_at: str
    updated_at: str


class StoredChatMessage(BaseModel):
    message_id: str
    role: str
    content: str
    created_at: str
    kind: Optional[str] = None
    suggested_questions: Optional[List[str]] = None


class ChatMessagesPagination(BaseModel):
    total: int
    limit: int
    has_older: bool
    oldest_message_id: Optional[str] = None
    newest_message_id: Optional[str] = None


class PatientMessagesData(BaseModel):
    messages: List[StoredChatMessage]
    pagination: ChatMessagesPagination


class PatientDetail(BaseModel):
    patient_id: str
    display_name: str
    status: str
    intake_answers: dict[str, Any] = Field(default_factory=dict)
    evaluation: Optional[dict[str, Any]] = None
    recommendation: Optional[str] = None
    recommendation_board: Optional[dict[str, Any]] = None
    sources: List[dict[str, Any]] = Field(default_factory=list)
    primary_goal: Optional[str] = None
    message_count: int = 0
    turns_used: int = 0
    turns_max: int = 50
    messages: List[StoredChatMessage] = Field(default_factory=list)
    messages_pagination: Optional[ChatMessagesPagination] = None
    created_at: str
    updated_at: str


class PatientListData(BaseModel):
    patients: List[PatientSummary]
    total: int
    pagination: PaginationMeta


class ChatInfoData(BaseModel):
    name: str
    status: str
    collection: str
    chat_model: str
    embed_model: str
    flow_version: str


class AdviserBootstrapData(BaseModel):
    info: ChatInfoData
    flow: dict[str, Any]
    patients: List[PatientSummary]
    total: int
    pagination: Optional[PaginationMeta] = None
    active_patient: Optional[PatientDetail] = None
    active_patient_id: Optional[str] = None


class ChatHealthData(BaseModel):
    ok: bool
    vectors: int


PatientDetailResponse = ApiSuccessResponse[PatientDetail]
ChatReplyResponse = ApiSuccessResponse[ChatReplyData]
PatientListResponse = ApiSuccessResponse[PatientListData]
PatientMessagesResponse = ApiSuccessResponse[PatientMessagesData]
AdviserBootstrapResponse = ApiSuccessResponse[AdviserBootstrapData]
ChatInfoResponse = ApiSuccessResponse[ChatInfoData]
ChatHealthResponse = ApiSuccessResponse[ChatHealthData]
IntakeResponseEnvelope = ApiSuccessResponse[IntakeResponse]
FollowUpResponseEnvelope = ApiSuccessResponse[FollowUpResponse]
