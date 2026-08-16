---
name: expo-go-native-modules-gotcha
description: Picker wheels render blank in Expo Go — must use the dev build from expo run:ios
metadata: 
  node_type: memory
  type: project
  originSessionId: a3b7ed7e-c584-4e86-b50f-d1bfef5975c3
---

Randoro depends on native modules that **do not work in Expo Go**: `@react-native-picker/picker` (the duration/rounds scroll wheels) and the AVAudioSession plugin (background audio routing).

**Symptom:** the duration/rounds picker wheels render as empty grey rows — no numbers. This is NOT a code bug. It means the app is running in Expo Go, whose runtime lacks the native picker module, so the JS `<Picker>` loads but its native `UIPickerView` backing view isn't present.

**Fix:** run the dev build via `npx expo run:ios --device`. After it's installed, `npx expo start` can serve JS reloads to it — but you must open the **dev build** app on the device, not Expo Go. They look identical; only the dev build has the native modules. Deleting Expo Go from the device avoids accidentally connecting to it.

**Why this cost real time (2026-07):** spent a long session convinced the blank wheels were caused by Dynamic Type / `itemStyle` / height changes in SetupScreen. Reverted picker code repeatedly, diffed commits — the JS was byte-identical to a working state. The actual variable was the runtime (Expo Go vs dev build), not the code. First diagnostic question for any "native component renders blank / same code worked before" should be: which runtime is it running in?

Documented in the README "Running locally" section. Related: [[project_audio_session]].
