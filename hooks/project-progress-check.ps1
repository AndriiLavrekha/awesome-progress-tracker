param(
    [string]$ProjectRoot = ".",
    [Parameter(Mandatory = $true)]
    [string]$SessionStartedAt,
    [switch]$MeaningfulWork,
    [switch]$CompletionBoundary
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$cliPath = Join-Path $repoRoot 'dist/src/hook/cli.js'

$Arguments = @(
    $cliPath,
    "--project-root",
    $ProjectRoot,
    "--session-started-at",
    $SessionStartedAt
)

if ($MeaningfulWork) {
    $Arguments += "--meaningful-work"
}

if ($CompletionBoundary) {
    $Arguments += "--completion-boundary"
}

node @Arguments
exit $LASTEXITCODE
