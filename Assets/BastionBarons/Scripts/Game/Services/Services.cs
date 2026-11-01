using System;
using System.Collections.Generic;
using System.IO;
using BastionBarons.Core;
using UnityEngine;

namespace BastionBarons.Game
{
    /// <summary>Carrega o conteúdo de jogo (cartas, Barões, castelos, balanceamento).</summary>
    public static class ContentLoader
    {
        public const string ResourcePath = "Data/content";
        /// <summary>
        /// Arquivo baixado do servidor/painel admin (Fase 5/6). Se existir e for válido, substitui o embutido —
        /// permite rebalancear sem publicar nova versão do app.
        /// </summary>
        public static string OverridePath { get { return Path.Combine(Application.persistentDataPath, "content_override.json"); } }

        public static ContentDatabase LoadDefault()
        {
            var ta = Resources.Load<TextAsset>(ResourcePath);
            if (ta == null) throw new InvalidOperationException("Resources/" + ResourcePath + ".json não encontrado");
            return Parse(ta.text);
        }

        public static ContentDatabase Parse(string json)
        {
            return new ContentDatabase(JsonUtility.FromJson<ContentFile>(json));
        }

        public static ContentDatabase Load()
        {
            try
            {
                if (File.Exists(OverridePath)) return Parse(File.ReadAllText(OverridePath));
            }
            catch (Exception e)
            {
                Debug.LogWarning("[Content] Override inválido, usando conteúdo embutido: " + e.Message);
            }
            return LoadDefault();
        }
    }

    /// <summary>Salvamento local atômico do perfil (modo visitante / offline).</summary>
    public class SaveService
    {
        readonly string path;

        public SaveService(string fileName = "profile.json")
        {
            path = Path.Combine(Application.persistentDataPath, fileName);
        }

        public string FilePath { get { return path; } }

        public PlayerProfile LoadOrCreate(ContentDatabase content)
        {
            try
            {
                if (File.Exists(path))
                {
                    var p = JsonUtility.FromJson<PlayerProfile>(File.ReadAllText(path));
                    if (p != null && !string.IsNullOrEmpty(p.playerId))
                    {
                        Progression.Repair(p, content);
                        return p;
                    }
                }
            }
            catch (Exception e)
            {
                Debug.LogError("[Save] Perfil corrompido, criando backup: " + e.Message);
                try { File.Copy(path, path + ".corrupt", true); } catch (Exception) { }
            }
            var np = Progression.CreateNewProfile(content, Guid.NewGuid().ToString("N"));
            Save(np);
            return np;
        }

        public void Save(PlayerProfile p)
        {
            try
            {
                string tmp = path + ".tmp";
                File.WriteAllText(tmp, JsonUtility.ToJson(p));
                File.Copy(tmp, path, true);
                File.Delete(tmp);
            }
            catch (Exception e)
            {
                Debug.LogError("[Save] Falha ao salvar: " + e.Message);
            }
        }

        public void Delete()
        {
            if (File.Exists(path)) File.Delete(path);
        }
    }

    [Serializable] class LocEntry { public string k; public string v; }
    [Serializable] class LocFile { public LocEntry[] entries; }

    /// <summary>Textos localizados. Nenhum texto de interface fica fixo no código.</summary>
    public static class Localization
    {
        /// <summary>Idiomas com tabela completa. es, fr e de estão planejados (ver docs/STATUS.md).</summary>
        public static readonly string[] Languages = { "pt-BR", "en" };
        public static readonly string[] LanguageNames = { "Português (Brasil)", "English" };
        public static string Current { get; private set; }

        static Dictionary<string, string> table = new Dictionary<string, string>();
        static Dictionary<string, string> fallback = new Dictionary<string, string>();

        public static void Init(string lang)
        {
            if (string.IsNullOrEmpty(lang) || Array.IndexOf(Languages, lang) < 0)
                lang = Application.systemLanguage == SystemLanguage.Portuguese ? "pt-BR" : "en";
            Set(lang);
        }

        public static void Set(string lang)
        {
            Current = lang;
            table = Load(lang);
            fallback = lang == "en" ? table : Load("en");
        }

        static Dictionary<string, string> Load(string lang)
        {
            var d = new Dictionary<string, string>();
            var ta = Resources.Load<TextAsset>("Localization/" + lang);
            if (ta == null) return d;
            var f = JsonUtility.FromJson<LocFile>(ta.text);
            if (f != null && f.entries != null) foreach (var e in f.entries) d[e.k] = e.v;
            return d;
        }

        public static bool Has(string key) { return table.ContainsKey(key) || fallback.ContainsKey(key); }

        public static string T(string key)
        {
            string v;
            if (table.TryGetValue(key, out v)) return v;
            if (fallback.TryGetValue(key, out v)) return v;
            return key;
        }

        public static string T(string key, params object[] args)
        {
            try { return string.Format(T(key), args); }
            catch (FormatException) { return T(key); }
        }

        public static string CardName(string id) { return T("card." + id + ".name"); }
        public static string CardDesc(string id) { return T("card." + id + ".desc"); }
        public static string BaronName(string id) { return T("baron." + id + ".name"); }
        public static string CastleName(string id) { return T("castle." + id + ".name"); }
    }

    /// <summary>
    /// Áudio. Procura clipes definitivos em Resources/Audio/&lt;id&gt; e, se não houver, gera sons procedurais
    /// originais como provisório (ver docs/ASSETS.md para a lista de substituição).
    /// </summary>
    public class AudioService : MonoBehaviour
    {
        public static AudioService Instance { get; private set; }
        AudioSource music, sfx;
        readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();
        const int Rate = 22050;
        readonly Dictionary<string, float> lastPlayed = new Dictionary<string, float>();

        void Awake()
        {
            Instance = this;
            music = gameObject.AddComponent<AudioSource>();
            music.loop = true;
            music.playOnAwake = false;
            sfx = gameObject.AddComponent<AudioSource>();
            sfx.playOnAwake = false;
        }

        public void SetVolumes(float musicVol, float sfxVol)
        {
            music.volume = Mathf.Clamp01(musicVol) * 0.5f;
            sfx.volume = Mathf.Clamp01(sfxVol);
        }

        public void Play(string id, float volume = 1f)
        {
            float last;
            if (lastPlayed.TryGetValue(id, out last) && Time.unscaledTime - last < 0.05f) return; // evita empilhar sons idênticos
            lastPlayed[id] = Time.unscaledTime;
            var c = Get(id);
            if (c != null) sfx.PlayOneShot(c, volume);
        }

        public void PlayMusic(string id)
        {
            var c = Get(id);
            if (c == null || (music.clip == c && music.isPlaying)) return;
            music.clip = c;
            music.Play();
        }

        public void StopMusic() { music.Stop(); }

        AudioClip Get(string id)
        {
            AudioClip c;
            if (clips.TryGetValue(id, out c)) return c;
            c = Resources.Load<AudioClip>("Audio/" + id);
            if (c == null) c = Generate(id);
            clips[id] = c;
            return c;
        }

        static AudioClip Make(string name, float seconds, Func<float, System.Random, float> wave)
        {
            int n = Mathf.Max(1, (int)(Rate * seconds));
            var data = new float[n];
            var rnd = new System.Random(name.GetHashCode());
            for (int i = 0; i < n; i++) data[i] = Mathf.Clamp(wave(i / (float)Rate, rnd), -1f, 1f);
            var clip = AudioClip.Create(name, n, 1, Rate, false);
            clip.SetData(data, 0);
            return clip;
        }

        static float Sin(float f, float t) { return Mathf.Sin(2f * Mathf.PI * f * t); }
        static float Noise(System.Random r) { return (float)(r.NextDouble() * 2.0 - 1.0); }

        static AudioClip Generate(string id)
        {
            switch (id)
            {
                case "click": return Make(id, 0.07f, (t, r) => Sin(1100f, t) * Mathf.Exp(-t * 60f) * 0.5f);
                case "card": return Make(id, 0.18f, (t, r) => Sin(500f + 900f * t * 5f, t) * Mathf.Exp(-t * 18f) * 0.4f);
                case "spawn": return Make(id, 0.3f, (t, r) => (Sin(t < 0.1f ? 392f : t < 0.2f ? 523f : 659f, t)) * Mathf.Exp(-(t % 0.1f) * 20f) * 0.35f);
                case "sword": return Make(id, 0.15f, (t, r) => (Noise(r) * 0.6f + Sin(1800f, t) * 0.4f) * Mathf.Exp(-t * 30f) * 0.35f);
                case "bow": return Make(id, 0.18f, (t, r) => Sin(900f - 2500f * t, t) * Mathf.Exp(-t * 20f) * 0.3f);
                case "magic": return Make(id, 0.45f, (t, r) => Sin(600f + 300f * Mathf.Sin(t * 40f), t) * Mathf.Exp(-t * 6f) * 0.3f);
                case "explosion": return Make(id, 0.6f, (t, r) => (Noise(r) * 0.8f + Sin(70f, t) * 0.5f) * Mathf.Exp(-t * 6f) * 0.5f);
                case "dragon": return Make(id, 0.7f, (t, r) => (Noise(r) * 0.5f + Sin(110f + 40f * Mathf.Sin(t * 12f), t) * 0.6f) * Mathf.Sin(Mathf.PI * t / 0.7f) * 0.45f);
                case "castle_hit": return Make(id, 0.35f, (t, r) => (Sin(90f, t) + Noise(r) * 0.3f) * Mathf.Exp(-t * 10f) * 0.5f);
                case "death": return Make(id, 0.25f, (t, r) => Sin(300f - 600f * t, t) * Mathf.Exp(-t * 12f) * 0.3f);
                case "baron": return Make(id, 0.9f, (t, r) => (Sin(262f, t) + Sin(330f, t) + Sin(392f, t) + Sin(523f, t * (t > 0.3f ? 1f : 0f))) * 0.12f * Mathf.Min(1f, t * 20f) * Mathf.Exp(-t * 2.5f));
                case "victory": return Make(id, 1.6f, (t, r) => { float[] n = { 523f, 659f, 784f, 1047f }; int k = Mathf.Min(3, (int)(t / 0.25f)); return (Sin(n[k], t) + 0.5f * Sin(n[k] * 2f, t)) * 0.25f * Mathf.Exp(-(t - k * 0.25f) * (k == 3 ? 1.5f : 6f)); });
                case "defeat": return Make(id, 1.4f, (t, r) => { float[] n = { 392f, 349f, 311f, 262f }; int k = Mathf.Min(3, (int)(t / 0.3f)); return Sin(n[k], t) * 0.25f * Mathf.Exp(-(t - k * 0.3f) * 3f); });
                case "music_menu": return Music(id, 70f, new[] { 262f, 220f, 175f, 196f }, false);
                case "music_battle": return Music(id, 110f, new[] { 220f, 175f, 196f, 165f }, true);
                default: return Make(id, 0.1f, (t, r) => Sin(660f, t) * Mathf.Exp(-t * 30f) * 0.3f);
            }
        }

        /// <summary>Loop musical procedural simples (pad + baixo + percussão opcional), sem uso de material de terceiros.</summary>
        static AudioClip Music(string name, float bpm, float[] roots, bool drums)
        {
            float beat = 60f / bpm;
            float chordLen = beat * 4f;
            float total = chordLen * roots.Length * 2f;
            return Make(name, total, (t, r) =>
            {
                int ci = (int)(t / chordLen) % roots.Length;
                float root = roots[ci];
                float local = t % chordLen;
                float env = Mathf.Min(1f, local * 4f) * Mathf.Min(1f, (chordLen - local) * 4f);
                float pad = (Sin(root, t) + Sin(root * 1.26f, t) * 0.7f + Sin(root * 1.5f, t) * 0.6f) * 0.08f * env;
                float bt = t % beat;
                float bass = Sin(root * 0.5f, t) * Mathf.Exp(-bt * 4f) * 0.18f;
                float arp = Sin(root * (new[] { 2f, 2.52f, 3f, 4f })[(int)(t / (beat * 0.5f)) % 4], t) * Mathf.Exp(-(t % (beat * 0.5f)) * 8f) * 0.06f;
                float drum = 0f;
                if (drums)
                {
                    drum += Sin(60f, bt) * Mathf.Exp(-bt * 25f) * 0.35f;
                    float half = (t + beat * 0.5f) % beat;
                    drum += Noise(r) * Mathf.Exp(-half * 40f) * 0.08f;
                }
                return pad + bass + arp + drum;
            });
        }
    }

    /// <summary>Perfis de qualidade gráfica e taxa de quadros.</summary>
    public static class QualityService
    {
        public static void Apply(int level)
        {
            level = Mathf.Clamp(level, 0, 2);
            int count = QualitySettings.names.Length;
            if (count > 0) QualitySettings.SetQualityLevel(Mathf.RoundToInt(level / 2f * (count - 1)), true);
            Application.targetFrameRate = level == 0 ? 30 : 60;
            QualitySettings.vSyncCount = 0;
            QualitySettings.shadows = level == 2 ? ShadowQuality.HardOnly : ShadowQuality.Disable;
        }
    }
}
