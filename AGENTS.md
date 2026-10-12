# Android permission policy

The user requires that future changes add no Android permissions unless the
requested functionality needs them. UI, reading progress, paging and bookmark
icons do not need media permissions. Keep READ_MEDIA_AUDIO, READ_MEDIA_IMAGES,
READ_MEDIA_VIDEO and READ_MEDIA_VISUAL_USER_SELECTED out of the built APK.

Verify the final APK permission report using utils/scripts/checkApkPermissions.js
and compare it with the baseline APK. Treat unexpected permission additions as
build failures; do not expand the baseline merely to make a build pass. When a
requested feature needs a permission, document that need and update the policy
and validation deliberately. Preserve file access through user-selected files
and folders. For each new modification task, copy the previous version's branch
into exactly one new feature or fix branch and edit there. The previous branch
is the backup; do not create an additional backup branch. Every delivered APK
must pass signature verification as well as the final permission check.

The user prioritizes conserving usage. Reuse the build pipeline, run focused
tests for changed behavior, and avoid redundant broad checks or unnecessary
tool calls. Keep progress messages brief and avoid frequent status polling.
