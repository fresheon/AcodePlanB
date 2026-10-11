# Editor appearance test build

This branch contains the complete Acode source tree and a debug APK with editor appearance settings.

Download `acode-editor-appearance-debug.apk` from this directory using GitHub's download button. Verify it against `SHA256SUMS` if desired. The package ID is `com.foxdebug.acode`; the APK uses a development signature. An existing installation with a different signature cannot be updated in place. Back up app data before uninstalling an existing app.

The header now has two buttons beside the pencil:

- An eye in read-only mode, or a crossed-out eye in editing mode. Click it to invoke the existing read-only command. The original menu entry remains synchronized.
- A fullscreen icon that shows only the active editor pane. Click the top-right corner once (or press Escape) to restore the original pane layout. Switching to another file or closing the fullscreen file also exits.

Read-only text cannot be selected by tap, double click or long press and has no visible cursor or active-line highlight. Scrolling is retained. Switching back to editing restores ordinary selection and input. Entering fullscreen switches the active file to read-only. Exiting keeps it read-only until the eye button is clicked outside fullscreen. The global fullscreen preference is unchanged.

Under Settings → Editor settings, test:

- Editor background color and default text color; syntax highlighting retains its theme colors.
- Line height 1, 2, 2.5 and 4 (unitless font-size multipliers).
- Paragraph spacing 0–80px, which adds visual spacing before a nonempty paragraph after blank lines without changing the file. The paragraph-start line number stays aligned.
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

With paging enabled and the editor read-only, swipe right from the text viewport's left half for the previous page, or left from its right half for the next page. The horizontal distance must reach the configured threshold and exceed vertical movement. At 0px, tap the left/right half for previous/next page. Each page is one visible text viewport; positions clamp to document boundaries. Paging does not change file contents or selection. Disabling removes paging gesture handlers and restores normal interactions. Vertical scrolling remains available.

The fullscreen clock and battery remain 12px, now 5px below the screen top; the blank gap to text remains 30px. The exit corner still hides after four seconds and remains clickable.

Validation: 739 unit tests passed, 1 skipped; type checking, Biome, Rspack, Chromium touch swipes/tap paging/disable restoration and status spacing passed. Android APK build and signature verification passed. Physical tablet validation of this update is pending.

## Editing and fullscreen read-only fix

The previous paging extension captured mouse/pointer clicks and disabled text selection even when the file was editable, preventing caret placement and keyboard activation. Paging event interception and styles now only apply while CodeMirror is read-only, and respond immediately to read-only changes. Editing retains normal cursor placement, input and vertical scrolling even with the paging preference enabled.

Entering editor fullscreen switches to read-only. The eye control is disabled in fullscreen and the shared read-only command also refuses fullscreen toggles. Exiting stays read-only; click the eye outside fullscreen to edit. An external read-only update that tries to enable editing in fullscreen is reset to read-only.

Validation: 741 unit tests passed, 1 skipped; TypeScript, Biome, Rspack, Chromium focus/text input with tap paging enabled, swipe suspension during editing, paging in read-only mode, fullscreen read-only and exit state passed. Android APK build and signature verification passed. Physical tablet IME activation still requires device testing.
