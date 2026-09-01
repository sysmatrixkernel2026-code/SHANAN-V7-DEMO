# Check image mapping consistency across the catalog
# Sample products from different parts of the range and verify their images match
$sampleIds = @(
  'prod-SHN-JB-000804',  # First JB product
  'prod-SHN-JB-001000',  # Early range
  'prod-SHN-JB-001522',  # Missing image
  'prod-SHN-JB-002000',  # Mid range
  'prod-SHN-JB-003000',  # Mid-late range
  'prod-SHN-JB-003860',  # Near end
  'prod-00001',           # SKF (wrong logo)
  'prod-00008'            # Bosch (no image)
)

foreach ($pid in $sampleIds) {
  $detail = (Invoke-WebRequest -Uri "http://localhost:3001/api/products/$pid" -UseBasicParsing -TimeoutSec 5).Content | ConvertFrom-Json
  $p = $detail.product
  $imgCount = $p.images.Count
  $hasImg = if ($p.primaryImage) { "YES" } else { "NO" }
  $imgSrc = if ($p.primaryImage) { $p.primaryImage } else { "none" }
  Write-Host "$pid | img=$hasImg | src=$imgSrc | images_count=$imgCount | sku=$($p.sku)"

  if ($p.primaryImage -and $p.primaryImage -match '/jb/images/(\d+)\.jpg') {
    $fileNum = $matches[1]
    $fp = "C:\Users\Dell\Desktop\SHANAN-V7-INSPECTION\src-only\storage\jb\images\$fileNum.jpg"
    if (Test-Path $fp) {
      $sz = (Get-Item $fp).Length
      Write-Host "  -> file $fileNum.jpg exists ($sz bytes) OK"
    } else {
      Write-Host "  -> file $fileNum.jpg MISSING!"
    }
  }
}

# Also verify: check a sample of random JB products from different pages
Write-Host "`n=== RANDOM JB PRODUCT IMAGE SPOT CHECK ==="
$pagesToCheck = @(10, 20, 30, 39)
foreach ($pg in $pagesToCheck) {
  $resp = (Invoke-WebRequest -Uri "http://localhost:3001/api/products?page=$pg&pageSize=12" -UseBasicParsing).Content | ConvertFrom-Json
  $first = $resp.items[0]
  $last = $resp.items[-1]
  foreach ($item in @($first, $last)) {
    if ($item.primaryImage -and $item.primaryImage -match '/jb/images/(\d+)\.jpg') {
      $fileNum = $matches[1]
      $fp = "C:\Users\Dell\Desktop\SHANAN-V7-INSPECTION\src-only\storage\jb\images\$fileNum.jpg"
      $exists = Test-Path $fp
      $status = if ($exists) { "OK" } else { "MISSING" }
      Write-Host "  Page $pg | $($item.id) | img=$($item.primaryImage) | file=$fileNum.jpg $status"
    } else {
      Write-Host "  Page $pg | $($item.id) | primaryImage=$($item.primaryImage)"
    }
  }
}
