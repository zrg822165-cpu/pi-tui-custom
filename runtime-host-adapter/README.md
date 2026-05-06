# Runtime Host Adapter

Small compatibility boundary for modules extracted out of `InteractiveMode`.

The JavaScript host has moved from direct fields toward store-backed adapters.
Extracted modules should use this adapter instead of reaching into either shape
directly.

Rust rewrite notes:

- Keep these accessors as the contract between UI/runtime modules and the host.
- Prefer adding explicit methods here over adding more ad-hoc `host.*` reads.
