import { useCallback, useState } from "react";
import type { ButtonState } from "@/components/motion/button/stateful";
import { releaseWorkspace } from "./fixtures/release-workspace";
import { ChatWorkspace } from "./components/workspace/chat-workspace";
import type {
  ChatApprovalDecision,
  ChatResource,
  ChatUserView,
  ChatWorkspaceData,
} from "./model";

export type ChatFeatureProps = {
  user: ChatUserView;
  workspace?: ChatWorkspaceData;
  signOutError: string;
  signOutStatus: ButtonState;
  composerLoading?: boolean;
  onNewTask?: () => void;
  onSearch?: () => void;
  onRuns?: () => void;
  onResourcesChange?: (resources: ChatResource[]) => void;
  onComposerSubmit?: (value: string, model?: string) => void | Promise<void>;
  onComposerStop?: () => void;
  onModelChange?: (model: string) => void;
  onApprovalDecision?: (
    blockId: string,
    decision: ChatApprovalDecision,
  ) => void;
  onSignOut: () => void;
};

export function ChatFeature({
  user,
  workspace = releaseWorkspace,
  signOutError,
  signOutStatus,
  composerLoading = false,
  onNewTask,
  onSearch,
  onRuns,
  onResourcesChange,
  onComposerSubmit,
  onComposerStop,
  onModelChange,
  onApprovalDecision,
  onSignOut,
}: ChatFeatureProps) {
  const [activeResourceId, setActiveResourceId] = useState(
    workspace.activeResourceId,
  );
  const [resources, setResources] = useState(workspace.resources);
  const [reasoningEffort, setReasoningEffort] = useState(
    workspace.reasoningOptions.find((option) => option.value === "medium")
      ?.value ?? workspace.reasoningOptions[0]?.value ?? "",
  );
  const [fastMode, setFastMode] = useState(false);
  const updateResources = useCallback(
    (nextResources: ChatResource[]) => {
      setResources(nextResources);
      onResourcesChange?.(nextResources);
    },
    [onResourcesChange],
  );

  return (
    <ChatWorkspace
      data={workspace}
      resources={resources}
      user={user}
      activeResourceId={activeResourceId}
      reasoningEffort={reasoningEffort}
      fastMode={fastMode}
      signOutError={signOutError}
      signOutStatus={signOutStatus}
      composerLoading={composerLoading}
      onResourceSelect={setActiveResourceId}
      onResourcesChange={updateResources}
      onNewTask={onNewTask}
      onSearch={onSearch}
      onRuns={onRuns}
      onComposerSubmit={onComposerSubmit}
      onComposerStop={onComposerStop}
      onModelChange={onModelChange}
      onApprovalDecision={onApprovalDecision}
      onReasoningChange={setReasoningEffort}
      onSpeedChange={setFastMode}
      onSignOut={onSignOut}
    />
  );
}
