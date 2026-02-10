import React from 'react'
import { Badge, Button, Flex, ScrollArea, Separator, Text, TextField } from '@radix-ui/themes'

type SessionSidebarProps = {
  appearance: 'dark' | 'light'
  onToggleAppearance: () => void
  token: string
  onTokenChange: (value: string) => void
  sessionKeys: string[]
  sessionKey: string
  onSessionSelect: (key: string) => void
  onOpenConfig: () => Promise<void>
  onNewSession: () => void
}

export function SessionSidebar({
  appearance,
  onToggleAppearance,
  token,
  onTokenChange,
  sessionKeys,
  sessionKey,
  onSessionSelect,
  onOpenConfig,
  onNewSession,
}: SessionSidebarProps) {
  const isDark = appearance === 'dark'

  return (
    <aside
      className={
        isDark
          ? 'flex h-full min-h-0 flex-col border-r border-slate-800 bg-slate-950 p-4'
          : 'flex h-full min-h-0 flex-col border-r border-slate-200 bg-white p-4'
      }
    >
      <Flex justify="between" align="center" className="mb-4">
        <div className="flex items-center gap-2">
          <div className={isDark ? 'h-7 w-7 rounded-md bg-teal-400' : 'h-7 w-7 rounded-md bg-slate-900'} />
          <Text size="5" weight="bold">
            MicroClaw
          </Text>
        </div>
        <Badge color={token.trim() ? 'jade' : 'gray'} variant="surface">
          {token.trim() ? 'Protected' : 'Local Open'}
        </Badge>
      </Flex>

      <Flex direction="column" gap="2" className="mb-4">
        <Button size="2" variant="solid" color="teal" onClick={onNewSession}>
          New Session
        </Button>
        <Button size="2" variant="soft" onClick={() => void onOpenConfig()}>
          Runtime Config
        </Button>
        <Button size="2" variant="ghost" onClick={onToggleAppearance}>
          {isDark ? 'Switch to Light' : 'Switch to Dark'}
        </Button>
      </Flex>

      <TextField.Root
        value={token}
        onChange={(e) => onTokenChange(e.target.value)}
        placeholder="Bearer token (optional)"
      />

      <Separator size="4" className="my-4" />

      <Flex justify="between" align="center" className="mb-2">
        <Text size="2" weight="medium" color="gray">
          Sessions
        </Text>
        <Badge variant="surface">{sessionKeys.length}</Badge>
      </Flex>

      <div
        className={
          isDark
            ? 'min-h-0 flex-1 rounded-xl border border-slate-800 bg-slate-900/60 p-2'
            : 'min-h-0 flex-1 rounded-xl border border-slate-200 bg-slate-50/70 p-2'
        }
      >
        <ScrollArea type="auto" style={{ height: '100%' }}>
          <div className="flex flex-col gap-1.5 pr-1">
            {sessionKeys.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onSessionSelect(key)}
                className={
                  sessionKey === key
                    ? isDark
                      ? 'flex w-full items-center rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-left shadow-sm'
                      : 'flex w-full items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-left shadow-sm'
                    : isDark
                      ? 'flex w-full items-center rounded-lg border border-transparent px-3 py-2 text-left text-slate-300 hover:border-slate-700 hover:bg-slate-800'
                      : 'flex w-full items-center rounded-lg border border-transparent px-3 py-2 text-left text-slate-600 hover:border-slate-200 hover:bg-white'
                }
              >
                <span className="max-w-[220px] truncate text-sm font-medium">{key}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>
    </aside>
  )
}
