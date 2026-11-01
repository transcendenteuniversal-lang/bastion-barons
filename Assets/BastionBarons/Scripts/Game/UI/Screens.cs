using System;
using System.Collections.Generic;
using BastionBarons.Core;
using UnityEngine;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace BastionBarons.Game
{
    /// <summary>Executa um callback por frame enquanto a tela existir.</summary>
    public class UiTicker : MonoBehaviour
    {
        public Action<float> OnTick;
        void Update() { if (OnTick != null) OnTick(Time.deltaTime); }
    }

    public static class UiInput
    {
        public static InputField Field(Transform parent, string value, string placeholder, Action<string> onChange)
        {
            var bg = Ui.Framed(parent, new Color(0.95f, 0.93f, 0.88f), Ui.Gold, 2f);
            var input = bg.gameObject.AddComponent<InputField>();
            input.targetGraphic = bg;
            var txt = Ui.Label(bg.transform, "", 30, Color.black, TextAnchor.MiddleLeft);
            txt.rectTransform.Place(0, 0, 1, 1, 12);
            txt.supportRichText = false;
            Object.Destroy(txt.GetComponent<Shadow>());
            var ph = Ui.Label(bg.transform, placeholder, 30, new Color(0.4f, 0.4f, 0.4f), TextAnchor.MiddleLeft, FontStyle.Italic);
            ph.rectTransform.Place(0, 0, 1, 1, 12);
            Object.Destroy(ph.GetComponent<Shadow>());
            input.textComponent = txt;
            input.placeholder = ph;
            input.characterLimit = 24;
            input.text = value ?? "";
            if (onChange != null) input.onValueChanged.AddListener(s => onChange(s));
            return input;
        }
    }

    // ======================================================================= Abertura

    public class SplashScreen : ScreenBase
    {
        public override void Build()
        {
            Background();
            var logoTex = Resources.Load<Texture2D>("Art/logo");
            if (logoTex != null)
            {
                var holder = Ui.Rect(Root, "Logo").Place(0.2f, 0.28f, 0.8f, 0.95f);
                var logo = Ui.Picture(holder, logoTex);
                logo.rectTransform.Fill();
                Ui.Fit(logo);
            }
            else Ui.Title(Root, T("app.title"), 120).rectTransform.Place(0.1f, 0.4f, 0.9f, 0.9f);

            RectTransform fill;
            var bar = Ui.Bar(Root, new Color(0, 0, 0, 0.6f), Ui.Hex("#3D8BFF"), out fill).Place(0.3f, 0.12f, 0.7f, 0.16f);
            var label = Ui.Label(Root, T("ui.loading"), 32, Color.white);
            label.rectTransform.Place(0.3f, 0.17f, 0.7f, 0.23f);
            Ui.Label(Root, "v" + Application.version + " • data " + App.Content.Version, 20, new Color(1, 1, 1, 0.6f), TextAnchor.LowerRight).rectTransform.Place(0.7f, 0.01f, 0.99f, 0.06f);

            float t = 0f;
            bool done = false;
            var ticker = Root.gameObject.AddComponent<UiTicker>();
            ticker.OnTick = dt =>
            {
                if (done) return;
                t += dt;
                Ui.SetFill(fill, t / 1.6f);
                if (t >= 1.6f)
                {
                    done = true;
                    App.Router.Show(new MainMenuScreen());
                }
            };
            App.Audio.PlayMusic("music_menu");
        }
    }

    // ======================================================================= Menu principal

    public class MainMenuScreen : ScreenBase
    {
        public override void Build()
        {
            Background();
            var p = App.Profile;
            App.Audio.PlayMusic("music_menu");

            // perfil (topo esquerdo)
            var prof = Ui.Framed(Root, new Color(0.06f, 0.1f, 0.24f, 0.92f), Ui.Gold, 3f).rectTransform.Place(0.01f, 0.86f, 0.32f, 0.985f);
            var lvl = Ui.Framed(prof, Ui.RoyalBlue, Ui.Gold, 2f).rectTransform.Place(0.02f, 0.1f, 0.2f, 0.9f);
            Ui.Label(lvl, p.accountLevel.ToString(), 44, Color.white, TextAnchor.MiddleCenter, FontStyle.Bold).rectTransform.Fill();
            Ui.Label(prof, p.playerName + (p.isGuest ? "  (" + T("ui.guest") + ")" : ""), 30, Color.white, TextAnchor.MiddleLeft, FontStyle.Bold).rectTransform.Place(0.23f, 0.5f, 0.98f, 0.95f);
            RectTransform xpFill;
            var xpBar = Ui.Bar(prof, new Color(0, 0, 0, 0.5f), Ui.Hex("#3D8BFF"), out xpFill).Place(0.23f, 0.12f, 0.95f, 0.42f);
            int need = Progression.XpForNextLevel(App.Content.Balance, p.accountLevel);
            Ui.SetFill(xpFill, p.xp / (float)need);
            Ui.Label(xpBar, p.xp + "/" + need + " XP", 22, Color.white).rectTransform.Fill();

            // recursos (topo direito)
            var wallet = Ui.Framed(Root, new Color(0.06f, 0.1f, 0.24f, 0.92f), Ui.Gold, 3f).rectTransform.Place(0.68f, 0.88f, 0.99f, 0.985f);
            Ui.Label(wallet, T("ui.gold") + ": " + p.gold + "     " + T("ui.crystals") + ": " + p.crystals, 30, Ui.Gold, TextAnchor.MiddleCenter, FontStyle.Bold).rectTransform.Fill();

            // logo
            var logoTex = Resources.Load<Texture2D>("Art/logo");
            if (logoTex != null)
            {
                var holder = Ui.Rect(Root, "Logo").Place(0.3f, 0.5f, 0.7f, 0.95f);
                var logo = Ui.Picture(holder, logoTex);
                logo.rectTransform.Fill();
                Ui.Fit(logo);
            }
            else Ui.Title(Root, T("app.title"), 90).rectTransform.Place(0.25f, 0.6f, 0.75f, 0.9f);

            Ui.Label(Root, T("ui.your_lineup", Localization.BaronName(p.selectedBaron), Localization.CastleName(p.selectedCastle)), 30, Color.white, TextAnchor.MiddleCenter, FontStyle.Bold)
                .rectTransform.Place(0.25f, 0.42f, 0.75f, 0.49f);

            var battle = Ui.Btn(Root, T("ui.battle"), () => App.Router.Show(new ModeSelectScreen()), Ui.Hex("#E09A16"), 72);
            battle.GetComponent<RectTransform>().Place(0.36f, 0.22f, 0.64f, 0.4f);

            // coluna esquerda
            var leftCol = Ui.VList(Root, 16, 0).Place(0.02f, 0.2f, 0.2f, 0.8f);
            Ui.Size(Ui.Btn(leftCol, T("ui.barons"), () => App.Router.Show(new BaronSelectScreen())), 110);
            Ui.Size(Ui.Btn(leftCol, T("ui.castles"), () => App.Router.Show(new CastleSelectScreen())), 110);
            Ui.Size(Ui.Btn(leftCol, T("ui.history"), () => App.Router.Show(new HistoryScreen())), 110);

            // coluna direita
            var rightCol = Ui.VList(Root, 16, 0).Place(0.8f, 0.2f, 0.98f, 0.8f);
            Ui.Size(Ui.Btn(rightCol, T("ui.collection"), () => App.Router.Show(new CollectionScreen())), 110);
            Ui.Size(Ui.Btn(rightCol, T("ui.deck"), () => App.Router.Show(new DeckBuilderScreen())), 110);
            Ui.Size(Ui.Btn(rightCol, T("ui.settings"), () => App.Router.Show(new SettingsScreen()), Ui.Stone * 0.7f), 110);

            if (p.isGuest)
                Ui.Label(Root, T("ui.guest_note"), 22, new Color(1, 1, 1, 0.75f)).rectTransform.Place(0.2f, 0.02f, 0.8f, 0.08f);
        }
    }

    // ======================================================================= Seleção de modo

    public class ModeSelectScreen : ScreenBase
    {
        public override void Build()
        {
            Background();
            Header(T("ui.choose_mode"), () => App.Router.Show(new MainMenuScreen()));
            Ui.Title(Root, T("ui.training"), 48).rectTransform.Place(0.1f, 0.72f, 0.9f, 0.84f);
            var row = Ui.HList(Root, 40, 0).Place(0.1f, 0.35f, 0.9f, 0.7f);
            Mode(row, AiDifficulty.Easy, Ui.Green);
            Mode(row, AiDifficulty.Normal, Ui.RoyalBlue);
            Mode(row, AiDifficulty.Hard, Ui.Crimson);
            Ui.Label(Root, T("ui.pvp_soon"), 26, new Color(1, 1, 1, 0.75f)).rectTransform.Place(0.1f, 0.12f, 0.9f, 0.28f);
        }

        void Mode(Transform row, AiDifficulty d, Color c)
        {
            Ui.Btn(row, T("ui." + d.ToString().ToLowerInvariant()), () => Start(d), c, 54);
        }

        void Start(AiDifficulty d)
        {
            var p = App.Profile;
            if (DeckRules.Validate(p.ActiveDeck.cards, App.Content, p) != DeckError.Ok)
            {
                Ui.Toast(Root, T("ui.deck_invalid", App.Content.Balance.deckSize), 2f);
                return;
            }
            App.Router.Show(new BattleLoadingScreen(d));
        }
    }

    public class BattleLoadingScreen : ScreenBase
    {
        readonly AiDifficulty d;
        public BattleLoadingScreen(AiDifficulty d) { this.d = d; }

        public override void Build()
        {
            Background();
            Ui.Title(Root, T("battle.loading"), 56).rectTransform.Place(0.1f, 0.45f, 0.9f, 0.6f);
            int frames = 0;
            var ticker = Root.gameObject.AddComponent<UiTicker>();
            ticker.OnTick = dt =>
            {
                frames++;
                if (frames == 2) App.Router.Show(new BattleScreen(d));
            };
        }
    }

    // ======================================================================= Barões

    public class BaronSelectScreen : ScreenBase
    {
        public override void Build()
        {
            Background();
            Header(T("ui.barons"), () => App.Router.Show(new MainMenuScreen()));
            var row = Ui.HList(Root, 20, 0).Place(0.02f, 0.06f, 0.98f, 0.86f);
            var p = App.Profile;
            foreach (var b in App.Content.Barons)
            {
                var def = b;
                bool unlocked = Progression.IsBaronUnlocked(p, def);
                bool selected = p.selectedBaron == def.id;
                var card = Ui.Framed(row, new Color(0.07f, 0.1f, 0.22f, 0.95f), selected ? Ui.Gold : Ui.Stone, selected ? 5f : 2f).rectTransform;
                var portrait = Ui.Box(card, Ui.Hex(def.color ?? "#2F5BD3"), "Portrait");
                portrait.rectTransform.Place(0.08f, 0.6f, 0.92f, 0.96f);
                Ui.Label(portrait.transform, CardWidget.Initials(Localization.BaronName(def.id)), 80, Color.white, TextAnchor.MiddleCenter, FontStyle.Bold).rectTransform.Fill();
                Ui.Title(card, Localization.BaronName(def.id), 40).rectTransform.Place(0.02f, 0.5f, 0.98f, 0.59f);
                Ui.Label(card, T("baron." + def.id + ".title"), 24, new Color(0.8f, 0.85f, 1f)).rectTransform.Place(0.02f, 0.45f, 0.98f, 0.5f);
                Ui.Label(card, T("baron." + def.id + ".ability"), 28, Ui.Gold, TextAnchor.MiddleCenter, FontStyle.Bold).rectTransform.Place(0.04f, 0.38f, 0.96f, 0.45f);
                Ui.Label(card, T("baron." + def.id + ".desc"), 22, Color.white, TextAnchor.UpperCenter).rectTransform.Place(0.06f, 0.17f, 0.94f, 0.37f);
                if (!unlocked)
                {
                    Ui.Label(card, T("ui.locked_level", def.unlockLevel), 24, Ui.Hex("#FF8A8A"), TextAnchor.MiddleCenter, FontStyle.Bold).rectTransform.Place(0.04f, 0.03f, 0.96f, 0.15f);
                }
                else if (selected)
                {
                    Ui.Label(card, T("ui.selected"), 30, Ui.Green, TextAnchor.MiddleCenter, FontStyle.Bold).rectTransform.Place(0.04f, 0.03f, 0.96f, 0.15f);
                }
                else
                {
                    Ui.Btn(card, T("ui.select"), () =>
                    {
                        p.selectedBaron = def.id;
                        App.SaveProfile();
                        App.Router.Refresh();
                    }, Ui.Green, 28).GetComponent<RectTransform>().Place(0.1f, 0.03f, 0.9f, 0.14f);
                }
            }
        }
    }

    // ======================================================================= Castelos

    public class CastleSelectScreen : ScreenBase
    {
        public override void Build()
        {
            Background();
            Header(T("ui.castles"), () => App.Router.Show(new MainMenuScreen()));
            var row = Ui.HList(Root, 30, 0).Place(0.05f, 0.06f, 0.95f, 0.86f);
            var p = App.Profile;
            foreach (var c in App.Content.Castles)
            {
                var def = c;
                bool unlocked = Progression.IsCastleUnlocked(p, def);
                bool selected = p.selectedCastle == def.id;
                var card = Ui.Framed(row, new Color(0.07f, 0.1f, 0.22f, 0.95f), selected ? Ui.Gold : Ui.Stone, selected ? 5f : 2f).rectTransform;
                // ilustração provisória: silhueta com as cores do castelo
                var art = Ui.Box(card, new Color(0.45f, 0.7f, 0.95f), "Sky").rectTransform.Place(0.06f, 0.5f, 0.94f, 0.96f);
                Color stone = Ui.Hex(def.stoneColor ?? "#9EA3AD"), roof = Ui.Hex(def.roofColor ?? "#2F5BD3");
                Ui.Box(art, stone, "Wall").rectTransform.Place(0.1f, 0f, 0.9f, 0.45f);
                Ui.Box(art, stone, "TowerL").rectTransform.Place(0.08f, 0f, 0.28f, 0.7f);
                Ui.Box(art, stone, "TowerR").rectTransform.Place(0.72f, 0f, 0.92f, 0.7f);
                Ui.Box(art, stone, "Keep").rectTransform.Place(0.38f, 0f, 0.62f, 0.85f);
                Ui.Box(art, roof, "RoofL").rectTransform.Place(0.06f, 0.7f, 0.3f, 0.85f);
                Ui.Box(art, roof, "RoofR").rectTransform.Place(0.7f, 0.7f, 0.94f, 0.85f);
                Ui.Box(art, roof, "RoofK").rectTransform.Place(0.36f, 0.85f, 0.64f, 1f);
                Ui.Box(art, Ui.Gold, "Gate").rectTransform.Place(0.45f, 0f, 0.55f, 0.25f);
                Ui.Title(card, Localization.CastleName(def.id), 42).rectTransform.Place(0.02f, 0.39f, 0.98f, 0.49f);
                Ui.Label(card, T("castle." + def.id + ".ability"), 30, Ui.Gold, TextAnchor.MiddleCenter, FontStyle.Bold).rectTransform.Place(0.04f, 0.31f, 0.96f, 0.39f);
                Ui.Label(card, T("castle." + def.id + ".desc"), 24, Color.white, TextAnchor.UpperCenter).rectTransform.Place(0.06f, 0.17f, 0.94f, 0.3f);
                if (!unlocked)
                    Ui.Label(card, T("ui.locked_level", def.unlockLevel), 26, Ui.Hex("#FF8A8A"), TextAnchor.MiddleCenter, FontStyle.Bold).rectTransform.Place(0.04f, 0.03f, 0.96f, 0.15f);
                else if (selected)
                    Ui.Label(card, T("ui.selected"), 32, Ui.Green, TextAnchor.MiddleCenter, FontStyle.Bold).rectTransform.Place(0.04f, 0.03f, 0.96f, 0.15f);
                else
                    Ui.Btn(card, T("ui.select"), () =>
                    {
                        p.selectedCastle = def.id;
                        App.SaveProfile();
                        App.Router.Refresh();
                    }, Ui.Green, 30).GetComponent<RectTransform>().Place(0.15f, 0.03f, 0.85f, 0.14f);
            }
        }
    }

    // ======================================================================= Construção de baralho

    public class DeckBuilderScreen : ScreenBase
    {
        List<string> working;
        int deckIndex = -1;

        public override void Build()
        {
            var p = App.Profile;
            if (deckIndex < 0) deckIndex = p.activeDeck;
            if (working == null) working = new List<string>(p.decks[deckIndex].cards);
            int size = App.Content.Balance.deckSize;

            Background();
            Header(T("ui.deck_title", deckIndex + 1), () => App.Router.Show(new MainMenuScreen()));

            var tabs = Ui.HList(Root, 12, 0).Place(0.02f, 0.8f, 0.3f, 0.875f);
            for (int i = 0; i < p.decks.Count; i++)
            {
                int idx = i;
                Ui.Btn(tabs, (i + 1).ToString(), () => { deckIndex = idx; working = new List<string>(p.decks[idx].cards); App.Router.Refresh(); }, idx == deckIndex ? Ui.Hex("#E09A16") : Ui.RoyalBlue, 34);
            }
            var info = Ui.Label(Root, T("ui.deck_count", working.Count, size, DeckRules.AverageCost(working, App.Content).ToString("0.0")), 30, Color.white, TextAnchor.MiddleLeft, FontStyle.Bold);
            info.rectTransform.Place(0.32f, 0.8f, 0.75f, 0.875f);
            var save = Ui.Btn(Root, T("ui.save"), Save, Ui.Green, 36);
            save.GetComponent<RectTransform>().Place(0.8f, 0.8f, 0.98f, 0.875f);
            save.interactable = DeckRules.Validate(working, App.Content, p) == DeckError.Ok;

            // baralho atual: 2 linhas de 7
            var deckGrid = Ui.Rect(Root, "Deck").Place(0.02f, 0.44f, 0.98f, 0.79f);
            deckGrid.gameObject.AddComponent<Image>().color = new Color(0.03f, 0.05f, 0.12f, 0.8f);
            var grid = deckGrid.gameObject.AddComponent<GridLayoutGroup>();
            grid.cellSize = new Vector2(150f, 180f);
            grid.spacing = new Vector2(14f, 12f);
            grid.padding = new RectOffset(10, 10, 10, 10);
            grid.childAlignment = TextAnchor.MiddleCenter;
            grid.constraint = GridLayoutGroup.Constraint.FixedColumnCount;
            grid.constraintCount = 7;
            foreach (var id in working)
            {
                string cid = id;
                var w = CardWidget.Create(deckGrid, App.Content.Card(cid), p.Owned(cid), true);
                var b = w.Frame.gameObject.AddComponent<Button>();
                b.onClick.AddListener(() => { working.Remove(cid); App.Audio.Play("click"); App.Router.Refresh(); });
            }
            for (int i = working.Count; i < size; i++)
                Ui.Framed(deckGrid, new Color(0.1f, 0.12f, 0.2f, 0.6f), Ui.Stone, 2f);

            Ui.Label(Root, T("ui.deck_tap_remove"), 24, new Color(1, 1, 1, 0.8f)).rectTransform.Place(0.02f, 0.39f, 0.98f, 0.44f);

            RectTransform scrollRoot;
            var content = Ui.ScrollGrid(Root, new Vector2(150f, 180f), new Vector2(14f, 14f), out scrollRoot);
            scrollRoot.Place(0.02f, 0.01f, 0.98f, 0.39f);
            var owned = new List<CardDef>();
            foreach (var c in App.Content.CollectibleCards) if (p.Owns(c.id) && !working.Contains(c.id)) owned.Add(c);
            owned.Sort((a, b) => a.cost != b.cost ? a.cost.CompareTo(b.cost) : string.CompareOrdinal(a.id, b.id));
            foreach (var c in owned)
            {
                string cid = c.id;
                var w = CardWidget.Create(content, c, p.Owned(cid), true);
                var b = w.Frame.gameObject.AddComponent<Button>();
                b.onClick.AddListener(() =>
                {
                    if (working.Count >= size) { Ui.Toast(Root, T("ui.deck_invalid", size), 1.5f); return; }
                    working.Add(cid);
                    App.Audio.Play("card");
                    App.Router.Refresh();
                });
            }
        }

        void Save()
        {
            var p = App.Profile;
            if (DeckRules.Validate(working, App.Content, p) != DeckError.Ok)
            {
                Ui.Toast(Root, T("ui.deck_invalid", App.Content.Balance.deckSize), 2f);
                return;
            }
            p.decks[deckIndex].cards = new List<string>(working);
            p.activeDeck = deckIndex;
            App.SaveProfile();
            Ui.Toast(Root, T("ui.deck_saved"), 1.5f);
        }
    }

    // ======================================================================= Coleção

    public class CollectionScreen : ScreenBase
    {
        int rarityFilter = -1;   // -1 todas
        int typeFilter;          // 0 todas, 1 tropas, 2 feitiços
        int costFilter = -1;     // -1 qualquer; 7 = 7+
        string search = "";
        string classFilter = "";

        static readonly string[] Classes = { "", "King", "Paladin", "Archer", "Mage", "Necromancer", "Orc", "Assassin", "Druid", "Cleric", "Engineer", "Barbarian", "Guardian", "Beast" };

        public override void Build()
        {
            Background();
            var p = App.Profile;
            int ownedCount = 0;
            foreach (var c in App.Content.CollectibleCards) if (p.Owns(c.id)) ownedCount++;
            Header(T("ui.collection") + "  •  " + T("ui.owned", ownedCount, App.Content.CollectibleCards.Count), () => App.Router.Show(new MainMenuScreen()));

            var filters = Ui.HList(Root, 12, 0).Place(0.02f, 0.79f, 0.98f, 0.875f);
            Ui.Btn(filters, rarityFilter < 0 ? T("ui.filter_all") : T("rarity." + (Rarity)rarityFilter), () => { rarityFilter = rarityFilter >= 4 ? -1 : rarityFilter + 1; App.Router.Refresh(); },
                rarityFilter < 0 ? Ui.RoyalBlue : Ui.RarityColor((Rarity)rarityFilter) * 0.7f, 28);
            Ui.Btn(filters, typeFilter == 0 ? T("ui.type_all") : typeFilter == 1 ? T("ui.type_troops") : T("ui.type_spells"), () => { typeFilter = (typeFilter + 1) % 3; App.Router.Refresh(); }, Ui.RoyalBlue, 28);
            Ui.Btn(filters, string.IsNullOrEmpty(classFilter) ? T("ui.class_all") : T("cls." + classFilter), () =>
            {
                int i = Array.IndexOf(Classes, classFilter);
                classFilter = Classes[(i + 1) % Classes.Length];
                App.Router.Refresh();
            }, Ui.RoyalBlue, 28);
            Ui.Btn(filters, T("ui.filter_cost", costFilter < 0 ? T("ui.any") : costFilter >= 7 ? "7+" : costFilter.ToString()), () => { costFilter = costFilter < 0 ? 1 : costFilter >= 7 ? -1 : costFilter + 1; App.Router.Refresh(); }, Ui.RoyalBlue, 28);
            UiInput.Field(filters, search, T("ui.search"), s => { search = s; RebuildGrid(); });

            RectTransform scrollRoot;
            grid = Ui.ScrollGrid(Root, new Vector2(170f, 205f), new Vector2(16f, 16f), out scrollRoot);
            scrollRoot.Place(0.02f, 0.01f, 0.98f, 0.78f);
            RebuildGrid();
        }

        RectTransform grid;

        void RebuildGrid()
        {
            for (int i = grid.childCount - 1; i >= 0; i--)
            {
                var ch = grid.GetChild(i);
                ch.SetParent(null, false);
                Object.Destroy(ch.gameObject);
            }
            var p = App.Profile;
            var list = new List<CardDef>();
            foreach (var c in App.Content.CollectibleCards)
            {
                if (rarityFilter >= 0 && (int)c.Rarity != rarityFilter) continue;
                if (typeFilter == 1 && c.IsSpell) continue;
                if (typeFilter == 2 && !c.IsSpell) continue;
                if (!string.IsNullOrEmpty(classFilter) && c.cls != classFilter) continue;
                if (costFilter >= 0 && (costFilter >= 7 ? c.cost < 7 : c.cost != costFilter)) continue;
                if (!string.IsNullOrEmpty(search) && Localization.CardName(c.id).IndexOf(search, StringComparison.OrdinalIgnoreCase) < 0) continue;
                list.Add(c);
            }
            list.Sort((a, b) =>
            {
                bool oa = p.Owns(a.id), ob = p.Owns(b.id);
                if (oa != ob) return oa ? -1 : 1;
                return a.cost != b.cost ? a.cost.CompareTo(b.cost) : string.CompareOrdinal(a.id, b.id);
            });
            foreach (var c in list)
            {
                string cid = c.id;
                var owned = p.Owned(cid);
                var w = CardWidget.Create(grid, c, owned, true, owned == null);
                var b = w.Frame.gameObject.AddComponent<Button>();
                b.onClick.AddListener(() => { App.Audio.Play("click"); App.Router.Show(new CardDetailScreen(cid)); });
                if (owned != null && Progression.CanUpgrade(p, App.Content, cid))
                {
                    var up = Ui.Label(w.Root, "▲", 34, Ui.Green, TextAnchor.UpperLeft, FontStyle.Bold);
                    up.rectTransform.Place(0.05f, 0.25f, 0.5f, 0.5f);
                }
            }
        }
    }

    public class CardDetailScreen : ScreenBase
    {
        readonly string id;
        public CardDetailScreen(string id) { this.id = id; }

        public override void Build()
        {
            Background();
            var c = App.Content.Card(id);
            var p = App.Profile;
            var owned = p.Owned(id);
            var b = App.Content.Balance;
            Header(Localization.CardName(id), () => App.Router.Show(new CollectionScreen()));

            var holder = Ui.Rect(Root, "Big").Place(0.05f, 0.15f, 0.3f, 0.85f);
            var w = CardWidget.Create(holder, c, owned, true, owned == null);
            w.Root.Fill();

            var panel = Ui.Framed(Root, Ui.Panel, Ui.RarityColor(c.Rarity), 3f).rectTransform.Place(0.34f, 0.08f, 0.96f, 0.86f);
            Ui.Label(panel, T("rarity." + c.Rarity) + "  •  " + T("cls." + c.cls) + (c.flying ? "  •  " + T("ui.flying") : ""), 32, Ui.RarityColor(c.Rarity), TextAnchor.MiddleLeft, FontStyle.Bold)
                .rectTransform.Place(0.04f, 0.88f, 0.96f, 0.97f);
            Ui.Label(panel, Localization.CardDesc(id), 30, Color.white, TextAnchor.UpperLeft).rectTransform.Place(0.04f, 0.74f, 0.96f, 0.87f);

            int level = owned != null ? owned.level : 1;
            float mult = App.Content.LevelMultiplier(level);
            var stats = new List<string>();
            stats.Add(T("stat.cost") + ": " + c.cost);
            if (c.IsSpell)
            {
                if (c.spellValue > 0f) stats.Add(T("stat.effect") + ": " + Mathf.RoundToInt(c.spellValue * mult));
                if (c.spellDuration > 0f) stats.Add(c.spellDuration + " s");
            }
            else
            {
                stats.Add(T("stat.hp") + ": " + Mathf.RoundToInt(c.hp * mult));
                stats.Add(T("stat.damage") + ": " + Mathf.RoundToInt(c.damage * mult));
                stats.Add(T("stat.attack_speed") + ": " + c.attackInterval.ToString("0.0") + " s");
                stats.Add(T("stat.move_speed") + ": " + c.moveSpeed.ToString("0.0"));
                stats.Add(T("stat.range") + ": " + c.range.ToString("0.#"));
                stats.Add(T("stat.targets") + ": " + T("targets." + c.Targets));
                if (c.count > 1) stats.Add(T("stat.count") + ": " + c.count);
            }
            var col = Ui.VList(panel, 6, 0).Place(0.04f, 0.3f, 0.96f, 0.72f);
            foreach (var s in stats) Ui.Size(Ui.Label(col, s, 30, new Color(0.9f, 0.93f, 1f), TextAnchor.MiddleLeft), 42);

            if (owned == null)
            {
                Ui.Label(panel, T("ui.how_to_get"), 32, Ui.Gold, TextAnchor.MiddleCenter, FontStyle.Bold).rectTransform.Place(0.04f, 0.05f, 0.96f, 0.25f);
                return;
            }
            Ui.Label(panel, T("ui.level", owned.level), 40, Ui.Gold, TextAnchor.MiddleLeft, FontStyle.Bold).rectTransform.Place(0.04f, 0.18f, 0.4f, 0.28f);
            if (owned.level >= b.maxCardLevel)
            {
                Ui.Label(panel, T("ui.max_level"), 34, Ui.Green, TextAnchor.MiddleCenter, FontStyle.Bold).rectTransform.Place(0.4f, 0.05f, 0.96f, 0.25f);
                return;
            }
            int needCopies = Progression.CopiesRequired(b, owned.level);
            int needGold = Progression.GoldRequired(b, owned.level);
            RectTransform cf;
            var copies = Ui.Bar(panel, new Color(0, 0, 0, 0.5f), Ui.Green, out cf).Place(0.4f, 0.19f, 0.96f, 0.27f);
            Ui.SetFill(cf, owned.copies / (float)needCopies);
            Ui.Label(copies, T("ui.copies", owned.copies, needCopies), 26, Color.white).rectTransform.Fill();
            var up = Ui.Btn(panel, T("ui.upgrade", needGold), () =>
            {
                if (Progression.Upgrade(p, App.Content, id))
                {
                    App.SaveProfile();
                    App.Audio.Play("victory", 0.6f);
                    App.Router.Refresh();
                    Ui.Toast(App.Router.Current.Root, T("ui.upgraded", p.Owned(id).level), 2f);
                }
                else Ui.Toast(Root, T("ui.cant_upgrade"), 1.5f);
            }, Progression.CanUpgrade(p, App.Content, id) ? Ui.Green : Ui.Disabled, 32);
            up.GetComponent<RectTransform>().Place(0.4f, 0.04f, 0.96f, 0.16f);
        }
    }

    // ======================================================================= Configurações

    public class SettingsScreen : ScreenBase
    {
        public override void Build()
        {
            Background();
            Header(T("ui.settings"), () => App.Router.Show(new MainMenuScreen()));
            var p = App.Profile;
            var col = Ui.VList(Root, 14, 10).Place(0.15f, 0.05f, 0.85f, 0.87f);

            Row(col, T("settings.name"), r => UiInput.Field(r, p.playerName, T("settings.name"), s =>
            {
                s = (s ?? "").Trim();
                if (s.Length >= 2) { p.playerName = s; App.SaveProfile(); }
            }));
            Row(col, T("settings.music") + ": " + Mathf.RoundToInt(p.musicVolume * 100) + "%", r => Stepper(r, () => Volume(true, -0.1f), () => Volume(true, 0.1f)));
            Row(col, T("settings.sfx") + ": " + Mathf.RoundToInt(p.sfxVolume * 100) + "%", r => Stepper(r, () => Volume(false, -0.1f), () => Volume(false, 0.1f)));
            Row(col, T("settings.quality"), r => Ui.Btn(r, T("settings.quality." + p.quality), () =>
            {
                p.quality = (p.quality + 1) % 3;
                QualityService.Apply(p.quality);
                App.SaveProfile();
                App.Router.Refresh();
            }, Ui.RoyalBlue, 30));
            int li = Mathf.Max(0, Array.IndexOf(Localization.Languages, Localization.Current));
            Row(col, T("settings.language"), r => Ui.Btn(r, Localization.LanguageNames[li], () =>
            {
                string next = Localization.Languages[(li + 1) % Localization.Languages.Length];
                Localization.Set(next);
                p.language = next;
                App.SaveProfile();
                App.Router.Refresh();
            }, Ui.RoyalBlue, 30));
            Row(col, T("settings.privacy"), r => Ui.Btn(r, T("settings.view"), () => Ui.Modal(Root, T("settings.privacy_text"), (T("ui.back"), (Action)null)), Ui.RoyalBlue, 30));
            Row(col, T("settings.credits"), r => Ui.Btn(r, T("settings.view"), () => Ui.Modal(Root, T("settings.credits_text"), (T("ui.back"), (Action)null)), Ui.RoyalBlue, 30));
            Row(col, T("settings.reset"), r => Ui.Btn(r, T("settings.reset"), () => Ui.Modal(Root, T("settings.reset_confirm"),
                (T("battle.yes"), (Action)(() =>
                {
                    App.ResetProfile();
                    App.Audio.SetVolumes(App.Profile.musicVolume, App.Profile.sfxVolume);
                    App.Router.Show(new SplashScreen());
                })),
                (T("battle.no"), (Action)null)), Ui.Crimson, 30));
            Ui.Size(Ui.Label(col, "ID: " + p.playerId, 20, new Color(1, 1, 1, 0.5f)), 30);
        }

        void Volume(bool musicVol, float delta)
        {
            var p = App.Profile;
            if (musicVol) p.musicVolume = Mathf.Clamp01(Mathf.Round((p.musicVolume + delta) * 10f) / 10f);
            else p.sfxVolume = Mathf.Clamp01(Mathf.Round((p.sfxVolume + delta) * 10f) / 10f);
            App.Audio.SetVolumes(p.musicVolume, p.sfxVolume);
            App.SaveProfile();
            App.Router.Refresh();
        }

        static void Row(Transform col, string label, Action<Transform> control)
        {
            var row = Ui.HList(col, 20, 0);
            Ui.Size(row.GetComponent<HorizontalLayoutGroup>(), 84);
            Ui.Label(row, label, 32, Color.white, TextAnchor.MiddleLeft, FontStyle.Bold);
            var slot = Ui.Rect(row, "Control");
            control(slot);
            for (int i = 0; i < slot.childCount; i++) ((RectTransform)slot.GetChild(i)).Fill();
        }

        static void Stepper(Transform parent, Action minus, Action plus)
        {
            var h = Ui.HList(parent, 16, 0);
            Ui.Btn(h, "-", minus, Ui.RoyalBlue, 44);
            Ui.Btn(h, "+", plus, Ui.RoyalBlue, 44);
        }
    }

    // ======================================================================= Histórico

    public class HistoryScreen : ScreenBase
    {
        public override void Build()
        {
            Background();
            var p = App.Profile;
            Header(T("ui.history"), () => App.Router.Show(new MainMenuScreen()));
            Ui.Label(Root, T("history.stats", p.battles, p.wins, p.losses, p.draws, p.bestWinStreak), 30, Ui.Gold, TextAnchor.MiddleCenter, FontStyle.Bold).rectTransform.Place(0.05f, 0.8f, 0.95f, 0.87f);
            if (p.history.Count == 0)
            {
                Ui.Label(Root, T("history.empty"), 36, Color.white).rectTransform.Place(0.1f, 0.4f, 0.9f, 0.6f);
                return;
            }
            RectTransform scrollRoot;
            var content = Ui.ScrollGrid(Root, new Vector2(1500f, 70f), new Vector2(0f, 8f), out scrollRoot);
            scrollRoot.Place(0.05f, 0.03f, 0.95f, 0.78f);
            foreach (var r in p.history)
            {
                Color c = r.result > 0 ? Ui.Green : r.result < 0 ? Ui.Crimson : Ui.Stone;
                var row = Ui.Box(content, new Color(c.r * 0.4f, c.g * 0.4f, c.b * 0.4f, 0.9f), "Row");
                string res = T(r.result > 0 ? "result.victory" : r.result < 0 ? "result.defeat" : "result.draw");
                string text = r.dateUtc + "   " + res + "   " + Localization.BaronName(r.baron) + " x " + Localization.BaronName(r.opponentBaron)
                    + "   " + Mathf.RoundToInt(r.myCastlePct * 100) + "% / " + Mathf.RoundToInt(r.enemyCastlePct * 100) + "%   " + (r.seconds / 60) + ":" + (r.seconds % 60).ToString("00")
                    + "   " + r.mode;
                Ui.Label(row.transform, text, 26, Color.white, TextAnchor.MiddleLeft).rectTransform.Place(0, 0, 1, 1, 12);
            }
        }
    }

    // ======================================================================= Resultado

    public class ResultScreen : ScreenBase
    {
        readonly int result;
        readonly MatchEndReason reason;
        readonly MatchStats stats;
        readonly float myPct, foePct;
        readonly BattleRewards rewards;
        readonly AiDifficulty difficulty;

        public ResultScreen(int result, MatchEndReason reason, MatchStats stats, float myPct, float foePct, BattleRewards rewards, AiDifficulty difficulty)
        {
            this.result = result; this.reason = reason; this.stats = stats; this.myPct = myPct; this.foePct = foePct; this.rewards = rewards; this.difficulty = difficulty;
        }

        public override void Build()
        {
            Background();
            App.Audio.PlayMusic("music_menu");
            string key = result > 0 ? "result.victory" : result < 0 ? "result.defeat" : "result.draw";
            var title = Ui.Title(Root, T(key), 110);
            title.rectTransform.Place(0.1f, 0.8f, 0.9f, 0.97f);
            if (result < 0) title.color = Ui.Hex("#FF7A7A");
            Ui.Label(Root, T("result.reason." + reason), 32, Color.white).rectTransform.Place(0.1f, 0.74f, 0.9f, 0.8f);

            var left = Ui.Framed(Root, Ui.Panel, Ui.Gold, 3f).rectTransform.Place(0.08f, 0.2f, 0.48f, 0.7f);
            Ui.Title(left, T("result.stats"), 40).rectTransform.Place(0, 0.84f, 1, 0.98f);
            var lc = Ui.VList(left, 8, 20).Place(0, 0, 1, 0.82f);
            Line(lc, T("result.castle_left", Mathf.RoundToInt(myPct * 100), Mathf.RoundToInt(foePct * 100)));
            Line(lc, T("result.cards_played", stats.CardsPlayed));
            Line(lc, T("result.castle_damage", Mathf.RoundToInt(stats.DamageToCastle)));
            Line(lc, T("result.units_destroyed", stats.UnitsDestroyed));

            var right = Ui.Framed(Root, Ui.Panel, Ui.Gold, 3f).rectTransform.Place(0.52f, 0.2f, 0.92f, 0.7f);
            Ui.Title(right, T("result.rewards"), 40).rectTransform.Place(0, 0.84f, 1, 0.98f);
            var rc = Ui.VList(right, 8, 20).Place(0, 0.2f, 1, 0.82f);
            Line(rc, T("result.gold", rewards.Gold), Ui.Gold);
            Line(rc, T("result.xp", rewards.Xp), Ui.Hex("#8FC8FF"));
            if (!string.IsNullOrEmpty(rewards.CardId))
            {
                var def = App.Content.Card(rewards.CardId);
                Line(rc, T(rewards.NewCard ? "result.new_card" : "result.card", Localization.CardName(def.id), T("rarity." + def.Rarity)), Ui.RarityColor(def.Rarity));
            }
            if (rewards.LevelsGained > 0) Line(rc, T("result.level_up", App.Profile.accountLevel), Ui.Green);
            foreach (var u in rewards.Unlocked)
            {
                string name = u.StartsWith("baron:") ? Localization.BaronName(u.Substring(6)) : Localization.CastleName(u.Substring(7));
                Line(rc, T("result.unlocked", name), Ui.Green);
            }
            var b = App.Content.Balance;
            string Pct(Rarity r) { return (Progression.RarityChance(b, r) * 100f).ToString("0.#") + "%"; }
            Ui.Label(right, T("result.odds", Pct(Rarity.Common), Pct(Rarity.Rare), Pct(Rarity.Epic), Pct(Rarity.Legendary), Pct(Rarity.Mythic), b.pityThreshold), 18, new Color(1, 1, 1, 0.7f))
                .rectTransform.Place(0.04f, 0.02f, 0.96f, 0.2f);

            var row = Ui.HList(Root, 40, 0).Place(0.25f, 0.04f, 0.75f, 0.16f);
            Ui.Btn(row, T("result.continue"), () => App.Router.Show(new MainMenuScreen()), Ui.Green, 40);
            Ui.Btn(row, T("ui.battle"), () => App.Router.Show(new BattleLoadingScreen(difficulty)), Ui.Hex("#E09A16"), 40);
        }

        static void Line(Transform parent, string text, Color? color = null)
        {
            Ui.Size(Ui.Label(parent, text, 32, color ?? Color.white, TextAnchor.MiddleLeft, FontStyle.Bold), 52);
        }
    }
}
