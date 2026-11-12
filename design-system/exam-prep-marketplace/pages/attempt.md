# Attempt page override

Inherits [MASTER](../MASTER.md). Single task layout: stable header with overall/section timer and sync state, scrollable question pane, fixed safe-area action bar, collapsible palette. Desktop may show palette beside content. Avoid distracting motion or changing timer width; use tabular digits.

Five states have text/accessibility labels and distinct shape/icon/border cues, not only color. Announce question number, section, selection and marked status. Language switch preserves selected stable option ID, cursor and time. Font zoom applies to question, passage, options and solution review; controls remain usable.

Submit opens answered/skipped/marked counts, warns about unsynced answers and preserves focus. Deadline auto-submit does not depend on modal confirmation. Network loss shows “Saved on this device; waiting to sync” only after successful local commit. Late/rejected events and replaced session are explicit blocking states. No full-screen loading overlay hides the timer during routine sync.

Screen readers receive milestone time warnings rather than every-second announcements. No inaccessible keyboard shortcut intercepts input fields. Sticky controls cannot obscure focused options or long Hindi/math content. Test with TalkBack/VoiceOver and keyboard, not screenshots alone.
