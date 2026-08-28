import type { ButtonState } from "@/components/motion/button/stateful";
import { AnimatedSidebarInset } from "@/components/motion/animated-sidebar";
import type {
  ChatApprovalDecision,
  ChatResource,
  ChatUserView,
  ChatWorkspaceData,
} from "@/features/chat/model";
import { ChatComposer } from "../composer/chat-composer";
import { ChatMessageList } from "../messages/chat-message-list";
import { ChatSidebar } from "../sidebar/chat-sidebar";
import { ChatHeader } from "./chat-header";
import { ChatShell } from "./chat-shell";

export type ChatWorkspaceProps = {
  data: ChatWorkspaceData;
  resources: ChatResource[];
  user: ChatUserView;
  activeResourceId: string | null;
  reasoningEffort: string;
  fastMode: boolean;
  signOutError: string;
  signOutStatus: ButtonState;
  composerLoading: boolean;
  onResourceSelect: (id: string) => void;
  onResourcesChange: (resources: ChatResource[]) => void;
  onNewTask?: () => void;
  onSearch?: () => void;
  onRuns?: () => void;
  onComposerSubmit?: (value: string, model?: string) => void | Promise<void>;
  onComposerStop?: () => void;
  onModelChange?: (model: string) => void;
  onApprovalDecision?: (
    blockId: string,
    decision: ChatApprovalDecision,
  ) => void;
  onReasoningChange: (value: string) => void;
  onSpeedChange: (value: boolean) => void;
  onSignOut: () => void;
};

export function ChatWorkspace({
  data,
  resources,
  user,
  activeResourceId,
  reasoningEffort,
  fastMode,
  signOutError,
  signOutStatus,
  composerLoading,
  onResourceSelect,
  onResourcesChange,
  onNewTask,
  onSearch,
  onRuns,
  onComposerSubmit,
  onComposerStop,
  onModelChange,
  onApprovalDecision,
  onReasoningChange,
  onSpeedChange,
  onSignOut,
}: ChatWorkspaceProps) {
  return (
    <main className="min-h-svh bg-background">
      <ChatShell
        sidebarWidth="17rem"
        collapseSidebarBelow={600}
        className="min-h-svh rounded-none border-0"
      >
        <ChatSidebar
          resources={resources}
          activeResourceId={activeResourceId}
          expandedResourceIds={data.expandedResourceIds}
          user={user}
          signOutError={signOutError}
          signOutStatus={signOutStatus}
          onResourceSelect={onResourceSelect}
          onResourcesChange={onResourcesChange}
          onNewTask={onNewTask}
          onSearch={onSearch}
          onRuns={onRuns}
          onSignOut={onSignOut}
        />
        <AnimatedSidebarInset className="h-svh min-h-0">
          <ChatHeader
            title={data.title}
            subtitle={data.subtitle}
            connection={data.connection}
          />
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1">
              <ChatMessageList
                messages={data.messages}
                onApprovalDecision={onApprovalDecision}
              />
            </div>
            <ChatComposer
              models={data.models}
              reasoningOptions={data.reasoningOptions}
              reasoningEffort={reasoningEffort}
              fastMode={fastMode}
              loading={composerLoading}
              onSubmit={onComposerSubmit}
              onStop={onComposerStop}
              onModelChange={onModelChange}
              onReasoningChange={onReasoningChange}
              onSpeedChange={onSpeedChange}
            />
          </div>
        </AnimatedSidebarInset>
      </ChatShell>
    </main>
  );
}
