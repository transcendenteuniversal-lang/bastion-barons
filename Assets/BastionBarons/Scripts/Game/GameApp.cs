using BastionBarons.Core;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace BastionBarons.Game
{
    /// <summary>Ponto de entrada: cria o GameApp em qualquer cena, sem depender de prefabs.</summary>
    public static class GameBootstrap
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            if (GameApp.Instance != null) return;
            var go = new GameObject("BastionBarons");
            Object.DontDestroyOnLoad(go);
            go.AddComponent<GameApp>();
        }
    }

    public class GameApp : MonoBehaviour
    {
        public static GameApp Instance { get; private set; }

        public ContentDatabase Content { get; private set; }
        public PlayerProfile Profile { get; private set; }
        public SaveService Saves { get; private set; }
        public AudioService Audio { get; private set; }
        public Router Router { get; private set; }
        public Camera Cam { get; private set; }
        public Canvas Canvas { get; private set; }

        void Awake()
        {
            Instance = this;
            Screen.sleepTimeout = SleepTimeout.NeverSleep;
            Input.multiTouchEnabled = true;

            Content = ContentLoader.Load();
            Saves = new SaveService();
            Profile = Saves.LoadOrCreate(Content);
            Localization.Init(Profile.language);
            Profile.language = Localization.Current;

            Audio = gameObject.AddComponent<AudioService>();
            Audio.SetVolumes(Profile.musicVolume, Profile.sfxVolume);
            QualityService.Apply(Profile.quality);

            SetupCamera();
            SetupCanvas();
            Router = new Router(Canvas);
            Router.Show(new SplashScreen());
        }

        void SetupCamera()
        {
            Cam = Camera.main;
            if (Cam == null)
            {
                var go = new GameObject("Main Camera");
                go.tag = "MainCamera";
                Cam = go.AddComponent<Camera>();
                go.AddComponent<AudioListener>();
            }
            Cam.clearFlags = CameraClearFlags.SolidColor;
            Cam.backgroundColor = Ui.Hex("#7EC3F2");
            Cam.nearClipPlane = 0.3f;
            Cam.farClipPlane = 400f;

            if (FindAnyObjectByType<Light>() == null)
            {
                var lightGo = new GameObject("Sun");
                var light = lightGo.AddComponent<Light>();
                light.type = LightType.Directional;
                light.intensity = 1.15f;
                light.color = new Color(1f, 0.96f, 0.88f);
                light.shadows = LightShadows.Soft;
                lightGo.transform.rotation = Quaternion.Euler(50f, -35f, 0f);
            }
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.55f, 0.6f, 0.7f);
        }

        void SetupCanvas()
        {
            if (FindAnyObjectByType<EventSystem>() == null)
            {
                var es = new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
                DontDestroyOnLoad(es);
            }
            var go = new GameObject("UI", typeof(RectTransform));
            go.layer = 5;
            DontDestroyOnLoad(go);
            Canvas = go.AddComponent<Canvas>();
            Canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            Canvas.sortingOrder = 10;
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            scaler.matchWidthOrHeight = 1f; // celulares largos (18:9 a 20:9) mantêm a altura e ganham largura
            go.AddComponent<GraphicRaycaster>();
        }

        public void SaveProfile() { Saves.Save(Profile); }

        public void ResetProfile()
        {
            Saves.Delete();
            Profile = Saves.LoadOrCreate(Content);
            Localization.Init(Profile.language);
            Profile.language = Localization.Current;
            SaveProfile();
        }

        void OnApplicationPause(bool paused) { if (paused) SaveProfile(); }
        void OnApplicationQuit() { SaveProfile(); }
    }

    /// <summary>Navegação entre telas. Cada tela é reconstruída ao ser exibida.</summary>
    public class Router
    {
        readonly Canvas canvas;
        RectTransform root;
        ScreenBase current;

        public Router(Canvas canvas) { this.canvas = canvas; }
        public ScreenBase Current { get { return current; } }

        public void Show(ScreenBase screen)
        {
            if (current != null) current.Dispose();
            if (root != null) Object.Destroy(root.gameObject);
            root = Ui.Rect(canvas.transform, screen.GetType().Name);
            root.Fill();
            root.gameObject.AddComponent<SafeArea>();
            current = screen;
            screen.Root = root;
            screen.Build();
        }

        /// <summary>Reconstrói a tela atual (ex.: após trocar idioma).</summary>
        public void Refresh()
        {
            if (current != null) Show(current);
        }
    }

    public abstract class ScreenBase
    {
        public RectTransform Root;
        protected GameApp App { get { return GameApp.Instance; } }
        protected static string T(string key) { return Localization.T(key); }
        protected static string T(string key, params object[] a) { return Localization.T(key, a); }
        public abstract void Build();
        public virtual void Dispose() { }

        /// <summary>Fundo padrão dos menus com a arte oficial desfocada por um véu escuro.</summary>
        protected void Background(bool art = true)
        {
            Ui.Box(Root, Ui.Night, "Bg").rectTransform.Place(-1, -1, 2, 2);
            if (art)
            {
                var tex = Resources.Load<Texture2D>("Art/splash_bg");
                if (tex != null)
                {
                    var raw = Ui.Picture(Root, tex);
                    raw.rectTransform.Fill();
                    var arf = raw.gameObject.AddComponent<AspectRatioFitter>();
                    arf.aspectMode = AspectRatioFitter.AspectMode.EnvelopeParent;
                    arf.aspectRatio = tex.width / (float)tex.height;
                    raw.color = new Color(0.35f, 0.38f, 0.5f, 1f);
                }
            }
        }

        protected void Header(string title, System.Action back)
        {
            var bar = Ui.Box(Root, new Color(0.06f, 0.09f, 0.2f, 0.92f), "Header").rectTransform.Place(0, 0.89f, 1, 1);
            Ui.Title(bar, title, 52).rectTransform.Place(0.2f, 0, 0.8f, 1);
            if (back != null) Ui.Btn(bar, "< " + T("ui.back"), back, Ui.Crimson, 30).GetComponent<RectTransform>().Place(0.01f, 0.12f, 0.14f, 0.88f);
            var wallet = Ui.Label(bar, "", 30, Ui.Gold, TextAnchor.MiddleRight, FontStyle.Bold);
            wallet.rectTransform.Place(0.75f, 0, 0.98f, 1);
            wallet.text = T("ui.gold") + " " + App.Profile.gold + "   " + T("ui.crystals") + " " + App.Profile.crystals;
        }
    }

    /// <summary>Respeita entalhes/câmeras (telas 19.5:9, 20:9).</summary>
    public class SafeArea : MonoBehaviour
    {
        Rect last;
        void Update()
        {
            var sa = Screen.safeArea;
            if (sa == last || Screen.width <= 0 || Screen.height <= 0) return;
            last = sa;
            var rt = (RectTransform)transform;
            rt.anchorMin = new Vector2(sa.xMin / Screen.width, sa.yMin / Screen.height);
            rt.anchorMax = new Vector2(sa.xMax / Screen.width, sa.yMax / Screen.height);
            rt.offsetMin = rt.offsetMax = Vector2.zero;
        }
    }
}
