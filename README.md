# meeting-transcriber-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) stdio server for
[Meeting Transcriber](https://github.com/pasrom/meeting-transcriber), the local-first meeting
transcriber for macOS. It lets an agent submit an audio file, read the diarized transcript, name
the speakers, and turn meeting detection on or off — without any of the audio leaving the Mac.

This is a thin client over the app's own
[Local Automation API](https://github.com/pasrom/meeting-transcriber/blob/main/docs/automation-api.md),
a localhost-only HTTP surface the app ships for exactly this purpose. No audio, models or
transcripts pass through any cloud service: the transcription runs on the Apple Neural Engine
and this server only moves file paths and text over the loopback interface.

## Requirements

- macOS 14.2+ with Meeting Transcriber installed from **Homebrew** or built from source. The
  automation API is compiled out of the App Store variant, because that sandbox forbids the
  `network.server` entitlement the listener needs.
- Node.js 20 or newer.
- The automation API turned on. It is off by default:
  - **Settings → Advanced → "Local Automation API"** for a persistent toggle, or
  - launch the app with `MEETINGTRANSCRIBER_DEBUG_RPC=1` for one session.

The app writes a bearer token to
`~/Library/Application Support/MeetingTranscriber/.rpc-token` (mode `0600`) on first launch of
the API. This server reads it from there, so there is nothing to configure by hand. The token
rotates whenever the API is toggled off and on; the server re-reads the file and retries once
when the app rejects a stale copy.

## Setup

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "meeting-transcriber": {
      "command": "npx",
      "args": ["-y", "meeting-transcriber-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add meeting-transcriber -- npx -y meeting-transcriber-mcp
```

### From source

```bash
git clone https://github.com/msvargas/meeting-transcriber-mcp.git
cd meeting-transcriber-mcp
npm install && npm run build
```

Then point the `command` at `node` with `args` of `["/absolute/path/to/dist/index.js"]`.

## Tools

| Tool | What it does |
| --- | --- |
| `transcribe_file` | Submit one file and wait for the diarized transcript. Runs headless, so a multi-speaker recording finishes on its own with auto-assigned names |
| `enqueue_files` | Queue one or more files and get job ids back immediately |
| `get_job` | Read a job's state, result paths, transcript and optionally the generated Markdown protocol |
| `get_naming` | Read the speaker labels a job is waiting to have named, with the app's suggestions |
| `confirm_naming` | Assign real names to diarization labels so a parked job can finish |
| `skip_naming` | Let a job finish with the names the app assigned itself |
| `get_watch_status` | Read whether the app is watching for meetings, and whether its permissions are healthy |
| `set_watch` | Start or stop automatic meeting detection |

### Two deliberate omissions

**No microphone recording control.** The app's API can start and stop a microphone-only
recording for an in-person meeting, and this server does not expose it. Nobody in the room can
see an agent decide to record them, and the app's own docs note that a start can raise a
permission dialog "unannounced". Drive that from the menu bar or a Stream Deck key instead.

**No `toggle` on `set_watch`.** A toggle applies a delta to a state the caller cannot see
reliably, so if the meeting ended or somebody used the menu bar in between, it does the opposite
of what was intended and stays inverted. `start` and `stop` express the desired end state and
converge no matter what happened before.

## Configuration

Every variable is optional.

| Variable | Default | Purpose |
| --- | --- | --- |
| `MEETING_TRANSCRIBER_BASE_URL` | `http://127.0.0.1:9876` | Where the app's API listens |
| `MEETING_TRANSCRIBER_TOKEN_PATH` | The app's token file under `Application Support` | Read the bearer token from somewhere else |
| `MEETING_TRANSCRIBER_TOKEN` | unset | Pin the token directly instead of reading a file. Disables the re-read-on-401 recovery |
| `MEETING_TRANSCRIBER_TIMEOUT_MS` | `30000` | Budget for the short endpoints. `transcribe_file` derives its own from `maxWaitSeconds` |

## Reading the results

Two fields are easy to misread, so the server spells them out in prose.

**An absent echo verdict is not a clean one.** On a loudspeaker recording the far end lands on
the microphone track too, and the app measures that before transcribing. When the verdict is
missing, nothing was measured — the job was single-source, a track was silent, or the tracks
overlapped for less than one analysis window. Only an explicit "not detected" means analysed and
clean, and this server never collapses the two.

**A job in `error` is not always final.** A user can retry it from the menu bar, which moves the
same id back to `waiting`. A poller that sees `error` and keeps polling may well watch the job
run again and end in `done`.

## Inherited limitations

These come from the app's API, not from this server:

- **Polling only.** There is no webhook or push channel, so a client polls `get_job`. On
  loopback a 3–5 second interval costs effectively nothing.
- **No upload.** A path must already be readable on the Mac running the app. Submitting a file
  that only exists on another machine fails.
- **The speaker database is read-only on this path.** Already-enrolled voices are recognized,
  but no endpoint here enrolls new ones.
- **Starting to watch can raise a macOS permission prompt.** Grant microphone and screen
  recording once interactively before relying on `set_watch`.

## Development

```bash
npm run typecheck
npm test          # 26 tests, no running app required: fetch is injected
npm run check     # typecheck + tests + repository hygiene
npm run build
bash scripts/smoke.sh   # drives the built server over stdio against a real app
```

The tests connect a real MCP client to the server over an in-memory transport and stub the HTTP
layer, so they cover the tool schemas, the status-code mapping and the rendering without
touching Meeting Transcriber.

## License

MIT
