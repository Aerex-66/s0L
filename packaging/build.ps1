<#
.SYNOPSIS
  Builds the portable s0L package: release\s0L-<version>.zip, signed with the Aerex certificate.
.DESCRIPTION
  Unzip anywhere, double-click s0L.exe. No install, no admin. Data lives in %LOCALAPPDATA%\s0L.
  Signing needs an Azure sign-in on this PC first:
    az login --tenant 53766e3f-8ad5-418c-bac7-aaad7bdc46df --use-device-code
.PARAMETER NoSign
  Skip signing (local test builds); the zip is named s0L-<version>-unsigned.zip.
#>
[CmdletBinding()]
param([switch]$NoSign)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'  # PowerShell 5.1 downloads crawl with the progress bar on

$repo = Split-Path -Parent $PSScriptRoot
$version = (Get-Content (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json).version
$release = Join-Path $repo 'release'
$cache = Join-Path $release 'cache'
$stage = Join-Path $release "staging\s0L-$version"
$app = Join-Path $stage 'app'
$zip = Join-Path $release $(if ($NoSign) { "s0L-$version-unsigned.zip" } else { "s0L-$version.zip" })
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$heldSuffix = '.s0l-packaging-hold'
$utf8 = New-Object System.Text.UTF8Encoding $false

function Step([string]$text) { Write-Host "`n== $text" -ForegroundColor Cyan }

function Invoke-Checked([string]$exe, [string[]]$arguments) {
    & $exe @arguments
    if ($LASTEXITCODE -ne 0) { throw "$exe failed (exit $LASTEXITCODE)" }
}

function Copy-Tree([string]$from, [string]$to, [string[]]$skipDirs = @(), [string[]]$skipFiles = @()) {
    $roboArgs = @($from, $to, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1')
    if ($skipDirs) { $roboArgs += '/XD'; $roboArgs += $skipDirs }
    if ($skipFiles) { $roboArgs += '/XF'; $roboArgs += $skipFiles }
    & robocopy @roboArgs | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Copying $from failed (robocopy exit $LASTEXITCODE)" }
    $global:LASTEXITCODE = 0
}

# The real iSBD reference deck (client deal text + slide renders) is local-only: it never ships.
function Get-ClientContentFolders {
    @((Join-Path $repo 'frontend\src\features\isbd'), (Join-Path $repo 'frontend\public\isbd-bg'))
}

function Hide-ClientContent {
    $files = @(Get-Item (Join-Path $repo 'frontend\src\features\isbd\isbdReference.json') -ErrorAction SilentlyContinue) +
             @(Get-ChildItem (Join-Path $repo 'frontend\public\isbd-bg') -Filter 'ref_slide*.png' -File -ErrorAction SilentlyContinue)
    foreach ($file in $files) { if ($file) { Rename-Item $file.FullName ($file.Name + $heldSuffix) } }
}

function Restore-ClientContent {
    foreach ($folder in Get-ClientContentFolders) {
        Get-ChildItem $folder -Filter "*$heldSuffix" -File -ErrorAction SilentlyContinue | ForEach-Object {
            Rename-Item $_.FullName $_.Name.Substring(0, $_.Name.Length - $heldSuffix.Length)
        }
    }
}

function Get-NuGetPackage([string]$id) {
    $dir = Join-Path $cache "tools\$id"
    if (-not (Test-Path $dir)) {
        $package = Join-Path $cache "$id.zip"
        Invoke-WebRequest "https://www.nuget.org/api/v2/package/$id" -OutFile $package -UseBasicParsing
        Expand-Archive $package $dir
        Remove-Item $package
    }
    $dir
}

Push-Location $repo
try {
    Step "Checking tools for s0L $version"
    $pyExe = (& python -c "import sys; print(sys.executable)").Trim()
    $pyVersion = (& python -c "import platform; print(platform.python_version())").Trim()
    $pyTag = (& python -c "import sys; print(f'{sys.version_info[0]}{sys.version_info[1]}')").Trim()
    $nodeExe = (Get-Command node -CommandType Application | Select-Object -First 1).Source
    if (-not (Test-Path $csc)) { throw "The .NET Framework C# compiler is missing: $csc" }
    if (-not $NoSign) {
        # Windows PowerShell 5.1 turns redirected native stderr into a terminating error under 'Stop'.
        $ErrorActionPreference = 'Continue'
        & az account show --output none 2>$null
        $signedIn = $LASTEXITCODE -eq 0
        $ErrorActionPreference = 'Stop'
        if (-not $signedIn) {
            throw 'Sign in to Azure first: az login --tenant 53766e3f-8ad5-418c-bac7-aaad7bdc46df --use-device-code'
        }
    }
    $mondayApp = (& python -c "import json; from core.features.integrations.monday import credentials as c; a = c.load_app(); print(json.dumps(a) if a else '')").Trim()
    if (-not $mondayApp) { throw "monday isn't set up on this PC, so colleagues couldn't connect. Run: npm run monday:provision" }
    Write-Host "Python $pyVersion ($pyExe), Node $(& $nodeExe -v)"

    Step 'Staging'
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
    New-Item -ItemType Directory -Force $app, $cache | Out-Null

    Step 'Building the frontend (real iSBD reference files held aside)'
    Restore-ClientContent
    Hide-ClientContent
    try { Invoke-Checked 'npm.cmd' @('--prefix', (Join-Path $repo 'frontend'), 'run', 'build') }
    finally { Restore-ClientContent }

    Step 'Copying the app'
    Copy-Item (Join-Path $repo 'deal_tracker.py'), (Join-Path $repo 'deal_structure.py') $app
    Copy-Tree (Join-Path $repo 'core') (Join-Path $app 'core') @('__pycache__') @('*.ps1', '*.pyc')
    Copy-Tree (Join-Path $repo 'shared') (Join-Path $app 'shared') @('test-fixtures')
    Copy-Tree (Join-Path $repo 'gssm-server') (Join-Path $app 'gssm-server') @('.gssm', 'engine-imports') @('*.log')
    Copy-Tree (Join-Path $repo 'frontend\dist') (Join-Path $app 'frontend\dist')
    [IO.File]::WriteAllText((Join-Path $app 'monday-app.json'), $mondayApp, $utf8)

    Step "Python $pyVersion (embeddable)"
    $embedZip = Join-Path $cache "python-$pyVersion-embed-amd64.zip"
    if (-not (Test-Path $embedZip)) {
        Invoke-WebRequest "https://www.python.org/ftp/python/$pyVersion/python-$pyVersion-embed-amd64.zip" -OutFile $embedZip -UseBasicParsing
    }
    $pyDir = Join-Path $stage 'runtime\python'
    Expand-Archive $embedZip $pyDir
    # No 'import site': the bundle must not see packages installed in the user's own Python.
    [IO.File]::WriteAllLines((Join-Path $pyDir "python$pyTag._pth"),
        [string[]]@("python$pyTag.zip", '.', 'Lib\site-packages', '..\..\app'))
    Invoke-Checked $pyExe @('-m', 'pip', 'install', '--disable-pip-version-check', '--no-warn-script-location',
        '--target', (Join-Path $pyDir 'Lib\site-packages'), '-r', (Join-Path $repo 'requirements.txt'))
    Remove-Item (Join-Path $pyDir 'Lib\site-packages\bin') -Recurse -Force -ErrorAction SilentlyContinue
    Invoke-Checked $pyExe @('-m', 'compileall', '-q', (Join-Path $app 'core'), (Join-Path $app 'deal_tracker.py'),
        (Join-Path $app 'deal_structure.py'))

    Step 'Node'
    New-Item -ItemType Directory -Force (Join-Path $stage 'runtime\node') | Out-Null
    Copy-Item $nodeExe (Join-Path $stage 'runtime\node\node.exe')

    Step 'Launcher'
    $numeric = (($version -split '[^0-9]+' | Where-Object { $_ }) | Select-Object -First 3) -join '.'
    $versionFile = Join-Path $cache 'LauncherVersion.cs'
    [IO.File]::WriteAllText($versionFile, @"
[assembly: System.Reflection.AssemblyVersion("$numeric.0")]
[assembly: System.Reflection.AssemblyFileVersion("$numeric.0")]
[assembly: System.Reflection.AssemblyInformationalVersion("$version")]
"@, $utf8)
    Invoke-Checked $csc @('/nologo', '/target:winexe', '/optimize+', "/out:$(Join-Path $stage 's0L.exe')",
        "/win32icon:$(Join-Path $PSScriptRoot 'launcher\s0L.ico')", '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll',
        (Join-Path $PSScriptRoot 'launcher\s0L.cs'), $versionFile)

    Step 'Checking nothing private is in the package'
    $private = @(Get-ChildItem $app -Recurse -Force -File | Where-Object {
            $_.Name -like 'deals_data*.json' -or $_.Name -like 'ref_slide*.png' -or
            $_.Name -in @('outlook_calendar_cache.json', 'isbdReference.json') -or
            $_.Extension -in @('.pptx', '.xlsx', '.xlsm', '.docx', '.sqlite') }) +
        @(Get-ChildItem $stage -Recurse -Force -Directory | Where-Object { $_.Name -in @('.gssm', 'engine-imports') }) +
        @('documents', 'client_logos' | Where-Object { Test-Path (Join-Path $app $_) })
    if ($private.Count) { throw "Private data found in the package, stopping:`n$($private -join "`n")" }

    if (-not $NoSign) {
        Step 'Signing (Artifact Signing: Aero / Aerex)'
        $buildTools = Get-NuGetPackage 'Microsoft.Windows.SDK.BuildTools'
        $signtool = (Get-ChildItem $buildTools -Recurse -Filter signtool.exe | Where-Object { $_.Directory.Name -eq 'x64' } |
                Sort-Object FullName -Descending | Select-Object -First 1).FullName
        $dlib = (Get-ChildItem (Get-NuGetPackage 'Microsoft.ArtifactSigning.Client') -Recurse -Filter Azure.CodeSigning.Dlib.dll |
                Where-Object { $_.Directory.Name -eq 'x64' } | Select-Object -First 1).FullName
        if (-not $signtool -or -not $dlib) { throw 'SignTool or the Artifact Signing dlib was not found in the downloaded packages.' }
        $metadata = Join-Path $cache 'metadata.json'
        [IO.File]::WriteAllText($metadata, (@{
                    Endpoint               = 'https://cus.codesigning.azure.net/'
                    CodeSigningAccountName = 'Aero'
                    CertificateProfileName = 'Aerex'
                    ExcludeCredentials     = @('EnvironmentCredential', 'WorkloadIdentityCredential', 'ManagedIdentityCredential',
                        'SharedTokenCacheCredential', 'VisualStudioCredential', 'VisualStudioCodeCredential',
                        'AzurePowerShellCredential', 'AzureDeveloperCliCredential', 'InteractiveBrowserCredential')
                } | ConvertTo-Json), $utf8)

        $unsigned = @(Get-ChildItem $stage -Recurse -File -Include *.exe, *.dll, *.pyd, *.node |
                Where-Object { (Get-AuthenticodeSignature $_.FullName).Status -ne 'Valid' } | ForEach-Object FullName)
        Write-Host "$($unsigned.Count) files to sign"
        for ($i = 0; $i -lt $unsigned.Count; $i += 40) {
            $batch = $unsigned[$i..([Math]::Min($i + 39, $unsigned.Count - 1))]
            Invoke-Checked $signtool (@('sign', '/fd', 'SHA256', '/tr', 'http://timestamp.acs.microsoft.com', '/td', 'SHA256',
                    '/dlib', $dlib, '/dmdf', $metadata) + $batch)
        }
        $bad = @($unsigned | Where-Object { (Get-AuthenticodeSignature $_).Status -ne 'Valid' })
        if ($bad.Count) { throw "These files are still not signed:`n$($bad -join "`n")" }
        Write-Host ('s0L.exe signed by: ' + (Get-AuthenticodeSignature (Join-Path $stage 's0L.exe')).SignerCertificate.Subject)
    }

    Step 'Zipping'
    if (Test-Path $zip) { Remove-Item $zip }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::CreateFromDirectory($stage, $zip, [IO.Compression.CompressionLevel]::Optimal, $true)
    $size = [Math]::Round((Get-Item $zip).Length / 1MB, 1)
    Write-Host "`nDone: $zip ($size MB)" -ForegroundColor Green
    Write-Host "Unzipped copy for testing: $stage\s0L.exe"
}
finally {
    Pop-Location
}
