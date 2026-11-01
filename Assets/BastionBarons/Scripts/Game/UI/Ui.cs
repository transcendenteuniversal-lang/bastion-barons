using System;
using BastionBarons.Core;
using UnityEngine;
using UnityEngine.UI;

namespace BastionBarons.Game
{
    /// <summary>Fábrica de UI (uGUI) com a identidade visual de BASTION BARONS: azul real, dourado, pedra e vermelho.</summary>
    public static class Ui
    {
        public static readonly Color Gold = Hex("#F7C548");
        public static readonly Color GoldDark = Hex("#A8741A");
        public static readonly Color RoyalBlue = Hex("#2450B8");
        public static readonly Color DeepBlue = Hex("#14244F");
        public static readonly Color Night = new Color(0.05f, 0.07f, 0.14f, 0.97f);
        public static readonly Color Panel = new Color(0.10f, 0.14f, 0.27f, 0.96f);
        public static readonly Color Stone = Hex("#8E94A0");
        public static readonly Color Crimson = Hex("#B3202A");
        public static readonly Color Green = Hex("#3FA34D");
        public static readonly Color Purple = Hex("#8A3FD1");
        public static readonly Color Disabled = new Color(0.3f, 0.32f, 0.38f, 1f);

        static Font font;
        public static Font Font
        {
            get
            {
                if (font == null) font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
                return font;
            }
        }

        public static Color Hex(string hex)
        {
            Color c;
            return ColorUtility.TryParseHtmlString(hex, out c) ? c : Color.magenta;
        }

        public static Color RarityColor(Rarity r)
        {
            switch (r)
            {
                case Rarity.Rare: return Hex("#3D8BFF");
                case Rarity.Epic: return Hex("#A64DFF");
                case Rarity.Legendary: return Hex("#FFB21E");
                case Rarity.Mythic: return Hex("#FF3D6E");
                default: return Hex("#B8C0CC");
            }
        }

        public static RectTransform Rect(Transform parent, string name)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.layer = 5; // UI
            go.transform.SetParent(parent, false);
            return (RectTransform)go.transform;
        }

        /// <summary>Âncoras relativas (0..1) + margens em pixels de referência.</summary>
        public static RectTransform Place(this RectTransform rt, float minX, float minY, float maxX, float maxY, float pad = 0f)
        {
            rt.anchorMin = new Vector2(minX, minY);
            rt.anchorMax = new Vector2(maxX, maxY);
            rt.offsetMin = new Vector2(pad, pad);
            rt.offsetMax = new Vector2(-pad, -pad);
            return rt;
        }

        public static RectTransform Fill(this RectTransform rt) { return rt.Place(0, 0, 1, 1); }

        public static Image Box(Transform parent, Color color, string name = "Box")
        {
            var rt = Rect(parent, name);
            var img = rt.gameObject.AddComponent<Image>();
            img.color = color;
            return img;
        }

        public static Image Framed(Transform parent, Color fill, Color border, float thickness = 4f)
        {
            var img = Box(parent, fill, "Framed");
            var o = img.gameObject.AddComponent<Outline>();
            o.effectColor = border;
            o.effectDistance = new Vector2(thickness, -thickness);
            var o2 = img.gameObject.AddComponent<Outline>();
            o2.effectColor = border;
            o2.effectDistance = new Vector2(-thickness, thickness);
            return img;
        }

        public static Text Label(Transform parent, string text, int size, Color color, TextAnchor align = TextAnchor.MiddleCenter, FontStyle style = FontStyle.Normal)
        {
            var rt = Rect(parent, "Text");
            var t = rt.gameObject.AddComponent<Text>();
            t.font = Font;
            t.text = text;
            t.fontSize = size;
            t.fontStyle = style;
            t.color = color;
            t.alignment = align;
            t.horizontalOverflow = HorizontalWrapMode.Wrap;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            t.raycastTarget = false;
            var sh = rt.gameObject.AddComponent<Shadow>();
            sh.effectColor = new Color(0, 0, 0, 0.7f);
            sh.effectDistance = new Vector2(2, -2);
            return t;
        }

        /// <summary>Título com aparência metálica dourada (provisório até a fonte medieval licenciada).</summary>
        public static Text Title(Transform parent, string text, int size)
        {
            var t = Label(parent, text, size, Gold, TextAnchor.MiddleCenter, FontStyle.Bold);
            var o = t.gameObject.AddComponent<Outline>();
            o.effectColor = Hex("#5A2E05");
            o.effectDistance = new Vector2(3, -3);
            return t;
        }

        public static Button Btn(Transform parent, string label, Action onClick, Color? color = null, int fontSize = 34)
        {
            var img = Framed(parent, color ?? RoyalBlue, Gold, 3f);
            img.gameObject.name = "Button";
            var b = img.gameObject.AddComponent<Button>();
            b.targetGraphic = img;
            var colors = b.colors;
            colors.highlightedColor = new Color(1.1f, 1.1f, 1.1f, 1f);
            colors.pressedColor = new Color(0.75f, 0.75f, 0.75f, 1f);
            colors.disabledColor = new Color(0.5f, 0.5f, 0.5f, 0.8f);
            b.colors = colors;
            var t = Label(img.transform, label, fontSize, Color.white, TextAnchor.MiddleCenter, FontStyle.Bold);
            t.rectTransform.Place(0, 0, 1, 1, 6);
            b.onClick.AddListener(() =>
            {
                if (AudioService.Instance != null) AudioService.Instance.Play("click");
                if (onClick != null) onClick();
            });
            return b;
        }

        public static void SetLabel(Button b, string text)
        {
            var t = b.GetComponentInChildren<Text>();
            if (t != null) t.text = text;
        }

        public static LayoutElement Size(Component c, float preferredHeight, float preferredWidth = -1f)
        {
            var le = c.gameObject.GetComponent<LayoutElement>();
            if (le == null) le = c.gameObject.AddComponent<LayoutElement>();
            le.preferredHeight = preferredHeight;
            le.minHeight = preferredHeight;
            if (preferredWidth > 0f) { le.preferredWidth = preferredWidth; le.minWidth = preferredWidth; }
            return le;
        }

        public static RectTransform VList(Transform parent, float spacing, int padding = 0, TextAnchor align = TextAnchor.UpperCenter)
        {
            var rt = Rect(parent, "VList");
            var v = rt.gameObject.AddComponent<VerticalLayoutGroup>();
            v.spacing = spacing;
            v.padding = new RectOffset(padding, padding, padding, padding);
            v.childAlignment = align;
            v.childControlWidth = true;
            v.childControlHeight = true;
            v.childForceExpandWidth = true;
            v.childForceExpandHeight = false;
            return rt;
        }

        public static RectTransform HList(Transform parent, float spacing, int padding = 0, TextAnchor align = TextAnchor.MiddleCenter)
        {
            var rt = Rect(parent, "HList");
            var h = rt.gameObject.AddComponent<HorizontalLayoutGroup>();
            h.spacing = spacing;
            h.padding = new RectOffset(padding, padding, padding, padding);
            h.childAlignment = align;
            h.childControlWidth = true;
            h.childControlHeight = true;
            h.childForceExpandWidth = true;
            h.childForceExpandHeight = true;
            return rt;
        }

        /// <summary>Área rolável vertical com grade. Retorna o 'content' onde os itens devem ser criados.</summary>
        public static RectTransform ScrollGrid(Transform parent, Vector2 cell, Vector2 spacing, out RectTransform root)
        {
            root = Rect(parent, "Scroll");
            root.gameObject.AddComponent<Image>().color = new Color(0f, 0f, 0f, 0.25f);
            var sr = root.gameObject.AddComponent<ScrollRect>();
            sr.horizontal = false;
            sr.movementType = ScrollRect.MovementType.Clamped;
            sr.scrollSensitivity = 40f;
            var vp = Rect(root, "Viewport").Fill();
            vp.gameObject.AddComponent<RectMask2D>();
            var content = Rect(vp, "Content");
            content.anchorMin = new Vector2(0f, 1f);
            content.anchorMax = new Vector2(1f, 1f);
            content.pivot = new Vector2(0.5f, 1f);
            content.offsetMin = Vector2.zero;
            content.offsetMax = Vector2.zero;
            var grid = content.gameObject.AddComponent<GridLayoutGroup>();
            grid.cellSize = cell;
            grid.spacing = spacing;
            grid.padding = new RectOffset(16, 16, 16, 16);
            grid.childAlignment = TextAnchor.UpperCenter;
            var fit = content.gameObject.AddComponent<ContentSizeFitter>();
            fit.verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            sr.viewport = vp;
            sr.content = content;
            return content;
        }

        /// <summary>Barra horizontal baseada em âncoras (não depende de sprites).</summary>
        public static RectTransform Bar(Transform parent, Color bg, Color fg, out RectTransform fill)
        {
            var back = Box(parent, bg, "Bar");
            fill = Box(back.transform, fg, "Fill").rectTransform;
            fill.Place(0, 0, 1, 1, 3);
            return back.rectTransform;
        }

        public static void SetFill(RectTransform fill, float pct, bool vertical = false)
        {
            pct = Mathf.Clamp01(pct);
            fill.anchorMin = Vector2.zero;
            fill.anchorMax = vertical ? new Vector2(1f, pct) : new Vector2(pct, 1f);
        }

        public static RawImage Picture(Transform parent, Texture tex)
        {
            var rt = Rect(parent, "Picture");
            var raw = rt.gameObject.AddComponent<RawImage>();
            raw.texture = tex;
            raw.raycastTarget = false;
            return raw;
        }

        /// <summary>Mantém proporção da textura dentro do retângulo pai.</summary>
        public static void Fit(RawImage raw)
        {
            if (raw.texture == null) return;
            var arf = raw.gameObject.AddComponent<AspectRatioFitter>();
            arf.aspectMode = AspectRatioFitter.AspectMode.FitInParent;
            arf.aspectRatio = raw.texture.width / (float)raw.texture.height;
        }

        /// <summary>Janela modal simples com mensagem e botões.</summary>
        public static RectTransform Modal(Transform parent, string message, params (string label, Action action)[] buttons)
        {
            var shade = Box(parent, new Color(0, 0, 0, 0.75f), "Modal").rectTransform.Fill();
            var panel = Framed(shade, Panel, Gold, 4f).rectTransform.Place(0.25f, 0.3f, 0.75f, 0.7f);
            var msg = Label(panel, message, 36, Color.white);
            msg.rectTransform.Place(0.05f, 0.4f, 0.95f, 0.95f);
            var row = HList(panel, 30, 0).Place(0.08f, 0.08f, 0.92f, 0.32f);
            foreach (var b in buttons)
            {
                var action = b.action;
                var shadeGo = shade.gameObject;
                Btn(row, b.label, () => { UnityEngine.Object.Destroy(shadeGo); if (action != null) action(); });
            }
            return shade;
        }

        public static void Toast(Transform parent, string message, float seconds = 2f)
        {
            var box = Framed(parent, new Color(0.08f, 0.1f, 0.2f, 0.95f), Gold, 3f);
            box.raycastTarget = false;
            box.rectTransform.Place(0.3f, 0.45f, 0.7f, 0.55f);
            Label(box.transform, message, 34, Color.white).rectTransform.Fill();
            UnityEngine.Object.Destroy(box.gameObject, seconds);
        }
    }
}
