param(
    [Parameter(Mandatory = $true)][string]$Path
)
# Move a file to the Windows recycle bin (restorable), never hard-delete.
if (-not (Test-Path -LiteralPath $Path)) {
    Write-Output "missing"
    exit 2
}
Add-Type -AssemblyName Microsoft.VisualBasic
try {
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(
        $Path,
        [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
        [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
    )
} catch {
    Write-Output ("failed: " + $_.Exception.Message)
    exit 1
}
Write-Output "recycled"