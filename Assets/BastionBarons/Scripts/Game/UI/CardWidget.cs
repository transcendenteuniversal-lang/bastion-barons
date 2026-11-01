using BastionBarons.Core;
using UnityEngine;
using UnityEngine.UI;

namespace BastionBarons.Game
{
    /// <summary>
    /// Visual de carta. A ilustração definitiva é carregada de Resources/Art/Cards/&lt;id&gt;.png quando existir;
    /// até lá é exibido um retrato provisório com a cor da classe e as iniciais (ver docs/ASSETS.md).
    /// </summary>
    public static class CardWidget
    {
        public class Refs
        {
            public RectTransform Root;
            public Image Frame;
            public Image Shade;
            public Text Cost, Name, Level;
        }

        public static Refs Create(Transform parent, CardDef def, OwnedCard owned, bool showLevel, bool locked = false)
        {
            var r = new Refs();
            Color rc = Ui.RarityColor(def.Rarity);
            r.Frame = Ui.Framed(parent, new Color(0.08f, 0.1f, 0.18f, 1f), rc, 4f);
            r.Frame.gameObject.name = "Card_" + def.id;
            r.Root = r.Frame.rectTransform;

            var art = Ui.Box(r.Root, Palette.ClassColor(def.cls) * 0.85f + new Color(0, 0, 0, 0.15f), "Art");
            art.rectTransform.Place(0.06f, 0.24f, 0.94f, 0.94f);
            art.raycastTarget = false;
            var tex = Resources.Load<Texture2D>("Art/Cards/" + def.id);
            if (tex != null)
            {
                var raw = Ui.Picture(art.transform, tex);
                raw.rectTransform.Fill();
            }
            else
            {
                string name = Localization.CardName(def.id);
                var initials = Ui.Label(art.transform, Initials(name), 46, new Color(1f, 1f, 1f, 0.9f), TextAnchor.MiddleCenter, FontStyle.Bold);
                initials.rectTransform.Fill();
                var kind = Ui.Label(art.transform, def.IsSpell ? "*" : def.flying ? "^" : "", 30, Ui.Gold, TextAnchor.LowerRight);
                kind.rectTransform.Place(0, 0, 0.95f, 0.3f);
            }

            var costBg = Ui.Framed(r.Root, Ui.Purple, Color.white, 2f);
            costBg.raycastTarget = false;
            costBg.rectTransform.anchorMin = costBg.rectTransform.anchorMax = new Vector2(0f, 1f);
            costBg.rectTransform.pivot = new Vector2(0f, 1f);
            costBg.rectTransform.sizeDelta = new Vector2(52f, 52f);
            costBg.rectTransform.anchoredPosition = new Vector2(-8f, 8f);
            r.Cost = Ui.Label(costBg.transform, def.cost.ToString(), 36, Color.white, TextAnchor.MiddleCenter, FontStyle.Bold);
            r.Cost.rectTransform.Fill();

            r.Name = Ui.Label(r.Root, Localization.CardName(def.id), 22, Color.white, TextAnchor.MiddleCenter, FontStyle.Bold);
            r.Name.rectTransform.Place(0.02f, 0.02f, 0.98f, 0.24f);
            r.Name.resizeTextForBestFit = true;
            r.Name.resizeTextMinSize = 12;
            r.Name.resizeTextMaxSize = 22;
            r.Name.verticalOverflow = VerticalWrapMode.Truncate;

            if (showLevel && owned != null)
            {
                r.Level = Ui.Label(r.Root, Localization.T("ui.level", owned.level), 20, Ui.Gold, TextAnchor.UpperRight, FontStyle.Bold);
                r.Level.rectTransform.Place(0.3f, 0.78f, 0.95f, 0.98f);
            }

            r.Shade = Ui.Box(r.Root, new Color(0f, 0f, 0f, 0.6f), "Shade");
            r.Shade.rectTransform.Fill();
            r.Shade.raycastTarget = false;
            r.Shade.enabled = locked;
            if (locked)
            {
                var lt = Ui.Label(r.Shade.transform, Localization.T("ui.locked"), 22, Color.white, TextAnchor.MiddleCenter, FontStyle.Bold);
                lt.rectTransform.Fill();
            }
            return r;
        }

        public static string Initials(string name)
        {
            if (string.IsNullOrEmpty(name)) return "?";
            var parts = name.Split(' ');
            if (parts.Length == 1) return name.Substring(0, Mathf.Min(2, name.Length)).ToUpperInvariant();
            string s = "";
            foreach (var p in parts) if (p.Length > 2 || s.Length == 0) s += char.ToUpperInvariant(p[0]);
            return s.Length > 3 ? s.Substring(0, 3) : s;
        }
    }
}
