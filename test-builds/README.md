# Editor appearance test build

This branch contains the complete Acode source tree and a debug APK with editor appearance settings.

Download `acode-editor-appearance-debug.apk` from this directory using GitHub's download button. Verify it against `SHA256SUMS` if desired. The package ID is `com.foxdebug.acode`; the APK uses a development signature. An existing installation with a different signature cannot be updated in place. Back up app data before uninstalling an existing app.

The header now has two buttons beside the pencil:

- An eye in read-only mode, or a crossed-out eye in editing mode. Click it to invoke the existing read-only command. The original menu entry remains synchronized.
- A fullscreen icon that shows only the active editor pane. Click the top-right exit icon once (or press Escape) to restore the original pane layout. Switching to another file or closing the fullscreen file also exits.

Read-only text cannot be selected by tap, double click or long press and has no visible cursor or active-line highlight. Scrolling is retained. Switching back to editing restores ordinary selection and input. The fullscreen toggle does not change file editability or the global fullscreen preference.

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
