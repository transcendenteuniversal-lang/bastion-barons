using System;
using System.Collections.Generic;

namespace BastionBarons.Core
{
    public enum CardType { Troop, Spell, Building }
    public enum CardCategory { Troop, Spell, Creature, Defense, Support }
    public enum Rarity { Common, Rare, Epic, Legendary, Mythic }
    public enum TargetType { Ground, Both, CastleOnly }
    public enum UnitAbility { None, Splash, ProtectAura, Summon, Rebirth, SlowOnHit, Regen, HealAura, BuildTurret }
    public enum SpellEffect { None, Damage, Stun, Heal, StrongestTargets, Shield, Poison, Summon }
    public enum BaronAbility { RoyalCommand, ElvenRain, ArmyOfDead, OrcFury, ArcaneStorm }
    public enum CastleAbility { ImperialShield, DragonBreath, IceStorm }

    internal static class EnumUtil
    {
        public static T Parse<T>(string value, T fallback) where T : struct
        {
            if (string.IsNullOrEmpty(value)) return fallback;
            T result;
            if (Enum.TryParse(value, true, out result)) return result;
            throw new FormatException("Valor inválido '" + value + "' para " + typeof(T).Name);
        }
    }

    /// <summary>Definição de carta. Campos públicos em string para serem lidos por JsonUtility e pelo painel admin.</summary>
    [Serializable]
    public class CardDef
    {
        public string id;
        public string type;       // Troop | Spell | Building
        public string category;   // Troop | Spell | Creature | Defense | Support
        public string rarity;     // Common .. Mythic
        public string cls;        // classe/arquétipo (King, Paladin, Archer, ...)
        public int cost;
        public float hp;
        public float damage;
        public float attackInterval = 1f;
        public float moveSpeed;
        public float range = 1.5f;
        public string targets;    // Ground | Both | CastleOnly
        public bool flying;
        public int count = 1;
        public string ability;    // UnitAbility
        public float abilityValue;
        public float abilityRadius;
        public float abilityDuration;
        public float abilityInterval;
        public string summonId;
        public int summonCount;
        public string spell;      // SpellEffect
        public float spellValue;
        public float spellRadius; // 0 = rota inteira
        public float spellDuration;
        public float castleDamageRatio;
        public int spellHits;
        public float lifetime;    // 0 = permanente
        public bool token;        // unidade invocada, não colecionável

        [NonSerialized] public CardType Type;
        [NonSerialized] public CardCategory Category;
        [NonSerialized] public Rarity Rarity;
        [NonSerialized] public TargetType Targets;
        [NonSerialized] public UnitAbility Ability;
        [NonSerialized] public SpellEffect Spell;

        public bool IsSpell { get { return Type == CardType.Spell; } }
        public bool CanHitAir { get { return Targets == TargetType.Both; } }

        public void Resolve()
        {
            Type = EnumUtil.Parse(type, CardType.Troop);
            Category = EnumUtil.Parse(category, CardCategory.Troop);
            Rarity = EnumUtil.Parse(rarity, Rarity.Common);
            Targets = EnumUtil.Parse(targets, TargetType.Ground);
            Ability = EnumUtil.Parse(ability, UnitAbility.None);
            Spell = EnumUtil.Parse(spell, SpellEffect.None);
            if (count <= 0) count = 1;
            if (attackInterval <= 0f) attackInterval = 1f;
        }
    }

    [Serializable]
    public class BaronDef
    {
        public string id;
        public string cls;
        public string ability;
        public float chargeSeconds = 30f;
        public float initialCharge;   // 0..1
        public float value;
        public float value2;
        public float duration;
        public int count;
        public float interval;
        public bool requiresLane;
        public string summonId;
        public int unlockLevel = 1;
        public string color;          // cor principal (hex) para placeholders

        [NonSerialized] public BaronAbility Ability;
        public void Resolve() { Ability = EnumUtil.Parse(ability, BaronAbility.RoyalCommand); }
    }

    [Serializable]
    public class CastleDef
    {
        public string id;
        public float hp;              // 0 = usa balance.castleHp
        public string ability;
        public float cooldown = 50f;
        public float initialCooldown = 20f;
        public float value;
        public float value2;
        public float duration;
        public bool requiresLane;
        public int unlockLevel = 1;
        public string roofColor;
        public string stoneColor;

        [NonSerialized] public CastleAbility Ability;
        public void Resolve() { Ability = EnumUtil.Parse(ability, CastleAbility.ImperialShield); }
    }

    /// <summary>Parâmetros de balanceamento ajustáveis sem nova versão do app.</summary>
    [Serializable]
    public class BalanceConfig
    {
        public int tickRate = 20;
        public float matchSeconds = 180f;
        public float startEnergy = 5f;
        public float maxEnergy = 10f;
        public float energyPerSecond = 0.36f;
        public float doubleEnergyLastSeconds = 60f;
        public int handSize = 4;
        public int deckSize = 14;
        public float laneLength = 100f;
        public float spawnOffset = 9f;
        public float castleFront = 6f;
        public float castleHp = 3000f;
        public float castleAttackDamage = 45f;
        public float castleAttackInterval = 1f;
        public float castleAttackRange = 16f;
        public float deployDelay = 0.8f;
        public float turretForwardOffset = 8f;
        public int maxUnitsPerPlayer = 40;
        public float levelStatBonus = 0.08f;
        public int maxCardLevel = 10;
        public int[] upgradeCopies = { 2, 4, 8, 15, 25, 40, 60, 90, 130 };
        public int[] upgradeGold = { 20, 50, 120, 250, 500, 900, 1500, 2500, 4000 };
        public int[] rarityWeights = { 600, 270, 100, 25, 5 };
        public int pityThreshold = 10;
        public int winGold = 60, drawGold = 25, lossGold = 15;
        public int winXp = 40, drawXp = 20, lossXp = 15;
        public int xpBase = 100, xpPerLevel = 60;
        public string[] starterCards;
        public string[] starterDeck;
        public string starterBaron = "rei_bastion";
        public string starterCastle = "royal_fortress";
    }

    [Serializable]
    public class ContentFile
    {
        public string version;
        public BalanceConfig balance;
        public CardDef[] cards;
        public BaronDef[] barons;
        public CastleDef[] castles;
    }

    public class ContentException : Exception
    {
        public readonly List<string> Errors;
        public ContentException(List<string> errors) : base("Conteúdo inválido:\n" + string.Join("\n", errors)) { Errors = errors; }
    }

    public class ContentDatabase
    {
        public readonly BalanceConfig Balance;
        public readonly string Version;
        readonly Dictionary<string, CardDef> cards = new Dictionary<string, CardDef>();
        readonly Dictionary<string, BaronDef> barons = new Dictionary<string, BaronDef>();
        readonly Dictionary<string, CastleDef> castles = new Dictionary<string, CastleDef>();
        public readonly List<CardDef> AllCards = new List<CardDef>();
        public readonly List<CardDef> CollectibleCards = new List<CardDef>();
        public readonly List<BaronDef> Barons = new List<BaronDef>();
        public readonly List<CastleDef> Castles = new List<CastleDef>();

        public ContentDatabase(ContentFile file)
        {
            var errors = new List<string>();
            if (file == null) { errors.Add("arquivo nulo"); throw new ContentException(errors); }
            Balance = file.balance ?? new BalanceConfig();
            Version = file.version ?? "0";
            foreach (var c in file.cards ?? new CardDef[0])
            {
                try { c.Resolve(); } catch (FormatException e) { errors.Add(c.id + ": " + e.Message); continue; }
                if (string.IsNullOrEmpty(c.id)) { errors.Add("carta sem id"); continue; }
                if (cards.ContainsKey(c.id)) { errors.Add("carta duplicada: " + c.id); continue; }
                if (!c.IsSpell && c.hp <= 0) errors.Add(c.id + ": hp deve ser > 0");
                if (!c.token && (c.cost < 1 || c.cost > Balance.maxEnergy)) errors.Add(c.id + ": custo fora do intervalo");
                cards[c.id] = c; AllCards.Add(c);
                if (!c.token) CollectibleCards.Add(c);
            }
            foreach (var c in AllCards)
            {
                bool needsSummon = c.Ability == UnitAbility.Summon || c.Ability == UnitAbility.BuildTurret || c.Spell == SpellEffect.Summon;
                if (needsSummon && (string.IsNullOrEmpty(c.summonId) || !cards.ContainsKey(c.summonId)))
                    errors.Add(c.id + ": summonId inválido '" + c.summonId + "'");
            }
            foreach (var b in file.barons ?? new BaronDef[0])
            {
                try { b.Resolve(); } catch (FormatException e) { errors.Add(b.id + ": " + e.Message); continue; }
                if (barons.ContainsKey(b.id)) { errors.Add("barão duplicado: " + b.id); continue; }
                if (b.Ability == BaronAbility.ArmyOfDead && !cards.ContainsKey(b.summonId ?? "")) errors.Add(b.id + ": summonId inválido");
                barons[b.id] = b; Barons.Add(b);
            }
            foreach (var c in file.castles ?? new CastleDef[0])
            {
                try { c.Resolve(); } catch (FormatException e) { errors.Add(c.id + ": " + e.Message); continue; }
                if (castles.ContainsKey(c.id)) { errors.Add("castelo duplicado: " + c.id); continue; }
                castles[c.id] = c; Castles.Add(c);
            }
            if (Barons.Count == 0) errors.Add("nenhum barão definido");
            if (Castles.Count == 0) errors.Add("nenhum castelo definido");
            if (CollectibleCards.Count < Balance.deckSize) errors.Add("cartas insuficientes para um baralho");
            if (errors.Count > 0) throw new ContentException(errors);
        }

        public bool HasCard(string id) { return id != null && cards.ContainsKey(id); }
        public CardDef Card(string id)
        {
            CardDef c;
            if (id != null && cards.TryGetValue(id, out c)) return c;
            throw new KeyNotFoundException("Carta desconhecida: " + id);
        }
        public bool HasBaron(string id) { return id != null && barons.ContainsKey(id); }
        public BaronDef Baron(string id)
        {
            BaronDef b;
            if (id != null && barons.TryGetValue(id, out b)) return b;
            throw new KeyNotFoundException("Barão desconhecido: " + id);
        }
        public bool HasCastle(string id) { return id != null && castles.ContainsKey(id); }
        public CastleDef Castle(string id)
        {
            CastleDef c;
            if (id != null && castles.TryGetValue(id, out c)) return c;
            throw new KeyNotFoundException("Castelo desconhecido: " + id);
        }

        public float LevelMultiplier(int level)
        {
            if (level < 1) level = 1;
            return 1f + Balance.levelStatBonus * (level - 1);
        }
    }
}
