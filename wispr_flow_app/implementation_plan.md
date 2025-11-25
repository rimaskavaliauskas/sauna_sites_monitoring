# Wispr Flow Clone Implementation Plan

## Goal
Build a desktop background application in Python that replicates "Wispr Flow" dictation functionality. The app will record audio while F2 is held, transcribe it locally using Whisper, refine the text using Gemini API, and inject it into the active window.

## User Review Required
> [!IMPORTANT]
> - **API Key**: You will need a valid Google Gemini API Key.
> - **Hardware**: Local transcription with Whisper 'base' model requires some CPU/GPU resources.
> - **Permissions**: The app requires microphone access and permission to control the keyboard (pyautogui/keyboard).

## Proposed Changes

### Directory Structure
Creating a new directory `wispr_flow_app/` in the root workspace.

### Dependencies
[NEW] [requirements.txt](file:///d:/AI/aleksandro%20kursas/cloudflare-agent/wispr_flow_app/requirements.txt)
- openai-whisper
- pyaudio
- keyboard
- pyautogui
- google-generativeai
- tkinter (usually built-in, but listed for awareness)
- torch (dependency of whisper)

### Core Logic
[NEW] [main.py](file:///d:/AI/aleksandro%20kursas/cloudflare-agent/wispr_flow_app/main.py)
- Entry point.
- Initializes GUI and background threads.

[NEW] [audio_recorder.py](file:///d:/AI/aleksandro%20kursas/cloudflare-agent/wispr_flow_app/audio_recorder.py)
- Handles `pyaudio` stream.
- Listens for F2 key events using `keyboard`.
- Saves audio to temporary WAV file.

[NEW] [transcriber.py](file:///d:/AI/aleksandro%20kursas/cloudflare-agent/wispr_flow_app/transcriber.py)
- Loads `openai-whisper` base model.
- Transcribes WAV file to text.

[NEW] [refiner.py](file:///d:/AI/aleksandro%20kursas/cloudflare-agent/wispr_flow_app/refiner.py)
- Sends text to Gemini API for refinement.
- Prompt: "Fix grammar, punctuation, and improve flow slightly, but keep the tone authentic. Return only the fixed text."

[NEW] [injector.py](file:///d:/AI/aleksandro%20kursas/cloudflare-agent/wispr_flow_app/injector.py)
- Uses `pyautogui` to type text.

[NEW] [gui.py](file:///d:/AI/aleksandro%20kursas/cloudflare-agent/wispr_flow_app/gui.py)
- Tkinter window.
- API Key input field (saved to local file).
- Status label.

## Verification Plan

### Automated Tests
- No automated unit tests planned for this interactive desktop app.

### Manual Verification
1. **Setup**:
   - Install dependencies: `pip install -r requirements.txt`
   - Run app: `python main.py`
2. **GUI Check**:
   - Verify window appears.
   - Verify API Key field allows pasting.
   - Verify Status label says "Ready".
3. **Functional Test**:
   - Enter a valid Gemini API Key.
   - Open a text editor (e.g., Notepad).
   - Hold **F2**.
   - Speak a sentence (e.g., "hello world this is a test").
   - Release **F2**.
   - Observe Status label: "Listening..." -> "Processing...".
   - Verify text is typed into Notepad: "Hello world, this is a test." (or similar refined output).
