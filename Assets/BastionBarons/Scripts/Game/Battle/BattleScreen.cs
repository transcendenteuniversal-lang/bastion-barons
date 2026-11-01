using System;
using System.Collections.Generic;
using BastionBarons.Core;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace BastionBarons.Game
{
    public class BattleScreen : ScreenBase
    {
        readonly AiDifficulty difficulty;
        GameObject battleGo;

        public BattleScreen(AiDifficulty difficulty) { this.difficulty = difficulty; }

        public override void Build()
        {
            battleGo = new GameObject("Battle");
            battleGo.AddComponent<BattleRunner>().Setup(App, Root, difficulty);
        }

        public override void Dispose()
        {
            if (battleGo != null) Object.Destroy(battleGo);
        }
    }

    /// <summary>Lane marcada para seleção por toque (raycast).</summary>
    public class LaneTag : MonoBehaviour { public int Lane; }

    /// <summary>Controla a batalha offline: simulação em ticks fixos, IA, entrada por toque, sincronização visual e HUD.</summary>
    public class BattleRunner : MonoBehaviour
    {
        public const float WorldScale = 0.6f;
        public static readonly float[] LaneZ = { 6f, 0f, -6f };

        enum Pending { None, Card, Baron, Castle }

        GameApp app;
        RectTransform hudRoot;
        AiDifficulty difficulty;
        Match match;
        AiController ai;
        Camera cam;
        float acc, endTimer;
        bool paused, finished, endAnnounced;
        Pending pending;
        int selectedCard = -1;
        int hoverLane = -1;
        float lastAspect;

        readonly Dictionary<int, UnitView> views = new Dictionary<int, UnitView>();
        readonly CastleView[] castles = new CastleView[2];
        readonly BaronView[] barons = new BaronView[2];
        readonly Renderer[] laneRenderers = new Renderer[3];
        Material laneMat, laneHover, laneHint;

        // HUD
        readonly CardWidget.Refs[] handCards = new CardWidget.Refs[4];
        readonly string[] handIds = new string[4];
        RectTransform handRow, energyFill, myHpFill, enemyHpFill, baronFill, castleFill;
        Text timerText, energyText, myHpText, enemyHpText, hintText, baronState, castleState, doubleText, nextName;
        Image baronBtnImg, castleBtnImg;
        RectTransform nextSlot;
        string nextId;

        public void Setup(GameApp app, RectTransform root, AiDifficulty difficulty)
        {
            this.app = app;
            hudRoot = root;
            this.difficulty = difficulty;
            cam = app.Cam;

            var p = app.Profile;
            var content = app.Content;
            var deck = p.ActiveDeck.cards;
            int seed = Environment.TickCount;
            var rng = new Rng(seed ^ 0x5bd1e995);

            var setup = new MatchSetup { Seed = seed };
            setup.Players[0].BaronId = p.selectedBaron;
            setup.Players[0].CastleId = p.selectedCastle;
            setup.Players[0].Deck = new List<string>(deck);
            int levelSum = 0;
            foreach (var id in deck)
            {
                var o = p.Owned(id);
                int lvl = o != null ? o.level : 1;
                setup.Players[0].CardLevels[id] = lvl;
                levelSum += lvl;
            }
            // IA justa: mesmo nível médio do jogador, sem bônus de atributos
            int aiLevel = Mathf.Max(1, Mathf.RoundToInt(levelSum / (float)Mathf.Max(1, deck.Count)));
            setup.Players[1].BaronId = content.Barons[rng.Range(0, content.Barons.Count)].id;
            setup.Players[1].CastleId = content.Castles[rng.Range(0, content.Castles.Count)].id;
            setup.Players[1].Deck = BuildAiDeck(content, rng);
            foreach (var id in setup.Players[1].Deck) setup.Players[1].CardLevels[id] = aiLevel;

            match = new Match(content, setup);
            ai = new AiController(match, 1, difficulty, seed + 17);

            BuildWorld();
            BuildHud();
            app.Audio.PlayMusic("music_battle");
        }

        static List<string> BuildAiDeck(ContentDatabase c, Rng rng)
        {
            var troops = new List<string>();
            var spells = new List<string>();
            foreach (var card in c.CollectibleCards)
            {
                if (card.IsSpell) spells.Add(card.id);
                else troops.Add(card.id);
            }
            rng.Shuffle(troops);
            rng.Shuffle(spells);
            int spellCount = Mathf.Min(4, spells.Count);
            var deck = new List<string>();
            for (int i = 0; i < spellCount; i++) deck.Add(spells[i]);
            for (int i = 0; deck.Count < c.Balance.deckSize && i < troops.Count; i++) deck.Add(troops[i]);
            return deck;
        }

        public Vector3 ToWorld(float x, int lane, bool flying)
        {
            return new Vector3((x - match.L * 0.5f) * WorldScale, flying ? 2.6f : 0f, LaneZ[Mathf.Clamp(lane, 0, 2)]);
        }

        // ------------------------------------------------------------------ mundo

        void BuildWorld()
        {
            var world = transform;
            float half = match.L * 0.5f * WorldScale;

            var ground = Art3D.Prim(PrimitiveType.Plane, world, new Vector3(0, -0.05f, 0), new Vector3(14f, 1f, 9f), Palette.Grass);
            ground.name = "Ground";
            laneMat = Art3D.Mat(Palette.PathStone);
            laneHint = Art3D.Mat(Ui.Hex("#E3D3A8"));
            laneHover = Art3D.Glow(Ui.Hex("#FFD966"));
            float laneLen = (match.L - 2f * match.B.castleFront) * WorldScale;
            for (int l = 0; l < 3; l++)
            {
                var strip = Art3D.Prim(PrimitiveType.Cube, world, new Vector3(0, 0.02f, LaneZ[l]), new Vector3(laneLen, 0.1f, 4.4f), Palette.PathStone, true);
                strip.name = "Lane" + l;
                strip.AddComponent<LaneTag>().Lane = l;
                var box = strip.GetComponent<BoxCollider>();
                box.size = new Vector3(1f, 30f, 1.3f); // área de toque generosa (inclui unidades voadoras)
                laneRenderers[l] = strip.GetComponent<Renderer>();
                // bordas de pedra entre rotas (degraus como na arte de referência)
                Art3D.Prim(PrimitiveType.Cube, world, new Vector3(0, 0.2f, LaneZ[l] + 2.45f), new Vector3(laneLen, 0.4f, 0.4f), Ui.Hex("#9A9384"));
            }
            Art3D.Prim(PrimitiveType.Cube, world, new Vector3(0, 0.2f, LaneZ[2] - 2.45f), new Vector3(laneLen, 0.4f, 0.4f), Ui.Hex("#9A9384"));

            // cenário: falésias, cachoeira, árvores e montanhas
            for (int i = -6; i <= 6; i++)
            {
                float h = 6f + Mathf.PerlinNoise(i * 0.7f, 0.3f) * 6f;
                Art3D.Prim(PrimitiveType.Cube, world, new Vector3(i * 7f, h * 0.5f, 18f + Mathf.Abs(i % 3)), new Vector3(7.2f, h, 6f), Ui.Hex("#8C8A86"));
                Art3D.Prim(PrimitiveType.Cube, world, new Vector3(i * 7f, h + 0.3f, 18f + Mathf.Abs(i % 3)), new Vector3(7.4f, 0.6f, 6.2f), Palette.Grass);
            }
            Art3D.Prim(PrimitiveType.Cube, world, new Vector3(4f, 5f, 15.2f), new Vector3(3f, 10f, 0.3f), Ui.Hex("#9ED8F5"));
            for (int i = 0; i < 18; i++)
            {
                float x = -40f + i * 4.7f;
                float z = 11f + (i % 3) * 1.5f;
                Tree(world, new Vector3(x, 0, z), 0.9f + (i % 4) * 0.15f);
            }
            for (int i = 0; i < 7; i++) Tree(world, new Vector3(-36f + i * 12f, 0, -12.5f - (i % 2) * 2f), 0.8f);
            for (int i = 0; i < 6; i++)
                Art3D.Cone(world, new Vector3(-70f + i * 28f, 0, 70f), 22f, 28f + (i % 3) * 8f, Ui.Hex("#7D93B5"));

            for (int i = 0; i < 2; i++)
            {
                var ps = match.Players[i];
                float face = i == 0 ? 1f : -1f;
                float front = (match.CastleFrontOf(i) - match.L * 0.5f) * WorldScale;
                var cgo = new GameObject("Castle" + i);
                cgo.transform.SetParent(world, false);
                cgo.transform.position = new Vector3(front - face * 2.6f, 0, 0);
                castles[i] = cgo.AddComponent<CastleView>();
                castles[i].Init(ps.Castle, i == 0);

                var bgo = new GameObject("Baron" + i);
                bgo.transform.SetParent(world, false);
                bgo.transform.position = new Vector3(front - face * 1.2f, 5.6f, -3.5f);
                barons[i] = bgo.AddComponent<BaronView>();
                barons[i].Init(ps.Baron, i == 0);
            }
            FitCamera();
        }

        static void Tree(Transform parent, Vector3 pos, float s)
        {
            Art3D.Prim(PrimitiveType.Cylinder, parent, pos + new Vector3(0, 1f * s, 0), new Vector3(0.4f, 1f, 0.4f) * s, Palette.Wood);
            Art3D.Prim(PrimitiveType.Sphere, parent, pos + new Vector3(0, 2.6f * s, 0), new Vector3(2.2f, 2f, 2.2f) * s, Ui.Hex("#3F8A35"));
        }

        void FitCamera()
        {
            lastAspect = cam.aspect;
            var target = new Vector3(0f, 0f, -4.5f);
            cam.transform.position = new Vector3(0f, 34f, -41f);
            cam.transform.LookAt(target);
            float dist = Vector3.Distance(cam.transform.position, target);
            float halfWidth = 37f;
            float vfov = 2f * Mathf.Atan(halfWidth / dist / Mathf.Max(0.5f, cam.aspect)) * Mathf.Rad2Deg;
            cam.fieldOfView = Mathf.Clamp(vfov, 30f, 70f);
            cam.backgroundColor = Ui.Hex("#8FCDF5");
        }

        // ------------------------------------------------------------------ HUD

        Image Deco(Transform parent, Color c, string name = "Box")
        {
            var img = Ui.Box(parent, c, name);
            img.raycastTarget = false;
            return img;
        }

        void BuildHud()
        {
            var me = match.Players[0];
            var foe = match.Players[1];

            // painel do jogador (topo esquerdo)
            var left = Deco(hudRoot, new Color(0.05f, 0.1f, 0.25f, 0.85f), "MyPanel").rectTransform.Place(0.005f, 0.865f, 0.3f, 0.995f);
            var portrait = Deco(left, Ui.Hex(me.Baron.color ?? "#2F5BD3"));
            portrait.rectTransform.Place(0.01f, 0.06f, 0.24f, 0.94f);
            Ui.Label(portrait.transform, CardWidget.Initials(Localization.BaronName(me.Baron.id)), 40, Color.white, TextAnchor.MiddleCenter, FontStyle.Bold).rectTransform.Fill();
            Ui.Label(left, app.Profile.playerName, 30, Color.white, TextAnchor.MiddleLeft, FontStyle.Bold).rectTransform.Place(0.27f, 0.52f, 0.98f, 0.98f);
            var hp = Ui.Bar(left, new Color(0, 0, 0, 0.6f), Ui.Hex("#2F7BFF"), out myHpFill);
            hp.GetComponent<Image>().raycastTarget = false;
            hp.Place(0.27f, 0.08f, 0.98f, 0.48f);
            myHpText = Ui.Label(hp, "", 28, Color.white, TextAnchor.MiddleCenter, FontStyle.Bold);
            myHpText.rectTransform.Fill();

            // painel do adversário (topo direito)
            var right = Deco(hudRoot, new Color(0.25f, 0.05f, 0.07f, 0.85f), "FoePanel").rectTransform.Place(0.7f, 0.865f, 0.995f, 0.995f);
            var fp = Deco(right, Ui.Hex(foe.Baron.color ?? "#B3202A"));
            fp.rectTransform.Place(0.76f, 0.06f, 0.99f, 0.94f);
            Ui.Label(fp.transform, CardWidget.Initials(Localization.BaronName(foe.Baron.id)), 40, Color.white, TextAnchor.MiddleCenter, FontStyle.Bold).rectTransform.Fill();
            Ui.Label(right, Localization.T("battle.ai", Localization.T("ui." + difficulty.ToString().ToLowerInvariant())) + " • " + Localization.BaronName(foe.Baron.id), 26, Color.white, TextAnchor.MiddleRight, FontStyle.Bold).rectTransform.Place(0.02f, 0.52f, 0.73f, 0.98f);
            var ehp = Ui.Bar(right, new Color(0, 0, 0, 0.6f), Ui.Hex("#E0323A"), out enemyHpFill);
            ehp.GetComponent<Image>().raycastTarget = false;
            ehp.Place(0.02f, 0.08f, 0.73f, 0.48f);
            enemyHpText = Ui.Label(ehp, "", 28, Color.white, TextAnchor.MiddleCenter, FontStyle.Bold);
            enemyHpText.rectTransform.Fill();

            // cronômetro
            var timer = Deco(hudRoot, new Color(0.04f, 0.06f, 0.14f, 0.9f), "Timer").rectTransform.Place(0.44f, 0.9f, 0.56f, 0.995f);
            timerText = Ui.Label(timer, "3:00", 50, Color.white, TextAnchor.MiddleCenter, FontStyle.Bold);
            timerText.rectTransform.Fill();
            doubleText = Ui.Label(hudRoot, Localization.T("battle.double_energy"), 28, Ui.Hex("#D58BFF"), TextAnchor.MiddleCenter, FontStyle.Bold);
            doubleText.rectTransform.Place(0.38f, 0.85f, 0.62f, 0.9f);
            doubleText.enabled = false;
            var conn = Ui.Label(hudRoot, Localization.T("battle.offline"), 20, new Color(0.8f, 0.9f, 1f, 0.8f), TextAnchor.MiddleCenter);
            conn.rectTransform.Place(0.38f, 0.82f, 0.62f, 0.85f);

            // pausa
            Ui.Btn(hudRoot, "II", ShowPause, new Color(0.1f, 0.12f, 0.2f, 0.9f), 34).GetComponent<RectTransform>().Place(0.305f, 0.91f, 0.345f, 0.99f);

            // poder do Barão (esquerda, como na referência)
            var bp = BuildPowerButton(0.005f, 0.42f, 0.18f, 0.64f, Localization.T("battle.baron_power"), Localization.T("baron." + me.Baron.id + ".ability"), Localization.T("baron." + me.Baron.id + ".desc"), OnBaronPressed, out baronFill, out baronState);
            baronBtnImg = bp;
            var cp = BuildPowerButton(0.005f, 0.22f, 0.18f, 0.41f, Localization.T("battle.castle_power"), Localization.T("castle." + me.Castle.id + ".ability"), Localization.T("castle." + me.Castle.id + ".desc"), OnCastlePressed, out castleFill, out castleState);
            castleBtnImg = cp;

            // bandeja de cartas + próxima carta
            var tray = Deco(hudRoot, new Color(0.04f, 0.06f, 0.14f, 0.88f), "Tray").rectTransform.Place(0.185f, 0f, 0.86f, 0.27f);
            nextSlot = Ui.Rect(tray, "Next").Place(0.01f, 0.24f, 0.11f, 0.86f);
            nextName = Ui.Label(tray, Localization.T("battle.next"), 20, Ui.Gold, TextAnchor.MiddleCenter, FontStyle.Bold);
            nextName.rectTransform.Place(0.01f, 0.86f, 0.11f, 0.99f);
            handRow = Ui.HList(tray, 26, 0).Place(0.13f, 0.2f, 0.99f, 0.97f);
            var hl = handRow.GetComponent<HorizontalLayoutGroup>();
            hl.childForceExpandWidth = false;
            hl.childForceExpandHeight = false;

            var eb = Ui.Bar(tray, new Color(0, 0, 0, 0.7f), Ui.Hex("#B04DFF"), out energyFill);
            eb.GetComponent<Image>().raycastTarget = false;
            eb.Place(0.13f, 0.03f, 0.99f, 0.16f);
            for (int i = 1; i < 10; i++) Deco(eb, new Color(0, 0, 0, 0.6f), "Tick").rectTransform.Place(i / 10f - 0.002f, 0f, i / 10f + 0.002f, 1f);
            var eNum = Deco(tray, Ui.Purple, "EnergyNum");
            eNum.rectTransform.Place(0.01f, 0.0f, 0.11f, 0.22f);
            energyText = Ui.Label(eNum.transform, "5", 40, Color.white, TextAnchor.MiddleCenter, FontStyle.Bold);
            energyText.rectTransform.Fill();

            hintText = Ui.Label(hudRoot, "", 40, Ui.Gold, TextAnchor.MiddleCenter, FontStyle.Bold);
            hintText.rectTransform.Place(0.3f, 0.27f, 0.7f, 0.34f);
            RefreshHand(true);
        }

        Image BuildPowerButton(float x0, float y0, float x1, float y1, string header, string title, string desc, Action onClick, out RectTransform fill, out Text state)
        {
            var b = Ui.Btn(hudRoot, "", onClick, new Color(0.06f, 0.1f, 0.24f, 0.92f), 20);
            var rt = b.GetComponent<RectTransform>().Place(x0, y0, x1, y1);
            Ui.Label(rt, header, 22, Ui.Gold, TextAnchor.UpperLeft, FontStyle.Bold).rectTransform.Place(0.05f, 0.78f, 0.98f, 0.97f);
            Ui.Label(rt, title, 26, Color.white, TextAnchor.UpperLeft, FontStyle.Bold).rectTransform.Place(0.05f, 0.58f, 0.98f, 0.8f);
            var d = Ui.Label(rt, desc, 17, new Color(0.85f, 0.9f, 1f), TextAnchor.UpperLeft);
            d.rectTransform.Place(0.05f, 0.2f, 0.98f, 0.6f);
            var bar = Ui.Bar(rt, new Color(0, 0, 0, 0.6f), Ui.Hex("#2F9BFF"), out fill);
            bar.GetComponent<Image>().raycastTarget = false;
            bar.Place(0.05f, 0.04f, 0.95f, 0.17f);
            state = Ui.Label(bar, "", 18, Color.white, TextAnchor.MiddleCenter, FontStyle.Bold);
            state.rectTransform.Fill();
            return b.GetComponent<Image>();
        }

        void RefreshHand(bool force)
        {
            var me = match.Players[0];
            bool changed = force;
            for (int i = 0; i < handIds.Length; i++)
                if (i < me.Deck.Hand.Count && handIds[i] != me.Deck.Hand[i]) changed = true;
            if (me.Deck.Next != nextId) changed = true;
            if (changed)
            {
                for (int i = handRow.childCount - 1; i >= 0; i--)
                {
                    var ch = handRow.GetChild(i);
                    ch.SetParent(null, false);
                    Destroy(ch.gameObject);
                }
                for (int i = 0; i < 4 && i < me.Deck.Hand.Count; i++)
                {
                    string id = me.Deck.Hand[i];
                    handIds[i] = id;
                    var refs = CardWidget.Create(handRow, app.Content.Card(id), app.Profile.Owned(id), true);
                    handCards[i] = refs;
                    Ui.Size(refs.Frame, 205f, 165f);
                    int index = i;
                    var trigger = refs.Root.gameObject.AddComponent<EventTrigger>();
                    var entry = new EventTrigger.Entry { eventID = EventTriggerType.PointerDown };
                    entry.callback.AddListener(_ => SelectCard(index));
                    trigger.triggers.Add(entry);
                }
                for (int i = nextSlot.childCount - 1; i >= 0; i--) Destroy(nextSlot.GetChild(i).gameObject);
                nextId = me.Deck.Next;
                if (nextId != null)
                {
                    var n = CardWidget.Create(nextSlot, app.Content.Card(nextId), null, false);
                    n.Root.Fill();
                    n.Frame.raycastTarget = false;
                }
            }
            for (int i = 0; i < 4; i++)
            {
                var c = handCards[i];
                if (c == null) continue;
                var def = app.Content.Card(handIds[i]);
                bool afford = me.Energy >= def.cost;
                c.Shade.enabled = !afford;
                bool sel = pending == Pending.Card && selectedCard == i;
                c.Root.localScale = sel ? Vector3.one * 1.08f : Vector3.one;
                c.Frame.color = sel ? Ui.Hex("#3A3010") : new Color(0.08f, 0.1f, 0.18f, 1f);
            }
        }

        void UpdateHud()
        {
            var me = match.Players[0];
            var foe = match.Players[1];
            int secs = Mathf.CeilToInt(match.TimeRemaining);
            timerText.text = (secs / 60) + ":" + (secs % 60).ToString("00");
            timerText.color = secs <= 30 ? Ui.Hex("#FF6A6A") : Color.white;
            doubleText.enabled = match.IsDoubleEnergy && !match.IsOver;
            Ui.SetFill(myHpFill, me.CastleHpPct);
            Ui.SetFill(enemyHpFill, foe.CastleHpPct);
            myHpText.text = Mathf.CeilToInt(Mathf.Max(0f, me.CastleHp)) + (me.CastleShield > 0f ? "  +" + Mathf.CeilToInt(me.CastleShield) : "");
            enemyHpText.text = Mathf.CeilToInt(Mathf.Max(0f, foe.CastleHp)) + (foe.CastleShield > 0f ? "  +" + Mathf.CeilToInt(foe.CastleShield) : "");
            Ui.SetFill(energyFill, me.Energy / match.B.maxEnergy);
            energyText.text = Mathf.FloorToInt(me.Energy).ToString();

            Ui.SetFill(baronFill, me.BaronProgress);
            baronState.text = me.BaronReady ? Localization.T("battle.ready") : Mathf.FloorToInt(me.BaronProgress * 100f) + "%";
            baronBtnImg.color = me.BaronReady ? Color.Lerp(Ui.Hex("#1F3F8F"), Ui.Hex("#3060D0"), Mathf.PingPong(Time.time * 2f, 1f)) : new Color(0.06f, 0.1f, 0.24f, 0.92f);
            Ui.SetFill(castleFill, me.CastleProgress);
            castleState.text = me.CastleReady ? Localization.T("battle.ready") : Mathf.CeilToInt(Mathf.Max(0f, me.CastleCooldown)) + "s";
            castleBtnImg.color = me.CastleReady ? Color.Lerp(Ui.Hex("#1F3F8F"), Ui.Hex("#3060D0"), Mathf.PingPong(Time.time * 2f, 1f)) : new Color(0.06f, 0.1f, 0.24f, 0.92f);

            hintText.text = pending != Pending.None ? Localization.T("battle.select_lane") : "";
            RefreshHand(false);
        }

        // ------------------------------------------------------------------ entrada

        void SelectCard(int index)
        {
            if (match.IsOver || paused) return;
            if (pending == Pending.Card && selectedCard == index) { ClearPending(); return; }
            pending = Pending.Card;
            selectedCard = index;
            app.Audio.Play("card");
        }

        void OnBaronPressed()
        {
            if (match.IsOver || paused) return;
            var me = match.Players[0];
            if (!me.BaronReady) return;
            if (me.Baron.requiresLane) { pending = pending == Pending.Baron ? Pending.None : Pending.Baron; return; }
            Execute(Command.Baron(0, 0));
        }

        void OnCastlePressed()
        {
            if (match.IsOver || paused) return;
            var me = match.Players[0];
            if (!me.CastleReady) return;
            if (me.Castle.requiresLane) { pending = pending == Pending.Castle ? Pending.None : Pending.Castle; return; }
            Execute(Command.Castle(0, 0));
        }

        void ClearPending()
        {
            pending = Pending.None;
            selectedCard = -1;
        }

        int LaneAt(Vector2 screenPos)
        {
            RaycastHit hit;
            var ray = cam.ScreenPointToRay(screenPos);
            if (Physics.Raycast(ray, out hit, 500f))
            {
                var tag = hit.collider.GetComponent<LaneTag>();
                if (tag != null) return tag.Lane;
            }
            return -1;
        }

        void HandleInput()
        {
            if (pending == Pending.None || match.IsOver || paused) { hoverLane = -1; return; }
            Vector2 pos;
            bool up;
            bool overUi;
            var es = EventSystem.current;
            if (Input.touchCount > 0)
            {
                var t = Input.GetTouch(0);
                pos = t.position;
                up = t.phase == TouchPhase.Ended;
                overUi = es != null && es.IsPointerOverGameObject(t.fingerId);
            }
            else
            {
                pos = Input.mousePosition;
                up = Input.GetMouseButtonUp(0);
                overUi = es != null && es.IsPointerOverGameObject();
            }
            hoverLane = overUi ? -1 : LaneAt(pos);
            if (up && hoverLane >= 0) Act(hoverLane);
        }

        void Act(int lane)
        {
            switch (pending)
            {
                case Pending.Card:
                    if (selectedCard >= 0 && selectedCard < handIds.Length)
                        Execute(Command.Play(0, selectedCard, handIds[selectedCard], lane));
                    break;
                case Pending.Baron: Execute(Command.Baron(0, lane)); break;
                case Pending.Castle: Execute(Command.Castle(0, lane)); break;
            }
        }

        void Execute(Command c)
        {
            var r = match.Execute(c);
            if (r == CommandResult.Ok) { ClearPending(); return; }
            if (r == CommandResult.NotEnoughEnergy) Ui.Toast(hudRoot, Localization.T("battle.not_enough_energy"), 1.2f);
            else if (r == CommandResult.UnitCap) Ui.Toast(hudRoot, Localization.T("battle.unit_cap"), 1.2f);
            else ClearPending();
        }

        void UpdateLaneHighlight()
        {
            for (int l = 0; l < 3; l++)
            {
                var m = laneMat;
                if (pending != Pending.None) m = l == hoverLane ? laneHover : (Mathf.PingPong(Time.time * 2f, 1f) > 0.5f ? laneHint : laneMat);
                if (laneRenderers[l].sharedMaterial != m) laneRenderers[l].sharedMaterial = m;
            }
        }

        // ------------------------------------------------------------------ pausa / fim

        GameObject pauseOverlay;

        void ShowPause()
        {
            if (match.IsOver || pauseOverlay != null) return;
            paused = true;
            ClearPending();
            var shade = Ui.Box(hudRoot, new Color(0, 0, 0, 0.7f), "Pause");
            shade.rectTransform.Fill();
            pauseOverlay = shade.gameObject;
            var panel = Ui.Framed(shade.transform, Ui.Panel, Ui.Gold, 4f).rectTransform.Place(0.35f, 0.3f, 0.65f, 0.75f);
            Ui.Title(panel, Localization.T("battle.paused"), 56).rectTransform.Place(0, 0.72f, 1, 0.95f);
            var col = Ui.VList(panel, 20, 20).Place(0.1f, 0.05f, 0.9f, 0.7f);
            Ui.Size(Ui.Btn(col, Localization.T("battle.resume"), HidePause, Ui.Green), 100);
            Ui.Size(Ui.Btn(col, Localization.T("battle.surrender"), () =>
            {
                Ui.Modal(hudRoot, Localization.T("battle.confirm_surrender"),
                    (Localization.T("battle.yes"), (Action)(() => { HidePause(); match.Surrender(0); })),
                    (Localization.T("battle.no"), (Action)null));
            }, Ui.Crimson), 100);
        }

        void HidePause()
        {
            paused = false;
            if (pauseOverlay != null) Destroy(pauseOverlay);
            pauseOverlay = null;
        }

        void Finish()
        {
            if (finished) return;
            finished = true;
            var me = match.Players[0];
            var foe = match.Players[1];
            int result = match.Winner == 0 ? 1 : match.Winner == 1 ? -1 : 0;
            var record = new BattleRecord
            {
                dateUtc = DateTime.UtcNow.ToString("u"),
                mode = "training_" + difficulty.ToString().ToLowerInvariant(),
                result = result,
                baron = me.Baron.id,
                opponentBaron = foe.Baron.id,
                myCastlePct = me.CastleHpPct,
                enemyCastlePct = foe.CastleHpPct,
                seconds = Mathf.RoundToInt(match.Time),
            };
            var rewards = Progression.ApplyBattleResult(app.Profile, app.Content, result, new Rng(Environment.TickCount), record);
            app.SaveProfile();
            app.Router.Show(new ResultScreen(result, match.EndReason, me.Stats, me.CastleHpPct, foe.CastleHpPct, rewards, difficulty));
        }

        // ------------------------------------------------------------------ loop

        void Update()
        {
            if (match == null) return;
            float dt = Time.deltaTime;
            if (!Mathf.Approximately(cam.aspect, lastAspect)) FitCamera();

            if (!paused && !match.IsOver)
            {
                acc += dt;
                int steps = 0;
                while (acc >= match.Dt && steps < 8)
                {
                    ai.Tick();
                    match.Step();
                    acc -= match.Dt;
                    steps++;
                }
                if (steps >= 8) acc = 0f;
            }

            ProcessEvents();
            SyncUnits(dt);
            for (int i = 0; i < 2; i++) castles[i].SetShield(match.Players[i].CastleShield > 0f);
            HandleInput();
            UpdateLaneHighlight();
            UpdateHud();

            if (match.IsOver)
            {
                if (!endAnnounced)
                {
                    endAnnounced = true;
                    ClearPending();
                    HidePause();
                    if (match.Winner >= 0)
                    {
                        castles[1 - match.Winner].Collapse();
                        barons[match.Winner].Celebrate();
                        barons[1 - match.Winner].Lament();
                    }
                    app.Audio.StopMusic();
                    app.Audio.Play(match.Winner == 0 ? "victory" : "defeat");
                    string key = match.Winner == 0 ? "result.victory" : match.Winner == 1 ? "result.defeat" : "result.draw";
                    var big = Ui.Title(hudRoot, Localization.T(key), 120);
                    big.rectTransform.Place(0.2f, 0.45f, 0.8f, 0.7f);
                }
                endTimer += dt;
                if (endTimer > 3f) Finish();
            }
        }

        void SyncUnits(float dt)
        {
            var alive = new HashSet<int>();
            foreach (var u in match.Units)
            {
                if (!u.Alive) continue;
                alive.Add(u.Id);
                UnitView v;
                var pos = ToWorld(u.X, u.Lane, u.Flying);
                if (!views.TryGetValue(u.Id, out v))
                {
                    var go = new GameObject("Unit_" + u.Def.id + "_" + u.Id);
                    go.transform.SetParent(transform, false);
                    v = go.AddComponent<UnitView>();
                    v.Init(u, pos, cam);
                    views[u.Id] = v;
                }
                v.Sync(u, pos, dt);
            }
            var dead = new List<int>();
            foreach (var kv in views) if (!alive.Contains(kv.Key)) dead.Add(kv.Key);
            foreach (var id in dead)
            {
                if (views[id] != null) views[id].Die();
                views.Remove(id);
            }
        }

        Vector3 CastleWorld(int owner)
        {
            return new Vector3((match.CastleFrontOf(owner) - match.L * 0.5f) * WorldScale, 3f, 0f);
        }

        void ProcessEvents()
        {
            foreach (var e in match.DrainEvents())
            {
                switch (e.Type)
                {
                    case SimEventType.UnitSpawned:
                        if (e.Player == 0) app.Audio.Play("spawn", 0.5f);
                        break;
                    case SimEventType.UnitAttack:
                    {
                        UnitView v;
                        if (views.TryGetValue(e.UnitId, out v) && v != null) v.PlayAttack();
                        var def = app.Content.HasCard(e.Id) ? app.Content.Card(e.Id) : null;
                        if (def == null) break;
                        if (def.range > 4f && v != null)
                        {
                            UnitView t;
                            Vector3 to = e.TargetId != 0 && views.TryGetValue(e.TargetId, out t) && t != null ? t.transform.position + Vector3.up : CastleWorld(1 - e.Player);
                            Color c = def.cls == "Necromancer" ? Ui.Hex("#C04DFF") : def.cls == "Mage" ? Ui.Hex("#6FD8FF") : def.flying ? Ui.Hex("#FF8A3A") : Ui.Hex("#F2E3B3");
                            FxAnim.Projectile(v.transform.position + Vector3.up * 1.4f, to, c, def.cls == "Mage" ? 0.45f : 0.25f);
                            if (def.Ability == UnitAbility.Splash) FxAnim.Burst(to, c, def.abilityRadius * WorldScale);
                            app.Audio.Play(def.cls == "Mage" || def.cls == "Necromancer" ? "magic" : def.flying ? "dragon" : "bow", 0.35f);
                        }
                        else app.Audio.Play("sword", 0.3f);
                        break;
                    }
                    case SimEventType.UnitRevived:
                    {
                        UnitView v;
                        if (views.TryGetValue(e.UnitId, out v) && v != null) { v.Revive(); FxAnim.Burst(v.transform.position, Ui.Hex("#FFB23A"), 2f); }
                        break;
                    }
                    case SimEventType.UnitDied:
                        app.Audio.Play("death", 0.25f);
                        break;
                    case SimEventType.Heal:
                        FxAnim.Burst(ToWorld(e.X, e.Lane, false) + Vector3.up, Ui.Hex("#7CFF8A"), 0.8f, 0.3f);
                        break;
                    case SimEventType.SpellCast:
                    {
                        float laneLen = (match.L - 2f * match.B.castleFront) * WorldScale;
                        Color c = SpellColor(e.Id);
                        if (e.Value <= 0f) FxAnim.LaneFlash(ToWorld(match.L * 0.5f, e.Lane, false), laneLen, c);
                        else FxAnim.Burst(ToWorld(e.X, e.Lane, false), c, e.Value * WorldScale, 0.5f);
                        app.Audio.Play(e.Id == "fireball" ? "explosion" : "magic", 0.6f);
                        break;
                    }
                    case SimEventType.BaronUsed:
                    {
                        barons[e.Player].Command();
                        barons[1 - e.Player].React();
                        var b = match.Players[e.Player].Baron;
                        Color c = Ui.Hex(b.color ?? "#FFD966");
                        float laneLen = (match.L - 2f * match.B.castleFront) * WorldScale;
                        if (e.Lane >= 0) FxAnim.LaneFlash(ToWorld(match.L * 0.5f, e.Lane, false), laneLen, c, 0.9f);
                        else for (int l = 0; l < 3; l++) FxAnim.LaneFlash(ToWorld(match.L * 0.5f, l, false), laneLen, c, 0.9f);
                        app.Audio.Play("baron");
                        if (e.Player == 1) Ui.Toast(hudRoot, Localization.BaronName(b.id) + ": " + Localization.T("baron." + b.id + ".ability"), 1.5f);
                        break;
                    }
                    case SimEventType.CastlePowerUsed:
                    {
                        var k = match.Players[e.Player].Castle;
                        float laneLen = (match.L - 2f * match.B.castleFront) * WorldScale;
                        Color c = k.Ability == CastleAbility.DragonBreath ? Ui.Hex("#FF6A1E") : k.Ability == CastleAbility.IceStorm ? Ui.Hex("#9FE6FF") : Ui.Hex("#8FE3FF");
                        if (e.Lane >= 0) FxAnim.LaneFlash(ToWorld(match.L * 0.5f, e.Lane, false), laneLen, c, 0.9f);
                        app.Audio.Play(k.Ability == CastleAbility.DragonBreath ? "dragon" : "magic");
                        if (e.Player == 1) Ui.Toast(hudRoot, Localization.CastleName(k.id) + ": " + Localization.T("castle." + k.id + ".ability"), 1.5f);
                        break;
                    }
                    case SimEventType.CastleDamaged:
                        castles[e.Player].Hit();
                        app.Audio.Play("castle_hit", 0.4f);
                        break;
                    case SimEventType.CastleAttack:
                    {
                        UnitView t;
                        if (views.TryGetValue(e.TargetId, out t) && t != null)
                            FxAnim.Projectile(CastleWorld(e.Player) + Vector3.up * 4f, t.transform.position + Vector3.up, Ui.Hex("#F2E3B3"), 0.22f, 0.3f);
                        break;
                    }
                    case SimEventType.DoubleEnergy:
                        Ui.Toast(hudRoot, Localization.T("battle.double_energy"), 2f);
                        break;
                }
            }
        }

        static Color SpellColor(string id)
        {
            switch (id)
            {
                case "fireball": return Ui.Hex("#FF6A1E");
                case "freeze": return Ui.Hex("#9FE6FF");
                case "divine_heal": return Ui.Hex("#FFE68A");
                case "lightning": return Ui.Hex("#FFF27A");
                case "arcane_shield": return Ui.Hex("#6FD8FF");
                case "poison": return Ui.Hex("#7CD32B");
                case "arrow_rain": return Ui.Hex("#E9D8A6");
                case "skeleton_summon": return Ui.Hex("#C04DFF");
                case "elven_rain_wave": return Ui.Hex("#7CFF8A");
                default: return Ui.Gold;
            }
        }

        void OnDestroy()
        {
            foreach (var kv in views) if (kv.Value != null) Destroy(kv.Value.gameObject);
        }
    }
}
