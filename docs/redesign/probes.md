# The redesign: probe tables

This file is a record, not a directive to build from. It preserves the measurements of the redesign's design consultation (made on the v1.15.1 build, commit 3f905c1, with the demo loaded, in the pre-installed Chromium) and the arithmetic of the proposal the owner approved as the direction of record. Nothing in this annex is implemented by the structure pass (v1.16.0). The mockup of the direction is beside this file: mockup.html.

All sizes are CSS pixels. "Stage share" is the visible area of the stage as a share of the viewport; "image share" is the visible area of the map image inside the stage. "Today" figures are measured. "Proposed" figures are arithmetic from the proposed chrome sizes and were not measured on a build.

## 1. Today: the stage's share of the viewport (measured)

| Viewport | Layout today | Map: stage | Map: image | Presentation: stage | Presentation: image | Timeline: stage | Map segment page |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2560×1080 | desktop | 48.4 % | 24.9 % | 69.3 % | 47.5 % | 67.4 % | fits |
| 3440×1440 | desktop | 61.8 % | 34.9 % | 76.6 % | 50.9 % | 76.6 % | fits |
| 1920×1080 | desktop | 37.5 % | 24.6 % | 61.7 % | 59.9 % | 61.7 % | fits |
| 2560×1440 | desktop | 55.5 % | 43.8 % | 71.9 % | 68.3 % | 70.5 % | fits |
| 3840×2160 | desktop | 71.8 % | 60.7 % | 80.8 % | 73.5 % | 80.8 % | fits |
| 1920×1200 | desktop | 40.6 % | 32.2 % | 62.8 % | 56.7 % | 62.8 % | fits |
| 2560×1600 | desktop | 57.6 % | 52.6 % | 72.7 % | 67.7 % | 71.4 % | fits |
| 1366×768 | desktop | 27.5 % | 20.4 % | 42.2 % | 38.7 % | 40.2 % | scrolls (page 829 high) |
| 1440×900 | desktop | 25.1 % | 16.9 % | 48.3 % | 43.5 % | 46.5 % | scrolls (page 921 high) |
| 960×1080 | desktop | 13.6 % | 8.5 % | 30.2 % | 12.4 % | 29.1 % | overflows sideways (page 1267 wide) |
| 1280×720 | desktop | 22.7 % | 18.9 % | 37.2 % | 32.7 % | 35.1 % | scrolls (page 781 high) |
| 390×844 | narrow | 68.7 % | 26.5 % | 74 % | 26.5 % | 74 % | fits |
| 320×568 | narrow | 55.8 % | 31.3 % | 63.6 % | 31.3 % | 63.6 % | fits |
| 393×852 | narrow | 68.9 % | 26.5 % | 74.2 % | 26.5 % | 74.2 % | fits |
| 430×932 | narrow | 71.5 % | 26.9 % | 76.3 % | 26.9 % | 76.3 % | fits |
| 412×915 | narrow | 70.9 % | 26.1 % | 75.8 % | 26.1 % | 75.8 % | fits |
| 360×800 | narrow | 66.9 % | 25.5 % | 72.5 % | 25.5 % | 72.5 % | fits |
| 844×390 | narrow | 53.4 % | 20.7 % | 65.4 % | 31.1 % | 65.4 % | fits |
| 768×1024 | narrow | 80.1 % | 46.4 % | 84.6 % | 46.4 % | 84.6 % | fits |
| 1024×768 | desktop | 12.1 % | 9.4 % | 27.1 % | 21.5 % | 25.5 % | overflows sideways (page 1267 wide) |
| 820×1180 | narrow | 82.5 % | 43.2 % | 86.4 % | 43.2 % | 86.4 % | fits |
| 1180×820 | desktop | 21.9 % | 21.3 % | 37.6 % | 30 % | 35.9 % | overflows sideways (page 1267 wide) |

## 2. Today: what the chrome consumes in the Map segment (measured, width×height)

| Viewport | Stage | Header | Map toolbar | Annotation toolbar | Items panel | In view | Legend |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2560×1080 | 1966×680 | 2560×49 | 1966×32 | 1966×29 | 256×992 | 240×992 | 1966×113 |
| 3440×1440 | 2846×1076 | 3440×49 | 2846×32 | 2846×29 | 256×1352 | 240×1352 | 2846×77 |
| 1920×1080 | 1326×586 | 1920×49 | 1326×32 | 1326×50 | 256×992 | 240×992 | 1326×187 |
| 2560×1440 | 1966×1040 | 2560×49 | 1966×32 | 1966×29 | 256×1352 | 240×1352 | 1966×113 |
| 3840×2160 | 3246×1834 | 3840×49 | 3246×32 | 3246×29 | 256×2072 | 240×2072 | 3246×40 |
| 1920×1200 | 1326×706 | 1920×49 | 1326×32 | 1326×50 | 256×1112 | 240×1112 | 1326×187 |
| 2560×1600 | 1966×1200 | 2560×49 | 1966×32 | 1966×29 | 256×1512 | 240×1512 | 1966×113 |
| 1366×768 | 772×384 | 1366×117 | 772×66 | 772×62 | 256×680 | 240×680 | 772×260 |
| 1440×900 | 846×384 | 1440×77 | 846×66 | 846×62 | 256×812 | 240×812 | 846×187 |
| 960×1080 | 366×384 | 960×117 | 366×192 | 366×168 | 256×992 | 240×992 | 366×517 |
| 1280×720 | 686×384 | 1280×117 | 686×66 | 686×83 | 256×632 | 240×632 | 686×298 |
| 390×844 | 364×621 | 390×101 | 364×44 | 364×44 | – | – | – |
| 320×568 | 294×345 | 320×101 | 294×44 | 294×44 | – | – | – |
| 393×852 | 367×629 | 393×101 | 367×44 | 367×44 | – | – | – |
| 430×932 | 404×709 | 430×101 | 404×44 | 404×44 | – | – | – |
| 412×915 | 386×692 | 412×101 | 386×44 | 386×44 | – | – | – |
| 360×800 | 334×577 | 360×101 | 334×44 | 334×44 | – | – | – |
| 844×390 | 818×215 | 844×53 | 818×44 | 818×44 | – | – | – |
| 768×1024 | 742×849 | 768×53 | 742×44 | 742×44 | – | – | – |
| 1024×768 | 430×384 | 1024×117 | 430×134 | 430×126 | 256×680 | 240×680 | 430×442 |
| 820×1180 | 794×1005 | 820×53 | 794×44 | 794×44 | – | – | – |
| 1180×820 | 586×384 | 1180×117 | 586×100 | 586×93 | 256×732 | 240×732 | 586×368 |

A dash means the part is not shown at that size (the narrow layout moves it into an overlay).

## 3. Today: what the chrome consumes in the Presentation segment (measured, width×height)

| Viewport | Stage | Header | Toolbar | Visibility list | In view | Legend |
| --- | --- | --- | --- | --- | --- | --- |
| 2560×1080 | 2042×938 | 2560×36 | 2042×26 | 256×1024 | 200×1024 | 2042×26 |
| 3440×1440 | 2922×1298 | 3440×36 | 2922×26 | 256×1384 | 200×1384 | 2922×26 |
| 1920×1080 | 1402×912 | 1920×36 | 1402×26 | 256×1024 | 200×1024 | 1402×52 |
| 2560×1440 | 2042×1298 | 2560×36 | 2042×26 | 256×1384 | 200×1384 | 2042×26 |
| 3840×2160 | 3322×2018 | 3840×36 | 3322×26 | 256×2104 | 200×2104 | 3322×26 |
| 1920×1200 | 1402×1032 | 1920×36 | 1402×26 | 256×1144 | 200×1144 | 1402×52 |
| 2560×1600 | 2042×1458 | 2560×36 | 2042×26 | 256×1544 | 200×1544 | 2042×26 |
| 1366×768 | 848×522 | 1366×53 | 848×54 | 256×712 | 200×712 | 848×102 |
| 1440×900 | 922×679 | 1440×53 | 922×54 | 256×844 | 200×844 | 922×77 |
| 960×1080 | 442×708 | 960×89 | 442×82 | 256×1024 | 200×1024 | 442×200 |
| 1280×720 | 762×450 | 1280×57 | 762×54 | 256×664 | 200×664 | 762×126 |
| 390×844 | 364×669 | 390×101 | 364×44 | – | – | – |
| 320×568 | 294×393 | 320×101 | 294×44 | – | – | – |
| 393×852 | 367×677 | 393×101 | 367×44 | – | – | – |
| 430×932 | 404×757 | 430×101 | 404×44 | – | – | – |
| 412×915 | 386×740 | 412×101 | 386×44 | – | – | – |
| 360×800 | 334×625 | 360×101 | 334×44 | – | – | – |
| 844×390 | 818×263 | 844×53 | 818×44 | – | – | – |
| 768×1024 | 742×897 | 768×53 | 742×44 | – | – | – |
| 1024×768 | 506×421 | 1024×89 | 506×82 | 256×712 | 200×712 | 506×175 |
| 820×1180 | 794×1053 | 820×53 | 794×44 | – | – | – |
| 1180×820 | 662×550 | 1180×89 | 662×54 | 256×764 | 200×764 | 662×126 |

## 4. Today against the proposal: the Map segment's stage share

The proposed chrome: one 44-pixel bar (48 on phones); the list docked at 288 pixels from 1400 pixels of width, folded to a 44-pixel rail from 1200 to 1399, a drawer below 1200; "In view" docked at 264 pixels from 1920 pixels of width, floating below that; one 56-pixel tool bar at the bottom on phones; one 56-pixel side rail on short landscape screens.

| Viewport | Today | Proposed, default | Proposed, panels folded | Proposed, Presentation | Proposed class |
| --- | --- | --- | --- | --- | --- |
| 2560×1080 | 48.4 % | 75.2 % | 95.9 % | 95.9 % | extra wide |
| 3440×1440 | 61.8 % | 81.4 % | 96.9 % | 96.9 % | extra wide |
| 1920×1080 | 37.5 % | 68.3 % | 95.9 % | 95.9 % | extra wide |
| 2560×1440 | 55.5 % | 76.0 % | 96.9 % | 96.9 % | extra wide |
| 3840×2160 | 71.8 % | 83.9 % | 98.0 % | 98.0 % | extra wide |
| 1920×1200 | 40.6 % | 68.6 % | 96.3 % | 96.3 % | extra wide |
| 2560×1600 | 57.6 % | 76.3 % | 97.3 % | 97.3 % | extra wide |
| 1366×768 | 27.5 % | 91.2 % | 94.3 % | 94.3 % | wide (list as a rail) |
| 1440×900 | 25.1 % | 76.1 % | 95.1 % | 95.1 % | wide |
| 960×1080 | 13.6 % | 95.9 % | 95.9 % | 95.9 % | medium |
| 1280×720 | 22.7 % | 90.7 % | 93.9 % | 93.9 % | wide (list as a rail) |
| 390×844 | 68.7 % | 87.7 % | 87.7 % | 94.3 % | compact |
| 320×568 | 55.8 % | 81.7 % | 81.7 % | 91.5 % | compact |
| 393×852 | 68.9 % | 87.8 % | 87.8 % | 94.4 % | compact |
| 430×932 | 71.5 % | 88.8 % | 88.8 % | 94.8 % | compact |
| 412×915 | 70.9 % | 88.6 % | 88.6 % | 94.8 % | compact |
| 360×800 | 66.9 % | 87.0 % | 87.0 % | 94.0 % | compact |
| 844×390 | 53.4 % | 93.4 % | 93.4 % | 93.4 % | short |
| 768×1024 | 80.1 % | 95.7 % | 95.7 % | 95.7 % | medium |
| 1024×768 | 12.1 % | 94.3 % | 94.3 % | 94.3 % | medium |
| 820×1180 | 82.5 % | 96.3 % | 96.3 % | 96.3 % | medium |
| 1180×820 | 21.9 % | 94.6 % | 94.6 % | 94.6 % | medium |

The proposed breakpoint classes: compact (width under 768), short (height under 500), medium (768 to 1199), wide (1200 to 1919), extra wide (1920 and above). Today's single threshold is 896 pixels of width (56rem), with a landscape clause for low phone screens; the fixed side panels give the desktop layout a least page width of 1,267 pixels, so widths from 897 to 1,266 overflow sideways today.

## 5. The exported viewer (measured, exported from the demo at 1920×1080)

| Viewport | Stage | Stage share | Image share | Header | Toolbar | In view | Legend | Toolbar type | Legend type | In view type | Marker (width, height, number size) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1920×1080 | 1668×912 | 73.4 % | 59.9 % | 1920×33 | 1668×26 | 200×1024 | 1668×52 | 13 px | 12 px | 13 px | 34, 28, 12.8 |
| 3840×2160 | 3588×2018 | 87.3 % | 15 % | 3840×33 | 3588×26 | 200×2104 | 3588×26 | 13 px | 12 px | 13 px | 34, 28, 12.8 |
| 1280×720 | 1028×527 | 58.8 % | 58.8 % | 1280×33 | 1028×26 | 200×664 | 1028×77 | 13 px | 12 px | 13 px | 34, 28, 12.8 |
| 390×844 | 372×692 | 78.2 % | 78.2 % | 390×74 | 372×56 | – | – | 16 px | 12 px | 13 px | 34, 28, 12.8 |

The viewer opens at the file's saved view and is not refitted to the screen it opens on, which is why the image share at 3840×2160 is low. Type and marker sizes do not scale with the screen.

## 6. Contrast of the mockup's tokens (computed, WCAG 2 relative luminance)

| Pair | Light | Dark |
| --- | --- | --- |
| Text on surface | 17.76 | 14.02 |
| Secondary text on surface | 7.86 | 7.81 |
| Secondary text on ground | 7.15 | 8.67 |
| Selection colour on surface | 8.06 | 7.65 |
| Text on the selection colour | 8.06 | 8.26 |
| Control border on surface | 4.21 | 4.01 |
| Marker number on its fill (green, blue, red, neutral) | 5.33, 6.05, 5.59, 5.63 | 7.65, 6.86, 6.03, 7.45 |
| Marker number on yellow | 9.00 | 11.65 |
| Selection colour against the markers (green, blue, yellow, red) | 1.51, 1.33, 4.08, 1.44 | 1.14, 1.27, 1.34, 1.44 |

The selection colour is separated from the marker colours by hue, not by lightness; selection therefore also carries a shape (an underline, a ring, or a fill).

## 7. What was not measured

The documents' pages were not probed in the consultation. The proposed shares were not measured on a build. The mockup's status-to-colour mapping is illustrative.
