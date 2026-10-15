import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionUsage } from 'claude-code'

import { allocateCells, formatTokens } from '../hooks/register'

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const CATEGORIES = [
  { name: 'System prompt', tokens: 3_000, color: 'promptBorder', isDeferred: false, kind: 'used' },
  { name: 'Messages', tokens: 47_000, color: 'permission', isDeferred: false, kind: 'used' },
  { name: 'MCP tools', tokens: 9_000, color: 'warning', isDeferred: true, kind: 'deferred' },
  { name: 'Autocompact buffer', tokens: 33_000, color: 'inactive', isDeferred: false, kind: 'buffer' },
  { name: 'Free space', tokens: 117_000, color: 'inactive', isDeferred: false, kind: 'free' },
] as const

// Stands in for the engine: answers usage with a fixed /context breakdown,
// lets measurements through, and draws a marker when the plugin passes.
const engineBeneath = (on: On) => {
  on('session.usage', () => ({ value: USAGE }))
  on('session.measure', ($, e) => ({ changed: [...e.changed] }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine-default" />
  })
}

const USAGE: SessionUsage = {
  startedAt: 0,
  rateLimits: [],
  context: {
    window: 200_000,
    tokens: 50_000,
    percent: 25,
    breakdown: {
      categories: CATEGORIES.map(c => ({ ...c })),
      totalTokens: 50_000,
      maxTokens: 200_000,
      rawMaxTokens: 200_000,
      autocompactSource: 'model-default',
      percentage: 25,
      gridRows: [],
      model: 'test-model',
      memoryFiles: [],
      mcpTools: [],
      agents: [],
      isAutoCompactEnabled: true,
      apiUsage: null,
    },
  },
}

type Node = { type: string; props?: Record<string, unknown>; children?: unknown[] }

// The bar's segments: the colored Texts on the band's first line.
const barSegments = (tree: unknown) => {
  const barLine = (tree as Node).children?.[0] as Node | undefined
  return (barLine?.children ?? [])
    .map(child => child as Node)
    .filter(node => typeof node.props?.color === 'string')
    .map(node => ({ color: node.props?.color, text: (node.children ?? []).join('') }))
}

const RUN = {
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
} as const

const measure = ($: Engine) =>
  $.session.measure({
    context: { window: 200_000, tokens: 50_000, percent: 25 },
    rateLimits: [],
    changed: ['context'],
  })

describe('allocateCells', () => {
  test('fills exactly the width it is given', () => {
    const cells = allocateCells([3_000, 47_000, 33_000, 117_000], 63)
    expect(cells.reduce((a, b) => a + b, 0)).toBe(63)
  })

  test('keeps proportions', () => {
    expect(allocateCells([1, 1], 10)).toEqual([5, 5])
    expect(allocateCells([1, 3], 8)).toEqual([2, 6])
  })

  test('draws nothing for an empty window', () => {
    expect(allocateCells([0, 0], 20)).toEqual([0, 0])
  })
})

describe('formatTokens', () => {
  test('abbreviates like /context', () => {
    expect(formatTokens(950)).toBe('950')
    expect(formatTokens(47_000)).toBe('47.0k')
    expect(formatTokens(1_000_000)).toBe('1.0M')
  })
})

test('draws the bar and legend once the context is measured', async ($, on) => {
  engineBeneath(on)
  await measure($)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'context-bar', surface, ...BAND })

    const label = await ui.find({ type: 'Text', text: /25% · 50\.0k\/200\.0k/ })
    expect(label).toBeDefined()

    expect(await ui.find({ type: 'Text', text: /System prompt 3\.0k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Messages 47\.0k/ })).toBeDefined()
    // Deferred tool schemas sit outside the window: no bar cell, no legend entry.
    expect(await ui.find({ type: 'Text', text: /MCP tools/ })).toBeUndefined()

    // The bar's segments fill the band's width, less the label.
    const segments = barSegments(await ui.drawn())
    const width = segments.reduce((sum, s) => sum + s.text.length, 0)
    const labelText = ' 25% · 50.0k/200.0k'
    expect(width).toBe(BAND.props.bodyColumns - labelText.length)

    // One segment per non-deferred category, colored with /context's theme keys.
    expect(segments.map(s => s.color)).toEqual([
      'promptBorder',
      'permission',
      'inactive',
      'inactive',
    ])
    // Messages is 47k of 200k: about 23.5% of the bar, the largest used slice.
    const messages = segments.find(s => s.color === 'permission')
    expect(messages?.text.length).toBe(14)

    await ui.unmount()
  }
})

test('shows a waiting line before the first measurement', async ($, on) => {
  engineBeneath(on)

  const ui = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /waiting for the first response/ })).toBeDefined()
  await ui.unmount()
})

test('/context-bar hides the bar, and running it again brings it back', async ($, on) => {
  engineBeneath(on)
  await measure($)

  const off = await $.command.run({ command: 'context-bar', ...RUN })
  expect(off).toMatchObject({ text: 'Context bar off.' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'context-bar', surface, ...BAND })
    expect(await ui.find({ key: 'engine-default' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /System prompt/ })).toBeUndefined()
    await ui.unmount()
  }

  const on2 = await $.command.run({ command: 'context-bar', ...RUN })
  expect(on2).toMatchObject({ text: 'Context bar on.' })

  const ui = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /System prompt/ })).toBeDefined()
  await ui.unmount()
})

test('passes when a survey holds the band', async ($, on) => {
  engineBeneath(on)
  await measure($)

  const ui = await $.ui.mount({
    plugin: 'context-bar',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { ...BAND.props, hasSurvey: true },
  })
  expect(await ui.find({ key: 'engine-default' })).toBeDefined()
  await ui.unmount()
})
