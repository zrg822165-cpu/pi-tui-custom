# TUI Renderer

This folder is the renderer boundary for the current custom TUI shell.

The current renderer is still the JavaScript/pi-tui implementation in
`interactive-mode.js`, but callers can now attach a renderer facade and target a
small event/action protocol. A future Rust renderer should implement the same
contract and consume the same event shape.

This first extraction is deliberately conservative: it creates the plug-in
surface without moving the working visual code yet.

