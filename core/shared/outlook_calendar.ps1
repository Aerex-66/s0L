# outlook_calendar.ps1 — Live Outlook calendar sync
# Runs in a VISIBLE window, reads calendar via COM, writes JSON cache.
# Usage: Right-click > Run with PowerShell, or from a terminal you can see.
# The Flask backend reads the cache file — no COM needed at request time.
param(
    [int]$DaysBefore = 7,
    [int]$DaysAfter = 60,
    [int]$IntervalSec = 60,
    [switch]$Once
)

$ErrorActionPreference = 'Stop'
$cacheFile = Join-Path $PSScriptRoot '..\..\outlook_calendar_cache.json'
$cacheFile = [System.IO.Path]::GetFullPath($cacheFile)

function Read-OutlookCalendar {
    $ol = New-Object -ComObject Outlook.Application
    $ns = $ol.GetNamespace("MAPI")
    $cal = $ns.GetDefaultFolder(9)  # olFolderCalendar
    $items = $cal.Items
    $items.Sort("[Start]")
    $items.IncludeRecurrences = $true

    $startDate = (Get-Date).AddDays(-$DaysBefore).ToString("MM/dd/yyyy HH:mm")
    $endDate   = (Get-Date).AddDays($DaysAfter).ToString("MM/dd/yyyy HH:mm")
    $filter    = "[Start] >= '$startDate' AND [Start] <= '$endDate'"
    $filtered  = $items.Restrict($filter)

    $events = @()
    foreach ($item in $filtered) {
        try {
            if ($null -eq $item -or $null -eq $item.Subject) { continue }
            $events += @{
                subject    = [string]$item.Subject
                start      = $item.Start.ToString("yyyy-MM-ddTHH:mm:ss")
                end        = $item.End.ToString("yyyy-MM-ddTHH:mm:ss")
                location   = [string]$item.Location
                isAllDay   = [bool]$item.AllDayEvent
                categories = [string]$item.Categories
                organizer  = [string]$item.Organizer
                busyStatus = [int]$item.BusyStatus
            }
        } catch { continue }
    }

    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($items) | Out-Null
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($cal) | Out-Null
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ns) | Out-Null
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ol) | Out-Null

    return $events
}

$host.UI.RawUI.WindowTitle = "s0L Outlook Sync"
Write-Host "s0L Outlook Calendar Sync" -ForegroundColor Cyan
Write-Host "Cache: $cacheFile"
Write-Host ""

if ($Once) {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Reading Outlook calendar..."
    try {
        $events = Read-OutlookCalendar
        $events | ConvertTo-Json -Depth 3 | Set-Content $cacheFile -Encoding utf8
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Wrote $($events.Count) events." -ForegroundColor Green
    } catch {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "Refreshing every ${IntervalSec}s. Press Ctrl+C to stop."
    Write-Host ""
    while ($true) {
        try {
            $events = Read-OutlookCalendar
            $events | ConvertTo-Json -Depth 3 | Set-Content $cacheFile -Encoding utf8
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] OK — $($events.Count) events" -ForegroundColor Green
        } catch {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ERROR: $($_.Exception.Message)" -ForegroundColor Red
        }
        Start-Sleep -Seconds $IntervalSec
    }
}
