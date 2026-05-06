# Interactive Mode Support

Rust-rewrite friendly helpers extracted from the large upstream
`interactive-mode.js` host.

Current boundary:

- `stream-smoothing-policy.mjs`: pure stream smoothing configuration, eligibility,
  text extraction, and step sizing.
- `path-formatters.mjs`: pure path/source labels for autocomplete, extension,
  resource, and diagnostic displays.
- `stream-controller-contract.mjs`: target contract for the next extraction step,
  where timer ownership and streaming flush state move out of `InteractiveMode`.
- `tool-status-controller-contract.mjs`: target contract for tool/status live-line
  orchestration.
- `input-controller-contract.mjs`: target contract for submit/abort/clipboard and
  editor-mode orchestration.

Keep this folder free of concrete TUI component classes unless the file name is
explicitly an adapter. Pure policy modules should be portable to Rust with the
same inputs and outputs.

