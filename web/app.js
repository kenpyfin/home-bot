import React, { useEffect, useMemo, useRef, useState } from 'https://esm.sh/react@18';
import { createRoot } from 'https://esm.sh/react-dom@18/client';
import * as Radix from 'https://esm.sh/@radix-ui/themes@3.2.1?external=react,react-dom';

const h = React.createElement;
const {
  Theme,
  Flex,
  Box,
  Card,
  Button,
  Heading,
  Text,
  TextField,
  TextArea,
  ScrollArea,
  Separator,
  Dialog,
  Badge,
} = Radix;

function readToken() {
  return localStorage.getItem('microclaw_web_token') || '';
}

function saveToken(token) {
  localStorage.setItem('microclaw_web_token', token);
}

function makeHeaders(token, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (token && token.trim()) {
    headers['Authorization'] = `Bearer ${token.trim()}`;
  }
  return headers;
}

async function api(path, token, options = {}) {
  const res = await fetch(path, { ...options, headers: makeHeaders(token, options) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `HTTP ${res.status}`);
  }
  return data;
}

function App() {
  const [token, setToken] = useState(readToken());
  const [sessions, setSessions] = useState([]);
  const [sessionKey, setSessionKey] = useState('main');
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [senderName, setSenderName] = useState('web-user');
  const [error, setError] = useState('');
  const [statusText, setStatusText] = useState('');
  const [sending, setSending] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [config, setConfig] = useState(null);
  const [configDraft, setConfigDraft] = useState({});
  const [saveStatus, setSaveStatus] = useState('');
  const eventSourceRef = useRef(null);

  const canSend = useMemo(() => messageInput.trim().length > 0 && !sending, [messageInput, sending]);

  async function loadSessions() {
    const data = await api('/api/sessions', token);
    setSessions(Array.isArray(data.sessions) ? data.sessions : []);
  }

  async function loadHistory(target = sessionKey) {
    const query = new URLSearchParams({ session_key: target, limit: '200' });
    const data = await api(`/api/history?${query.toString()}`, token);
    setMessages(Array.isArray(data.messages) ? data.messages : []);
  }

  function closeStream() {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }

  function addOptimisticUserMessage(content) {
    const msg = {
      id: `u-${Date.now()}`,
      sender_name: senderName || 'web-user',
      content,
      is_from_bot: false,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, msg]);
  }

  function ensureStreamingAssistant() {
    setMessages((prev) => {
      const id = 'streaming-assistant';
      if (prev.some((m) => m.id === id)) return prev;
      return [...prev, {
        id,
        sender_name: 'assistant',
        content: '',
        is_from_bot: true,
        timestamp: new Date().toISOString(),
      }];
    });
  }

  function appendAssistantDelta(delta) {
    setMessages((prev) => prev.map((m) => {
      if (m.id !== 'streaming-assistant') return m;
      return { ...m, content: (m.content || '') + delta };
    }));
  }

  async function onSend() {
    const trimmed = messageInput.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError('');
    setStatusText('Sending...');
    closeStream();

    try {
      addOptimisticUserMessage(trimmed);
      ensureStreamingAssistant();
      setMessageInput('');

      const sendRes = await api('/api/send_stream', token, {
        method: 'POST',
        body: JSON.stringify({
          session_key: sessionKey,
          sender_name: senderName,
          message: trimmed,
        }),
      });

      const runId = sendRes.run_id;
      if (!runId) throw new Error('missing run_id');

      const streamQuery = new URLSearchParams({ run_id: runId });
      if (token && token.trim()) streamQuery.set('token', token.trim());

      const es = new EventSource(`/api/stream?${streamQuery.toString()}`);
      eventSourceRef.current = es;

      es.addEventListener('status', (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.message) setStatusText(data.message);
        } catch (_) {}
      });

      es.addEventListener('tool_start', (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.name) setStatusText(`tool: ${data.name}...`);
        } catch (_) {}
      });

      es.addEventListener('tool_result', (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.name) {
            const suffix = data.is_error ? 'error' : 'ok';
            setStatusText(`tool: ${data.name} (${suffix})`);
          }
        } catch (_) {}
      });

      es.addEventListener('delta', (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.delta) appendAssistantDelta(data.delta);
        } catch (_) {}
      });

      es.addEventListener('done', async (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (typeof data.response === 'string') {
            setMessages((prev) => prev.map((m) => {
              if (m.id !== 'streaming-assistant') return m;
              return { ...m, content: data.response };
            }));
          }
        } catch (_) {}

        closeStream();
        setSending(false);
        setStatusText('Done');
        await Promise.all([loadSessions(), loadHistory(sessionKey)]);
      });

      es.addEventListener('error', (ev) => {
        try {
          const data = JSON.parse(ev.data);
          setError(data.error || 'Stream error');
        } catch (_) {
          setError('Stream connection error');
        }
        closeStream();
        setSending(false);
      });
    } catch (e) {
      setError(e.message || String(e));
      setSending(false);
      setStatusText('');
      closeStream();
      await loadHistory(sessionKey).catch(() => {});
    }
  }

  async function onResetSession() {
    try {
      await api('/api/reset', token, {
        method: 'POST',
        body: JSON.stringify({ session_key: sessionKey }),
      });
      await loadHistory(sessionKey);
    } catch (e) {
      setError(e.message || String(e));
    }
  }

  async function openConfig() {
    setSaveStatus('');
    const data = await api('/api/config', token);
    setConfig(data.config || null);
    setConfigDraft({
      llm_provider: data.config?.llm_provider || '',
      model: data.config?.model || '',
      api_key: '',
      max_tokens: data.config?.max_tokens || 8192,
      max_tool_iterations: data.config?.max_tool_iterations || 100,
      show_thinking: !!data.config?.show_thinking,
      web_enabled: !!data.config?.web_enabled,
      web_host: data.config?.web_host || '127.0.0.1',
      web_port: data.config?.web_port || 3900,
      web_auth_token: '',
    });
    setConfigOpen(true);
  }

  async function saveConfigChanges() {
    try {
      const payload = {
        llm_provider: configDraft.llm_provider,
        model: configDraft.model,
        max_tokens: Number(configDraft.max_tokens),
        max_tool_iterations: Number(configDraft.max_tool_iterations),
        show_thinking: !!configDraft.show_thinking,
        web_enabled: !!configDraft.web_enabled,
        web_host: configDraft.web_host,
        web_port: Number(configDraft.web_port),
      };
      if ((configDraft.api_key || '').trim()) payload.api_key = configDraft.api_key.trim();
      if ((configDraft.web_auth_token || '').trim()) payload.web_auth_token = configDraft.web_auth_token.trim();
      await api('/api/config', token, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setSaveStatus('Saved. Restart microclaw to apply changes.');
    } catch (e) {
      setSaveStatus(`Save failed: ${e.message || String(e)}`);
    }
  }

  useEffect(() => {
    saveToken(token);
  }, [token]);

  useEffect(() => {
    async function init() {
      try {
        setError('');
        await Promise.all([loadSessions(), loadHistory(sessionKey)]);
      } catch (e) {
        setError(e.message || String(e));
      }
    }
    init();
    return closeStream;
  }, []);

  useEffect(() => {
    loadHistory(sessionKey).catch((e) => setError(e.message || String(e)));
  }, [sessionKey]);

  return h(
    Theme,
    { appearance: 'light', accentColor: 'teal', grayColor: 'slate', radius: 'medium', scaling: '100%' },
    h(
      Flex,
      { style: { height: '100%', padding: '16px', gap: '16px' } },
      h(
        Card,
        { style: { width: '280px', display: 'flex', flexDirection: 'column', gap: '12px' } },
        h(Flex, { justify: 'between', align: 'center' },
          h(Heading, { size: '4' }, 'MicroClaw'),
          h(Button, { size: '1', variant: 'soft', onClick: async () => {
            try { await openConfig(); } catch (e) { setError(e.message || String(e)); }
          } }, 'Config')
        ),
        h(Text, { size: '2', color: 'gray' }, 'Local sessions'),
        h(TextField.Root, { value: token, onChange: (e) => setToken(e.target.value), placeholder: 'Bearer token (optional)' },
          h(TextField.Input)
        ),
        h(Separator),
        h(ScrollArea, { type: 'auto', style: { height: '100%' } },
          h(Flex, { direction: 'column', gap: '8px' },
            h(Button, {
              variant: sessionKey === 'main' ? 'solid' : 'soft',
              onClick: () => setSessionKey('main'),
            }, 'main'),
            ...sessions.map((s) => h(Button, {
              key: s.session_key,
              variant: sessionKey === s.session_key ? 'solid' : 'soft',
              onClick: () => setSessionKey(s.session_key),
              style: { justifyContent: 'flex-start' },
            }, s.session_key))
          )
        )
      ),
      h(
        Card,
        { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 } },
        h(Flex, { justify: 'between', align: 'center' },
          h(Flex, { align: 'center', gap: '8px' },
            h(Heading, { size: '4' }, sessionKey),
            h(Badge, { color: 'teal', variant: 'soft' }, 'SSE')
          ),
          h(Flex, { gap: '8px' },
            h(Button, { size: '1', variant: 'soft', onClick: () => loadHistory(sessionKey).catch((e) => setError(e.message || String(e))) }, 'Refresh'),
            h(Button, { size: '1', variant: 'soft', color: 'orange', onClick: onResetSession }, 'Reset Session')
          )
        ),
        statusText ? h(Text, { size: '2', color: 'gray' }, statusText) : null,
        error ? h(Text, { color: 'red', size: '2' }, error) : null,
        h(
          Box,
          { style: { flex: 1, minHeight: 0 } },
          h(ScrollArea, { type: 'auto', style: { height: '100%', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#ffffff' } },
            h(Flex, { direction: 'column', gap: '10px' },
              ...messages.map((m) => h(Card, {
                key: m.id,
                style: { background: m.is_from_bot ? '#f0fdfa' : '#f8fafc' },
              },
                h(Flex, { justify: 'between', align: 'center' },
                  h(Text, { weight: 'bold', size: '2' }, m.sender_name),
                  h(Text, { size: '1', color: 'gray' }, new Date(m.timestamp).toLocaleString())
                ),
                h(Text, { as: 'p', size: '2', style: { whiteSpace: 'pre-wrap', marginTop: '6px' } }, m.content)
              ))
            )
          )
        ),
        h(Flex, { gap: '8px' },
          h(TextField.Root, { value: senderName, onChange: (e) => setSenderName(e.target.value), style: { width: '180px' } },
            h(TextField.Input, { placeholder: 'sender name' })
          ),
          h(TextArea, {
            value: messageInput,
            onChange: (e) => setMessageInput(e.target.value),
            placeholder: 'Type message...',
            style: { flex: 1, minHeight: '84px' },
            onKeyDown: (e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onSend();
              }
            },
          }),
          h(Button, { disabled: !canSend, onClick: onSend }, sending ? 'Streaming...' : 'Send')
        ),
        h(Text, { size: '1', color: 'gray' }, 'Tip: Ctrl/Cmd + Enter to send')
      ),
      h(Dialog.Root, { open: configOpen, onOpenChange: setConfigOpen },
        h(Dialog.Content, { maxWidth: '640px' },
          h(Dialog.Title, null, 'Runtime Config'),
          h(Dialog.Description, { size: '2', mb: '3' }, 'Save writes to microclaw.config.yaml. Restart is required.'),
          config ? h(Flex, { direction: 'column', gap: '10px' },
            h(Text, { size: '2', color: 'gray' }, `Current provider: ${config.llm_provider}`),
            h(TextField.Root, { value: configDraft.llm_provider || '', onChange: (e) => setConfigDraft({ ...configDraft, llm_provider: e.target.value }) }, h(TextField.Input, { placeholder: 'llm_provider' })),
            h(TextField.Root, { value: configDraft.model || '', onChange: (e) => setConfigDraft({ ...configDraft, model: e.target.value }) }, h(TextField.Input, { placeholder: 'model' })),
            h(TextField.Root, { value: configDraft.api_key || '', onChange: (e) => setConfigDraft({ ...configDraft, api_key: e.target.value }) }, h(TextField.Input, { placeholder: 'api_key (leave blank to keep existing)' })),
            h(TextField.Root, { value: String(configDraft.max_tokens || 8192), onChange: (e) => setConfigDraft({ ...configDraft, max_tokens: e.target.value }) }, h(TextField.Input, { placeholder: 'max_tokens' })),
            h(TextField.Root, { value: String(configDraft.max_tool_iterations || 100), onChange: (e) => setConfigDraft({ ...configDraft, max_tool_iterations: e.target.value }) }, h(TextField.Input, { placeholder: 'max_tool_iterations' })),
            h(TextField.Root, { value: configDraft.web_host || '127.0.0.1', onChange: (e) => setConfigDraft({ ...configDraft, web_host: e.target.value }) }, h(TextField.Input, { placeholder: 'web_host' })),
            h(TextField.Root, { value: String(configDraft.web_port || 3900), onChange: (e) => setConfigDraft({ ...configDraft, web_port: e.target.value }) }, h(TextField.Input, { placeholder: 'web_port' })),
            h(TextField.Root, { value: configDraft.web_auth_token || '', onChange: (e) => setConfigDraft({ ...configDraft, web_auth_token: e.target.value }) }, h(TextField.Input, { placeholder: 'web_auth_token (optional)' })),
            h(Flex, { gap: '10px' },
              h(Button, { variant: configDraft.show_thinking ? 'solid' : 'soft', onClick: () => setConfigDraft({ ...configDraft, show_thinking: !configDraft.show_thinking }) }, `show_thinking: ${configDraft.show_thinking ? 'on' : 'off'}`),
              h(Button, { variant: configDraft.web_enabled ? 'solid' : 'soft', onClick: () => setConfigDraft({ ...configDraft, web_enabled: !configDraft.web_enabled }) }, `web_enabled: ${configDraft.web_enabled ? 'on' : 'off'}`)
            ),
            saveStatus ? h(Text, { size: '2', color: saveStatus.startsWith('Save failed') ? 'red' : 'green' }, saveStatus) : null,
            h(Flex, { justify: 'end', gap: '8px', mt: '2' },
              h(Dialog.Close, null, h(Button, { variant: 'soft' }, 'Close')),
              h(Button, { onClick: saveConfigChanges }, 'Save')
            )
          ) : h(Text, null, 'Loading...')
        )
      )
    )
  );
}

createRoot(document.getElementById('root')).render(h(App));
