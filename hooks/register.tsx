import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Segment, Snapshot } from '../types'

const isVisible = atom({ plugin: 'context-bar', key: 'isVisible' } as const, true)
const snapshot = atom({ plugin: 'context-bar', key: 'snapshot' } as const, null)

const GLYPH: Record<Segment['kind'], string> = { used: '█', buffer: '▒', free: '░' }

export const formatTokens = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

// Largest-remainder rounding, so the cells always sum to exactly `width`.
export const allocateCells = (tokens: number[], width: number): number[] => {
  const total = tokens.reduce((sum, t) => sum + t, 0)
  if (total <= 0 || width <= 0) return tokens.map(() => 0)

  const exact = tokens.map(t => (t / total) * width)
  const cells = exact.map(Math.floor)
  let left = width - cells.reduce((sum, c) => sum + c, 0)
  const byRemainder = exact
    .map((x, i) => ({ i, rem: x - Math.floor(x) }))
    .sort((a, b) => b.rem - a.rem)

  for (const { i } of byRemainder) {
    if (left <= 0) break
    cells[i] = (cells[i] ?? 0) + 1
    left -= 1
  }

  return cells
}

const refresh = async ($: EngineInterface) => {
  const usage = await $.session.usage({ breakdown: 'summary' })
  const breakdown = usage.context.breakdown
  if (!breakdown) return

  const segments: Segment[] = breakdown.categories
    .filter(row => row.kind !== 'deferred' && row.tokens > 0)
    .map(row => ({
      name: row.name,
      tokens: row.tokens,
      color: row.color,
      kind: row.kind as Segment['kind'],
    }))

  const next: Snapshot = {
    segments,
    usedTokens: breakdown.totalTokens,
    maxTokens: breakdown.rawMaxTokens,
    percent: breakdown.percentage,
  }
  await update($, snapshot, () => next)
}

let isRefreshing = false

const refreshQuietly = async ($: EngineInterface) => {
  if (isRefreshing) return
  isRefreshing = true
  try {
    await refresh($)
  } catch {
    // A failed estimate leaves the last bar up; the next measure retries.
  } finally {
    isRefreshing = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'context-bar',
      description: 'Toggle the context window bar above the prompt',
    })
    if (await read($, isVisible)) void refreshQuietly($)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context') && (await read($, isVisible))) {
      await refreshQuietly($)
    }

    return next(e)
  })

  on('command.run', { command: 'context-bar' }, async $ => {
    try {
      const shown = await update($, isVisible, value => !value)
      if (shown) await refreshQuietly($)

      return { text: shown ? 'Context bar on.' : 'Context bar off.' }
    } catch {
      return { text: 'Context bar could not switch just now. Try again.' }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isVisible))) return next(e)

    const data = await read($, snapshot)
    const { Box, Text } = $.ui.resolve(e)

    if (!data || data.segments.length === 0) {
      return (
        <Box>
          <Text dimColor>Context bar: waiting for the first response…</Text>
        </Box>
      )
    }

    const label = ` ${data.percent}% · ${formatTokens(data.usedTokens)}/${formatTokens(data.maxTokens)}`
    const barWidth = Math.max(10, e.props.bodyColumns - label.length)
    const cells = allocateCells(
      data.segments.map(s => s.tokens),
      barWidth,
    )
    const used = data.segments.filter(s => s.kind === 'used')

    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          {data.segments.map((s, i) => {
            const n = cells[i] ?? 0
            return n > 0 ? (
              <Text color={s.color}>
                {GLYPH[s.kind].repeat(n)}
              </Text>
            ) : null
          })}
          <Text dimColor>{label}</Text>
        </Text>
        <Text wrap="truncate-end">
          {used.map((s, i) => (
            <Text>
              <Text color={s.color}>{GLYPH.used}</Text>
              <Text dimColor>
                {' '}
                {s.name} {formatTokens(s.tokens)}
                {i < used.length - 1 ? '   ' : ''}
              </Text>
            </Text>
          ))}
        </Text>
      </Box>
    )
  })
}
