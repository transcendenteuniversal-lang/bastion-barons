using System;
using System.Collections.Generic;

namespace BastionBarons.Core
{
    [Serializable]
    public class OwnedCard
    {
        public string id;
        public int level = 1;
        public int copies;
    }

    [Serializable]
    public class SavedDeck
    {
        public string name;
        public List<string> cards = new List<string>();
    }

    [Serializable]
    public class BattleRecord
    {
        public string dateUtc;
        public string mode;
        public int result;          // 1 vitória, 0 empate, -1 derrota
        public string baron;
        public string opponentBaron;
        public float myCastlePct;
        public float enemyCastlePct;
        public int seconds;
    }

    [Serializable]
    public class PlayerProfile
    {
        public int saveVersion = 1;
        public string playerId;
        public string playerName = "Barão";
        public bool isGuest = true;
        public int gold;
        public int crystals;
        public int xp;
        public int accountLevel = 1;
        public int battles, wins, losses, draws, winStreak, bestWinStreak;
        public string selectedBaron;
        public string selectedCastle;
        public int activeDeck;
        public List<SavedDeck> decks = new List<SavedDeck>();
        public List<OwnedCard> cards = new List<OwnedCard>();
        public int pityCounter;
        public string language = "";
        public float musicVolume = 0.6f;
        public float sfxVolume = 0.8f;
        public int quality = 2;
        public List<BattleRecord> history = new List<BattleRecord>();

        public OwnedCard Owned(string id)
        {
            for (int i = 0; i < cards.Count; i++) if (cards[i].id == id) return cards[i];
            return null;
        }
        public bool Owns(string id) { return Owned(id) != null; }
        public SavedDeck ActiveDeck { get { return decks.Count == 0 ? null : decks[Math.Max(0, Math.Min(activeDeck, decks.Count - 1))]; } }
    }

    public enum DeckError { Ok, WrongSize, Duplicate, UnknownCard, NotCollectible, NotOwned }

    public static class DeckRules
    {
        /// <summary>Retorna null se o baralho for válido (tamanho, cartas existentes, sem repetição, colecionáveis).</summary>
        public static string ValidateComposition(IList<string> deck, ContentDatabase c)
        {
            var e = Validate(deck, c, null);
            return e == DeckError.Ok ? null : e.ToString();
        }

        public static DeckError Validate(IList<string> deck, ContentDatabase c, PlayerProfile owner)
        {
            if (deck == null || deck.Count != c.Balance.deckSize) return DeckError.WrongSize;
            var seen = new HashSet<string>();
            foreach (var id in deck)
            {
                if (!c.HasCard(id)) return DeckError.UnknownCard;
                if (c.Card(id).token) return DeckError.NotCollectible;
                if (!seen.Add(id)) return DeckError.Duplicate;
                if (owner != null && !owner.Owns(id)) return DeckError.NotOwned;
            }
            return DeckError.Ok;
        }

        public static float AverageCost(IList<string> deck, ContentDatabase c)
        {
            if (deck == null || deck.Count == 0) return 0f;
            float sum = 0f; int n = 0;
            foreach (var id in deck) if (c.HasCard(id)) { sum += c.Card(id).cost; n++; }
            return n == 0 ? 0f : sum / n;
        }
    }

    public class BattleRewards
    {
        public int Gold, Xp;
        public string CardId;
        public bool NewCard;
        public int LevelsGained;
        public List<string> Unlocked = new List<string>();
    }

    public static class Progression
    {
        public static PlayerProfile CreateNewProfile(ContentDatabase c, string playerId)
        {
            var b = c.Balance;
            var p = new PlayerProfile { playerId = playerId, gold = 100 };
            foreach (var id in b.starterCards ?? new string[0])
                if (c.HasCard(id) && !p.Owns(id)) p.cards.Add(new OwnedCard { id = id, level = 1, copies = 0 });
            p.decks.Add(new SavedDeck { name = "1", cards = new List<string>(b.starterDeck ?? new string[0]) });
            p.decks.Add(new SavedDeck { name = "2", cards = new List<string>(b.starterDeck ?? new string[0]) });
            p.decks.Add(new SavedDeck { name = "3", cards = new List<string>(b.starterDeck ?? new string[0]) });
            p.selectedBaron = b.starterBaron;
            p.selectedCastle = b.starterCastle;
            Repair(p, c);
            return p;
        }

        /// <summary>Corrige saves antigos ou corrompidos sem perder progresso válido.</summary>
        public static void Repair(PlayerProfile p, ContentDatabase c)
        {
            if (p.cards == null) p.cards = new List<OwnedCard>();
            if (p.decks == null) p.decks = new List<SavedDeck>();
            if (p.history == null) p.history = new List<BattleRecord>();
            p.cards.RemoveAll(o => o == null || !c.HasCard(o.id) || c.Card(o.id).token);
            foreach (var o in p.cards) o.level = Math.Max(1, Math.Min(c.Balance.maxCardLevel, o.level));
            foreach (var id in c.Balance.starterCards ?? new string[0])
                if (c.HasCard(id) && !p.Owns(id)) p.cards.Add(new OwnedCard { id = id });
            while (p.decks.Count < 3) p.decks.Add(new SavedDeck { name = (p.decks.Count + 1).ToString() });
            foreach (var d in p.decks)
            {
                if (d.cards == null) d.cards = new List<string>();
                if (DeckRules.Validate(d.cards, c, p) != DeckError.Ok)
                    d.cards = new List<string>(c.Balance.starterDeck ?? new string[0]);
            }
            p.activeDeck = Math.Max(0, Math.Min(p.activeDeck, p.decks.Count - 1));
            if (p.accountLevel < 1) p.accountLevel = 1;
            if (!c.HasBaron(p.selectedBaron) || !IsBaronUnlocked(p, c.Baron(p.selectedBaron))) p.selectedBaron = c.Balance.starterBaron;
            if (!c.HasCastle(p.selectedCastle) || !IsCastleUnlocked(p, c.Castle(p.selectedCastle))) p.selectedCastle = c.Balance.starterCastle;
        }

        public static bool IsBaronUnlocked(PlayerProfile p, BaronDef b) { return p.accountLevel >= b.unlockLevel; }
        public static bool IsCastleUnlocked(PlayerProfile p, CastleDef c) { return p.accountLevel >= c.unlockLevel; }

        public static int XpForNextLevel(BalanceConfig b, int level) { return b.xpBase + b.xpPerLevel * (Math.Max(1, level) - 1); }

        public static int AddXp(PlayerProfile p, ContentDatabase c, int amount, List<string> unlocked)
        {
            int gained = 0;
            p.xp += Math.Max(0, amount);
            while (p.xp >= XpForNextLevel(c.Balance, p.accountLevel))
            {
                p.xp -= XpForNextLevel(c.Balance, p.accountLevel);
                p.accountLevel++;
                gained++;
                foreach (var b in c.Barons) if (b.unlockLevel == p.accountLevel) unlocked.Add("baron:" + b.id);
                foreach (var k in c.Castles) if (k.unlockLevel == p.accountLevel) unlocked.Add("castle:" + k.id);
            }
            return gained;
        }

        public static int CopiesRequired(BalanceConfig b, int level)
        {
            var arr = b.upgradeCopies;
            if (arr == null || arr.Length == 0) return int.MaxValue;
            return arr[Math.Max(0, Math.Min(arr.Length - 1, level - 1))];
        }

        public static int GoldRequired(BalanceConfig b, int level)
        {
            var arr = b.upgradeGold;
            if (arr == null || arr.Length == 0) return int.MaxValue;
            return arr[Math.Max(0, Math.Min(arr.Length - 1, level - 1))];
        }

        public static bool CanUpgrade(PlayerProfile p, ContentDatabase c, string id)
        {
            var o = p.Owned(id);
            if (o == null || o.level >= c.Balance.maxCardLevel) return false;
            return o.copies >= CopiesRequired(c.Balance, o.level) && p.gold >= GoldRequired(c.Balance, o.level);
        }

        public static bool Upgrade(PlayerProfile p, ContentDatabase c, string id)
        {
            if (!CanUpgrade(p, c, id)) return false;
            var o = p.Owned(id);
            p.gold -= GoldRequired(c.Balance, o.level);
            o.copies -= CopiesRequired(c.Balance, o.level);
            o.level++;
            return true;
        }

        /// <summary>Probabilidade (0..1) de cada raridade — exibida ao jogador.</summary>
        public static float RarityChance(BalanceConfig b, Rarity r)
        {
            var w = b.rarityWeights;
            int total = 0;
            foreach (var x in w) total += x;
            int i = (int)r;
            return total <= 0 || i >= w.Length ? 0f : w[i] / (float)total;
        }

        /// <summary>Sorteia uma carta com probabilidades transparentes e proteção contra azar (pity).</summary>
        public static string RollCard(PlayerProfile p, ContentDatabase c, Rng rng)
        {
            var w = c.Balance.rarityWeights;
            bool pity = p.pityCounter >= c.Balance.pityThreshold - 1;
            int start = pity ? (int)Rarity.Epic : 0;
            int total = 0;
            for (int i = start; i < w.Length; i++) total += w[i];
            int roll = rng.Range(0, Math.Max(1, total));
            Rarity rarity = Rarity.Common;
            for (int i = start; i < w.Length; i++)
            {
                if (roll < w[i]) { rarity = (Rarity)i; break; }
                roll -= w[i];
            }
            var pool = new List<CardDef>();
            for (int r = (int)rarity; r >= 0 && pool.Count == 0; r--)
                foreach (var card in c.CollectibleCards) if ((int)card.Rarity == r) pool.Add(card);
            var chosen = pool[rng.Range(0, pool.Count)];
            if (chosen.Rarity >= Rarity.Epic) p.pityCounter = 0; else p.pityCounter++;
            return chosen.id;
        }

        public static BattleRewards ApplyBattleResult(PlayerProfile p, ContentDatabase c, int result, Rng rng, BattleRecord record)
        {
            var b = c.Balance;
            var r = new BattleRewards();
            p.battles++;
            if (result > 0) { p.wins++; p.winStreak++; p.bestWinStreak = Math.Max(p.bestWinStreak, p.winStreak); r.Gold = b.winGold; r.Xp = b.winXp; }
            else if (result == 0) { p.draws++; p.winStreak = 0; r.Gold = b.drawGold; r.Xp = b.drawXp; }
            else { p.losses++; p.winStreak = 0; r.Gold = b.lossGold; r.Xp = b.lossXp; }
            p.gold += r.Gold;
            if (result > 0)
            {
                r.CardId = RollCard(p, c, rng);
                var o = p.Owned(r.CardId);
                if (o == null) { p.cards.Add(new OwnedCard { id = r.CardId, level = 1, copies = 0 }); r.NewCard = true; }
                else o.copies++;
            }
            r.LevelsGained = AddXp(p, c, r.Xp, r.Unlocked);
            if (record != null)
            {
                p.history.Insert(0, record);
                if (p.history.Count > 50) p.history.RemoveRange(50, p.history.Count - 50);
            }
            return r;
        }
    }
}
