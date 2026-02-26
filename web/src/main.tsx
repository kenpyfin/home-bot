import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReadonlyJSONObject, ReadonlyJSONValue } from 'assistant-stream/utils'
import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  useMessage,
  useLocalRuntime,
  type ChatModelAdapter,
  type ChatModelRunOptions,
  type ChatModelRunResult,
  type ThreadMessageLike,
  type ToolCallMessagePartProps,
} from '@assistant-ui/react'
import {
  AssistantActionBar,
  AssistantMessage,
  BranchPicker,
  Thread,
  UserActionBar,
  UserMessage,
  makeMarkdownText,
} from '@assistant-ui/react-ui'
import {
  Button,
  Callout,
  Dialog,
  Flex,
  Heading,
  Select,
  Switch,
  Text,
  TextField,
  Theme,
} from '@radix-ui/themes'
import '@radix-ui/themes/styles.css'
import '@assistant-ui/react-ui/styles/index.css'
import './styles.css'
import { SessionSidebar } from './components/session-sidebar'
import type { SessionItem } from './types'

type ConfigPayload = Record<string, unknown>

type StreamEvent = {
  event: string
  payload: Record<string, unknown>
}

type BackendMessage = {
  id?: string
  sender_name?: string
  content?: string
  is_from_bot?: boolean
  timestamp?: string
}

type ToolStartPayload = {
  tool_use_id: string
  name: string
  input?: unknown
}

type ToolResultPayload = {
  tool_use_id: string
  name: string
  is_error?: boolean
  output?: unknown
  duration_ms?: number
  bytes?: number
  status_code?: number
  error_type?: string
}

type Appearance = 'dark' | 'light'
type UiTheme =
  | 'green'
  | 'blue'
  | 'slate'
  | 'amber'
  | 'violet'
  | 'rose'
  | 'cyan'
  | 'teal'
  | 'orange'
  | 'indigo'

const PROVIDER_SUGGESTIONS = [
  'openai',
  'ollama',
  'openrouter',
  'anthropic',
  'google',
  'alibaba',
  'deepseek',
  'moonshot',
  'mistral',
  'azure',
  'bedrock',
  'zhipu',
  'minimax',
  'cohere',
  'tencent',
  'xai',
  'huggingface',
  'together',
  'custom',
]

const MODEL_OPTIONS: Record<string, string[]> = {
  anthropic: ['claude-sonnet-4-5-20250929', 'claude-opus-4-1-20250805', 'claude-3-7-sonnet-latest'],
  openai: ['gpt-5.2', 'gpt-5', 'gpt-4.1'],
  ollama: ['llama3.2', 'qwen2.5', 'deepseek-r1'],
  openrouter: ['openai/gpt-5', 'anthropic/claude-sonnet-4-5', 'google/gemini-2.5-pro'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash'],
}

const DEFAULT_CONFIG_VALUES = {
  llm_provider: 'anthropic',
  max_tokens: 8192,
  max_tool_iterations: 100,
  max_document_size_mb: 100,
  show_thinking: false,
  web_enabled: true,
  web_host: '127.0.0.1',
  web_port: 10961,
}

const UI_THEME_OPTIONS: { key: UiTheme; label: string; color: string }[] = [
  { key: 'green', label: 'Green', color: '#34d399' },
  { key: 'blue', label: 'Blue', color: '#60a5fa' },
  { key: 'slate', label: 'Slate', color: '#94a3b8' },
  { key: 'amber', label: 'Amber', color: '#fbbf24' },
  { key: 'violet', label: 'Violet', color: '#a78bfa' },
  { key: 'rose', label: 'Rose', color: '#fb7185' },
  { key: 'cyan', label: 'Cyan', color: '#22d3ee' },
  { key: 'teal', label: 'Teal', color: '#2dd4bf' },
  { key: 'orange', label: 'Orange', color: '#fb923c' },
  { key: 'indigo', label: 'Indigo', color: '#818cf8' },
]

const RADIX_ACCENT_BY_THEME: Record<UiTheme, string> = {
  green: 'green',
  blue: 'blue',
  slate: 'gray',
  amber: 'amber',
  violet: 'violet',
  rose: 'ruby',
  cyan: 'cyan',
  teal: 'teal',
  orange: 'orange',
  indigo: 'indigo',
}

function defaultModelForProvider(providerRaw: string): string {
  const provider = providerRaw.trim().toLowerCase()
  if (provider === 'anthropic') return 'claude-sonnet-4-5-20250929'
  if (provider === 'ollama') return 'llama3.2'
  return 'gpt-5.2'
}

function readAppearance(): Appearance {
  const saved = localStorage.getItem('microclaw_appearance')
  return saved === 'light' ? 'light' : 'dark'
}

function saveAppearance(value: Appearance): void {
  localStorage.setItem('microclaw_appearance', value)
}

function readUiTheme(): UiTheme {
  const saved = localStorage.getItem('microclaw_ui_theme') as UiTheme | null
  return UI_THEME_OPTIONS.some((t) => t.key === saved) ? (saved as UiTheme) : 'green'
}

function saveUiTheme(value: UiTheme): void {
  localStorage.setItem('microclaw_ui_theme', value)
}

function writeSessionToUrl(sessionKey: string): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.set('session', sessionKey)
  window.history.replaceState(null, '', url.toString())
}

/** Stable default for web-only sessions; backend maps this to a fixed chat_id. */
const DEFAULT_WEB_SESSION_KEY = 'main'

function getInitialSessionKey(): string {
  if (typeof window === 'undefined') return DEFAULT_WEB_SESSION_KEY
  const fromUrl = new URLSearchParams(window.location.search).get('session')?.trim()
  return fromUrl || DEFAULT_WEB_SESSION_KEY
}

function pickLatestSessionKey(items: SessionItem[]): string {
  // Prefer web sessions so we don't land the user in a Telegram (read-only) chat.
  const webItems = items.filter((item) => item.chat_type === 'web')
  const candidates = webItems.length > 0 ? webItems : items

  if (candidates.length === 0) return DEFAULT_WEB_SESSION_KEY

  const parsed = candidates
    .map((item) => ({ item, ts: Date.parse(item.last_message_time || '') }))
    .filter((v) => Number.isFinite(v.ts))

  if (parsed.length > 0) {
    parsed.sort((a, b) => b.ts - a.ts)
    return parsed[0]?.item.session_key ?? DEFAULT_WEB_SESSION_KEY
  }

  return candidates[candidates.length - 1]?.session_key ?? DEFAULT_WEB_SESSION_KEY
}

if (typeof document !== 'undefined') {
  document.documentElement.classList.toggle('dark', readAppearance() === 'dark')
  document.documentElement.setAttribute('data-ui-theme', readUiTheme())
}

const WEB_AUTH_STORAGE_KEY = 'web_auth_token'

function getStoredAuthToken(): string | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const t = sessionStorage.getItem(WEB_AUTH_STORAGE_KEY)
    return t && t.trim() ? t.trim() : null
  } catch {
    return null
  }
}

function makeHeaders(options: RequestInit = {}): HeadersInit {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  }
  const token = getStoredAuthToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  return headers
}

export const AUTH_REQUIRED_EVENT = 'web-auth-required'

function messageForFailedResponse(status: number, data: Record<string, unknown>, bodyText?: string): string {
  if (status === 401) {
    return 'Unauthorized. Enter the API token (WEB_AUTH_TOKEN from .env).'
  }
  if (status === 429) {
    const serverMsg = String(data.error || data.message || bodyText || '').trim()
    return serverMsg
      ? `Too many requests: ${serverMsg} Please wait a moment before sending again.`
      : 'Too many requests. Please wait a moment before sending again.'
  }
  return String(data.error || data.message || bodyText || `HTTP ${status}`)
}

async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, { ...options, headers: makeHeaders(options) })
  const bodyText = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {}
  } catch {
    data = { message: bodyText || undefined }
  }
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT))
    throw new Error(messageForFailedResponse(401, data, bodyText))
  }
  if (!res.ok) {
    throw new Error(messageForFailedResponse(res.status, data, bodyText))
  }
  return data as T
}

async function* parseSseFrames(
  response: Response,
  signal: AbortSignal,
): AsyncGenerator<StreamEvent, void> {
  if (!response.body) {
    throw new Error('empty stream body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  let eventName = 'message'
  let dataLines: string[] = []

  const flush = (): StreamEvent | null => {
    if (dataLines.length === 0) return null
    const raw = dataLines.join('\n')
    dataLines = []

    let payload: Record<string, unknown> = {}
    try {
      payload = JSON.parse(raw) as Record<string, unknown>
    } catch {
      payload = { raw }
    }

    const event: StreamEvent = { event: eventName, payload }
    eventName = 'message'
    return event
  }

  const handleLine = (line: string): StreamEvent | null => {
    if (line === '') return flush()
    if (line.startsWith(':')) return null

    const sep = line.indexOf(':')
    const field = sep >= 0 ? line.slice(0, sep) : line
    let value = sep >= 0 ? line.slice(sep + 1) : ''
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'event') eventName = value
    if (field === 'data') dataLines.push(value)

    return null
  }

  while (true) {
    if (signal.aborted) return

    const { done, value } = await reader.read()
    pending += decoder.decode(value || new Uint8Array(), { stream: !done })

    while (true) {
      const idx = pending.indexOf('\n')
      if (idx < 0) break
      let line = pending.slice(0, idx)
      pending = pending.slice(idx + 1)
      if (line.endsWith('\r')) line = line.slice(0, -1)
      const event = handleLine(line)
      if (event) yield event
    }

    if (done) {
      if (pending.length > 0) {
        let line = pending
        if (line.endsWith('\r')) line = line.slice(0, -1)
        const event = handleLine(line)
        if (event) yield event
      }
      const event = flush()
      if (event) yield event
      return
    }
  }
}

function extractLatestUserText(messages: readonly ChatModelRunOptions['messages'][number][]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message.role !== 'user') continue

    const content = message.content
    let text: string

    if (typeof content === 'string') {
      text = content.trim()
    } else if (Array.isArray(content)) {
      text = content
        .map((part) => {
          if (part && typeof part === 'object' && part.type === 'text' && 'text' in part) {
            return typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : ''
          }
          return ''
        })
        .join('\n')
        .trim()
    } else if (content && typeof content === 'object' && !Array.isArray(content)) {
      // Single part object: { type: 'text', text: '...' }
      const part = content as { type?: string; text?: unknown }
      if (part.type === 'text' && typeof part.text === 'string') {
        text = part.text.trim()
      } else {
        continue
      }
    } else {
      continue
    }

    if (text.length > 0) {
      if (import.meta.env?.DEV && typeof console !== 'undefined' && console.debug) {
        console.debug('[extractLatestUserText]', text.slice(0, 80) + (text.length > 80 ? '…' : ''))
      }
      return text
    }
  }
  return ''
}

function mapBackendHistory(messages: BackendMessage[]): ThreadMessageLike[] {
  return messages.map((item, index) => ({
    id: item.id || `history-${index}`,
    role: item.is_from_bot ? 'assistant' : 'user',
    content: item.content || '',
    createdAt: item.timestamp ? new Date(item.timestamp) : new Date(),
  }))
}

function makeSessionKey(): string {
  return `session-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function toJsonValue(value: unknown): ReadonlyJSONValue {
  try {
    return JSON.parse(JSON.stringify(value)) as ReadonlyJSONValue
  } catch {
    return String(value)
  }
}

function toJsonObject(value: unknown): ReadonlyJSONObject {
  const normalized = toJsonValue(value)
  if (typeof normalized === 'object' && normalized !== null && !Array.isArray(normalized)) {
    return normalized as ReadonlyJSONObject
  }
  return {}
}

function formatUnknown(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function ToolCallCard(props: ToolCallMessagePartProps) {
  const result = asObject(props.result)
  const hasResult = Object.keys(result).length > 0
  const output = result.output
  const duration = result.duration_ms
  const bytes = result.bytes
  const statusCode = result.status_code
  const errorType = result.error_type

  return (
    <div className="tool-card">
      <div className="tool-card-head">
        <span className="tool-card-name">{props.toolName}</span>
        <span className={`tool-card-state ${hasResult ? (props.isError ? 'error' : 'ok') : 'running'}`}>
          {hasResult ? (props.isError ? 'error' : 'done') : 'running'}
        </span>
      </div>
      {Object.keys(props.args || {}).length > 0 ? (
        <pre className="tool-card-pre">{JSON.stringify(props.args, null, 2)}</pre>
      ) : null}
      {hasResult ? (
        <div className="tool-card-meta">
          {typeof duration === 'number' ? <span>{duration}ms</span> : null}
          {typeof bytes === 'number' ? <span>{bytes}b</span> : null}
          {typeof statusCode === 'number' ? <span>HTTP {statusCode}</span> : null}
          {typeof errorType === 'string' && errorType ? <span>{errorType}</span> : null}
        </div>
      ) : null}
      {output !== undefined ? <pre className="tool-card-pre">{formatUnknown(output)}</pre> : null}
    </div>
  )
}

function MessageTimestamp({ align }: { align: 'left' | 'right' }) {
  const createdAt = useMessage((m) => m.createdAt)
  const formatted = createdAt ? createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <div className={align === 'right' ? 'mc-msg-time mc-msg-time-right' : 'mc-msg-time'}>
      {formatted}
    </div>
  )
}

function CustomAssistantMessage() {
  const hasRenderableContent = useMessage((m) =>
    Array.isArray(m.content)
      ? m.content.some((part) => {
          if (part.type === 'text') return Boolean(part.text?.trim())
          return part.type === 'tool-call'
        })
      : false,
  )

  return (
    <AssistantMessage.Root>
      <AssistantMessage.Avatar />
      {hasRenderableContent ? (
        <AssistantMessage.Content />
      ) : (
        <div className="mc-assistant-placeholder" aria-live="polite">
          <span className="mc-assistant-placeholder-dot" />
          <span className="mc-assistant-placeholder-dot" />
          <span className="mc-assistant-placeholder-dot" />
          <span className="mc-assistant-placeholder-text">Thinking</span>
        </div>
      )}
      <BranchPicker />
      <AssistantActionBar />
      <MessageTimestamp align="left" />
    </AssistantMessage.Root>
  )
}

function CustomUserMessage() {
  return (
    <UserMessage.Root>
      <UserMessage.Attachments />
      <MessagePrimitive.If hasContent>
        <UserActionBar />
        <div className="mc-user-content-wrap">
          <UserMessage.Content />
          <MessageTimestamp align="right" />
        </div>
      </MessagePrimitive.If>
      <BranchPicker />
    </UserMessage.Root>
  )
}

type ThreadPaneProps = {
  adapter: ChatModelAdapter
  initialMessages: ThreadMessageLike[]
  runtimeKey: string
}

function ThreadPane({ adapter, initialMessages, runtimeKey }: ThreadPaneProps) {
  const MarkdownText = makeMarkdownText()
  const runtime = useLocalRuntime(adapter, {
    initialMessages,
    maxSteps: 100,
  })

  return (
    <AssistantRuntimeProvider key={runtimeKey} runtime={runtime}>
      <div className="aui-root h-full min-h-0">
        <Thread
          assistantMessage={{
            allowCopy: true,
            allowReload: false,
            allowSpeak: false,
            allowFeedbackNegative: false,
            allowFeedbackPositive: false,
            components: {
              Text: MarkdownText,
              ToolFallback: ToolCallCard,
            },
          }}
          userMessage={{ allowEdit: false }}
          composer={{ allowAttachments: false }}
          components={{
            AssistantMessage: CustomAssistantMessage,
            UserMessage: CustomUserMessage,
          }}
          strings={{
            composer: {
              input: { placeholder: 'Message MicroClaw...' },
            },
          }}
          assistantAvatar={{ fallback: 'M' }}
        />
      </div>
    </AssistantRuntimeProvider>
  )
}

function App() {
  const [appearance, setAppearance] = useState<Appearance>(readAppearance())
  const [uiTheme, setUiTheme] = useState<UiTheme>(readUiTheme())
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [extraSessions, setExtraSessions] = useState<SessionItem[]>([])
  const [sessionKey, setSessionKey] = useState<string>(() => getInitialSessionKey())
  const [historySeed, setHistorySeed] = useState<ThreadMessageLike[]>([])
  const [historyCountBySession, setHistoryCountBySession] = useState<Record<string, number>>({})
  const [runtimeNonce, setRuntimeNonce] = useState<number>(0)
  const [error, setError] = useState<string>('')
  const [statusText, setStatusText] = useState<string>('Idle')
  const [replayNotice, setReplayNotice] = useState<string>('')
  const [sending, setSending] = useState<boolean>(false)
  const [configOpen, setConfigOpen] = useState<boolean>(false)
  const [config, setConfig] = useState<ConfigPayload | null>(null)
  const [configDraft, setConfigDraft] = useState<Record<string, unknown>>({})
  const [saveStatus, setSaveStatus] = useState<string>('')
  const [authRequired, setAuthRequired] = useState<boolean>(false)
  const [authTokenInput, setAuthTokenInput] = useState<string>('')

  React.useEffect(() => {
    const onAuthRequired = () => setAuthRequired(true)
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthRequired)
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthRequired)
  }, [])

  const sessionItems = useMemo(() => {
    const map = new Map<string, SessionItem>()

    for (const item of [...extraSessions, ...sessions]) {
      if (!map.has(item.session_key)) {
        map.set(item.session_key, item)
      }
    }

    if (!map.has(sessionKey) && !sessionKey.startsWith('chat:')) {
      map.set(sessionKey, {
        session_key: sessionKey,
        label: sessionKey,
        chat_id: 0,
        chat_type: 'web',
      })
    }

    if (map.size === 0) {
      map.set(DEFAULT_WEB_SESSION_KEY, {
        session_key: DEFAULT_WEB_SESSION_KEY,
        label: DEFAULT_WEB_SESSION_KEY,
        chat_id: 0,
        chat_type: 'web',
      })
    }

    return Array.from(map.values())
  }, [extraSessions, sessions, sessionKey])

  const selectedSession = useMemo(
    () => sessionItems.find((item) => item.session_key === sessionKey),
    [sessionItems, sessionKey],
  )

  const selectedSessionLabel = selectedSession?.label || sessionKey
  const selectedSessionReadOnly = Boolean(selectedSession && selectedSession.chat_type !== 'web')

  async function loadSessions(): Promise<void> {
    const data = await api<{ sessions?: SessionItem[] }>('/api/sessions')
    setSessions(Array.isArray(data.sessions) ? data.sessions : [])
  }

  async function loadHistory(target = sessionKey): Promise<void> {
    const query = new URLSearchParams({ session_key: target, limit: '200' })
    const data = await api<{ messages?: BackendMessage[] }>(`/api/history?${query.toString()}`)
    const rawMessages = Array.isArray(data.messages) ? data.messages : []
    const mapped = mapBackendHistory(rawMessages)
    setHistorySeed(mapped)
    setHistoryCountBySession((prev) => ({ ...prev, [target]: rawMessages.length }))
    setRuntimeNonce((x) => x + 1)
  }

  const adapter = useMemo<ChatModelAdapter>(
    () => ({
      run: async function* (options): AsyncGenerator<ChatModelRunResult, void> {
        const userText = extractLatestUserText(options.messages)
        if (!userText) return

        setSending(true)
        setStatusText('Sending...')
        setReplayNotice('')
        setError('')

        try {
          if (selectedSessionReadOnly) {
            setStatusText('Read-only channel')
            throw new Error('This chat is read-only. Switch to a web session or create a new chat to send messages.')
          }

          const sendResponse = await api<{ run_id?: string }>('/api/send_stream', {
            method: 'POST',
            body: JSON.stringify({
              session_key: sessionKey,
              sender_name: 'web-user',
              message: userText,
            }),
            signal: options.abortSignal,
          })

          const runId = sendResponse.run_id
          if (!runId) {
            throw new Error('missing run_id')
          }

          let receivedDone = false

          const query = new URLSearchParams({ run_id: runId })
          const streamResponse = await fetch(`/api/stream?${query.toString()}`, {
            method: 'GET',
            headers: makeHeaders(),
            cache: 'no-store',
            signal: options.abortSignal,
          })

          if (streamResponse.status === 401) {
            window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT))
            throw new Error('Unauthorized. Enter the API token (WEB_AUTH_TOKEN from .env).')
          }
          if (!streamResponse.ok) {
            const text = await streamResponse.text().catch(() => '')
            const msg =
              streamResponse.status === 429
                ? 'Too many requests. Please wait a moment before sending again.'
                : messageForFailedResponse(streamResponse.status, { message: text || undefined }, text)
            throw new Error(msg)
          }

          let assistantText = ''
          const toolState = new Map<
            string,
            {
              name: string
              args: ReadonlyJSONObject
              result?: ReadonlyJSONValue
              isError?: boolean
            }
          >()

          const makeContent = () => {
            const toolParts = Array.from(toolState.entries()).map(([toolCallId, tool]) => ({
              type: 'tool-call' as const,
              toolCallId,
              toolName: tool.name,
              args: tool.args,
              argsText: JSON.stringify(tool.args),
              ...(tool.result ? { result: tool.result } : {}),
              ...(tool.isError !== undefined ? { isError: tool.isError } : {}),
            }))

            return [
              ...(assistantText ? [{ type: 'text' as const, text: assistantText }] : []),
              ...toolParts,
            ]
          }

          for await (const event of parseSseFrames(streamResponse, options.abortSignal)) {
            const data = event.payload

            if (event.event === 'replay_meta') {
              if (data.replay_truncated === true) {
                const oldest = typeof data.oldest_event_id === 'number' ? data.oldest_event_id : null
                const message =
                  oldest !== null
                    ? `Stream history was truncated. Recovery resumed from event #${oldest}.`
                    : 'Stream history was truncated. Recovery resumed from the earliest available event.'
                setReplayNotice(message)
              }
              continue
            }

            if (event.event === 'status') {
              const message = typeof data.message === 'string' ? data.message : ''
              if (message) setStatusText(message)
              continue
            }

            if (event.event === 'tool_start') {
              const payload = data as ToolStartPayload
              if (!payload.tool_use_id || !payload.name) continue
              toolState.set(payload.tool_use_id, {
                name: payload.name,
                args: toJsonObject(payload.input),
              })
              setStatusText(`tool: ${payload.name}...`)
              const content = makeContent()
              if (content.length > 0) yield { content }
              continue
            }

            if (event.event === 'tool_result') {
              const payload = data as ToolResultPayload
              if (!payload.tool_use_id || !payload.name) continue

              const previous = toolState.get(payload.tool_use_id)
              const resultPayload: ReadonlyJSONObject = toJsonObject({
                output: payload.output ?? '',
                duration_ms: payload.duration_ms ?? null,
                bytes: payload.bytes ?? null,
                status_code: payload.status_code ?? null,
                error_type: payload.error_type ?? null,
              })

              toolState.set(payload.tool_use_id, {
                name: payload.name,
                args: previous?.args ?? {},
                result: resultPayload,
                isError: Boolean(payload.is_error),
              })

              const ms = typeof payload.duration_ms === 'number' ? payload.duration_ms : 0
              const bytes = typeof payload.bytes === 'number' ? payload.bytes : 0
              setStatusText(`tool: ${payload.name} ${payload.is_error ? 'error' : 'ok'} ${ms}ms ${bytes}b`)
              const content = makeContent()
              if (content.length > 0) yield { content }
              continue
            }

            if (event.event === 'delta') {
              const delta = typeof data.delta === 'string' ? data.delta : ''
              if (!delta) continue
              assistantText += delta
              const content = makeContent()
              if (content.length > 0) yield { content }
              continue
            }

            if (event.event === 'error') {
              const message = typeof data.error === 'string' ? data.error : 'stream error'
              throw new Error(message)
            }

            if (event.event === 'done') {
              receivedDone = true
              // Command shortcuts (e.g. /persona, /reset) return full response in done only, no deltas
              const doneResponse =
                typeof (data as { response?: string }).response === 'string'
                  ? (data as { response: string }).response
                  : ''
              if (doneResponse && assistantText.length === 0) {
                assistantText = doneResponse
                const content = makeContent()
                if (content.length > 0) yield { content }
              }
              setStatusText('Done')
              break
            }
          }

          // If stream ended without "done" (disconnect, tab close, timeout), poll until run completes so the user sees the result without sending a follow-up message.
          if (!receivedDone && runId) {
            const pollIntervalMs = 2500
            const pollMaxMs = 10 * 60 * 1000 // 10 minutes
            const start = Date.now()
            while (Date.now() - start < pollMaxMs) {
              await new Promise((r) => setTimeout(r, pollIntervalMs))
              try {
                const status = await api<{ done?: boolean }>(
                  `/api/run_status?run_id=${encodeURIComponent(runId)}`,
                )
                if (status.done === true) {
                  setStatusText('Done')
                  await loadHistory(sessionKey)
                  break
                }
              } catch {
                // Run not found (404) or other error — stop polling
                break
              }
            }
          }
        } finally {
          setSending(false)
          void loadSessions()
          void loadHistory(sessionKey)
        }
      },
    }),
    [sessionKey, selectedSessionReadOnly],
  )

  function createSession(): void {
    const currentCount = historyCountBySession[sessionKey] ?? historySeed.length
    const key = makeSessionKey()
    const item: SessionItem = {
      session_key: key,
      label: key,
      chat_id: 0,
      chat_type: 'web',
    }
    setExtraSessions((prev) => (prev.some((v) => v.session_key === key) ? prev : [item, ...prev]))
    setSessionKey(key)
    setHistoryCountBySession((prev) => ({ ...prev, [key]: 0 }))
    setHistorySeed([])
    setRuntimeNonce((x) => x + 1)
    setReplayNotice('')
    setError('')
    setStatusText(currentCount === 0 ? 'New session created.' : 'Idle')
  }

  function toggleAppearance(): void {
    setAppearance((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  async function onResetSessionByKey(targetSession: string): Promise<void> {
    try {
      await api('/api/reset', {
        method: 'POST',
        body: JSON.stringify({ session_key: targetSession }),
      })
      if (targetSession === sessionKey) {
        await loadHistory(targetSession)
      }
      await loadSessions()
      setStatusText('Session reset')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onRefreshSessionByKey(targetSession: string): Promise<void> {
    try {
      if (targetSession === sessionKey) {
        await loadHistory(targetSession)
      }
      await loadSessions()
      setStatusText('Session refreshed')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onDeleteSessionByKey(targetSession: string): Promise<void> {
    try {
      const resp = await api<{ deleted?: boolean }>('/api/delete_session', {
        method: 'POST',
        body: JSON.stringify({ session_key: targetSession }),
      })

      if (resp.deleted === false) {
        setStatusText('No session data found to delete.')
      }

      setExtraSessions((prev) => prev.filter((s) => s.session_key !== targetSession))
      setHistoryCountBySession((prev) => {
        const next = { ...prev }
        delete next[targetSession]
        return next
      })

      const fallback =
        sessionItems.find((item) => item.session_key !== targetSession)?.session_key ||
        DEFAULT_WEB_SESSION_KEY
      if (targetSession === sessionKey) {
        setSessionKey(fallback)
        await loadHistory(fallback)
      }
      await loadSessions()
      if (resp.deleted !== false) {
        setStatusText('Session deleted')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function openConfig(): Promise<void> {
    setSaveStatus('')
    const data = await api<{ config?: ConfigPayload }>('/api/config')
    setConfig(data.config || null)
    setConfigDraft({
      llm_provider: data.config?.llm_provider || '',
      model: data.config?.model || defaultModelForProvider(String(data.config?.llm_provider || 'anthropic')),
      llm_base_url: String(data.config?.llm_base_url || ''),
      api_key: '',
      max_tokens: Number(data.config?.max_tokens ?? 8192),
      max_tool_iterations: Number(data.config?.max_tool_iterations ?? 100),
      max_document_size_mb: Number(data.config?.max_document_size_mb ?? DEFAULT_CONFIG_VALUES.max_document_size_mb),
      show_thinking: Boolean(data.config?.show_thinking),
      web_enabled: Boolean(data.config?.web_enabled),
      web_host: String(data.config?.web_host || '127.0.0.1'),
      web_port: Number(data.config?.web_port ?? 10961),
    })
    setConfigOpen(true)
  }

  function setConfigField(field: string, value: unknown): void {
    setConfigDraft((prev) => ({ ...prev, [field]: value }))
  }

  function resetConfigField(field: string): void {
    setConfigDraft((prev) => {
      const next = { ...prev }
      switch (field) {
        case 'llm_provider':
          next.llm_provider = DEFAULT_CONFIG_VALUES.llm_provider
          next.model = defaultModelForProvider(DEFAULT_CONFIG_VALUES.llm_provider)
          break
        case 'model':
          next.model = defaultModelForProvider(String(next.llm_provider || DEFAULT_CONFIG_VALUES.llm_provider))
          break
        case 'llm_base_url':
          next.llm_base_url = ''
          break
        case 'max_tokens':
          next.max_tokens = DEFAULT_CONFIG_VALUES.max_tokens
          break
        case 'max_tool_iterations':
          next.max_tool_iterations = DEFAULT_CONFIG_VALUES.max_tool_iterations
          break
        case 'max_document_size_mb':
          next.max_document_size_mb = DEFAULT_CONFIG_VALUES.max_document_size_mb
          break
        case 'show_thinking':
          next.show_thinking = DEFAULT_CONFIG_VALUES.show_thinking
          break
        case 'web_enabled':
          next.web_enabled = DEFAULT_CONFIG_VALUES.web_enabled
          break
        case 'web_host':
          next.web_host = DEFAULT_CONFIG_VALUES.web_host
          break
        case 'web_port':
          next.web_port = DEFAULT_CONFIG_VALUES.web_port
          break
        default:
          break
      }
      return next
    })
  }

  async function saveConfigChanges(): Promise<void> {
    try {
      const payload: Record<string, unknown> = {
        llm_provider: String(configDraft.llm_provider || ''),
        model: String(configDraft.model || ''),
        max_tokens: Number(configDraft.max_tokens || 8192),
        max_tool_iterations: Number(configDraft.max_tool_iterations || 100),
        max_document_size_mb: Number(
          configDraft.max_document_size_mb || DEFAULT_CONFIG_VALUES.max_document_size_mb,
        ),
        show_thinking: Boolean(configDraft.show_thinking),
        web_enabled: Boolean(configDraft.web_enabled),
        web_host: String(configDraft.web_host || '127.0.0.1'),
        web_port: Number(configDraft.web_port || 10961),
      }
      if (String(configDraft.llm_provider || '').trim().toLowerCase() === 'custom') {
        payload.llm_base_url = String(configDraft.llm_base_url || '').trim() || null
      }
      const apiKey = String(configDraft.api_key || '').trim()
      if (apiKey) payload.api_key = apiKey

      await api('/api/config', { method: 'PUT', body: JSON.stringify(payload) })
      setSaveStatus('Saved. Restart microclaw to apply changes.')
    } catch (e) {
      setSaveStatus(`Save failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  useEffect(() => {
    saveAppearance(appearance)
    document.documentElement.classList.toggle('dark', appearance === 'dark')
  }, [appearance])

  useEffect(() => {
    saveUiTheme(uiTheme)
    document.documentElement.setAttribute('data-ui-theme', uiTheme)
  }, [uiTheme])

  useEffect(() => {
    ;(async () => {
      try {
        setError('')
        const data = await api<{ sessions?: SessionItem[] }>('/api/sessions')
        const loaded = Array.isArray(data.sessions) ? data.sessions : []
        setSessions(loaded)

        const latestSession = pickLatestSessionKey(loaded)
        const initialSession = latestSession

        setSessionKey(initialSession)
        writeSessionToUrl(initialSession)
        await loadHistory(initialSession)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadHistory(sessionKey).catch((e) => setError(e instanceof Error ? e.message : String(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey])

  useEffect(() => {
    writeSessionToUrl(sessionKey)
  }, [sessionKey])

  const runtimeKey = `${sessionKey}-${runtimeNonce}`
  const radixAccent = RADIX_ACCENT_BY_THEME[uiTheme] ?? 'green'
  const currentProvider = String(configDraft.llm_provider || DEFAULT_CONFIG_VALUES.llm_provider).trim().toLowerCase()
  const providerOptions = Array.from(
    new Set([currentProvider, ...PROVIDER_SUGGESTIONS.map((p) => p.toLowerCase())].filter(Boolean)),
  )
  const modelOptions = MODEL_OPTIONS[currentProvider] || []
  const sectionCardClass = appearance === 'dark'
    ? 'rounded-xl border p-5'
    : 'rounded-xl border border-slate-200/80 p-5'
  const sectionCardStyle = appearance === 'dark'
    ? { borderColor: 'color-mix(in srgb, var(--mc-border-soft) 68%, transparent)' }
    : undefined
  const toggleCardClass = appearance === 'dark'
    ? 'rounded-lg border p-3'
    : 'rounded-lg border border-slate-200/80 p-3'
  const toggleCardStyle = appearance === 'dark'
    ? { borderColor: 'color-mix(in srgb, var(--mc-border-soft) 60%, transparent)' }
    : undefined

  function submitAuthToken() {
    const token = authTokenInput.trim()
    if (!token) return
    sessionStorage.setItem(WEB_AUTH_STORAGE_KEY, token)
    setAuthRequired(false)
    setAuthTokenInput('')
    window.location.reload()
  }

  return (
    <Theme appearance={appearance} accentColor={radixAccent as never} grayColor="slate" radius="medium" scaling="100%">
      <Dialog.Root open={authRequired} onOpenChange={(open) => !open && setAuthRequired(false)}>
        <Dialog.Content>
          <Dialog.Title>API token required</Dialog.Title>
          <Dialog.Description size="2" mb="3">
            This server requires an API token. Use the same value as <code>WEB_AUTH_TOKEN</code> in your .env.
          </Dialog.Description>
          <Flex direction="column" gap="3">
            <TextField.Root
              type="password"
              placeholder="Enter token"
              value={authTokenInput}
              onChange={(e) => setAuthTokenInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitAuthToken()}
            />
            <Button onClick={() => submitAuthToken()}>Continue</Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      <div
        className={
          appearance === 'dark'
            ? 'h-screen w-screen bg-[var(--mc-bg-main)]'
            : 'h-screen w-screen bg-[radial-gradient(1200px_560px_at_-8%_-10%,#d1fae5_0%,transparent_58%),radial-gradient(1200px_560px_at_108%_-12%,#e0f2fe_0%,transparent_58%),#f8fafc]'
        }
      >
        <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)]">
          <SessionSidebar
            appearance={appearance}
            onToggleAppearance={toggleAppearance}
            uiTheme={uiTheme}
            onUiThemeChange={(theme) => setUiTheme(theme as UiTheme)}
            uiThemeOptions={UI_THEME_OPTIONS}
            sessionItems={sessionItems}
            selectedSessionKey={sessionKey}
            onSessionSelect={(key) => setSessionKey(key)}
            onRefreshSession={(key) => void onRefreshSessionByKey(key)}
            onResetSession={(key) => void onResetSessionByKey(key)}
            onDeleteSession={(key) => void onDeleteSessionByKey(key)}
            onOpenConfig={openConfig}
            onNewSession={createSession}
          />

          <main
            className={
              appearance === 'dark'
                ? 'flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--mc-bg-panel)]'
                : 'flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white/95'
            }
          >
            <header
              className={
                appearance === 'dark'
                  ? 'sticky top-0 z-10 border-b border-[color:var(--mc-border-soft)] bg-[color:var(--mc-bg-panel)]/95 px-4 py-3 backdrop-blur-sm'
                  : 'sticky top-0 z-10 border-b border-slate-200 bg-white/92 px-4 py-3 backdrop-blur-sm'
              }
            >
              <Heading size="6">
                {selectedSessionLabel}
              </Heading>
            </header>

            {selectedSessionReadOnly ? (
              <Callout.Root color="amber" size="1" variant="soft" className="mx-3 mt-3">
                <Callout.Text>
                  This chat is read-only (linked to Telegram/Discord). Switch to a web session in the sidebar or create a new chat to send messages.
                </Callout.Text>
              </Callout.Root>
            ) : null}

            <div
              className={
                appearance === 'dark'
                  ? 'flex min-h-0 flex-1 flex-col bg-[linear-gradient(to_bottom,var(--mc-bg-panel),var(--mc-bg-main)_28%)]'
                  : 'flex min-h-0 flex-1 flex-col bg-[linear-gradient(to_bottom,#f8fafc,white_20%)]'
              }
            >
              <div className="mx-auto w-full max-w-5xl px-3 pt-3">
                {replayNotice ? (
                  <Callout.Root color="orange" size="1" variant="soft">
                    <Callout.Text>{replayNotice}</Callout.Text>
                  </Callout.Root>
                ) : null}
                {error ? (
                  <Callout.Root color="red" size="1" variant="soft" className={replayNotice ? 'mt-2' : ''}>
                    <Callout.Text>{error}</Callout.Text>
                  </Callout.Root>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 px-1 pb-1">
                <ThreadPane key={runtimeKey} adapter={adapter} initialMessages={historySeed} runtimeKey={runtimeKey} />
              </div>
            </div>
          </main>
        </div>

        <Dialog.Root open={configOpen} onOpenChange={setConfigOpen}>
          <Dialog.Content maxWidth="760px">
            <Dialog.Title>Runtime Config</Dialog.Title>
            <Dialog.Description size="2" mb="3">
              Save writes to .env. Restart may be required.
            </Dialog.Description>
            {config ? (
              <Flex direction="column" gap="4">
                <div className={sectionCardClass} style={sectionCardStyle}>
                  <Text size="3" weight="bold">
                    LLM
                  </Text>
                  <div className="mt-3 grid grid-cols-1 gap-3">
                    <div>
                      <Flex justify="between" align="center" mb="1">
                        <Text size="1" color="gray">Provider</Text>
                        <Button size="1" variant="ghost" onClick={() => resetConfigField('llm_provider')}>Reset</Button>
                      </Flex>
                      <Select.Root
                        value={String(configDraft.llm_provider || DEFAULT_CONFIG_VALUES.llm_provider)}
                        onValueChange={(value) => setConfigField('llm_provider', value)}
                      >
                        <Select.Trigger placeholder="Select provider" />
                        <Select.Content>
                          {providerOptions.map((provider) => (
                            <Select.Item key={provider} value={provider}>
                              {provider}
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select.Root>
                    </div>

                    <div>
                      <Flex justify="between" align="center" mb="1">
                        <Text size="1" color="gray">Model</Text>
                        <Button size="1" variant="ghost" onClick={() => resetConfigField('model')}>Reset</Button>
                      </Flex>
                      <TextField.Root
                        value={String(configDraft.model || defaultModelForProvider(String(configDraft.llm_provider || DEFAULT_CONFIG_VALUES.llm_provider)))}
                        onChange={(e) => setConfigField('model', e.target.value)}
                        placeholder="claude-sonnet-4-5-20250929"
                      />
                      {modelOptions.length > 0 ? (
                        <Text size="1" color="gray" className="mt-1 block">
                          Suggested: {modelOptions.join(' / ')}
                        </Text>
                      ) : null}
                    </div>

                    {currentProvider === 'custom' ? (
                      <div>
                        <Flex justify="between" align="center" mb="1">
                          <Text size="1" color="gray">API Host</Text>
                          <Button size="1" variant="ghost" onClick={() => resetConfigField('llm_base_url')}>Reset</Button>
                        </Flex>
                        <TextField.Root
                          value={String(configDraft.llm_base_url || '')}
                          onChange={(e) => setConfigField('llm_base_url', e.target.value)}
                          placeholder="https://your-provider.example/v1"
                        />
                      </div>
                    ) : null}

                    <div>
                      <Text size="1" color="gray">API key (leave blank to keep existing)</Text>
                      <TextField.Root
                        className="mt-2"
                        value={String(configDraft.api_key || '')}
                        onChange={(e) => setConfigField('api_key', e.target.value)}
                        placeholder="api_key"
                      />
                    </div>
                  </div>
                </div>

                <div className={sectionCardClass} style={sectionCardStyle}>
                  <Text size="3" weight="bold">
                    Runtime
                  </Text>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <Flex justify="between" align="center" mb="1">
                        <Text size="1" color="gray">Max tokens</Text>
                        <Button size="1" variant="ghost" onClick={() => resetConfigField('max_tokens')}>Reset</Button>
                      </Flex>
                      <TextField.Root
                        value={String(configDraft.max_tokens || DEFAULT_CONFIG_VALUES.max_tokens)}
                        onChange={(e) => setConfigField('max_tokens', e.target.value)}
                        placeholder="max_tokens"
                      />
                    </div>
                    <div>
                      <Flex justify="between" align="center" mb="1">
                        <Text size="1" color="gray">Max tool iterations</Text>
                        <Button size="1" variant="ghost" onClick={() => resetConfigField('max_tool_iterations')}>Reset</Button>
                      </Flex>
                      <TextField.Root
                        value={String(configDraft.max_tool_iterations || DEFAULT_CONFIG_VALUES.max_tool_iterations)}
                        onChange={(e) => setConfigField('max_tool_iterations', e.target.value)}
                        placeholder="max_tool_iterations"
                      />
                    </div>
                    <div>
                      <Flex justify="between" align="center" mb="1">
                        <Text size="1" color="gray">Max document size (MB)</Text>
                        <Button size="1" variant="ghost" onClick={() => resetConfigField('max_document_size_mb')}>Reset</Button>
                      </Flex>
                      <TextField.Root
                        value={String(configDraft.max_document_size_mb || DEFAULT_CONFIG_VALUES.max_document_size_mb)}
                        onChange={(e) => setConfigField('max_document_size_mb', e.target.value)}
                        placeholder="max_document_size_mb"
                      />
                    </div>
                  </div>
                </div>

                <div className={sectionCardClass} style={sectionCardStyle}>
                  <Text size="3" weight="bold">
                    Web
                  </Text>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <Flex justify="between" align="center" mb="1">
                        <Text size="1" color="gray">Host</Text>
                        <Button size="1" variant="ghost" onClick={() => resetConfigField('web_host')}>Reset</Button>
                      </Flex>
                      <TextField.Root
                        value={String(configDraft.web_host || DEFAULT_CONFIG_VALUES.web_host)}
                        onChange={(e) => setConfigField('web_host', e.target.value)}
                        placeholder="web_host"
                      />
                    </div>
                    <div>
                      <Flex justify="between" align="center" mb="1">
                        <Text size="1" color="gray">Port</Text>
                        <Button size="1" variant="ghost" onClick={() => resetConfigField('web_port')}>Reset</Button>
                      </Flex>
                      <TextField.Root
                        value={String(configDraft.web_port || DEFAULT_CONFIG_VALUES.web_port)}
                        onChange={(e) => setConfigField('web_port', e.target.value)}
                        placeholder="web_port"
                      />
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className={toggleCardClass} style={toggleCardStyle}>
                      <Flex justify="between" align="center">
                        <Text size="2">show_thinking</Text>
                        <Switch
                          checked={Boolean(configDraft.show_thinking)}
                          onCheckedChange={(checked) => setConfigField('show_thinking', checked)}
                        />
                      </Flex>
                      <Button size="1" variant="ghost" className="mt-2" onClick={() => resetConfigField('show_thinking')}>
                        Reset to default
                      </Button>
                    </div>
                    <div className={toggleCardClass} style={toggleCardStyle}>
                      <Flex justify="between" align="center">
                        <Text size="2">web_enabled</Text>
                        <Switch
                          checked={Boolean(configDraft.web_enabled)}
                          onCheckedChange={(checked) => setConfigField('web_enabled', checked)}
                        />
                      </Flex>
                      <Button size="1" variant="ghost" className="mt-2" onClick={() => resetConfigField('web_enabled')}>
                        Reset to default
                      </Button>
                    </div>
                  </div>
                </div>

                {saveStatus ? (
                  <Text size="2" color={saveStatus.startsWith('Save failed') ? 'red' : 'green'}>
                    {saveStatus}
                  </Text>
                ) : null}
                <Flex justify="end" gap="2" mt="1">
                  <Dialog.Close>
                    <Button variant="soft">Close</Button>
                  </Dialog.Close>
                  <Button onClick={() => void saveConfigChanges()}>Save</Button>
                </Flex>
              </Flex>
            ) : (
              <Text size="2" color="gray">
                Loading...
              </Text>
            )}
          </Dialog.Content>
        </Dialog.Root>
      </div>
    </Theme>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
