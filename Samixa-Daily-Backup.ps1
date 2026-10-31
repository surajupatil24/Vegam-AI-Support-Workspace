$ErrorActionPreference = 'Stop'

$folder = 'C:\SurajPatil\AI_Support_Operating_System\Vegam-AI-Support-Workspace\backups\postgresql'
New-Item -ItemType Directory -Path $folder -Force | Out-Null

$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$file = Join-Path $folder "samixa_$timestamp.dump"

docker exec samixa_postgres pg_dump -U samixa -d samixa -Fc -f /tmp/samixa_backup.dump
if ($LASTEXITCODE -ne 0) {
    throw 'PostgreSQL backup failed'
}

docker cp 'samixa_postgres:/tmp/samixa_backup.dump' $file
if ($LASTEXITCODE -ne 0) {
    throw 'Copying backup failed'
}

if ((Get-Item $file).Length -eq 0) {
    throw 'Backup file is empty'
}

Get-ChildItem $folder -Filter '*.dump' |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item -Force

Write-Output "Backup completed: $file"
