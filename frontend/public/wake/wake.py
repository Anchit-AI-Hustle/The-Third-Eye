#!/usr/bin/env python3
# The Third Eye on a computer with no tab open: says "Hey JARVIS" -> talk mode.
# Offline name spotting with Vosk (Apache-2.0): the grammar holds only the
# assistants' names, so no other speech is recognised and nothing is sent anywhere.
import json, os, queue, subprocess, sys, time, webbrowser

import sounddevice as sd
from vosk import KaldiRecognizer, Model, SetLogLevel

SITE = os.environ.get("THIRD_EYE_URL", "https://the-third-eye.anchit-tandon.com").rstrip("/")
MODEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model")
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
            pass
    webbrowser.open(url)


def listen():
    rec = KaldiRecognizer(Model(MODEL), 16000, json.dumps(NAMES))
    rec.SetWords(True)
    audio = queue.Queue()
    last = 0.0
    with sd.RawInputStream(samplerate=16000, blocksize=1600, dtype="int16", channels=1,
                           callback=lambda data, frames, t, status: audio.put(bytes(data))):
        print("Listening for \"Hey JARVIS\"...", flush=True)
        while True:
            if not rec.AcceptWaveform(audio.get()):
                continue
            result = json.loads(rec.Result())
            if heard_name(result) and time.time() - last > COOLDOWN_S:
                last = time.time()
                print("Heard: " + result.get("text", ""), flush=True)
                open_talk()


if __name__ == "__main__":
    SetLogLevel(-1)
    while True:
        try:
            listen()
        except KeyboardInterrupt:
            sys.exit(0)
        except Exception as e:
            # Headphones unplugged, mic switched, laptop woke from sleep: reopen it.
            print("Microphone unavailable (%s); retrying..." % e, flush=True)
            time.sleep(5)
