export type Segment = {
  name: string
  tokens: number
  color: string
  kind: 'used' | 'free' | 'buffer'
}

export type Snapshot = {
  segments: Segment[]
  usedTokens: number
  maxTokens: number
  percent: number
}

declare module 'claude-code' {
  interface PluginState {
    'context-bar': { isVisible: boolean; snapshot: Snapshot | null }
  }
}
