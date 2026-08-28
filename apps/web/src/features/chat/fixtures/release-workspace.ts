import type { ChatWorkspaceData } from "@/features/chat/model";

export const releaseWorkspace: ChatWorkspaceData = {
  title: "Checkout release",
  subtitle: "Agent workspace · focused patch",
  connection: { label: "Connected", status: "connected" },
  activeResourceId: "checkout-audit",
  expandedResourceIds: ["release-workspace", "design-system"],
  resources: [
    {
      id: "release-workspace",
      label: "Release workspace",
      kind: "folder",
      children: [
        { id: "checkout-audit", label: "Checkout audit", kind: "file" },
        { id: "release-notes", label: "Release notes", kind: "file" },
        { id: "research-sources", label: "Research sources", kind: "bookmark" },
      ],
    },
    {
      id: "design-system",
      label: "Design system",
      kind: "folder",
      children: [
        { id: "motion-tokens", label: "Motion tokens", kind: "file" },
        {
          id: "component-inventory",
          label: "Component inventory",
          kind: "file",
        },
      ],
    },
    { id: "archived-runs", label: "Archived runs", kind: "folder" },
  ],
  messages: [
    {
      id: "request",
      role: "user",
      blocks: [
        {
          id: "request-text",
          type: "text",
          content:
            "Audit the checkout flow, fix the validation gap, and prepare a release-ready patch.",
        },
      ],
    },
    {
      id: "run",
      role: "assistant",
      blocks: [
        {
          id: "run-activity",
          type: "activity",
          status: "complete",
          summary: "Completed 3 steps",
          items: [
            {
              id: "activity-1",
              type: "step",
              label:
                "Tracing the checkout submission path and validation boundary.",
            },
            {
              id: "activity-2",
              type: "search",
              query: "order validation failures",
              results: [
                {
                  id: "activity-source",
                  title: "Internal interface notes",
                  domain: "workspace docs",
                },
              ],
            },
          ],
        },
        {
          id: "run-plan",
          type: "todo-list",
          title: "Release plan",
          defaultOpen: true,
          items: [
            {
              id: "plan-1",
              title: "Inspect the checkout flow",
              status: "completed",
            },
            {
              id: "plan-2",
              title: "Prepare the validation patch",
              status: "completed",
            },
            { id: "plan-3", title: "Run focused checks", status: "pending" },
            {
              id: "plan-4",
              title: "Collect release approval",
              status: "pending",
            },
          ],
        },
        {
          id: "run-approval",
          type: "tool-approval",
          defaultOpen: true,
          approval: {
            tool: "terminal.run",
            title: "Run focused checkout checks?",
            description:
              "The agent needs permission to run the validation and accessibility suites.",
            parameters: [
              {
                id: "command",
                label: "Command",
                value: "bun test checkout --coverage",
              },
              { id: "scope", label: "Scope", value: "Current workspace" },
            ],
          },
        },
      ],
    },
    {
      id: "approval",
      role: "assistant",
      blocks: [
        {
          id: "approval-text",
          type: "text",
          content:
            "The validation boundary is ready for review. I’ll wait for your approval before running the focused checks.",
        },
      ],
    },
  ],
  models: [
    { value: "gpt-5.6-sol", label: "GPT 5.6 Sol" },
    { value: "gpt-5.6-luna", label: "GPT 5.6 Luna" },
  ],
  reasoningOptions: [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "xhigh", label: "Extra high" },
    { value: "max", label: "Max" },
  ],
};
