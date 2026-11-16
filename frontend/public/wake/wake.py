#!/usr/bin/env python3
# The Third Eye on a computer, with or without a tab open, all day:
#  - "Hey JARVIS" opens talk mode. Spotted offline with Vosk (Apache-2.0).
#  - With a listener token (Settings -> Activation), the day is logged like the
#    phone does: 45-second chunks, silence skipped, transcribed and filed in the
#    Life Log, where follow-ups become tasks and reminders.
import json, os, queue, subprocess, sys, threading, time, urllib.request, uuid, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import sounddevice as sd
from vosk import KaldiRecognizer, Model, SetLogLevel

SITE = os.environ.get("THIRD_EYE_URL", "https://the-third-eye.anchit-tandon.com").rstrip("/")
HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(HERE, "model")
TOKEN_FILE = os.path.join(HERE, "token")
CHUNK_S = 45
# The website's silence threshold: 0.012 of full scale.
SILENT_PEAK = 393
# The open site asks here whether this computer is already logging, so a tab
# doesn't record the same day twice.
STATUS_PORT = 47321
# Everyday words compete with the names in the grammar, so ordinary speech
# ("Harvey and Davis will present") matches them rather than "jarvis".
COMMON = (
    "a able about above act add after again against ago air all also always among an and animal "
    "answer any appear are area as ask at back base be beauty been before began begin behind best "
    "better between big bird black blue boat body book both box boy bring brought budget build busy "
    "but by call came can car care carry carvings cause center certain change check children city "
    "class clear close cold color come common complete contain correct could country course cover "
    "cross cry cut dark davis day decide deep develop did differ direct distant do does dog don't "
    "done door down draw drive dry during each early earth ease east eat end enough equate even ever "
    "every everyone example eye face fact fall family far farm fast father feel feet few field figure "
    "fill final find fine fire first fish five fly follow food foot for force form found four free "
    "friend from front full game garage gave get girl give go gold good got govern great green ground "
    "group grow had half hand happen hard harvey has have hay he head hear heard heat hello help her "
    "here hey hi high him his hold home horse hot hour house how hundred i idea if in inch interest "
    "is island it jars just keep kind king knew know land language large last late laugh lay lead "
    "learn leave left less let letter life light like line list listen little live long look love low "
    "lunch machine made main make man many map maria mark marvelous may me mean measure meeting men "
    "might mile mind minute miss monday money moon more morning most mother mountain move much "
    "multiply music must my name near need nervous never new next night no north not note nothing "
    "notice noun now number numeral object ocean of off office often oh okay old on once one only "
    "open or order other our out over own page paint paper part pass pattern people person picture "
    "piece place plain plan plane plant play point port pose possible pound power press problem "
    "produce product pull put question quick rain ran reach read ready real record red remember "
    "report rest right river road rock room round rule run said sales same saw say school science sea "
    "second see seem self sentence serve service set several shape she ship short should show side "
    "simple since sing six slow small snow so some song soon sound south space special spell stand "
    "star start state stay stead step still stood stop story street strong study such sun sunday sure "
    "surface system table tail take talk teach team tell ten test than that the their them then there "
    "these they thing think this those though thought thousand three through thursday time tire to "
    "today together told too took top toward town travel travis tree true try turn two under unit "
    "until up us use usual verb very voice vowel wait walk want war warm was watch water way we week "
    "well went were west what wheel when where which while white who whole why will wind with wonder "
    "wood word work world would write year yes you young your "
).split()
NAMES = ["hey jarvis", "jarvis", "hey friday", "hey edith", "hey zeus", "hey athena"] + COMMON + ["[unk]"]
COOLDOWN_S = 8
# A grammar of only names forces some match onto any speech ("it is cold today"
# comes back as "jarvis"), but with low confidence; a name really said scores ~1.
MIN_CONF = 0.9


def heard_name(result):
    words = result.get("result", [])
    for i, w in enumerate(words):
        hey = i > 0 and words[i - 1]["word"] == "hey" and words[i - 1].get("conf", 0) >= MIN_CONF
        conf = w.get("conf", 0)
        if w["word"] == "jarvis" and (conf >= MIN_CONF or (hey and conf >= 0.75)):
            return True
        if w["word"] in ("friday", "edith", "zeus", "athena") and hey and conf >= MIN_CONF:
            return True
    return False


def open_talk():
    url = SITE + "/assistant?talk=1"
    # An open tab of the site is reused rather than a new one opened each time.
    if sys.platform == "darwin":
        host = SITE.split("//")[-1]
        try:
            out = subprocess.run(["osascript", "-e", FOCUS_CHROME % (host, url)], capture_output=True, text=True, timeout=5)
            if out.stdout.strip() == "ok":
                return
        except Exception:
            pass  # Chrome not scriptable (or not installed): open the default browser below.
    webbrowser.open(url)


def token():
    try:
        with open(TOKEN_FILE) as f:
            return f.read().strip()
    except OSError:
        return ""


def wav(pcm):
    n = len(pcm)
    return (b"RIFF" + (36 + n).to_bytes(4, "little") + b"WAVEfmt " + (16).to_bytes(4, "little")
            + (1).to_bytes(2, "little") + (1).to_bytes(2, "little") + (16000).to_bytes(4, "little")
            + (32000).to_bytes(4, "little") + (2).to_bytes(2, "little") + (16).to_bytes(2, "little")
            + b"data" + n.to_bytes(4, "little") + pcm)


def post(path, body, content_type):
    req = urllib.request.Request(SITE + path, data=body, method="POST", headers={
        "Authorization": "Bearer " + token(), "Content-Type": content_type, "User-Agent": "ThirdEyeListener/1",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read() or b"{}")


def deliver(pcm, start, end, silent):
    try:
        text, provider = "", None
        if not silent:
            boundary = uuid.uuid4().hex
            body = (("--%s\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"chunk.wav\"\r\n"
                     "Content-Type: audio/wav\r\n\r\n" % boundary).encode() + wav(pcm)
                    + ("\r\n--%s\r\nContent-Disposition: form-data; name=\"hint\"\r\n\r\nen\r\n--%s--\r\n" % (boundary, boundary)).encode())
            t = post("/api/transcribe", body, "multipart/form-data; boundary=" + boundary)
            text, provider = (t.get("text") or "").strip(), t.get("provider")
        segment = {"id": "d%d" % start, "startTs": start, "endTs": end, "transcript": text, "silent": silent}
        if provider:
            segment["provider"] = provider
        post("/api/lifelog/segment", json.dumps({"segment": segment, "tzOffset": -time.localtime().tm_gmtoff // 60}).encode(), "application/json")
    except Exception as e:
        print("Couldn't file the last recording (%s)" % e, flush=True)


class Status(BaseHTTPRequestHandler):
    def _head(self):
        self.send_header("Access-Control-Allow-Origin", SITE)
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Allow-Methods", "GET")

    def do_OPTIONS(self):
        self.send_response(204)
        self._head()
        self.end_headers()

    def do_GET(self):
        self.send_response(200)
        self._head()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"logging": bool(token()), "wake": True}).encode())

    def log_message(self, *args):
        pass


def serve_status():
    try:
        ThreadingHTTPServer(("127.0.0.1", STATUS_PORT), Status).serve_forever()
    except OSError:
        pass  # Port taken (a second copy running): that copy answers instead.


def listen():
    rec = KaldiRecognizer(Model(MODEL), 16000, json.dumps(NAMES))
    rec.SetWords(True)
    audio = queue.Queue()
    last = 0.0
    chunk, peak, start = bytearray(), 0, int(time.time() * 1000)
    with sd.RawInputStream(samplerate=16000, blocksize=1600, dtype="int16", channels=1,
                           callback=lambda data, frames, t, status: audio.put(bytes(data))):
        print("Listening for \"Hey JARVIS\"%s..." % (" and logging the day" if token() else ""), flush=True)
        while True:
            data = audio.get()
            if token():
                chunk += data
                peak = max(peak, max(abs(int.from_bytes(data[i:i + 2], "little", signed=True)) for i in range(0, len(data), 64)))
                now = int(time.time() * 1000)
                if now - start >= CHUNK_S * 1000:
                    threading.Thread(target=deliver, args=(bytes(chunk), start, now, peak < SILENT_PEAK), daemon=True).start()
                    chunk, peak, start = bytearray(), 0, now
            if not rec.AcceptWaveform(data):
                continue
            result = json.loads(rec.Result())
            if heard_name(result) and time.time() - last > COOLDOWN_S:
                last = time.time()
                print("Heard: " + result.get("text", ""), flush=True)
                open_talk()


if __name__ == "__main__":
    SetLogLevel(-1)
    threading.Thread(target=serve_status, daemon=True).start()
    while True:
        try:
            listen()
        except KeyboardInterrupt:
            sys.exit(0)
        except Exception as e:
            # Headphones unplugged, mic switched, laptop woke from sleep: reopen it.
            print("Microphone unavailable (%s); retrying..." % e, flush=True)
            time.sleep(5)
