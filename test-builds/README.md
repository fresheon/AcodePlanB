# Editor appearance test build

This branch contains the complete Acode source tree and a debug APK with editor appearance settings.

Download `acode-editor-appearance-debug.apk` from this directory using GitHub's download button. Verify it against `SHA256SUMS` if desired. The package ID is `com.foxdebug.acode`; the APK uses a development signature. An existing installation with a different signature cannot be updated in place. Back up app data before uninstalling an existing app.

The original file-tools icon is now a diagonal hammer. Beside it are two buttons:

- An eye in read-only mode, or a pencil with an underline in editing mode. Click it to invoke the existing read-only command. The original menu entry remains synchronized.
- A fullscreen icon that shows only the active editor pane. Click the top-right corner once (or press Escape) to restore the original pane layout. Switching to another file or closing the fullscreen file also exits.

Read-only text cannot be selected by tap, double click or long press and has no visible cursor or active-line highlight. Scrolling is retained. Switching back to editing restores ordinary selection and input. Entering fullscreen switches the active file to read-only. Exiting keeps it read-only until the eye button is clicked outside fullscreen. The global fullscreen preference is unchanged.

Under Settings → Editor settings, test:

- Editor background color and default text color; syntax highlighting retains its theme colors.
- Line height 1, 2, 2.5 and 4 (unitless font-size multipliers).
- Paragraph spacing 0–80px, which adds visual spacing between nonempty paragraphs separated by manual line breaks. Soft-wrapped rows receive no extra spacing; existing blank lines and file contents stay unchanged. The paragraph-start line number stays aligned.
- Left and right text padding 0–80px, including wrapped lines and split panes.
- Restore default appearance, which returns colors to the selected theme and resets spacing/padding while retaining font and line-height settings.
- Reopen the app to check persistence. Switch themes to check that custom colors persist; restore defaults to follow theme colors again.

Validation: 734 unit tests passed, 1 skipped; TypeScript, Biome and Rspack passed; Chromium checks passed for theme reset, padding, line height and paragraph/gutter alignment; Android debug APK build and APK signature verification passed. Chromium also verified reading-mode taps/double-clicks/context menus, hidden cursor/highlight, scrolling, fullscreen viewport sizing, corner exit and restoration of editable selection. Android device interaction has not been verified. Paragraph boundary decorations currently scan the document on edits when paragraph spacing is enabled; evaluate performance with very large files.

Build from the repository root after installing dependencies and preparing Cordova Android 15.1.0:

```sh
printf 'false\n' > /tmp/fdroid.bool
./node_modules/.bin/rspack --mode development
./node_modules/.bin/cordova build android --debug -- --packageType=apk
```

Toolchain used: Node 24, JDK 21, Android API 36, Build Tools 36.0.0, Gradle 8.14.2. Output: `platforms/android/app/build/outputs/apk/debug/app-debug.apk`.

## Toolbar click fix

The original header uses `header.tile`, whose child elements default to `pointer-events: none`. Reading buttons now explicitly opt into pointer hit testing. This fixes both visible-but-unresponsive toolbar icons.

The updated browser regression uses the actual `header.tile` and compiled `www/build/main.css`, checks `elementFromPoint` hit testing, taps both buttons, exits fullscreen through the top-right corner, verifies read-only scrolling/no cursor and types text after returning to editing. The regression is saved at `tests/browser/editorReadingControls.cjs` (requires Playwright and Chromium; run after the Rspack build). The 16 relevant unit tests and Biome check passed; the rebuilt APK passed signature verification. Android device validation remains pending.

## Android immersive reading update

Entering editor fullscreen now hides Android status and navigation bars using WindowInsetsControllerCompat. Exiting restores their previous visibility and behavior; returning to the app re-applies immersive mode while reading. Android still permits temporary system bars through its system swipe gesture.

A top-left clock and battery indicator use the editor's default foreground color. Battery and clock refresh every 15 seconds. Time, battery icon and percentage now use a fixed 12px size. The editor reserves a 5px top inset, a 12px status row and 30px of blank space before the scrollable text.

The top-right exit hint becomes transparent after four seconds, while its 48px corner hit area remains active. Entering again resets the hint. Timers are cleared on exit.

Validation for this update: 735 tests passed, 1 skipped; TypeScript, Biome, Rspack, Chromium touch regression (including invisible corner hit testing), Android APK build and signature verification passed. Physical tablet system-bar behavior and visual matching remain to be tested.

## Status-bar background and spacing correction

Cordova 15 creates a separate native view tagged `statusBarView` and uses its visibility when calculating WebView margins. Reading fullscreen now hides that view as well as Android bars, applies the fullscreen window flag and requests a new inset calculation. Previous background visibility and fullscreen flag are restored on exit.

The browser regression verifies a 12px status row 5px below the screen top, exactly 30px between that row and the text viewport, and the text viewport bottom fitting the screen. Actual tablet behavior still requires device verification.

## Page turning and status top inset

Settings → Editor settings now includes Page turning, immediately followed by Page swipe distance (px). Page turning defaults to off; the distance defaults to 60px and accepts finite nonnegative numbers. Changes persist and immediately reconfigure open editor panes, in ordinary and fullscreen layouts.

With paging enabled and the editor read-only, swipe left anywhere for the next page, or right anywhere for the previous page. The horizontal distance must reach the configured threshold and exceed vertical movement. At 0px, tap the left/right half for previous/next page. Pages follow complete visual rows within the visible text viewport. Partial bottom rows are hidden and start the next page; positions stop when the last document row fits. Paging does not change file contents or selection. Disabling removes paging gesture handlers and restores normal interactions. Vertical scrolling remains available.

The fullscreen clock and battery remain 12px, now 5px below the screen top; the blank gap to text remains 30px. The exit corner still hides after four seconds and remains clickable.

Validation: 739 unit tests passed, 1 skipped; type checking, Biome, Rspack, Chromium touch swipes/tap paging/disable restoration and status spacing passed. Android APK build and signature verification passed. Physical tablet validation of this update is pending.

## Editing and fullscreen read-only fix

The previous paging extension captured mouse/pointer clicks and disabled text selection even when the file was editable, preventing caret placement and keyboard activation. Paging event interception and styles now only apply while CodeMirror is read-only, and respond immediately to read-only changes. Editing retains normal cursor placement, input and vertical scrolling even with the paging preference enabled.

Entering editor fullscreen switches to read-only. The eye control is disabled in fullscreen and the shared read-only command also refuses fullscreen toggles. Exiting stays read-only; click the eye outside fullscreen to edit. An external read-only update that tries to enable editing in fullscreen is reset to read-only.

Validation: 741 unit tests passed, 1 skipped; TypeScript, Biome, Rspack, Chromium focus/text input with tap paging enabled, swipe suspension during editing, paging in read-only mode, fullscreen read-only and exit state passed. Android APK build and signature verification passed. Physical tablet IME activation still requires device testing.

## Toolbar icons and complete-row page boundaries

The existing file-tools action now uses a diagonal hammer. The editing-mode indicator now uses an underlined pencil; read-only retains the eye. Custom SVG masks inherit the header color and keep the existing button actions and hit targets.

Paging now measures actual visual rows with DOM Range rectangles, including wrapped rows and paragraph spacing. A row that does not fully fit at the bottom is clipped out of the current page and becomes the start of the next page. Previous-page navigation restores earlier page boundaries. Temporary bottom scroll space allows the final page to start at a complete row without clipping its top; next-page navigation stops when the final document row fits. Spacing/clipping are removed when paging is disabled or editing resumes. Oversized single rows taller than the entire viewport retain scrolling rather than blanking the viewport.

Validation: 742 unit tests passed, 1 skipped; TypeScript, Biome, Rspack, Chromium touch tests passed, including 17px text at 1.73 line height, wrapped/unwrapped paragraphs with 13px paragraph spacing, no clipped glyphs at either page edge, document-end behavior, icon rendering and restored editing. Android APK build and signature verification passed. Physical tablet validation remains pending.

## Editor color and padding persistence fix

The four appearance override fields have `null` defaults, but saved colors are strings and saved padding values are numbers. The generic settings loader previously compared their types with `typeof null` and reset all four overrides on every launch. The loader now validates those nullable fields explicitly: a supported CSS color or null for colors, a finite number from 0 to 80 or null for padding. Other settings keep their original type checks.

Regression tests instantiate the actual settings singleton repeatedly using the saved JSON, checking save/relaunch, a theme or unrelated preference change followed by another launch, explicit 0px/80px padding, default reset, and missing/invalid fields. Cordova file I/O is simulated in these tests; physical-device restart validation remains pending.

Validation: 745 unit tests passed, 1 skipped; TypeScript, Biome, Rspack, Android APK build and signature verification passed. If an older build already overwrote appearance values with defaults, enter the desired values again after installing this build.

## Paragraph spacing for manual line breaks

Paragraph spacing previously recognized only paragraphs separated by blank lines, so changing the setting had no effect on text with one manual line break between paragraphs. Each nonempty document line after the first now receives the configured extra spacing. Automatic wrapping remains governed by line height; existing blank lines are preserved, and 0px restores the original spacing.

Validation: 746 unit tests passed, 1 skipped; TypeScript, Biome, Rspack, Android debug APK build and signature verification passed. Chromium verified 0px, 18px and 40px spacing and resetting to 0px with and without blank separators, with wrapping enabled and disabled, plus the existing editing, fullscreen and complete-row paging checks. Settings save/relaunch tests verify 0px, 18px, 40px and 80px persistence. Physical tablet validation remains pending.

## Preserve reading position across fullscreen transitions

Moving the pane between its original container and the fullscreen body disconnected its scroll element, resetting browser scroll offsets. Both transitions now capture the current CodeMirror scroll snapshot before changing read-only state or moving the pane, restore horizontal/vertical offsets immediately, and dispatch the snapshot to preserve the visible text anchor during measurement. Exiting captures the current fullscreen page, rather than restoring the position from before entering.

Validation: 746 unit tests passed, 1 skipped; TypeScript, Biome, Rspack, Android debug APK build and signature verification passed. Chromium checks cover entry from reading and editing modes, page advancement in fullscreen and exit at the new page, with wrapping on/off and 18px paragraph spacing, checking the same top document position and subpixel offset. Existing editing, fullscreen and paging regressions passed. Physical tablet validation remains pending.

## Selection, cursor, vertical padding and compact status bar

Editor settings now includes selected-text highlight color and Cursor settings (color), followed by cursor width (greater than 0 and up to 10px). Selection and cursor overrides apply only while editable; read-only guards remain intact. Colors follow the theme until customized. Top/bottom text padding accepts 0–80px, defaults to 30px/0px, persists across launches, and updates open panes immediately. Restore default appearance clears both new colors and restores cursor width and vertical padding defaults.

Page turning and swipe distance now form one contiguous Scrolling category immediately before Scroll settings. The fullscreen status bar is 23px tall: 5px above 12px icons and 6px below them, using the editor background. Fullscreen top padding is the blank gap below this bar; bottom padding reserves the configured gap above the screen bottom. Paging tail padding composes with ordinary bottom text padding. Scroll restoration additionally retains the measured text anchor after the new viewport and padding are measured.

Validation: 747 unit tests passed, 1 skipped; TypeScript, Biome, Rspack, Android debug build and APK signature verification passed. Chromium verifies actual selected-text color, red 4px cursor, 22px top/18px bottom fullscreen gaps, status-bar icon insets, reading/editing fullscreen entry and exit position with wrapping and paragraph spacing, and existing input/paging/complete-row regression checks. Settings JSON save/relaunch tests include both new colors, cursor width and vertical padding. Physical tablet validation remains pending.

## Native selection highlight and four-tap fullscreen hint

The custom selected-text background now overrides the important native-selection rule installed by CodeMirror's drawing extension and any competing selection-layer background. Chromium verifies both the drawn selection and the actual line ::selection style use the configured yellow color; editable-only selectors preserve read-only selection guards.

Four primary pointer taps anywhere in fullscreen, each within 500ms of the previous tap, re-show the original top-right exit hint for four seconds. A tap must last at most 500ms and move no more than 12px; drags, cancelled pointers and slow sequences reset the count. Capture-phase listeners observe taps even when read-only/paging handlers consume events; they do not suppress existing gestures. Listeners, tap counters and timers are removed on exit. The invisible corner remains clickable.

Validation: 748 unit tests passed, 1 skipped; TypeScript, Biome, Rspack, Android debug build and signature verification passed. Chromium checks actual native/drawn selection colors, four taps restoring hint visibility, disappearance after four seconds, corner exit, and the existing fullscreen position, editable input and paging regressions. Unit checks cover slow taps, swipes, the timer boundary and exit cleanup. Physical tablet validation remains pending.

## Clicked paragraph / active-line background color

Cursor and selection now includes Clicked paragraph highlight color (单击段落时高亮色). This separate nullable color controls CodeMirror's cm-activeLine background: the entire logical line/paragraph containing the caret after a single click, including wrapped visual rows. Selected-text background retains its own setting. The new setting immediately reconfigures all editor panes, survives JSON save/relaunch, and restores theme behavior through Restore default appearance. Read-only/fullscreen backgrounds remain transparent through editable-only selectors.

Validation: 748 unit tests passed, 1 skipped; TypeScript, Biome, Rspack, Android debug build and signature verification passed. Chromium performs an actual text tap in editing mode, checks the active-line background becomes the configured green, verifies it is transparent in fullscreen read-only mode, and runs existing selection, cursor, padding, fullscreen position, four-tap hint and page-turning regressions. Settings UI picker and persistence checks include the new field. Physical tablet validation remains pending.

## Lock vertical scrolling during fullscreen page turning

Settings → Editor settings → Scrolling now includes Disable vertical scrolling during horizontal paging (左右翻页时禁止上下滚动) immediately above Scroll settings. It defaults off and persists across launches. With page turning enabled, the preference locks vertical scrolling only in fullscreen read-only mode. Scoped touch-action:none/overflow-y:hidden prevent native panning while allowing programmatic page movement; nonpassive touchmove and wheel guards cover browser gestures. Horizontal swipes and 0px tap paging retain existing behavior. Exiting fullscreen, turning off the lock/paging, or returning to editing restores normal vertical scrolling. Listener cleanup follows compartment reconfiguration and view destruction.

Validation: 748 unit tests passed, 1 skipped; TypeScript, Biome, Rspack, Android debug build and signature verification passed. Chromium checks that vertical touch swipes and mouse-wheel input cannot move the fullscreen viewport while locked, horizontal swipes still advance pages, exit restores scrolling with the setting still enabled, and disabling the setting restores fullscreen scrolling; existing input, position, colors and paging checks passed. Settings placement and save/relaunch tests cover the new preference. Physical tablet validation remains pending.

## Swipe direction independent of screen half

Horizontal paging now uses swipe direction only: left means next page and right means previous page, regardless of the starting screen half. Existing minimum distance and horizontal-over-vertical checks still apply. The page-turning descriptions in English, Simplified Chinese and Traditional Chinese reflect the new directions. At 0px, tap paging remains left-half previous/right-half next. Read-only gating, fullscreen vertical lock and complete-row page boundaries retain their existing behavior.

Validation: 748 unit tests passed, 1 skipped; TypeScript, Biome, Rspack, Android debug build and signature verification passed. Unit and Chromium tests exercise left/right swipes from both halves, below-threshold movements, tap paging, editing suspension and fullscreen vertical lock, alongside the existing display and fullscreen regressions. Physical tablet validation remains pending.

## Updated swipe directions

Per the latest requested direction, left swipes advance to the next page and right swipes return to the previous page from either half of the viewport. All three localized descriptions and the settings fallback match this behavior. 0px tap paging remains unchanged.

Validation: 748 unit tests passed, 1 skipped; TypeScript, Biome, Rspack, Chromium touch regression (both directions from both halves, vertical lock and existing reading/editing checks), Android debug build and APK signature verification passed. Physical tablet validation remains pending.
