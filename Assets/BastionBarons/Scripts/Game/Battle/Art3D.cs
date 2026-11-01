using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace BastionBarons.Game
{
    /// <summary>
    /// Geração de modelos 3D provisórios a partir de primitivas. Todo modelo de unidade passa por
    /// <see cref="UnitModels.Build"/>, que primeiro procura um prefab definitivo em Resources/Models/Units/&lt;id&gt;.
    /// Ou seja: para trocar a arte basta adicionar o prefab com o id da carta — nenhum código muda.
    /// </summary>
    public static class Art3D
    {
        static Material litBase;
        static readonly Dictionary<Color, Material> cache = new Dictionary<Color, Material>();

        static Material LitBase
        {
            get
            {
                if (litBase == null)
                {
                    litBase = Resources.Load<Material>("Materials/Lit");
                    if (litBase == null)
                    {
                        var sh = GraphicsSettings.currentRenderPipeline != null ? Shader.Find("Universal Render Pipeline/Lit") : Shader.Find("Standard");
                        if (sh == null) sh = Shader.Find("Diffuse");
                        litBase = new Material(sh);
                    }
                }
                return litBase;
            }
        }

        public static Material Mat(Color c)
        {
            Material m;
            if (cache.TryGetValue(c, out m) && m != null) return m;
            m = new Material(LitBase) { color = c };
            if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", 0.25f);
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", 0.25f);
            cache[c] = m;
            return m;
        }

        static readonly Dictionary<Color, Material> glowCache = new Dictionary<Color, Material>();
        public static Material Glow(Color c)
        {
            Material m;
            if (glowCache.TryGetValue(c, out m) && m != null) return m;
            m = new Material(Mat(c));
            glowCache[c] = m;
            if (m.HasProperty("_EmissionColor"))
            {
                m.EnableKeyword("_EMISSION");
                m.SetColor("_EmissionColor", c * 1.5f);
            }
            return m;
        }

        public static GameObject Prim(PrimitiveType type, Transform parent, Vector3 localPos, Vector3 scale, Color color, bool keepCollider = false)
        {
            var go = GameObject.CreatePrimitive(type);
            if (!keepCollider)
            {
                var col = go.GetComponent<Collider>();
                if (col != null) Object.Destroy(col);
            }
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = scale;
            var r = go.GetComponent<Renderer>();
            r.sharedMaterial = Mat(color);
            r.shadowCastingMode = ShadowCastingMode.On;
            return go;
        }

        static Mesh cone;
        public static Mesh ConeMesh
        {
            get
            {
                if (cone != null) return cone;
                const int seg = 20;
                var verts = new List<Vector3>();
                var tris = new List<int>();
                verts.Add(new Vector3(0f, 1f, 0f));
                verts.Add(Vector3.zero);
                for (int i = 0; i <= seg; i++)
                {
                    float a = i / (float)seg * Mathf.PI * 2f;
                    verts.Add(new Vector3(Mathf.Cos(a) * 0.5f, 0f, Mathf.Sin(a) * 0.5f));
                }
                for (int i = 0; i < seg; i++)
                {
                    tris.Add(0); tris.Add(i + 3); tris.Add(i + 2);
                    tris.Add(1); tris.Add(i + 2); tris.Add(i + 3);
                }
                cone = new Mesh { name = "Cone" };
                cone.SetVertices(verts);
                cone.SetTriangles(tris, 0);
                cone.RecalculateNormals();
                cone.RecalculateBounds();
                return cone;
            }
        }

        public static GameObject Cone(Transform parent, Vector3 localPos, float radius, float height, Color color)
        {
            var go = new GameObject("Cone");
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = new Vector3(radius * 2f, height, radius * 2f);
            go.AddComponent<MeshFilter>().sharedMesh = ConeMesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = Mat(color);
            return go;
        }

        public static void Recolor(GameObject root, Color color)
        {
            foreach (var r in root.GetComponentsInChildren<Renderer>()) r.sharedMaterial = Mat(color);
        }
    }

    public static class Palette
    {
        public static readonly Color PlayerBlue = Ui.Hex("#2F6BFF");
        public static readonly Color EnemyRed = Ui.Hex("#E0323A");
        public static readonly Color Skin = Ui.Hex("#F1C39B");
        public static readonly Color Steel = Ui.Hex("#B9C2CF");
        public static readonly Color GoldTrim = Ui.Hex("#F2B636");
        public static readonly Color Wood = Ui.Hex("#7A4A25");
        public static readonly Color Grass = Ui.Hex("#5DAA3C");
        public static readonly Color PathStone = Ui.Hex("#C9B79A");

        public static Color ClassColor(string cls)
        {
            switch (cls)
            {
                case "King": return Ui.Hex("#2D57C8");
                case "Paladin": return Ui.Hex("#D7DDE6");
                case "Archer": return Ui.Hex("#3E9B45");
                case "Mage": return Ui.Hex("#2E5FD6");
                case "Necromancer": return Ui.Hex("#6B2FB0");
                case "Orc": return Ui.Hex("#B8322B");
                case "Assassin": return Ui.Hex("#2B2B3A");
                case "Druid": return Ui.Hex("#6C8F2E");
                case "Cleric": return Ui.Hex("#F3EEDF");
                case "Engineer": return Ui.Hex("#C27A2C");
                case "Barbarian": return Ui.Hex("#8B5A2B");
                case "Guardian": return Ui.Hex("#7D8590");
                case "Beast": return Ui.Hex("#C9562B");
                default: return Ui.Hex("#888888");
            }
        }
    }
}
