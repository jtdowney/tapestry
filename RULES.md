# Repository Guidelines for AI Agents

This document provides guidelines for AI coding agents working with the Tapestry repository.

## Project Overview

- `extension/`: TypeScript/Svelte browser extension. Key areas: `src/background`, `src/content`, `src/sidebar`, `src/preferences`, and `src/shared/`. Built with Vite and pnpm. Note: simplified architecture; key design decisions are summarized in this document.
- `host/`: Rust native‑messaging host. Entry: `src/main.rs`; library in `src/lib.rs` and `src/codec.rs`; integration tests in `tests/`; example in `examples/interactive_client.rs`.
- `Justfile`: task runner for consistent build/test/dev/lint commands.

Tapestry is a browser extension that integrates with Fabric AI patterns. It consists of:
- A TypeScript/Svelte browser extension with sidebar UI for pattern execution
- A Rust native messaging host that bridges the browser extension and Fabric CLI

**Architecture Philosophy**: Simplified design prioritizing direct communication, minimal state, and clear boundaries over generic abstractions.

## Architecture v2 Key Changes

This project underwent a significant architectural simplification. The summary below reflects the current architecture.

### What Changed
- **Removed**: Complex dispatcher pattern, service classes, unified schemas, over-engineered stores
- **Added**: Direct message handling, two-domain messaging, component-local state, simple union types
- **Simplified**: Background script uses direct switch statements, components manage own listeners
- **Improved**: Clear separation between extension-internal and native host communication

### Key Files Structure
```
extension/src/
├── background/
│   ├── background.ts       # Direct message routing, connection state, broadcasts
│   └── messages.ts         # Native host protocol (zod)
├── content/content.ts      # Readability + Turndown extraction
├── shared/
│   ├── messages.ts         # Extension-internal messages (zod)
│   ├── connection.ts       # sendSafely + status helpers
│   ├── settings.ts         # chrome.storage helpers (fabric path/model, UI prefs)
│   ├── mount.ts            # Svelte 5 mount() helper
│   ├── constants.ts        # e.g., RECOMMENDED_PATTERNS
│   ├── requestId.ts        # UUID helpers
│   └── components/ConnectionStatus.svelte
├── sidebar/
│   ├── Sidebar.svelte      # Main Svelte 5 app (Go button built-in)
│   ├── main.ts             # Svelte mount() entry point
│   └── components/
│       ├── PatternSelector.svelte
│       └── MarkdownOutput.svelte
└── preferences/
    ├── Preferences.svelte  # Settings UI
    └── main.ts             # Svelte mount() entry point
```

## Common Development Commands

### Build
```bash
# Using just (recommended)
just build              # Build everything
just build-host         # Build Rust host only
just build-extension    # Build extension for both browsers

# Manual commands
cd host && cargo build --release
cd extension && pnpm build
```

The extension build process generates:
- Browser-specific manifests in `extension/dist/{browser}/`
- Native messaging host configs in `extension/dist/native-hosts/`

### Development
```bash
# Extension development (hot reload)
cd extension && pnpm dev

# Host development
cd host && cargo run

# Run with example client
cd host && cargo run --example interactive_client
```

### Code Quality
```bash
# Format
just fmt                    # Format all code
cd host && cargo fmt        # Format Rust
cd extension && pnpm format # Format TypeScript/Svelte

# Lint
just check               # Run all checks
cd host && cargo clippy  # Lint Rust
cd extension && pnpm lint   # Lint TypeScript/Svelte

# Type checking
cd extension && pnpm check  # TypeScript type check

# Tests
just test                   # Run all tests
cd host && cargo test       # Rust tests
cd extension && pnpm test   # Extension tests
```

### Installation
```bash
# Install native host for browsers
just install-firefox    # Firefox
just install-chrome     # Chrome
just install-all        # All browsers
just status            # Check installation status
```

## Architecture

The system uses Chrome/Firefox native messaging protocol:

1. **Message Flow**: Browser Extension ↔ Native Host (Rust) ↔ Fabric CLI
2. **Communication Protocol**: Length-prefixed JSON messages via stdin/stdout
3. **Message Structure**: UUID-tracked request/response with typed payloads
4. **Configuration Generation**: Native host configs are generated dynamically during extension build, ensuring extension IDs stay synchronized

## Key Components

#### Extension (`extension/`)

- **src/sidebar/**: Svelte 5 app providing the main UI
  - `Sidebar.svelte`: Main app component with integrated "Go" action
  - `components/PatternSelector.svelte`: Pattern selection dropdown
  - `components/MarkdownOutput.svelte`: Renders markdown using `marked` + DOMPurify

- **src/background/background.ts**: Direct message routing
  - Simple union type for connection state management
  - Direct switch-based message handling (no dispatcher)
  - Maps pending requests to response callbacks
  - Opens sidebar on browser action click
  - Broadcasts connection and processing events to the UI

- **src/content/content.ts**: Page content extraction
  - Uses Readability to extract article content
  - Converts HTML to Markdown using Turndown
  - Simple async message handler for capture_page requests

- **src/shared/**: Shared utilities and components
  - `messages.ts`: Extension-internal message types (Zod discriminated unions)
  - `connection.ts`: Safe messaging helpers (`sendSafely`) and status checks
  - `settings.ts`: Load/save settings; emits reconnection when Fabric path changes
  - `mount.ts`: Svelte mount helper used by sidebar and preferences
  - `components/ConnectionStatus.svelte`: Displays native host connection status

- **src/preferences/**: Settings page for configuration
  - `Preferences.svelte`: Simple settings UI
  - Chrome storage API integration
  - Settings:
    - `fabricPath` and `fabricModel`
    - `defaultPattern` and `visiblePatterns` controls (Select All/Recommended/Deselect All)
    - `showCustomPrompt` to include a Custom option in the sidebar
    - `renderAsMarkdown` to toggle markdown rendering
  - Changing `fabricPath` triggers `internal.reconnect_native`

#### Native Host (`host/`)

- **src/main.rs**: Entry point
  - Implements async Tokio runtime
  - Handles stdin/stdout communication with browser
  - Spawns and manages Fabric CLI processes
  - Streams responses back to extension

- **src/lib.rs**: Message type definitions
  - Request/Response enums with serde serialization
  - Payload types: Ping, ListPatterns, ProcessContent
  - UUID tracking for request/response correlation

- **src/codec.rs**: Native messaging codec
  - Implements 4-byte length prefix protocol
  - Handles JSON encoding/decoding
  - Stream-based message framing

- **src/handlers.rs**: Request dispatch and process streaming
  - Validates/handles ping, listPatterns, and processContent
  - Streams content lines and sends done/error responses

- **src/fabric.rs**: Fluent builder for Fabric CLI commands
  - `--version`, `--listpatterns`, `--stream`, `--model`, `--pattern`, custom prompt

- **examples/**
  - `interactive_client.rs` (interactive testing)
  - `simple_passthrough.rs` (example passthrough)

## Message Types

**Request Payloads:**
```rust
enum RequestPayload {
    Ping,                    // Connection test
    ListPatterns,           // Get available patterns
    ProcessContent {        // Process content through Fabric
        content: String,
        model: Option<String>,
        pattern: Option<String>,
        custom_prompt: Option<String>,
    }
}
```

**Response Payloads:**
```rust
enum ResponsePayload {
    Pong {                  // Connection test response
        resolved_path: Option<String>,
        version: Option<String>,
        valid: bool,
    },
    PatternsList {         // Available patterns
        patterns: Vec<String>,
    },
    Content {              // Streaming content line
        content: String,
    },
    Done {                 // Process completion
        exit_code: Option<i32>,
    },
    Error {                // Error message
        message: String,
    },
}
```

## Extension Internal Messages (Summary)

- Requests: `internal.connection_status`, `internal.list_patterns`, `internal.capture_page`, `internal.process_content`, `internal.reconnect_native`.
- Responses/Events: `internal.connection_status` (broadcast), `internal.patterns_list`, `internal.page_content`, `internal.processing_content` (streamed), `internal.processing_done`, `internal.processing_error`.
  - Defined via Zod discriminated unions in `extension/src/shared/messages.ts`.

## Coding Style & Naming Conventions

- **TypeScript/Svelte**: Prettier (2 spaces, 100 cols, single quotes, semicolons). See `extension/.prettierrc`. ESLint enforces import order and no‑unused‑vars; fix via `pnpm lint:fix`.
- **Rust**: `cargo fmt` + `cargo clippy` (warnings treated strictly in pre‑commit). Prefer small modules and 2024‑edition idioms.
- **Naming**: Svelte components `PascalCase.svelte` (e.g., `ConnectionStatus.svelte`). Utility modules typically lowerCamelCase; keep existing patterns. Tests end with `.test.ts` near sources.
- **Architecture**: Follow the simplified principles documented here — avoid premature abstraction, prefer direct communication, and keep state local to components.

## Development Guidelines

### Extension Development

- **Simplified Architecture**: Direct message handling with switch statements, no complex dispatcher
- **Two-Domain Messaging**: Extension-internal (`src/shared/messages.ts`) separate from native host (`src/background/messages.ts`)
- **Zod Validation**: Runtime validation at message boundaries
- **Svelte 5 Components**: Use `$state`, `$effect`, `$derived` - mount with `mount()` function
- **Component State**: Local state in components, no central stores
- **Styling**: Tailwind CSS with DaisyUI components
- **Message Flow**: Background script broadcasts streaming messages, correlates request/response pairs
- **Error Handling**: Simple string messages propagated directly to UI

### Native Host Development

- Use `anyhow::Result` for error handling
- All I/O operations are async with Tokio
- Messages use serde for JSON serialization
- The codec handles the native messaging protocol details
- Process management uses tokio::process for Fabric CLI

## Testing Guidelines

- **Extension**: Vitest + Testing Library / happy-dom. Run with `pnpm test`, watch with `pnpm test:watch`, and get coverage with `pnpm test:coverage`. Test files are colocated with implementation (`.test.ts`).
- **Host**: `cargo test` for unit/integration. Integration tests live in `host/tests`. Rust tests use standard `#[test]` attributes. Interactive testing is available via `cargo run --example interactive_client`.
- **Coverage**: No hard threshold is set, but new features and bug fixes should include tests for critical paths.

## Commit & Pull Request Guidelines

- **Commits**: Use Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `deps:`, `revert:`). Keep changes focused.
- **PRs**: Provide a clear description, link to any relevant issues, and include screenshots or terminal output for UI/behavioral changes. Ensure `just fmt` and `just check` pass. Install pre-commit hooks with `pre-commit install` and run them with `pre-commit run -a`.

## Security & Configuration

- The extension is designed to only communicate with the local native host. Avoid logging sensitive content in either the TypeScript or Rust code.
- The Fabric path and visible patterns can be configured in the Preferences UI.

## Dependencies

### Extension
- **svelte**: UI framework
- **typescript**: Type safety
- **zod**: Runtime validation
- **@mozilla/readability**: Article extraction
- **turndown**: HTML to Markdown conversion
- **marked**: Markdown to HTML for rendering
- **daisyui/tailwind**: Styling
 - **dompurify**: Sanitize rendered HTML

### Host
- **tokio**: Async runtime
- **serde/serde_json**: JSON serialization
- **anyhow**: Error handling
- **uuid**: Message correlation
- **camino**: UTF-8 path handling
 - **async-trait**: Async traits for command/process abstractions
 - **futures-util**: Stream/Sink utilities
 - **tokio-util**: Framed codecs for native messaging
 - **thiserror**: Error definitions
 - **which**: Resolve fabric executable path
