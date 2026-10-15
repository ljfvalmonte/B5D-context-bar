# context-bar

A Claude Code mod that shows how full Claude's context window (its working
memory for the conversation) is, as a colored bar above the prompt box. Each
color is one category from `/context`: system prompt, tools, memory files,
messages and so on. The faded part is free space.

```
████████▓▓▓▓▓▓░░░░░░░░░░░░░░░░  35% · 70k/200k
█ System prompt 3.0k   █ Messages 47.0k
```

Type `/context-bar` to hide it, and type it again to bring it back.

## Install

In Claude Code in a terminal:

```
/plugin install context-bar --marketplace ljfvalmonte/B5D-context-bar
```

From a shell:

```
claude plugin install context-bar --marketplace ljfvalmonte/B5D-context-bar
```

In the Claude desktop app's Code tab: click **+** next to the prompt box →
**Plugins** → **Add marketplace**, enter `ljfvalmonte/B5D-context-bar`, then
**Add plugin** on context-bar.

Install it once per computer. It stays installed after that, through restarts
and any length of time unused.

## Where it shows

Only in sessions running on your own computer: Claude Code in a terminal, or a
desktop Code tab session working in a local folder. Cloud sessions don't draw
it.

## Development

```
claude plugin validate .
claude plugin test .
```
