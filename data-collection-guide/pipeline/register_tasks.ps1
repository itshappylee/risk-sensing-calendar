# Register the scheduled tasks — run once from this folder in PowerShell:
#   powershell -ExecutionPolicy Bypass -File .\register_tasks.ps1
# Safe to re-run (/F overwrites tasks with the same name).
# Times are this PC's local time (Europe/Bratislava).

$dir = $PSScriptRoot
$bat = "`"$dir\run_job.bat`""

schtasks /Create /F /TN "RiskCalendar\hourly" /TR "$bat hourly" /SC HOURLY  /MO 1 /ST 00:05
schtasks /Create /F /TN "RiskCalendar\wf1b"   /TR "$bat wf1b"   /SC DAILY         /ST 07:00
schtasks /Create /F /TN "RiskCalendar\wf1e"   /TR "$bat wf1e"   /SC DAILY         /ST 07:10
schtasks /Create /F /TN "RiskCalendar\wf0b"   /TR "$bat wf0b"   /SC DAILY         /ST 09:10
schtasks /Create /F /TN "RiskCalendar\wf1d"   /TR "$bat wf1d"   /SC WEEKLY /D MON /ST 06:40
schtasks /Create /F /TN "RiskCalendar\wf1a"   /TR "$bat wf1a"   /SC MONTHLY /D 1  /ST 07:00

# If the PC was off at the scheduled time, run once as soon as it is on; also run on battery.
Get-ScheduledTask -TaskPath "\RiskCalendar\" | ForEach-Object {
    $s = $_.Settings
    $s.StartWhenAvailable = $true
    $s.DisallowStartIfOnBatteries = $false
    $s.StopIfGoingOnBatteries = $false
    $s.ExecutionTimeLimit = "PT30M"
    Set-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath -Settings $s | Out-Null
}

# The watchdog (wf0b) must NOT catch up: if it runs right after the PC wakes on Monday,
# the hourly jobs have not run yet and it raises false alarms.
$t = Get-ScheduledTask -TaskPath "\RiskCalendar\" -TaskName "wf0b"
$t.Settings.StartWhenAvailable = $false
Set-ScheduledTask -TaskName "wf0b" -TaskPath "\RiskCalendar\" -Settings $t.Settings | Out-Null

# Weekly job order on Monday: wf1d (06:40) must finish before wf1e (07:10).
Get-ScheduledTask -TaskPath "\RiskCalendar\" | Select-Object TaskName, State
