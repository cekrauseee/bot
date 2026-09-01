import {
  ApprovalCard,
  type ApprovalCardAnswers,
  type ApprovalCardStatus,
} from "@/components/agents/approval-card";
import type {
  ChatQuestionAnswers,
  ChatQuestionRequest,
} from "@/features/chat/model";

const approvalStatus = (
  status: ChatQuestionRequest["status"],
): ApprovalCardStatus => {
  if (status === "submitting") return "submitting";
  if (status === "answered") return "answered";
  if (status === "cancelled" || status === "error") return "rejected";
  return "pending";
};

export function AskUserQuestion({
  request,
  onSubmit,
}: {
  request: ChatQuestionRequest;
  onSubmit?: (answers: ChatQuestionAnswers) => void;
}) {
  return (
    <ApprovalCard
      title={request.title}
      description={request.description}
      questions={request.questions.map((question) => ({
        ...question,
        autoAdvance: false,
      }))}
      status={approvalStatus(request.status)}
      answers={request.answers}
      result={request.result}
      submitLabel="Send answer"
      onSubmit={onSubmit
        ? (answers: ApprovalCardAnswers) => onSubmit(answers)
        : undefined}
      className="max-w-3xl"
    />
  );
}
