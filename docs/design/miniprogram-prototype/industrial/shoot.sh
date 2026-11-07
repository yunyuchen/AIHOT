#!/bin/zsh
# 给一个原型拍两张图：shot.jpg（一屏）和 shot-full.jpg（每台手机展开成整页）。
# 用法：./shoot.sh <目录名>，例如 ./shoot.sh catalog。要在沙箱外跑（headless Chrome）。
set -e
cd "${0:A:h}"
dir="$1"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
url="file://$PWD/$dir/index.html"
# 四台手机：40 + 4×390 + 3×40 + 40，再给手机外框和标题留余量。
# Chrome 只出 PNG，拍完转成 JPG（入库的图小一些），长图再缩到一半。
"$chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1800,1060 \
  --virtual-time-budget=3000 --screenshot="$PWD/$dir/shot.raw.png" "$url" 2>/dev/null
"$chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1800,6000 \
  --virtual-time-budget=3000 --screenshot="$PWD/$dir/shot-full.raw.png" "$url?full=1" 2>/dev/null
magick "$PWD/$dir/shot.raw.png" -quality 85 "$PWD/$dir/shot.jpg"
# 去掉底部多余的背景。
magick "$PWD/$dir/shot-full.raw.png" -background "#8a8f92" -define trim:edges=south -trim +repage \
  -bordercolor "#8a8f92" -border 0x30 -resize 50% -quality 82 "$PWD/$dir/shot-full.jpg"
rm -f "$PWD/$dir/shot.raw.png" "$PWD/$dir/shot-full.raw.png"
magick identify "$PWD/$dir/shot.jpg" "$PWD/$dir/shot-full.jpg"
