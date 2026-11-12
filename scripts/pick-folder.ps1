param([Parameter(Mandatory = $true)][string]$Out)
# Native folder picker for the local music-hub server.
# Called by POST /api/library/roots/pick; writes the chosen path as UTF-8.
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "选择音乐文件夹"
$dialog.ShowNewFolderButton = $false
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    [IO.File]::WriteAllText($Out, $dialog.SelectedPath, [Text.UTF8Encoding]::new($false))
}
