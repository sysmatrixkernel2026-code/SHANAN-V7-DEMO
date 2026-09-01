$pageSize = 100
$brokenImages = @()
$allPrimaryUrls = @()
$page = 1
$totalPages = 1

do {
  $resp = (Invoke-WebRequest -Uri "http://localhost:3001/api/products?page=$page&pageSize=$pageSize" -UseBasicParsing).Content | ConvertFrom-Json
  $totalPages = $resp.totalPages
  foreach ($item in $resp.items) {
    if ($item.primaryImage) {
      $allPrimaryUrls += [PSCustomObject]@{ id = $item.id; url = $item.primaryImage }
      if ($item.primaryImage -match '/jb/images/(\d+)\.jpg') {
        $fn = $matches[1] + '.jpg'
        $fp = "C:\Users\Dell\Desktop\SHANAN-V7-INSPECTION\src-only\storage\jb\images\$fn"
        if (-not (Test-Path $fp)) {
          $brokenImages += [PSCustomObject]@{ id = $item.id; url = $item.primaryImage; file = $fp }
        }
      }
    }
  }
  $page++
} while ($page -le $totalPages)

Write-Host "BROKEN_IMAGE_LINKS: $($brokenImages.Count)"
foreach ($b in $brokenImages) {
  Write-Host "  BROKEN: $($b.id) -> $($b.url)"
}

$urlCounts = @{}
foreach ($entry in $allPrimaryUrls) {
  $u = $entry.url
  if (-not $urlCounts.ContainsKey($u)) { $urlCounts[$u] = 0 }
  $urlCounts[$u]++
}
$dups = $urlCounts.GetEnumerator() | Where-Object { $_.Value -gt 1 }
Write-Host "DUPLICATE_MAPPINGS: $(if ($dups) { $dups.Count } else { 0 })"
if ($dups) {
  foreach ($d in $dups) {
    Write-Host "  DUP: $($d.Key) used by $($d.Value) products"
  }
}

# Check images that exist in storage but are not linked to any product
$allFileNames = Get-ChildItem -Path "C:\Users\Dell\Desktop\SHANAN-V7-INSPECTION\src-only\storage\jb\images" -File | ForEach-Object { "/api/storage/jb/images/" + $_.Name }
$linkedUrls = $allPrimaryUrls | ForEach-Object { $_.url } | Sort-Object -Unique
$unlinkedFiles = $allFileNames | Where-Object { $_ -notin $linkedUrls }
Write-Host "UNLINKED_STORAGE_FILES: $($unlinkedFiles.Count)"
if ($unlinkedFiles.Count -gt 0 -and $unlinkedFiles.Count -le 10) {
  foreach ($u in $unlinkedFiles) { Write-Host "  UNLINKED: $u" }
}

# Verify some image URLs are actually reachable
Write-Host "`nIMAGE_ACCESS_CHECK:"
$samples = $allPrimaryUrls | Select-Object -First 5
foreach ($s in $samples) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:3001$($s.url)" -Method Head -UseBasicParsing -TimeoutSec 5
    Write-Host "  $($s.id) -> $($s.url) : HTTP $($r.StatusCode) OK"
  } catch {
    Write-Host "  $($s.id) -> $($s.url) : FAILED ($($_.Exception.Message))"
  }
}
