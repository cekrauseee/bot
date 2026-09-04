import type { TurnStreamEvent } from "@/features/composer/api"

export type BrowserFrameScene =
  "approval" | "dashboard" | "results" | "starting"

export type SimulationPhase =
  | "browser"
  | "complete"
  | "orchestration"
  | "reasoning"
  | "ready"
  | "response"
  | "tools"
  | "user"

export type SimulationStep = {
  delayMs: number
  description: string
  event?: TurnStreamEvent
  frame?: BrowserFrameScene | null
  label: string
  phase: SimulationPhase
}

const RUN_ONE = "simulation-run-research"
const TURN_ONE = "simulation-turn-research"
const RUN_TWO = "simulation-run-follow-up"
const TURN_TWO = "simulation-turn-follow-up"

function event(
  sequence: number,
  type: string,
  data: Record<string, unknown>,
  runId = RUN_ONE,
  turnId = TURN_ONE
): TurnStreamEvent {
  return {
    data,
    run_id: runId,
    sequence: String(sequence),
    turn_id: turnId,
    type,
    version: 2,
  }
}

function message(
  id: string,
  role: "assistant" | "user",
  content: string,
  createdAt: string,
  status: "completed" | "streaming" = "completed"
) {
  return {
    id,
    role,
    content,
    status,
    created_at: createdAt,
    updated_at: createdAt,
  }
}

const step = (
  input: Omit<SimulationStep, "delayMs"> & { delayMs?: number }
): SimulationStep => ({ delayMs: 680, ...input })

export function createConversationSimulation(
  startedAt: number,
  prompt = "Research our three closest competitors, review the launch brief in our GitHub repository, and turn the findings into a launch plan."
): SimulationStep[] {
  const firstTurnAt = new Date(startedAt).toISOString()
  const secondTurnAt = new Date(startedAt + 28_000).toISOString()

  return [
    step({
      delayMs: 450,
      description: "The simulator is ready. Send a message or press play.",
      label: "Ready",
      phase: "ready",
    }),
    step({
      description: "The user message is accepted and an assistant turn begins.",
      event: event(1, "turn.started", {
        user_message: message("simulation-user-1", "user", prompt, firstTurnAt),
        assistant_message: message(
          "simulation-assistant-1",
          "assistant",
          "",
          firstTurnAt,
          "streaming"
        ),
      }),
      label: "Message sent",
      phase: "user",
    }),
    step({
      description: "Reasoning arrives as the first streamed process chunk.",
      event: event(2, "reasoning.delta", {
        delta:
          "I’ll split this into market research, product analysis, and a concise launch recommendation.",
      }),
      label: "Planning the work",
      phase: "reasoning",
    }),
    step({
      delayMs: 520,
      description:
        "A second adjacent chunk extends the same reasoning activity.",
      event: event(3, "reasoning.delta", {
        delta:
          " First I need current positioning and pricing, then I can validate the plan against the codebase.",
      }),
      label: "Refining the plan",
      phase: "reasoning",
    }),
    step({
      description: "A web search begins and remains visibly in progress.",
      event: event(4, "step.started", {
        step: {
          id: "market-search",
          kind: "web_search",
          label: "Competitive landscape",
          query: "AI workspace competitors pricing collaboration 2026",
          status: "in_progress",
        },
      }),
      label: "Searching the web",
      phase: "tools",
    }),
    step({
      delayMs: 820,
      description: "Search results arrive and expand into linked sources.",
      event: event(5, "step.completed", {
        step: {
          id: "market-search",
          kind: "web_search",
          label: "Competitive landscape",
          query: "AI workspace competitors pricing collaboration 2026",
          sources: [
            {
              id: "source-1",
              title: "Workspace plans and pricing",
              domain: "notion.so",
              url: "https://www.notion.so/pricing",
            },
            {
              id: "source-2",
              title: "AI assistant product overview",
              domain: "openai.com",
              url: "https://openai.com/",
            },
            {
              id: "source-3",
              title: "Team collaboration features",
              domain: "slack.com",
              url: "https://slack.com/features",
            },
          ],
          status: "completed",
        },
      }),
      label: "Sources found",
      phase: "tools",
    }),
    step({
      description:
        "A specialist subagent is delegated a bounded research task.",
      event: event(6, "child.started", {
        child: {
          id: "competitive-researcher",
          label: "Competitive research",
          detail: "Comparing positioning, pricing, and collaboration workflows",
          status: "in_progress",
        },
      }),
      label: "Delegating research",
      phase: "orchestration",
    }),
    step({
      frame: "starting",
      description:
        "The agent launches a browser and the picture-in-picture appears.",
      event: event(7, "tool.started", {
        tool: {
          id: "browser-open",
          name: "browser_open",
          target: "https://example.com/market-report",
          status: "in_progress",
        },
        browser_projection: {
          control: "agent",
          state: "launching",
          url: "https://example.com/market-report",
        },
      }),
      label: "Opening the browser",
      phase: "browser",
    }),
    step({
      frame: "results",
      description: "The browser becomes live and displays the research page.",
      event: event(8, "tool.completed", {
        tool: {
          id: "browser-open",
          name: "browser_open",
          target: "https://example.com/market-report",
          status: "completed",
        },
        browser_projection: {
          control: "agent",
          state: "live",
          url: "https://example.com/market-report",
        },
      }),
      label: "Browser live",
      phase: "browser",
    }),
    step({
      frame: "results",
      description: "The current page is inspected while the PiP remains live.",
      event: event(9, "tool.started", {
        tool: {
          id: "browser-snapshot",
          name: "browser_snapshot",
          status: "in_progress",
        },
        browser_projection: {
          control: "agent",
          state: "live",
          url: "https://example.com/market-report",
        },
      }),
      label: "Inspecting the page",
      phase: "browser",
    }),
    step({
      frame: "results",
      description:
        "The page inspection completes and stays grouped with browser work.",
      event: event(10, "tool.completed", {
        tool: {
          id: "browser-snapshot",
          name: "browser_snapshot",
          status: "completed",
        },
        browser_projection: {
          control: "agent",
          state: "live",
          url: "https://example.com/market-report",
        },
      }),
      label: "Page inspected",
      phase: "browser",
    }),
    step({
      frame: "approval",
      description:
        "The agent reaches a protected action and requests user control.",
      event: event(11, "tool.started", {
        tool: {
          id: "browser-type",
          name: "browser_type",
          detail: "Approval required before continuing",
          status: "in_progress",
        },
        browser_projection: {
          control: "user",
          message: "Confirm access to the full market report.",
          state: "awaiting_user",
          url: "https://example.com/market-report/access",
        },
      }),
      label: "Waiting for user input",
      phase: "browser",
    }),
    step({
      delayMs: 1_150,
      frame: "approval",
      description:
        "Playback holds on the intervention state for visual inspection.",
      label: "User has browser control",
      phase: "browser",
    }),
    step({
      frame: "dashboard",
      description: "Control returns to the agent and browser work continues.",
      event: event(12, "tool.completed", {
        tool: {
          id: "browser-type",
          name: "browser_type",
          status: "completed",
        },
        browser_projection: {
          control: "agent",
          state: "live",
          url: "https://example.com/market-report/dashboard",
        },
      }),
      label: "Control returned",
      phase: "browser",
    }),
    step({
      description:
        "The delegated agent returns its findings to the parent turn.",
      event: event(13, "child.completed", {
        child: {
          id: "competitive-researcher",
          label: "Competitive research",
          detail: "3 competitors compared across 8 criteria",
          status: "completed",
        },
      }),
      label: "Subagent completed",
      phase: "orchestration",
    }),
    step({
      description: "The parent agent integrates the delegated result.",
      event: event(14, "reasoning.delta", {
        delta:
          "The market signal is clear. Now I’ll inspect the connected GitHub repository and validate the recommendation against the team’s launch brief.",
      }),
      label: "Synthesizing findings",
      phase: "reasoning",
    }),
    step({
      description:
        "The GitHub skill starts loading before repository tools are used.",
      event: event(15, "skill.started", {
        skill: {
          id: "github-skill",
          name: "github",
          detail: "Repository inspection guidance",
          status: "in_progress",
        },
      }),
      label: "Loading GitHub skill",
      phase: "tools",
    }),
    step({
      description: "The GitHub guidance is ready for the current run.",
      event: event(16, "skill.completed", {
        skill: {
          id: "github-skill",
          name: "github",
          detail: "Repository inspection guidance",
          status: "completed",
        },
      }),
      label: "GitHub skill loaded",
      phase: "tools",
    }),
    step({
      description:
        "The connected GitHub MCP starts searching the account’s repositories.",
      event: event(17, "tool.started", {
        tool: {
          id: "github-search-repositories",
          name: "search_repositories",
          target: "org:acme workspace launch",
          status: "in_progress",
        },
      }),
      label: "Searching GitHub repositories",
      phase: "tools",
    }),
    step({
      description: "The repository search resolves to the product repository.",
      event: event(18, "tool.completed", {
        tool: {
          id: "github-search-repositories",
          name: "search_repositories",
          target: "org:acme workspace launch",
          status: "completed",
        },
      }),
      label: "GitHub repository found",
      phase: "tools",
    }),
    step({
      description: "The GitHub MCP starts reading a file from the main branch.",
      event: event(19, "tool.started", {
        tool: {
          id: "github-read-launch-brief",
          name: "get_file_contents",
          target: "acme/atlas/product/launch-brief.md @ refs/heads/main",
          status: "in_progress",
        },
      }),
      label: "Reading from GitHub",
      phase: "tools",
    }),
    step({
      description:
        "The repository file read completes and remains grouped with the search.",
      event: event(20, "tool.completed", {
        tool: {
          id: "github-read-launch-brief",
          name: "get_file_contents",
          target: "acme/atlas/product/launch-brief.md @ refs/heads/main",
          status: "completed",
        },
      }),
      label: "GitHub brief read",
      phase: "tools",
    }),
    step({
      description: "The agent starts inspecting a workspace file.",
      event: event(21, "tool.started", {
        tool: {
          id: "read-brief",
          name: "filesystem_read",
          target: "/workspace/product/launch-brief.md",
          status: "in_progress",
        },
      }),
      label: "Reading the brief",
      phase: "tools",
    }),
    step({
      description: "The read completes and its status changes in place.",
      event: event(22, "tool.completed", {
        tool: {
          id: "read-brief",
          name: "filesystem_read",
          target: "/workspace/product/launch-brief.md",
          status: "completed",
        },
      }),
      label: "Brief read",
      phase: "tools",
    }),
    step({
      description: "A launch plan artifact is written to the workspace.",
      event: event(23, "tool.started", {
        tool: {
          id: "write-plan",
          name: "filesystem_write",
          target: "/workspace/product/launch-plan.md",
          status: "in_progress",
        },
      }),
      label: "Writing the plan",
      phase: "tools",
    }),
    step({
      description: "The file update completes.",
      event: event(24, "tool.completed", {
        tool: {
          id: "write-plan",
          name: "filesystem_write",
          target: "/workspace/product/launch-plan.md",
          status: "completed",
        },
      }),
      label: "Plan written",
      phase: "tools",
    }),
    step({
      description: "The agent starts a verification command.",
      event: event(25, "tool.started", {
        tool: {
          id: "verify-plan",
          name: "shell_exec",
          target: "npm run validate:launch-plan",
          status: "in_progress",
        },
      }),
      label: "Running validation",
      phase: "tools",
    }),
    step({
      delayMs: 850,
      description: "The command succeeds and the process is ready to answer.",
      event: event(26, "tool.completed", {
        tool: {
          id: "verify-plan",
          name: "shell_exec",
          target: "npm run validate:launch-plan",
          status: "completed",
        },
      }),
      label: "Validation passed",
      phase: "tools",
    }),
    step({
      delayMs: 420,
      description: "The assistant response begins streaming below the process.",
      event: event(27, "text.delta", {
        delta:
          "I compared the market, reviewed the launch brief in `acme/atlas`, and drafted the launch plan. **The clearest wedge is operational clarity**: make every handoff, browser action, and delegated task visible without making the interface feel busy.\n\n",
      }),
      label: "Streaming the answer",
      phase: "response",
    }),
    step({
      delayMs: 470,
      description: "A second answer chunk adds the recommendation list.",
      event: event(28, "text.delta", {
        delta:
          "1. Lead with transparent execution, not model choice.\n2. Package browser work as a visible, resumable capability.\n3. Show delegation as a compact chain with clear ownership.\n\n",
      }),
      label: "Streaming recommendations",
      phase: "response",
    }),
    step({
      delayMs: 540,
      description: "The final answer chunk links the created artifact.",
      event: event(29, "text.delta", {
        delta:
          "I also created `product/launch-plan.md` with positioning, rollout phases, success metrics, and the source comparison.",
      }),
      label: "Finishing the answer",
      phase: "response",
    }),
    step({
      delayMs: 900,
      description: "The first turn completes and all active indicators settle.",
      event: event(30, "turn.completed", {}),
      frame: null,
      label: "Turn completed",
      phase: "complete",
    }),
    step({
      description: "A follow-up user message starts a second turn.",
      event: event(
        31,
        "turn.started",
        {
          user_message: message(
            "simulation-user-2",
            "user",
            "Condense that into the three decisions I need to make today.",
            secondTurnAt
          ),
          assistant_message: message(
            "simulation-assistant-2",
            "assistant",
            "",
            secondTurnAt,
            "streaming"
          ),
        },
        RUN_TWO,
        TURN_TWO
      ),
      label: "Follow-up sent",
      phase: "user",
    }),
    step({
      description: "The assistant reasons briefly using the existing context.",
      event: event(
        32,
        "reasoning.delta",
        {
          delta:
            "I’ll convert the research into decisions with an owner and a deadline, without repeating the full analysis.",
        },
        RUN_TWO,
        TURN_TWO
      ),
      label: "Using conversation context",
      phase: "reasoning",
    }),
    step({
      delayMs: 430,
      description: "The concise response starts streaming.",
      event: event(
        33,
        "text.delta",
        {
          delta:
            "Decide today: **(1)** which workflow becomes the launch demo, **(2)** where user approval is mandatory in browser runs, and **(3)** which one metric defines a successful first month. ",
        },
        RUN_TWO,
        TURN_TWO
      ),
      label: "Streaming follow-up",
      phase: "response",
    }),
    step({
      delayMs: 480,
      description: "The assistant completes the actionable follow-up.",
      event: event(
        34,
        "text.delta",
        {
          delta:
            "My recommendation: demo competitive research, require approval before any external write, and optimize for completed multi-step tasks per active team.",
        },
        RUN_TWO,
        TURN_TWO
      ),
      label: "Finishing follow-up",
      phase: "response",
    }),
    step({
      delayMs: 1_200,
      description:
        "The full two-turn scenario is complete and can loop from the start.",
      event: event(35, "turn.completed", {}, RUN_TWO, TURN_TWO),
      label: "Scenario completed",
      phase: "complete",
    }),
  ]
}
