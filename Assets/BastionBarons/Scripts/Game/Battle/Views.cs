using System.Collections.Generic;
using BastionBarons.Core;
using UnityEngine;

namespace BastionBarons.Game
{
    /// <summary>Monta silhuetas distintas por carta/classe para leitura rápida na tela do celular.</summary>
    public static class UnitModels
    {
        public class Parts
        {
            public Transform Root, Body, Weapon;
            public List<Transform> Wings = new List<Transform>();
            public float Height = 2f;
        }

        public static Parts Build(CardDef def, Transform parent)
        {
            var p = new Parts();
            var root = new GameObject("Model").transform;
            root.SetParent(parent, false);
            p.Root = root;

            var prefab = Resources.Load<GameObject>("Models/Units/" + def.id);
            if (prefab != null)
            {
                var inst = Object.Instantiate(prefab, root);
                p.Body = inst.transform;
                return p;
            }

            switch (def.id)
            {
                case "fire_dragon": Dragon(p, Ui.Hex("#D8432A"), Ui.Hex("#F2A23A"), 1.25f); return p;
                case "ice_dragon": Dragon(p, Ui.Hex("#6CC6EE"), Ui.Hex("#E8F7FF"), 1.15f); return p;
                case "phoenix": Dragon(p, Ui.Hex("#FF8A1E"), Ui.Hex("#FFE15A"), 0.9f); return p;
                case "royal_griffin": Dragon(p, Ui.Hex("#2F5BD3"), Ui.Hex("#F5F0E6"), 0.95f); return p;
                case "stone_golem": Golem(p, Ui.Hex("#8C9098"), Ui.Hex("#5FC8FF"), 1.6f); return p;
                case "stone_guardian": Golem(p, Ui.Hex("#A7A08F"), Ui.Hex("#F2B636"), 1.3f); return p;
                case "guardian_ent": Ent(p); return p;
                case "dwarf_turret": Turret(p); return p;
            }

            float size = 0.85f + Mathf.Clamp01(def.hp / 1500f) * 0.7f;
            Color body = Palette.ClassColor(def.cls);
            Color skin = Palette.Skin;
            if (def.cls == "Orc" || def.id == "infernal_demon") skin = Ui.Hex(def.id == "infernal_demon" ? "#8E1B1B" : "#C9483A");
            if (def.id == "mountain_troll") skin = Ui.Hex("#7E9A86");
            if (def.cls == "Necromancer" && def.token) { body = Ui.Hex("#E9E4D4"); skin = Ui.Hex("#E9E4D4"); }
            Humanoid(p, def, body, skin, size);
            return p;
        }

        static void Humanoid(Parts p, CardDef def, Color body, Color skin, float s)
        {
            var b = new GameObject("Body").transform;
            b.SetParent(p.Root, false);
            b.localScale = Vector3.one * s;
            p.Body = b;
            Art3D.Prim(PrimitiveType.Capsule, b, new Vector3(0, 0.75f, 0), new Vector3(0.7f, 0.55f, 0.55f), body);
            Art3D.Prim(PrimitiveType.Sphere, b, new Vector3(0, 1.45f, 0), Vector3.one * 0.5f, skin);
            // pernas
            Art3D.Prim(PrimitiveType.Cube, b, new Vector3(0, 0.18f, 0.14f), new Vector3(0.2f, 0.36f, 0.18f), Ui.Hex("#3A2D25"));
            Art3D.Prim(PrimitiveType.Cube, b, new Vector3(0, 0.18f, -0.14f), new Vector3(0.2f, 0.36f, 0.18f), Ui.Hex("#3A2D25"));

            // cabeça/elmo por classe
            switch (def.cls)
            {
                case "King":
                case "Paladin":
                case "Guardian":
                    Art3D.Prim(PrimitiveType.Sphere, b, new Vector3(0, 1.5f, 0), new Vector3(0.55f, 0.45f, 0.55f), Palette.Steel);
                    Art3D.Prim(PrimitiveType.Cube, b, new Vector3(0, 1.78f, 0), new Vector3(0.06f, 0.18f, 0.4f), def.cls == "King" ? Palette.GoldTrim : Ui.Hex("#2F5BD3"));
                    break;
                case "Mage":
                case "Necromancer":
                case "Cleric":
                case "Druid":
                    Art3D.Cone(b, new Vector3(0, 1.55f, 0), 0.33f, 0.6f, body * 0.85f);
                    Art3D.Prim(PrimitiveType.Cylinder, b, new Vector3(0, 0.45f, 0), new Vector3(0.75f, 0.45f, 0.75f), body * 0.9f); // manto
                    break;
                case "Archer":
                case "Assassin":
                    Art3D.Cone(b, new Vector3(0, 1.5f, 0), 0.3f, 0.45f, body * 0.8f);
                    break;
                case "Barbarian":
                case "Orc":
                    Art3D.Prim(PrimitiveType.Cube, b, new Vector3(0.22f, 1.38f, 0.12f), new Vector3(0.08f, 0.16f, 0.06f), Color.white); // presas/chifres
                    Art3D.Prim(PrimitiveType.Cube, b, new Vector3(0.22f, 1.38f, -0.12f), new Vector3(0.08f, 0.16f, 0.06f), Color.white);
                    break;
                case "Engineer":
                    Art3D.Prim(PrimitiveType.Cylinder, b, new Vector3(0, 1.68f, 0), new Vector3(0.5f, 0.08f, 0.5f), Ui.Hex("#F2B636"));
                    break;
            }
            if (def.id == "infernal_demon")
            {
                Art3D.Cone(b, new Vector3(0, 1.7f, 0.18f), 0.08f, 0.4f, Ui.Hex("#1A1A1A"));
                Art3D.Cone(b, new Vector3(0, 1.7f, -0.18f), 0.08f, 0.4f, Ui.Hex("#1A1A1A"));
                Wing(p, b, new Vector3(-0.2f, 1.1f, 0.4f), 1f, Ui.Hex("#4A0E0E"));
                Wing(p, b, new Vector3(-0.2f, 1.1f, -0.4f), -1f, Ui.Hex("#4A0E0E"));
            }

            // arma (aponta para +X = frente)
            var w = new GameObject("Weapon").transform;
            w.SetParent(b, false);
            w.localPosition = new Vector3(0.3f, 0.85f, -0.3f);
            p.Weapon = w;
            bool ranged = def.range > 4f;
            switch (def.cls)
            {
                case "Archer":
                    if (def.id == "goblin_gunner") Art3D.Prim(PrimitiveType.Cylinder, w, new Vector3(0.25f, 0, 0), new Vector3(0.1f, 0.35f, 0.1f), Ui.Hex("#444444")).transform.localRotation = Quaternion.Euler(0, 0, 90);
                    else Art3D.Prim(PrimitiveType.Cylinder, w, Vector3.zero, new Vector3(0.06f, 0.55f, 0.06f), Palette.Wood);
                    break;
                case "Mage":
                case "Necromancer":
                case "Cleric":
                case "Druid":
                    Art3D.Prim(PrimitiveType.Cylinder, w, new Vector3(0, 0.1f, 0), new Vector3(0.07f, 0.75f, 0.07f), Palette.Wood);
                    var orb = Art3D.Prim(PrimitiveType.Sphere, w, new Vector3(0, 0.9f, 0), Vector3.one * 0.25f, def.cls == "Necromancer" ? Ui.Hex("#C04DFF") : def.cls == "Cleric" ? Ui.Hex("#FFE68A") : Ui.Hex("#6FD8FF"));
                    orb.GetComponent<Renderer>().sharedMaterial = Art3D.Glow(orb.GetComponent<Renderer>().sharedMaterial.color);
                    break;
                default:
                    if (def.range >= 2.5f && !ranged)
                    {
                        var spear = Art3D.Prim(PrimitiveType.Cylinder, w, new Vector3(0.4f, 0.1f, 0), new Vector3(0.06f, 0.8f, 0.06f), Palette.Wood);
                        spear.transform.localRotation = Quaternion.Euler(0, 0, 70);
                    }
                    else
                    {
                        bool axe = def.cls == "Barbarian" || def.cls == "Orc";
                        Art3D.Prim(PrimitiveType.Cube, w, new Vector3(0, 0.35f, 0), new Vector3(0.08f, 0.75f, 0.08f), axe ? Palette.Wood : Palette.Steel);
                        if (axe) Art3D.Prim(PrimitiveType.Cube, w, new Vector3(0.12f, 0.65f, 0), new Vector3(0.25f, 0.25f, 0.05f), Palette.Steel);
                    }
                    if (def.cls == "King" || def.cls == "Paladin" || def.cls == "Guardian")
                    {
                        // escudo azul com borda dourada (identidade da marca)
                        Art3D.Prim(PrimitiveType.Cube, b, new Vector3(0.3f, 0.8f, 0.32f), new Vector3(0.08f, 0.55f, 0.42f), Palette.GoldTrim);
                        Art3D.Prim(PrimitiveType.Cube, b, new Vector3(0.33f, 0.8f, 0.32f), new Vector3(0.06f, 0.47f, 0.34f), Ui.Hex("#2450B8"));
                    }
                    break;
            }
            p.Height = 1.9f * s;
        }

        static void Wing(Parts p, Transform parent, Vector3 pos, float side, Color c)
        {
            var pivot = new GameObject("Wing").transform;
            pivot.SetParent(parent, false);
            pivot.localPosition = pos;
            Art3D.Prim(PrimitiveType.Cube, pivot, new Vector3(0, 0, side * 0.6f), new Vector3(0.7f, 0.05f, 1.2f), c);
            p.Wings.Add(pivot);
        }

        static void Dragon(Parts p, Color body, Color belly, float s)
        {
            var b = new GameObject("Body").transform;
            b.SetParent(p.Root, false);
            b.localScale = Vector3.one * s;
            p.Body = b;
            Art3D.Prim(PrimitiveType.Sphere, b, new Vector3(0, 0, 0), new Vector3(1.6f, 0.8f, 0.8f), body);
            Art3D.Prim(PrimitiveType.Sphere, b, new Vector3(0.1f, -0.15f, 0), new Vector3(1.2f, 0.5f, 0.6f), belly);
            Art3D.Prim(PrimitiveType.Sphere, b, new Vector3(1f, 0.35f, 0), new Vector3(0.55f, 0.45f, 0.45f), body);
            Art3D.Cone(b, new Vector3(1.05f, 0.55f, 0.12f), 0.07f, 0.35f, belly);
            Art3D.Cone(b, new Vector3(1.05f, 0.55f, -0.12f), 0.07f, 0.35f, belly);
            var tail = Art3D.Prim(PrimitiveType.Cylinder, b, new Vector3(-1f, 0.05f, 0), new Vector3(0.18f, 0.5f, 0.18f), body);
            tail.transform.localRotation = Quaternion.Euler(0, 0, 70);
            Wing(p, b, new Vector3(0, 0.3f, 0.3f), 1f, body * 0.85f);
            Wing(p, b, new Vector3(0, 0.3f, -0.3f), -1f, body * 0.85f);
            p.Weapon = b;
            p.Height = 1.2f * s;
        }

        static void Golem(Parts p, Color stone, Color crystal, float s)
        {
            var b = new GameObject("Body").transform;
            b.SetParent(p.Root, false);
            b.localScale = Vector3.one * s;
            p.Body = b;
            Art3D.Prim(PrimitiveType.Cube, b, new Vector3(0, 0.95f, 0), new Vector3(0.9f, 0.9f, 1f), stone);
            Art3D.Prim(PrimitiveType.Cube, b, new Vector3(0.05f, 1.6f, 0), new Vector3(0.5f, 0.4f, 0.5f), stone);
            var eye = Art3D.Prim(PrimitiveType.Cube, b, new Vector3(0.3f, 1.65f, 0), new Vector3(0.05f, 0.08f, 0.35f), crystal);
            eye.GetComponent<Renderer>().sharedMaterial = Art3D.Glow(crystal);
            Art3D.Prim(PrimitiveType.Cube, b, new Vector3(0, 0.95f, 0.7f), new Vector3(0.35f, 0.9f, 0.35f), stone * 0.9f);
            Art3D.Prim(PrimitiveType.Cube, b, new Vector3(0, 0.95f, -0.7f), new Vector3(0.35f, 0.9f, 0.35f), stone * 0.9f);
            Art3D.Prim(PrimitiveType.Cube, b, new Vector3(0, 0.25f, 0.25f), new Vector3(0.35f, 0.5f, 0.3f), stone * 0.8f);
            Art3D.Prim(PrimitiveType.Cube, b, new Vector3(0, 0.25f, -0.25f), new Vector3(0.35f, 0.5f, 0.3f), stone * 0.8f);
            var c1 = Art3D.Prim(PrimitiveType.Cube, b, new Vector3(-0.2f, 1.45f, 0.3f), new Vector3(0.2f, 0.3f, 0.2f), crystal);
            c1.transform.localRotation = Quaternion.Euler(20, 0, 30);
            p.Weapon = b;
            p.Height = 2f * s;
        }

        static void Ent(Parts p)
        {
            var b = new GameObject("Body").transform;
            b.SetParent(p.Root, false);
            b.localScale = Vector3.one * 1.4f;
            p.Body = b;
            Art3D.Prim(PrimitiveType.Cylinder, b, new Vector3(0, 0.8f, 0), new Vector3(0.6f, 0.8f, 0.6f), Ui.Hex("#6B4423"));
            Art3D.Prim(PrimitiveType.Sphere, b, new Vector3(0, 1.9f, 0), new Vector3(1.4f, 1f, 1.4f), Ui.Hex("#4E9A3A"));
            Art3D.Prim(PrimitiveType.Sphere, b, new Vector3(0.32f, 1.25f, 0.12f), Vector3.one * 0.1f, Ui.Hex("#FFE15A"));
            Art3D.Prim(PrimitiveType.Sphere, b, new Vector3(0.32f, 1.25f, -0.12f), Vector3.one * 0.1f, Ui.Hex("#FFE15A"));
            var arm = Art3D.Prim(PrimitiveType.Cylinder, b, new Vector3(0.2f, 1.1f, 0.5f), new Vector3(0.15f, 0.5f, 0.15f), Ui.Hex("#6B4423"));
            arm.transform.localRotation = Quaternion.Euler(40, 0, 0);
            p.Weapon = b;
            p.Height = 2.6f;
        }

        static void Turret(Parts p)
        {
            var b = new GameObject("Body").transform;
            b.SetParent(p.Root, false);
            p.Body = b;
            Art3D.Prim(PrimitiveType.Cylinder, b, new Vector3(0, 0.8f, 0), new Vector3(0.9f, 0.8f, 0.9f), Ui.Hex("#9A8F80"));
            Art3D.Cone(b, new Vector3(0, 1.6f, 0), 0.6f, 0.7f, Ui.Hex("#C27A2C"));
            var gun = Art3D.Prim(PrimitiveType.Cylinder, b, new Vector3(0.55f, 1.2f, 0), new Vector3(0.18f, 0.4f, 0.18f), Ui.Hex("#3A3A3A"));
            gun.transform.localRotation = Quaternion.Euler(0, 0, 90);
            p.Weapon = gun.transform;
            p.Height = 2.3f;
        }
    }

    public class UnitView : MonoBehaviour
    {
        public int UnitId;
        public bool IsPlayer;
        UnitModels.Parts parts;
        Transform hpRoot, hpFill, shieldRing, stunFx;
        Renderer hpFillRenderer;
        float attackAnim, deployAnim, phase, dying = -1f;
        bool flying;
        Vector3 basePos;
        Camera cam;

        public void Init(Unit u, Vector3 worldPos, Camera camera)
        {
            UnitId = u.Id;
            IsPlayer = u.Owner == 0;
            flying = u.Flying;
            cam = camera;
            phase = Random.value * 10f;
            transform.position = worldPos;
            basePos = worldPos;
            parts = UnitModels.Build(u.Def, transform);
            parts.Root.localRotation = Quaternion.Euler(0f, IsPlayer ? 0f : 180f, 0f);

            // anel de time sob a unidade (leitura instantânea de aliado/inimigo)
            var ring = Art3D.Prim(PrimitiveType.Cylinder, transform, new Vector3(0, flying ? -2.6f : 0.03f, 0), new Vector3(1.3f, 0.02f, 1.3f), IsPlayer ? Palette.PlayerBlue : Palette.EnemyRed);
            ring.name = "TeamRing";

            hpRoot = new GameObject("HP").transform;
            hpRoot.SetParent(transform, false);
            hpRoot.localPosition = new Vector3(0, parts.Height + 0.5f, 0);
            Art3D.Prim(PrimitiveType.Cube, hpRoot, Vector3.zero, new Vector3(1.4f, 0.18f, 0.02f), new Color(0.1f, 0.1f, 0.1f));
            var fill = Art3D.Prim(PrimitiveType.Cube, hpRoot, new Vector3(0, 0, -0.02f), new Vector3(1.3f, 0.12f, 0.02f), IsPlayer ? Palette.PlayerBlue : Palette.EnemyRed);
            hpFill = fill.transform;
            hpFillRenderer = fill.GetComponent<Renderer>();
            foreach (var r in hpRoot.GetComponentsInChildren<Renderer>()) r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

            shieldRing = Art3D.Prim(PrimitiveType.Cylinder, transform, new Vector3(0, parts.Height * 0.5f, 0), new Vector3(1.8f, 0.03f, 1.8f), Ui.Hex("#8FE3FF")).transform;
            shieldRing.gameObject.SetActive(false);
            stunFx = Art3D.Prim(PrimitiveType.Cube, transform, new Vector3(0, parts.Height * 0.5f, 0), new Vector3(1.2f, parts.Height, 1.2f), Ui.Hex("#BFEFFF")).transform;
            stunFx.gameObject.SetActive(false);
            deployAnim = 0f;
        }

        public void Sync(Unit u, Vector3 target, float dt)
        {
            basePos = Vector3.Lerp(basePos, target, 1f - Mathf.Exp(-dt * 14f));
            float t = Time.time + phase;
            float bob = 0f;
            if (u.State == UnitState.Moving) bob = Mathf.Abs(Mathf.Sin(t * 9f)) * 0.15f;
            if (flying) bob = Mathf.Sin(t * 3f) * 0.25f;
            transform.position = basePos + Vector3.up * bob;

            deployAnim = Mathf.Min(1f, deployAnim + dt * 3f);
            float pop = deployAnim < 1f ? Mathf.SmoothStep(0.2f, 1f, deployAnim) : 1f;
            parts.Root.localScale = Vector3.one * pop;

            if (attackAnim > 0f)
            {
                attackAnim -= dt;
                float k = Mathf.Sin(Mathf.Clamp01(1f - attackAnim / 0.25f) * Mathf.PI);
                parts.Root.localPosition = new Vector3((IsPlayer ? 1f : -1f) * k * 0.35f, 0, 0);
                if (parts.Weapon != null && parts.Weapon.name == "Weapon") parts.Weapon.localRotation = Quaternion.Euler(0, 0, -70f * k);
            }
            else
            {
                parts.Root.localPosition = Vector3.zero;
                if (parts.Weapon != null && parts.Weapon.name == "Weapon") parts.Weapon.localRotation = Quaternion.identity;
            }

            foreach (var w in parts.Wings)
                w.localRotation = Quaternion.Euler(Mathf.Sin(t * 8f) * 35f * Mathf.Sign(w.localPosition.z), 0, 0);

            float pct = u.MaxHp > 0f ? Mathf.Clamp01(u.Hp / u.MaxHp) : 0f;
            hpRoot.gameObject.SetActive(pct < 0.999f || u.Shield > 0f);
            hpFill.localScale = new Vector3(1.3f * pct, 0.12f, 0.02f);
            hpFill.localPosition = new Vector3(-0.65f * (1f - pct), 0, -0.02f);
            if (cam != null) hpRoot.rotation = cam.transform.rotation;
            shieldRing.gameObject.SetActive(u.Shield > 0f);
            if (u.Shield > 0f) shieldRing.Rotate(0f, 180f * dt, 0f);
            stunFx.gameObject.SetActive(u.State == UnitState.Stunned);
            if (hpFillRenderer != null && u.PoisonTime > 0f) hpFillRenderer.sharedMaterial = Art3D.Mat(Ui.Hex("#7CD32B"));
            else if (hpFillRenderer != null) hpFillRenderer.sharedMaterial = Art3D.Mat(IsPlayer ? Palette.PlayerBlue : Palette.EnemyRed);
        }

        public void PlayAttack() { attackAnim = 0.25f; }

        public void Revive() { deployAnim = 0f; }

        public void Die()
        {
            if (dying >= 0f) return;
            dying = 0f;
            if (hpRoot != null) hpRoot.gameObject.SetActive(false);
        }

        public bool IsDying { get { return dying >= 0f; } }

        void Update()
        {
            if (dying < 0f) return;
            dying += Time.deltaTime;
            float k = Mathf.Clamp01(dying / 0.45f);
            parts.Root.localScale = Vector3.one * (1f - k);
            parts.Root.localRotation = Quaternion.Euler(0f, (IsPlayer ? 0f : 180f), 90f * k);
            if (k >= 1f) Destroy(gameObject);
        }
    }

    /// <summary>Castelo procedural: pedra cinza, torres com telhado azul, detalhes dourados e faixas vermelhas.</summary>
    public class CastleView : MonoBehaviour
    {
        readonly List<Transform> towers = new List<Transform>();
        readonly List<Transform> flags = new List<Transform>();
        Transform shield;
        float shake;
        Vector3 home;
        bool destroyed;
        float destroyT;

        public void Init(CastleDef def, bool isPlayer)
        {
            home = transform.position;
            Color stone = Ui.Hex(string.IsNullOrEmpty(def.stoneColor) ? "#9EA3AD" : def.stoneColor);
            Color roof = Ui.Hex(string.IsNullOrEmpty(def.roofColor) ? "#2F5BD3" : def.roofColor);
            Color banner = isPlayer ? Ui.Hex("#2450B8") : Ui.Hex("#B3202A");
            float face = isPlayer ? 1f : -1f; // lado voltado para o campo

            var prefab = Resources.Load<GameObject>("Models/Castles/" + def.id);
            if (prefab != null) { Instantiate(prefab, transform); }
            else
            {
                Art3D.Prim(PrimitiveType.Cube, transform, new Vector3(0, 2.5f, 0), new Vector3(5f, 5f, 15f), stone);
                for (int i = -3; i <= 3; i++) // ameias
                    Art3D.Prim(PrimitiveType.Cube, transform, new Vector3(face * 2.2f, 5.3f, i * 2f), new Vector3(0.6f, 0.6f, 0.9f), stone * 1.05f);
                Art3D.Prim(PrimitiveType.Cube, transform, new Vector3(face * 2.55f, 1.3f, 0), new Vector3(0.2f, 2.6f, 2.2f), Ui.Hex("#4A3020")); // portão
                Art3D.Prim(PrimitiveType.Cube, transform, new Vector3(face * 2.6f, 2.75f, 0), new Vector3(0.15f, 0.3f, 2.6f), Palette.GoldTrim);
                float[] zs = { -7f, 7f, 0f };
                for (int i = 0; i < zs.Length; i++)
                {
                    bool keep = i == 2;
                    var t = new GameObject("Tower").transform;
                    t.SetParent(transform, false);
                    t.localPosition = new Vector3(keep ? -face * 0.8f : face * 0.8f, 0, zs[i]);
                    float h = keep ? 10f : 7.5f, r = keep ? 2.4f : 1.8f;
                    Art3D.Prim(PrimitiveType.Cylinder, t, new Vector3(0, h * 0.5f, 0), new Vector3(r, h * 0.5f, r), stone);
                    Art3D.Prim(PrimitiveType.Cylinder, t, new Vector3(0, h, 0), new Vector3(r * 1.12f, 0.2f, r * 1.12f), Palette.GoldTrim);
                    Art3D.Cone(t, new Vector3(0, h + 0.2f, 0), r * 0.62f, r * 1.3f, roof);
                    var win = Art3D.Prim(PrimitiveType.Cube, t, new Vector3(face * r * 0.5f, h * 0.65f, 0), new Vector3(0.1f, 0.7f, 0.4f), Ui.Hex("#FFC85A"));
                    win.GetComponent<Renderer>().sharedMaterial = Art3D.Glow(Ui.Hex("#FFB23A"));
                    var pole = Art3D.Prim(PrimitiveType.Cylinder, t, new Vector3(0, h + r * 1.3f + 0.6f, 0), new Vector3(0.06f, 0.6f, 0.06f), Palette.GoldTrim);
                    var flag = new GameObject("Flag").transform;
                    flag.SetParent(pole.transform.parent, false);
                    flag.localPosition = new Vector3(0, h + r * 1.3f + 1f, 0);
                    Art3D.Prim(PrimitiveType.Cube, flag, new Vector3(0, 0, 0.45f), new Vector3(0.05f, 0.45f, 0.9f), banner);
                    flags.Add(flag);
                    towers.Add(t);
                    // faixa vertical com coroa dourada
                    Art3D.Prim(PrimitiveType.Cube, t, new Vector3(face * r * 0.52f, h * 0.35f, 0), new Vector3(0.05f, h * 0.35f, 0.7f), banner);
                    Art3D.Prim(PrimitiveType.Cube, t, new Vector3(face * r * 0.55f, h * 0.4f, 0), new Vector3(0.05f, 0.3f, 0.4f), Palette.GoldTrim);
                }
            }

            shield = new GameObject("Shield").transform;
            shield.SetParent(transform, false);
            for (int i = 0; i < 10; i++)
            {
                float a = i / 10f * Mathf.PI * 2f;
                var s = Art3D.Prim(PrimitiveType.Sphere, shield, new Vector3(Mathf.Cos(a) * 6f, 4f, Mathf.Sin(a) * 9f), Vector3.one * 0.8f, Ui.Hex("#8FE3FF"));
                s.GetComponent<Renderer>().sharedMaterial = Art3D.Glow(Ui.Hex("#5FC8FF"));
            }
            shield.gameObject.SetActive(false);
        }

        public void Hit() { shake = 0.25f; }

        public void SetShield(bool on) { if (shield.gameObject.activeSelf != on) shield.gameObject.SetActive(on); }

        public void Collapse() { destroyed = true; }

        void Update()
        {
            float t = Time.time;
            for (int i = 0; i < flags.Count; i++) flags[i].localRotation = Quaternion.Euler(0, Mathf.Sin(t * 3f + i) * 20f, 0);
            if (shield.gameObject.activeSelf) shield.Rotate(0, 40f * Time.deltaTime, 0);
            Vector3 offset = Vector3.zero;
            if (shake > 0f) { shake -= Time.deltaTime; offset = Random.insideUnitSphere * 0.25f * (shake / 0.25f); }
            if (destroyed)
            {
                destroyT += Time.deltaTime;
                for (int i = 0; i < towers.Count; i++)
                {
                    towers[i].localRotation = Quaternion.Euler(Mathf.Min(70f, destroyT * 60f) * (i % 2 == 0 ? 1 : -1), 0, Mathf.Min(30f, destroyT * 25f));
                }
                offset += Vector3.down * Mathf.Min(3f, destroyT * 1.5f);
            }
            transform.position = home + offset;
        }
    }

    /// <summary>O Barão fica junto ao castelo comandando: não entra nas rotas, não tem vida, não pode ser atacado.</summary>
    public class BaronView : MonoBehaviour
    {
        Transform body, arm;
        float cheer, cast;
        int mood; // 0 normal, 1 vitória, -1 derrota

        public void Init(BaronDef def, bool isPlayer)
        {
            var prefab = Resources.Load<GameObject>("Models/Barons/" + def.id);
            body = new GameObject("Baron").transform;
            body.SetParent(transform, false);
            body.localScale = Vector3.one * 1.6f;
            body.localRotation = Quaternion.Euler(0, isPlayer ? 0 : 180, 0);
            if (prefab != null) { Instantiate(prefab, body); return; }

            Color main = Ui.Hex(string.IsNullOrEmpty(def.color) ? "#2F5BD3" : def.color);
            Color skin = Palette.Skin;
            if (def.id == "thorg") skin = Ui.Hex("#C9483A");
            if (def.id == "malachar") skin = Ui.Hex("#E9E4D4");
            Art3D.Prim(PrimitiveType.Capsule, body, new Vector3(0, 0.8f, 0), new Vector3(0.8f, 0.6f, 0.65f), main);
            Art3D.Prim(PrimitiveType.Sphere, body, new Vector3(0, 1.55f, 0), Vector3.one * 0.55f, skin);
            // capa
            Art3D.Prim(PrimitiveType.Cube, body, new Vector3(-0.35f, 0.75f, 0), new Vector3(0.08f, 1.2f, 0.8f), def.id == "rei_bastion" ? Ui.Hex("#F3EEDF") : main * 0.7f);
            switch (def.id)
            {
                case "rei_bastion":
                    Art3D.Prim(PrimitiveType.Sphere, body, new Vector3(0.18f, 1.35f, 0), new Vector3(0.35f, 0.3f, 0.45f), Ui.Hex("#C8501E")); // barba ruiva
                    Art3D.Prim(PrimitiveType.Cylinder, body, new Vector3(0, 1.85f, 0), new Vector3(0.45f, 0.12f, 0.45f), Palette.GoldTrim);   // coroa
                    for (int i = 0; i < 5; i++)
                    {
                        float a = i / 5f * Mathf.PI * 2f;
                        Art3D.Cone(body, new Vector3(Mathf.Cos(a) * 0.2f, 1.95f, Mathf.Sin(a) * 0.2f), 0.06f, 0.18f, Palette.GoldTrim);
                    }
                    break;
                case "elara":
                    Art3D.Prim(PrimitiveType.Sphere, body, new Vector3(-0.1f, 1.6f, 0), new Vector3(0.6f, 0.5f, 0.6f), Ui.Hex("#F2D46B")); // cabelo loiro
                    Art3D.Cone(body, new Vector3(0, 1.62f, 0.3f), 0.05f, 0.25f, skin);
                    Art3D.Cone(body, new Vector3(0, 1.62f, -0.3f), 0.05f, 0.25f, skin);
                    break;
                case "malachar":
                    Art3D.Cone(body, new Vector3(0, 1.45f, 0), 0.42f, 0.8f, Ui.Hex("#4B1F7A"));
                    var eye = Art3D.Prim(PrimitiveType.Sphere, body, new Vector3(0.25f, 1.58f, 0), new Vector3(0.1f, 0.08f, 0.3f), Ui.Hex("#D27BFF"));
                    eye.GetComponent<Renderer>().sharedMaterial = Art3D.Glow(Ui.Hex("#C04DFF"));
                    break;
                case "thorg":
                    Art3D.Prim(PrimitiveType.Cube, body, new Vector3(0.25f, 1.42f, 0.12f), new Vector3(0.1f, 0.2f, 0.07f), Color.white);
                    Art3D.Prim(PrimitiveType.Cube, body, new Vector3(0.25f, 1.42f, -0.12f), new Vector3(0.1f, 0.2f, 0.07f), Color.white);
                    Art3D.Prim(PrimitiveType.Sphere, body, new Vector3(-0.1f, 1.75f, 0), new Vector3(0.5f, 0.3f, 0.5f), Ui.Hex("#1E1A1A"));
                    Art3D.Prim(PrimitiveType.Cube, body, new Vector3(0, 1.15f, 0), new Vector3(0.9f, 0.2f, 1f), Ui.Hex("#5A5E66")); // ombreiras
                    break;
                case "eldrin":
                    Art3D.Cone(body, new Vector3(0, 1.5f, 0), 0.4f, 0.75f, Ui.Hex("#2450B8"));
                    Art3D.Prim(PrimitiveType.Sphere, body, new Vector3(0.2f, 1.3f, 0), new Vector3(0.3f, 0.45f, 0.4f), Color.white); // barba branca
                    break;
            }
            arm = new GameObject("Arm").transform;
            arm.SetParent(body, false);
            arm.localPosition = new Vector3(0.1f, 1.15f, -0.45f);
            Art3D.Prim(PrimitiveType.Cylinder, arm, new Vector3(0, 0.5f, 0), new Vector3(0.08f, 0.6f, 0.08f), def.id == "rei_bastion" ? Palette.Steel : Palette.Wood);
            var tip = Art3D.Prim(PrimitiveType.Sphere, arm, new Vector3(0, 1.15f, 0), Vector3.one * 0.22f, main);
            tip.GetComponent<Renderer>().sharedMaterial = Art3D.Glow(main);
        }

        public void Command() { cast = 1f; }
        public void Celebrate() { mood = 1; }
        public void Lament() { mood = -1; }
        public void React() { cheer = 0.4f; }

        void Update()
        {
            if (body == null) return;
            float t = Time.time;
            float y = Mathf.Sin(t * 2f) * 0.05f;
            if (mood == 1) y = Mathf.Abs(Mathf.Sin(t * 6f)) * 0.6f;
            if (cheer > 0f) { cheer -= Time.deltaTime; y += Mathf.Sin(cheer / 0.4f * Mathf.PI) * 0.3f; }
            body.localPosition = new Vector3(0, y, 0);
            float slump = mood == -1 ? 25f : 0f;
            body.localRotation = Quaternion.Euler(0, body.localEulerAngles.y, -slump);
            if (arm != null)
            {
                float raise = 0f;
                if (cast > 0f) { cast -= Time.deltaTime; raise = Mathf.Sin(Mathf.Clamp01(cast) * Mathf.PI) * 120f; }
                if (mood == 1) raise = 140f;
                arm.localRotation = Quaternion.Euler(raise, 0, 0);
            }
        }
    }

    /// <summary>Efeitos visuais leves e legíveis (sem excesso de partículas).</summary>
    public class FxAnim : MonoBehaviour
    {
        public System.Func<float, bool> Tick; // recebe t (s); retorna false para encerrar
        float t;
        void Update()
        {
            t += Time.deltaTime;
            if (Tick == null || !Tick(t)) Destroy(gameObject);
        }

        public static void Projectile(Vector3 from, Vector3 to, Color c, float size = 0.35f, float time = 0.22f)
        {
            var go = Art3D.Prim(PrimitiveType.Sphere, null, from, Vector3.one * size, c);
            go.GetComponent<Renderer>().sharedMaterial = Art3D.Glow(c);
            var fx = go.AddComponent<FxAnim>();
            fx.Tick = t =>
            {
                float k = Mathf.Clamp01(t / time);
                go.transform.position = Vector3.Lerp(from, to, k) + Vector3.up * Mathf.Sin(k * Mathf.PI) * 1.2f;
                return k < 1f;
            };
        }

        public static void Burst(Vector3 pos, Color c, float radius, float time = 0.4f)
        {
            var go = Art3D.Prim(PrimitiveType.Sphere, null, pos, Vector3.zero, c);
            go.GetComponent<Renderer>().sharedMaterial = Art3D.Glow(c);
            go.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            var fx = go.AddComponent<FxAnim>();
            fx.Tick = t =>
            {
                float k = Mathf.Clamp01(t / time);
                float s = radius * 2f * Mathf.Sin(k * Mathf.PI * 0.5f) * (1f - k * 0.7f);
                go.transform.localScale = new Vector3(s, s * 0.5f, s);
                return k < 1f;
            };
        }

        public static void LaneFlash(Vector3 center, float length, Color c, float time = 0.6f)
        {
            var go = Art3D.Prim(PrimitiveType.Cube, null, center + Vector3.up * 0.15f, new Vector3(length, 0.05f, 3.6f), c);
            go.GetComponent<Renderer>().sharedMaterial = Art3D.Glow(c);
            var fx = go.AddComponent<FxAnim>();
            fx.Tick = t =>
            {
                float k = Mathf.Clamp01(t / time);
                go.transform.localScale = new Vector3(length, 0.05f + Mathf.Sin(k * Mathf.PI) * 0.6f, 3.6f * (1f - k * 0.5f));
                return k < 1f;
            };
        }
    }
}
