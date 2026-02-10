import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
  type ChatModelRunOptions,
  type ChatModelRunResult,
  type ThreadMessageLike,
} from '@assistant-ui/react'
import { Thread } from '@assistant-ui/react-ui'
import {
  Badge,
  Button,
  Callout,
  Dialog,
  Flex,
  Heading,
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

type Appearance = 'dark' | 'light'

function readToken(): string {
  return localStorage.getItem('microclaw_web_token') || ''
}

function saveToken(token: string): void {
  localStorage.setItem('microclaw_web_token', token)
}

function readAppearance(): Appearance {
  const saved = localStorage.getItem('microclaw_appearance')
  return saved === 'light' ? 'light' : 'dark'
}

function saveAppearance(value: Appearance): void {
  localStorage.setItem('microclaw_appearance', value)
}

if (typeof document !== 'undefined') {
  document.documentElement.classList.toggle('dark', readAppearance() === 'dark')
}

function makeHeaders(token: string, options: RequestInit = {}): HeadersInit {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  }
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  if (token.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`
  }
  return headers
}

async function api<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, { ...options, headers: makeHeaders(token, options) })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(String(data.error || data.message || `HTTP ${res.status}`))
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

    const text = message.content
      .map((part) => {
        if (part.type === 'text') return part.text
        return ''
      })
      .join('\n')
      .trim()

    if (text.length > 0) return text
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

type ThreadPaneProps = {
  adapter: ChatModelAdapter
  initialMessages: ThreadMessageLike[]
  runtimeKey: string
}

function ThreadPane({ adapter, initialMessages, runtimeKey }: ThreadPaneProps) {
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
          }}
          userMessage={{ allowEdit: false }}
          composer={{ allowAttachments: false }}
          strings={{
            composer: {
              input: { placeholder: 'Message MicroClaw...' },
            },
          }}
        />
      </div>
    </AssistantRuntimeProvider>
  )
}

function App() {
  const [appearance, setAppearance] = useState<Appearance>(readAppearance())
  const [token, setToken] = useState<string>(readToken())
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [extraSessions, setExtraSessions] = useState<string[]>([])
  const [sessionKey, setSessionKey] = useState<string>('main')
  const [historySeed, setHistorySeed] = useState<ThreadMessageLike[]>([])
  const [runtimeNonce, setRuntimeNonce] = useState<number>(0)
  const [senderName, setSenderName] = useState<string>('web-user')
  const [error, setError] = useState<string>('')
  const [statusText, setStatusText] = useState<string>('Idle')
  const [replayNotice, setReplayNotice] = useState<string>('')
  const [sending, setSending] = useState<boolean>(false)
  const [configOpen, setConfigOpen] = useState<boolean>(false)
  const [newSessionOpen, setNewSessionOpen] = useState<boolean>(false)
  const [newSessionName, setNewSessionName] = useState<string>('')
  const [config, setConfig] = useState<ConfigPayload | null>(null)
  const [configDraft, setConfigDraft] = useState<Record<string, unknown>>({})
  const [saveStatus, setSaveStatus] = useState<string>('')

  const sessionKeys = useMemo(() => {
    const keys = ['main', ...extraSessions, ...sessions.map((s) => s.session_key)]
    return [...new Set(keys)]
  }, [sessions, extraSessions])

  async function loadSessions(): Promise<void> {
    const data = await api<{ sessions?: SessionItem[] }>('/api/sessions', token)
    setSessions(Array.isArray(data.sessions) ? data.sessions : [])
  }

  async function loadHistory(target = sessionKey): Promise<void> {
    const query = new URLSearchParams({ session_key: target, limit: '200' })
    const data = await api<{ messages?: BackendMessage[] }>(`/api/history?${query.toString()}`, token)
    const mapped = mapBackendHistory(Array.isArray(data.messages) ? data.messages : [])
    setHistorySeed(mapped)
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

        const sendResponse = await api<{ run_id?: string }>('/api/send_stream', token, {
          method: 'POST',
          body: JSON.stringify({
            session_key: sessionKey,
            sender_name: senderName || 'web-user',
            message: userText,
          }),
          signal: options.abortSignal,
        })

        const runId = sendResponse.run_id
        if (!runId) {
          throw new Error('missing run_id')
        }

        const query = new URLSearchParams({ run_id: runId })
        const streamResponse = await fetch(`/api/stream?${query.toString()}`, {
          method: 'GET',
          headers: makeHeaders(token),
          cache: 'no-store',
          signal: options.abortSignal,
        })

        if (!streamResponse.ok) {
          const text = await streamResponse.text().catch(() => '')
          throw new Error(text || `HTTP ${streamResponse.status}`)
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

          if (event.event === 'delta') {
            const delta = typeof data.delta === 'string' ? data.delta : ''
            if (!delta) continue

            yield {
              content: [
                {
                  type: 'text',
                  text: delta,
                },
              ],
            }
            continue
          }

          if (event.event === 'error') {
            const message = typeof data.error === 'string' ? data.error : 'stream error'
            throw new Error(message)
          }

          if (event.event === 'done') {
            setStatusText('Done')
            break
          }
        }

        setSending(false)
        void loadSessions()
      },
    }),
    [token, sessionKey, senderName],
  )

  function createSession(rawName?: string): void {
    const cleaned = (rawName || '').trim().replace(/\s+/g, ' ')
    const key = cleaned || `session-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`
    setExtraSessions((prev) => (prev.includes(key) ? prev : [key, ...prev]))
    setSessionKey(key)
    setHistorySeed([])
    setRuntimeNonce((x) => x + 1)
    setReplayNotice('')
    setError('')
    setStatusText('Idle')
    setNewSessionName('')
    setNewSessionOpen(false)
  }

  function toggleAppearance(): void {
    setAppearance((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  async function onResetSession(): Promise<void> {
    try {
      await api('/api/reset', token, {
        method: 'POST',
        body: JSON.stringify({ session_key: sessionKey }),
      })
      await loadHistory(sessionKey)
      setStatusText('Session reset')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function openConfig(): Promise<void> {
    setSaveStatus('')
    const data = await api<{ config?: ConfigPayload }>('/api/config', token)
    setConfig(data.config || null)
    setConfigDraft({
      llm_provider: data.config?.llm_provider || '',
      model: data.config?.model || '',
      api_key: '',
      max_tokens: Number(data.config?.max_tokens ?? 8192),
      max_tool_iterations: Number(data.config?.max_tool_iterations ?? 100),
      show_thinking: Boolean(data.config?.show_thinking),
      web_enabled: Boolean(data.config?.web_enabled),
      web_host: String(data.config?.web_host || '127.0.0.1'),
      web_port: Number(data.config?.web_port ?? 10961),
      web_auth_token: '',
    })
    setConfigOpen(true)
  }

  async function saveConfigChanges(): Promise<void> {
    try {
      const payload: Record<string, unknown> = {
        llm_provider: String(configDraft.llm_provider || ''),
        model: String(configDraft.model || ''),
        max_tokens: Number(configDraft.max_tokens || 8192),
        max_tool_iterations: Number(configDraft.max_tool_iterations || 100),
        show_thinking: Boolean(configDraft.show_thinking),
        web_enabled: Boolean(configDraft.web_enabled),
        web_host: String(configDraft.web_host || '127.0.0.1'),
        web_port: Number(configDraft.web_port || 10961),
      }
      const apiKey = String(configDraft.api_key || '').trim()
      const webAuth = String(configDraft.web_auth_token || '').trim()
      if (apiKey) payload.api_key = apiKey
      if (webAuth) payload.web_auth_token = webAuth

      await api('/api/config', token, { method: 'PUT', body: JSON.stringify(payload) })
      setSaveStatus('Saved. Restart microclaw to apply changes.')
    } catch (e) {
      setSaveStatus(`Save failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  useEffect(() => {
    saveToken(token)
  }, [token])

  useEffect(() => {
    saveAppearance(appearance)
    document.documentElement.classList.toggle('dark', appearance === 'dark')
  }, [appearance])

  useEffect(() => {
    ;(async () => {
      try {
        setError('')
        await Promise.all([loadSessions(), loadHistory(sessionKey)])
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

  const runtimeKey = `${sessionKey}-${runtimeNonce}`

  return (
    <Theme appearance={appearance} accentColor="teal" grayColor="slate" radius="medium" scaling="100%">
      <div
        className={
          appearance === 'dark'
            ? 'h-screen w-screen bg-slate-950'
            : 'h-screen w-screen bg-[radial-gradient(1200px_560px_at_-8%_-10%,#d1fae5_0%,transparent_58%),radial-gradient(1200px_560px_at_108%_-12%,#e0f2fe_0%,transparent_58%),#f8fafc]'
        }
      >
        <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)]">
          <SessionSidebar
            appearance={appearance}
            onToggleAppearance={toggleAppearance}
            token={token}
            onTokenChange={setToken}
            sessionKeys={sessionKeys}
            sessionKey={sessionKey}
            onSessionSelect={setSessionKey}
            onOpenConfig={openConfig}
            onNewSession={() => setNewSessionOpen(true)}
          />

          <main
            className={
              appearance === 'dark'
                ? 'flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-slate-900'
                : 'flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white/95'
            }
          >
            <header
              className={
                appearance === 'dark'
                  ? 'sticky top-0 z-10 border-b border-slate-800 bg-slate-900/95 px-4 py-3 backdrop-blur-sm'
                  : 'sticky top-0 z-10 border-b border-slate-200 bg-white/92 px-4 py-3 backdrop-blur-sm'
              }
            >
              <Flex justify="between" align="center" gap="2" wrap="wrap">
                <Flex align="center" gap="2">
                  <Heading size="4" className="capitalize">
                    {sessionKey}
                  </Heading>
                  <Badge color="teal" variant="soft">
                    assistant-ui
                  </Badge>
                  <Badge color={sending ? 'teal' : 'gray'} variant="surface">
                    {sending ? 'Streaming' : 'Idle'}
                  </Badge>
                </Flex>
                <Flex gap="2" align="center">
                  <TextField.Root
                    style={{ width: 170 }}
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="sender name"
                  />
                  <Button
                    size="1"
                    variant="soft"
                    onClick={() =>
                      loadHistory(sessionKey).catch((e) => setError(e instanceof Error ? e.message : String(e)))
                    }
                  >
                    Refresh
                  </Button>
                  <Button size="1" variant="soft" color="orange" onClick={onResetSession}>
                    Reset Session
                  </Button>
                </Flex>
              </Flex>
              <Text size="1" color="gray" className="mt-1">
                Status: {statusText}
              </Text>
            </header>

            <div
              className={
                appearance === 'dark'
                  ? 'flex min-h-0 flex-1 flex-col bg-[linear-gradient(to_bottom,#020617,#0f172a_22%)]'
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

        <Dialog.Root open={newSessionOpen} onOpenChange={setNewSessionOpen}>
          <Dialog.Content maxWidth="480px">
            <Dialog.Title>New Session</Dialog.Title>
            <Dialog.Description size="2" mb="3">
              Create a new local web chat session.
            </Dialog.Description>
            <Flex direction="column" gap="3">
              <TextField.Root
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder="Session name (optional)"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    createSession(newSessionName)
                  }
                }}
              />
              <Flex justify="end" gap="2">
                <Dialog.Close>
                  <Button variant="soft">Cancel</Button>
                </Dialog.Close>
                <Button onClick={() => createSession(newSessionName)}>Create</Button>
              </Flex>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>

        <Dialog.Root open={configOpen} onOpenChange={setConfigOpen}>
          <Dialog.Content maxWidth="640px">
            <Dialog.Title>Runtime Config</Dialog.Title>
            <Dialog.Description size="2" mb="3">
              Save writes to microclaw.config.yaml. Restart is required.
            </Dialog.Description>
            {config ? (
              <Flex direction="column" gap="2">
                <Text size="2" color="gray">
                  Current provider: {String(config.llm_provider || '')}
                </Text>
                <TextField.Root
                  value={String(configDraft.llm_provider || '')}
                  onChange={(e) => setConfigDraft({ ...configDraft, llm_provider: e.target.value })}
                  placeholder="llm_provider"
                />
                <TextField.Root
                  value={String(configDraft.model || '')}
                  onChange={(e) => setConfigDraft({ ...configDraft, model: e.target.value })}
                  placeholder="model"
                />
                <TextField.Root
                  value={String(configDraft.api_key || '')}
                  onChange={(e) => setConfigDraft({ ...configDraft, api_key: e.target.value })}
                  placeholder="api_key (leave blank to keep existing)"
                />
                <TextField.Root
                  value={String(configDraft.max_tokens || 8192)}
                  onChange={(e) => setConfigDraft({ ...configDraft, max_tokens: e.target.value })}
                  placeholder="max_tokens"
                />
                <TextField.Root
                  value={String(configDraft.max_tool_iterations || 100)}
                  onChange={(e) => setConfigDraft({ ...configDraft, max_tool_iterations: e.target.value })}
                  placeholder="max_tool_iterations"
                />
                <TextField.Root
                  value={String(configDraft.web_host || '127.0.0.1')}
                  onChange={(e) => setConfigDraft({ ...configDraft, web_host: e.target.value })}
                  placeholder="web_host"
                />
                <TextField.Root
                  value={String(configDraft.web_port || 10961)}
                  onChange={(e) => setConfigDraft({ ...configDraft, web_port: e.target.value })}
                  placeholder="web_port"
                />
                <TextField.Root
                  value={String(configDraft.web_auth_token || '')}
                  onChange={(e) => setConfigDraft({ ...configDraft, web_auth_token: e.target.value })}
                  placeholder="web_auth_token (optional)"
                />
                <Flex gap="2">
                  <Button
                    variant={Boolean(configDraft.show_thinking) ? 'solid' : 'soft'}
                    onClick={() =>
                      setConfigDraft({ ...configDraft, show_thinking: !Boolean(configDraft.show_thinking) })
                    }
                  >
                    show_thinking: {Boolean(configDraft.show_thinking) ? 'on' : 'off'}
                  </Button>
                  <Button
                    variant={Boolean(configDraft.web_enabled) ? 'solid' : 'soft'}
                    onClick={() => setConfigDraft({ ...configDraft, web_enabled: !Boolean(configDraft.web_enabled) })}
                  >
                    web_enabled: {Boolean(configDraft.web_enabled) ? 'on' : 'off'}
                  </Button>
                </Flex>
                {saveStatus ? (
                  <Text size="2" color={saveStatus.startsWith('Save failed') ? 'red' : 'green'}>
                    {saveStatus}
                  </Text>
                ) : null}
                <Flex justify="end" gap="2" mt="2">
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
