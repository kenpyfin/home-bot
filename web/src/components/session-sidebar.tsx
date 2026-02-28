import React, { useEffect, useRef, useState } from 'react'
import { Badge, Button, Flex, ScrollArea, Separator, Text } from '@radix-ui/themes'
import type { Persona } from '../types'

type SessionSidebarProps = {
  appearance: 'dark' | 'light'
  onToggleAppearance: () => void
  uiTheme: string
  onUiThemeChange: (theme: string) => void
  uiThemeOptions: Array<{ key: string; label: string; color: string }>
  personas: Persona[]
  selectedPersonaId: number | null
  onPersonaSelect: (personaName: string) => void
  onRefreshChat: () => void
  onResetChat: () => void
  onDeleteChat: () => void
  onOpenConfig: () => Promise<void>
}

export function SessionSidebar({
  appearance,
  onToggleAppearance,
  uiTheme,
  onUiThemeChange,
  uiThemeOptions,
  personas,
  selectedPersonaId,
  onPersonaSelect,
  onRefreshChat,
  onResetChat,
  onDeleteChat,
  onOpenConfig,
}: SessionSidebarProps) {
  const isDark = appearance === 'dark'
  const [chatMenuOpen, setChatMenuOpen] = useState(false)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const themeMenuRef = useRef<HTMLDivElement | null>(null)
  const themeButtonRef = useRef<HTMLButtonElement | null>(null)
  const chatMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return

      if (themeButtonRef.current?.contains(target)) return
      if (themeMenuRef.current?.contains(target)) return
      if (chatMenuRef.current?.contains(target)) return

      setChatMenuOpen(false)
      setThemeMenuOpen(false)
    }

    const closeOnScroll = () => {
      setChatMenuOpen(false)
      setThemeMenuOpen(false)
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('scroll', closeOnScroll, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('scroll', closeOnScroll, true)
    }
  }, [])

  return (
    <aside
      className={isDark ? 'flex h-full min-h-0 flex-col border-r p-4' : 'flex h-full min-h-0 flex-col border-r border-slate-200 bg-white p-4'}
      style={isDark ? { borderColor: 'var(--mc-border-soft)', background: 'var(--mc-bg-sidebar)' } : undefined}
    >
      <Flex justify="between" align="center" className="mb-4">
        <div className="flex items-center gap-2">
          <img
            src="/icon.png"
            alt="MicroClaw"
            className="h-7 w-7 rounded-md border border-black/10 object-cover"
            loading="eager"
            decoding="async"
          />
          <Text size="5" weight="bold">
            MicroClaw
          </Text>
        </div>
        <div className="relative flex items-center gap-2">
          <button
            ref={themeButtonRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setThemeMenuOpen((v) => !v)
            }}
            aria-label="Change UI theme color"
            className={
              isDark
                ? 'inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--mc-border-soft)] bg-[color:var(--mc-bg-panel)] text-slate-200 hover:brightness-110'
                : 'inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }
          >
            <span className="text-sm">🎨</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleAppearance()
            }}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className={
              isDark
                ? 'inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--mc-border-soft)] bg-[color:var(--mc-bg-panel)] text-slate-200 hover:brightness-110'
                : 'inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }
          >
            <span className="text-sm">{isDark ? '☀' : '☾'}</span>
          </button>
          {themeMenuOpen ? (
            <div
              ref={themeMenuRef}
              className={
                isDark
                  ? 'absolute right-0 top-10 z-50 w-56 rounded-lg border border-[color:var(--mc-border-soft)] bg-[color:var(--mc-bg-sidebar)] p-2 shadow-xl'
                  : 'absolute right-0 top-10 z-50 w-56 rounded-lg border border-slate-300 bg-white p-2 shadow-xl'
              }
            >
              <Text size="1" color="gray">Theme</Text>
              <div className="mt-2 grid grid-cols-2 gap-1">
                {uiThemeOptions.map((theme) => (
                  <button
                    key={theme.key}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onUiThemeChange(theme.key)
                      setThemeMenuOpen(false)
                    }}
                    className={
                      uiTheme === theme.key
                        ? isDark
                          ? 'flex items-center gap-2 rounded-md border border-[color:var(--mc-accent)] bg-[color:var(--mc-bg-panel)] px-2 py-1 text-left text-xs text-slate-100'
                          : 'flex items-center gap-2 rounded-md border px-2 py-1 text-left text-xs text-slate-900'
                        : isDark
                          ? 'flex items-center gap-2 rounded-md border border-transparent px-2 py-1 text-left text-xs text-slate-300 hover:border-[color:var(--mc-border-soft)] hover:bg-[color:var(--mc-bg-panel)]'
                          : 'flex items-center gap-2 rounded-md border border-transparent px-2 py-1 text-left text-xs text-slate-600 hover:border-slate-200 hover:bg-slate-50'
                    }
                    style={!isDark && uiTheme === theme.key ? { borderColor: 'var(--mc-accent)', backgroundColor: 'color-mix(in srgb, var(--mc-accent) 12%, white)' } : undefined}
                  >
                    <span
                      className={isDark ? 'h-3 w-3 rounded-sm border border-white/20' : 'h-3 w-3 rounded-sm border border-slate-300'}
                      style={{ backgroundColor: theme.color }}
                      aria-hidden="true"
                    />
                    {theme.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Flex>

      <Flex justify="between" align="center" className="mb-2">
        <Text size="2" weight="medium" color="gray">
          Persona
        </Text>
        <div className="relative" ref={chatMenuRef}>
          <button
            type="button"
            onClick={() => setChatMenuOpen((o) => !o)}
            className={
              isDark
                ? 'rounded-md border border-[color:var(--mc-border-soft)] px-2 py-1 text-xs text-slate-400 hover:bg-[color:var(--mc-bg-panel)]'
                : 'rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100'
            }
          >
            ⋮
          </button>
          {chatMenuOpen ? (
            <div
              className={
                isDark
                  ? 'absolute right-0 top-8 z-50 min-w-[140px] rounded-lg border border-[color:var(--mc-border-soft)] bg-[color:var(--mc-bg-sidebar)] p-1 shadow-xl'
                  : 'absolute right-0 top-8 z-50 min-w-[140px] rounded-lg border border-slate-200 bg-white p-1 shadow-xl'
              }
            >
              <button
                type="button"
                className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-black/5"
                onClick={() => { onRefreshChat(); setChatMenuOpen(false) }}
              >
                Refresh
              </button>
              <button
                type="button"
                className="w-full rounded-md px-3 py-2 text-left text-sm text-amber-700 hover:bg-amber-50"
                onClick={() => { onResetChat(); setChatMenuOpen(false) }}
              >
                Clear context
              </button>
              <button
                type="button"
                className="w-full rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                onClick={() => { onDeleteChat(); setChatMenuOpen(false) }}
              >
                Delete chat
              </button>
            </div>
          ) : null}
        </div>
      </Flex>

      <Separator size="4" className="my-2" />

      <div
        className={
          isDark
            ? 'min-h-0 flex-1 rounded-xl border border-[color:var(--mc-border-soft)] bg-[color:var(--mc-bg-panel)] p-2'
            : 'min-h-0 flex-1 rounded-xl border border-slate-200 bg-slate-50/70 p-2'
        }
      >
        <ScrollArea type="auto" style={{ height: '100%' }}>
          <div className="flex flex-col gap-1 pr-1">
            {personas.length === 0 ? (
              <Text size="1" color="gray">Loading…</Text>
            ) : (
              personas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPersonaSelect(p.name)}
                  className={
                    selectedPersonaId === p.id
                      ? isDark
                        ? 'flex w-full items-center justify-between rounded-lg border border-[color:var(--mc-accent)] bg-[color:var(--mc-bg-panel)] px-3 py-2 text-left text-sm shadow-sm'
                        : 'flex w-full items-center justify-between rounded-lg border bg-white px-3 py-2 text-left text-sm shadow-sm'
                      : isDark
                        ? 'flex w-full items-center justify-between rounded-lg border border-transparent px-3 py-2 text-left text-sm text-slate-300 hover:border-[color:var(--mc-border-soft)] hover:bg-[color:var(--mc-bg-panel)]'
                        : 'flex w-full items-center justify-between rounded-lg border border-transparent px-3 py-2 text-left text-sm text-slate-600 hover:border-slate-200 hover:bg-white'
                  }
                  style={
                    !isDark && selectedPersonaId === p.id
                      ? { borderColor: 'color-mix(in srgb, var(--mc-accent) 36%, #94a3b8)' }
                      : undefined
                  }
                >
                  <span className="font-medium">{p.name}</span>
                  {p.is_active ? <Badge size="1" variant="soft">active</Badge> : null}
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <div className={isDark ? 'mt-4 border-t border-[color:var(--mc-border-soft)] pt-3' : 'mt-4 border-t border-slate-200 pt-3'}>
        <Button size="2" variant="soft" onClick={() => void onOpenConfig()} style={{ width: '100%' }}>
          Runtime Config
        </Button>
        <div className="mt-3 flex flex-col items-center gap-1">
          <a
            href="https://microclaw.ai"
            target="_blank"
            rel="noreferrer"
            className={isDark ? 'text-xs text-slate-400 hover:text-slate-200' : 'text-xs text-slate-600 hover:text-slate-900'}
          >
            microclaw.ai
          </a>
        </div>
      </div>

    </aside>
  )
}
