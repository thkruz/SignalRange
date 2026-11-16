"""Local transcription for vo-qc.mjs. Usage: python vo-qc-transcribe.py [--model small.en] [--jobs jobs.json | file1.mp3 file2.mp3 ...]
jobs.json is a list of {file, prompt}; prompt is an initial_prompt of names/jargon that biases spelling.
Prints one JSON object per line: {file, text, words:[{w,start,end}], duration}. CPU int8, no network after the model is cached."""
import json, subprocess, sys
import numpy as np
from faster_whisper import WhisperModel

args = sys.argv[1:]
model_name = "small.en"
if args and args[0] == "--model":
    model_name, args = args[1], args[2:]
def load(path):
    # ffmpeg decode (PyAV in some builds rejects its own container options)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


model = WhisperModel(model_name, device="cpu", compute_type="int8")
jobs = [{"file": f, "prompt": None} for f in args]
if args and args[0] == "--jobs":
    jobs = json.load(open(args[1], encoding="utf-8"))
for job in jobs:
    f = job["file"]
    segs, info = model.transcribe(load(f), language="en", word_timestamps=True, beam_size=5, vad_filter=False, condition_on_previous_text=False, initial_prompt=job.get("prompt"))
    words = []
    for s in segs:
        for w in s.words or []:
            words.append({"w": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)})
    print(json.dumps({"file": f, "text": " ".join(w["w"] for w in words), "words": words, "duration": round(info.duration, 3)}), flush=True)
