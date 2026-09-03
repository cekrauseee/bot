import type { BrowserFrame } from "@/features/conversation/model"
import type { BrowserFrameScene } from "@/features/conversation-simulator/scenario"

type MockBrowserScene = {
  accent: string
  eyebrow: string
  heading: string
  path: string
  rows: Array<[string, string]>
}

const scenes: Record<BrowserFrameScene, MockBrowserScene> = {
  starting: {
    accent: "#667085",
    eyebrow: "Secure browser session",
    heading: "Opening market report…",
    path: "example.com/market-report",
    rows: [
      ["Connecting", "Encrypted session"],
      ["Loading", "Research workspace"],
    ],
  },
  results: {
    accent: "#6750a4",
    eyebrow: "Market intelligence · 2026",
    heading: "Competitive workspace report",
    path: "example.com/market-report",
    rows: [
      ["Northstar", "Workflow-first · €24 seat"],
      ["Relay", "Automation-first · €30 seat"],
      ["Canvas", "Knowledge-first · €18 seat"],
    ],
  },
  approval: {
    accent: "#b54708",
    eyebrow: "Action required",
    heading: "Confirm report access",
    path: "example.com/market-report/access",
    rows: [
      ["Permission", "Read private benchmark"],
      ["Duration", "This browser session only"],
    ],
  },
  dashboard: {
    accent: "#067647",
    eyebrow: "Access confirmed",
    heading: "Market comparison dashboard",
    path: "example.com/market-report/dashboard",
    rows: [
      ["Products compared", "3"],
      ["Criteria analyzed", "8"],
      ["Sources verified", "12"],
    ],
  },
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
}

export function createMockBrowserFrame(
  sceneName?: BrowserFrameScene
): BrowserFrame | undefined {
  if (!sceneName || typeof document === "undefined") return undefined

  const scene = scenes[sceneName]
  const canvas = document.createElement("canvas")
  canvas.width = 1120
  canvas.height = 630
  const context = canvas.getContext("2d")
  if (!context) return undefined

  context.fillStyle = "#f5f6f8"
  context.fillRect(0, 0, canvas.width, canvas.height)

  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, 76)
  context.fillStyle = "#d0d5dd"
  context.fillRect(0, 75, canvas.width, 1)
  ;["#f97066", "#fdb022", "#32d583"].forEach((color, index) => {
    context.fillStyle = color
    context.beginPath()
    context.arc(28 + index * 24, 38, 7, 0, Math.PI * 2)
    context.fill()
  })

  roundedRect(context, 132, 20, 850, 38, 9)
  context.fillStyle = "#f2f4f7"
  context.fill()
  context.fillStyle = "#475467"
  context.font = "500 16px Inter, system-ui, sans-serif"
  context.fillText(scene.path, 154, 45)

  context.fillStyle = scene.accent
  context.fillRect(0, 76, 12, canvas.height - 76)
  context.fillStyle = "#667085"
  context.font = "600 18px Inter, system-ui, sans-serif"
  context.fillText(scene.eyebrow.toUpperCase(), 82, 152)
  context.fillStyle = "#101828"
  context.font = "650 42px Inter, system-ui, sans-serif"
  context.fillText(scene.heading, 82, 208)

  scene.rows.forEach(([label, value], index) => {
    const y = 260 + index * 92
    roundedRect(context, 82, y, 956, 68, 14)
    context.fillStyle = "#ffffff"
    context.fill()
    context.strokeStyle = "#e4e7ec"
    context.lineWidth = 1
    context.stroke()
    context.fillStyle = "#344054"
    context.font = "600 18px Inter, system-ui, sans-serif"
    context.fillText(label, 108, y + 41)
    context.fillStyle = "#667085"
    context.font = "500 18px Inter, system-ui, sans-serif"
    const valueWidth = context.measureText(value).width
    context.fillText(value, 1010 - valueWidth, y + 41)
  })

  const encoded = canvas.toDataURL("image/png")
  return {
    base64: encoded.slice(encoded.indexOf(",") + 1),
    capturedAt: new Date().toISOString(),
    mimeType: "image/png",
  }
}
