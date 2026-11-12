package com.jarvis.app;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

// "Hey JARVIS" heard on the phone itself, offline: Vosk (Apache-2.0) with a
// grammar of just the assistants' names, so nothing leaves the device until
// the name is said. The Indian-English model (~36 MB) downloads once.
final class WakeWord {
    private static final String MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-en-in-0.4.zip";
    // Everyday words compete with the names in the grammar, so ordinary speech
    // ("Harvey and Davis will present") matches them rather than "jarvis".
    private static final String COMMON =
        "a able about above act add after again against ago air all also always among an and animal " +
        "answer any appear are area as ask at back base be beauty been before began begin behind best " +
        "better between big bird black blue boat body book both box boy bring brought budget build busy " +
        "but by call came can car care carry carvings cause center certain change check children city " +
        "class clear close cold color come common complete contain correct could country course cover " +
        "cross cry cut dark davis day decide deep develop did differ direct distant do does dog don't " +
        "done door down draw drive dry during each early earth ease east eat end enough equate even ever " +
        "every everyone example eye face fact fall family far farm fast father feel feet few field figure " +
        "fill final find fine fire first fish five fly follow food foot for force form found four free " +
        "friend from front full game garage gave get girl give go gold good got govern great green ground " +
        "group grow had half hand happen hard harvey has have hay he head hear heard heat hello help her " +
        "here hey hi high him his hold home horse hot hour house how hundred i idea if in inch interest " +
        "is island it jars just keep kind king knew know land language large last late laugh lay lead " +
        "learn leave left less let letter life light like line list listen little live long look love low " +
        "lunch machine made main make man many map maria mark marvelous may me mean measure meeting men " +
        "might mile mind minute miss monday money moon more morning most mother mountain move much " +
        "multiply music must my name near need nervous never new next night no north not note nothing " +
        "notice noun now number numeral object ocean of off office often oh okay old on once one only " +
        "open or order other our out over own page paint paper part pass pattern people person picture " +
        "piece place plain plan plane plant play point port pose possible pound power press problem " +
        "produce product pull put question quick rain ran reach read ready real record red remember " +
        "report rest right river road rock room round rule run said sales same saw say school science sea " +
        "second see seem self sentence serve service set several shape she ship short should show side " +
        "simple since sing six slow small snow so some song soon sound south space special spell stand " +
        "star start state stay stead step still stood stop story street strong study such sun sunday sure " +
        "surface system table tail take talk teach team tell ten test than that the their them then there " +
        "these they thing think this those though thought thousand three through thursday time tire to " +
        "today together told too took top toward town travel travis tree true try turn two under unit " +
        "until up us use usual verb very voice vowel wait walk want war warm was watch water way we week " +
        "well went were west what wheel when where which while white who whole why will wind with wonder " +
        "wood word work world would write year yes you young your ";
    // A grammar of only names forces some match onto any speech ("it is cold
    // today" comes back as "jarvis"), but with low confidence; a name really
    // said scores ~1.
    private static final double MIN_CONF = 0.9;
    private static Model model;

    private final Recognizer recognizer;

    private WakeWord(Recognizer r) { recognizer = r; }

    /** Null until the model is on the device; the first call downloads it (blocking, so call off the main thread). */
    static WakeWord open(Context ctx) {
        try {
            if (model == null) {
                File dir = new File(ctx.getFilesDir(), "vosk");
                File ready = new File(dir, ".ready");
                if (!ready.exists()) {
                    download(dir);
                    if (!ready.createNewFile()) throw new IllegalStateException("model marker not written");
                }
                model = new Model(modelRoot(dir).getAbsolutePath());
            }
            Recognizer r = new Recognizer(model, 16_000f, grammar());
            r.setWords(true);
            return new WakeWord(r);
        } catch (Exception e) {
            return null;
        }
    }

    /** True when this audio (16 kHz mono PCM) ends an utterance that said an assistant's name. */
    boolean feed(short[] pcm, int n) {
        try {
            if (!recognizer.acceptWaveForm(pcm, n)) return false;
            JSONArray words = new JSONObject(recognizer.getResult()).optJSONArray("result");
            for (int i = 0; words != null && i < words.length(); i++) {
                JSONObject w = words.getJSONObject(i);
                JSONObject before = i > 0 ? words.getJSONObject(i - 1) : null;
                boolean hey = before != null && "hey".equals(before.optString("word")) && before.optDouble("conf", 0) >= MIN_CONF;
                double conf = w.optDouble("conf", 0);
                String word = w.optString("word");
                if ("jarvis".equals(word) && (conf >= MIN_CONF || (hey && conf >= 0.75))) return true;
                if (hey && conf >= MIN_CONF && word.matches("friday|edith|zeus|athena")) return true;
            }
        } catch (Exception ignored) { /* a malformed result is no wake */ }
        return false;
    }

    void close() { recognizer.close(); }

    private static String grammar() {
        JSONArray g = new JSONArray();
        for (String p : new String[] {"hey jarvis", "jarvis", "hey friday", "hey edith", "hey zeus", "hey athena"}) g.put(p);
        for (String w : COMMON.trim().split(" ")) g.put(w);
        return g.put("[unk]").toString();
    }

    private static File modelRoot(File dir) {
        File[] kids = dir.listFiles(File::isDirectory);
        return kids != null && kids.length == 1 ? kids[0] : dir;
    }

    private static void download(File dir) throws Exception {
        dir.mkdirs();
        HttpURLConnection c = (HttpURLConnection) new URL(MODEL_URL).openConnection();
        try (InputStream in = c.getInputStream(); ZipInputStream zip = new ZipInputStream(in)) {
            byte[] buf = new byte[64 * 1024];
            for (ZipEntry e; (e = zip.getNextEntry()) != null; ) {
                File out = new File(dir, e.getName());
                // Zip-slip guard: the separator stops "vosk-evil/" passing as inside "vosk".
                if (!out.getCanonicalPath().startsWith(dir.getCanonicalPath() + File.separator)) continue;
                if (e.isDirectory()) { out.mkdirs(); continue; }
                out.getParentFile().mkdirs();
                try (FileOutputStream f = new FileOutputStream(out)) {
                    for (int r; (r = zip.read(buf)) > 0; ) f.write(buf, 0, r);
                }
            }
        } finally {
            c.disconnect();
        }
    }

}
