# Match log (single source of truth)

Archived legacy format as of 2026-09-19. "Single source of truth" here refers to this old match log; the current bot writes telemetry under [`data/log/`](../../../../data/log/).

File: `events.jsonl` — one JSON object per line.

## Canonical fields
- `event`: match_start | shop | applied | ghost | fight | match_end
- `matchId`: ties all events for one series
- `opponent`: lowercase handle (one name, always this key)
- units always: `{name, kit, atk, hp, honey, cost, rarity, uid}`

## match_end.result
`win` | `loss` | `draw`

Parse: `jq -c 'select(.event=="match_end")' events.jsonl`
