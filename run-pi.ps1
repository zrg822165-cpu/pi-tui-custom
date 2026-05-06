Set-Location -LiteralPath $PSScriptRoot
$env:PI_CODING_AGENT_DIR = Join-Path $PSScriptRoot ".pi\agent"
& ".\node_modules\.bin\pi.cmd" @args
