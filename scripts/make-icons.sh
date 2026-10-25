#!/bin/zsh
# Renders the app icon, the Android adaptive icon layers and the splash image
# from assets/randoro-icon.svg with headless Chrome (and ffmpeg for the iOS icon).
set -e
cd "${0:A:h}/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP=$(mktemp -d)
SRC=assets/randoro-icon.svg

# iOS: the full square, as is.
cp $SRC $TMP/icon.svg
# Android shows only the middle 72 of the icon's 108 dp, so the artwork is shrunk
# into that area (813 × 108/72 = 1219.5) on a transparent canvas, with the
# baseline run past the edges. The black comes from adaptiveIcon.backgroundColor.
sed -e '/<rect/d' \
    -e 's/viewBox="0 0 813 813"/viewBox="-203.25 -203.25 1219.5 1219.5"/' \
    -e 's/M 0,471/M -210,471/' \
    -e 's/L 813,471/L 1030,471/' \
    $SRC > $TMP/android-icon-foreground.svg
# Monochrome (themed icons): white, with the R spike grey.
sed -e 's/#ef4444/#686868/' $TMP/android-icon-foreground.svg > $TMP/android-icon-monochrome.svg

# iOS splash: the trace across the full screen width, baseline running off both edges.
sed -e '/<rect/d' \
    -e 's/M 0,471/M -10,471/' \
    -e 's/L 813,471/L 823,471/' \
    $SRC > $TMP/splash-ios.svg
# Android 12+ shows the splash image only inside a small centred circle, so the
# trace sits in the middle 60% (813 / 0.6 = 1355).
sed -e '/<rect/d' \
    -e 's/viewBox="0 0 813 813"/viewBox="-271 -271 1355 1355"/' \
    $SRC > $TMP/splash-android.svg

for name in icon android-icon-foreground android-icon-monochrome splash-ios splash-android; do
  echo "<body style=\"margin:0\"><img src=\"$name.svg\" width=\"1024\" height=\"1024\" style=\"display:block\"></body>" > $TMP/$name.html
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --default-background-color=00000000 --window-size=1024,1024 \
    --screenshot="$TMP/$name.png" "file://$TMP/$name.html" 2>/dev/null
done
# The App Store rejects icons with an alpha channel.
ffmpeg -loglevel error -y -i $TMP/icon.png -pix_fmt rgb24 assets/icon.png
cp $TMP/android-icon-foreground.png $TMP/android-icon-monochrome.png $TMP/splash-ios.png $TMP/splash-android.png assets/
rm -r $TMP
echo "Wrote assets/icon.png, android-icon-foreground.png, android-icon-monochrome.png, splash-ios.png and splash-android.png"
