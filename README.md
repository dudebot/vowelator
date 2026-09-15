# Vowelator

**[Open the app](https://dudebot.github.io/vowelator/)**

A browser toy that strips consonants out of speech and leaves the howl. Drop a rant (audio or video). It finds the vowel nuclei, throws away the rest, and concatenates what’s left — Courage the Cowardly Dog explaining horrors, except it’s whoever you fed it.

Inspired by [this post](https://x.com/C_hoffmanni/status/2099676754558255615).

Everything runs on your machine. Export is a `.wav` of the result plus an `.ffconcat` cut list if you want to rebuild the same edit in ffmpeg.

```bash
ffmpeg -f concat -safe 0 -i rant-vowels.ffconcat -c copy rant-vowels.m4a
```
