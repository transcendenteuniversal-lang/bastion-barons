using System.Collections.Generic;
using System.Linq;
using BastionBarons.Core;
using BastionBarons.Game;
using NUnit.Framework;

namespace BastionBarons.Tests
{
    /// <summary>Regras fundamentais de combate, energia, baralho, Barões, castelos, IA e progressão.</summary>
    public class CoreTests
    {
        ContentDatabase content;

        [SetUp]
        public void Setup() { content = ContentLoader.LoadDefault(); }

        Match NewMatch(string baron0 = "rei_bastion", string castle0 = "royal_fortress", string baron1 = "rei_bastion", string castle1 = "royal_fortress", int seed = 42)
        {
            var s = new MatchSetup { Seed = seed };
            var deck = content.Balance.starterDeck.ToList();
            s.Players[0].BaronId = baron0; s.Players[0].CastleId = castle0; s.Players[0].Deck = new List<string>(deck);
            s.Players[1].BaronId = baron1; s.Players[1].CastleId = castle1; s.Players[1].Deck = new List<string>(deck);
            var m = new Match(content, s);
            m.RecordEvents = false;
            return m;
        }

        static void Run(Match m, float seconds) { int n = (int)(seconds / m.Dt); for (int i = 0; i < n && !m.IsOver; i++) m.Step(); }

        static int HandIndexOf(Match m, int player, string id) { return m.Players[player].Deck.Hand.IndexOf(id); }

        /// <summary>Coloca uma carta específica na mão (troca por reembaralhamento determinístico do teste).</summary>
        static int ForceCard(Match m, int player, string id)
        {
            var hand = m.Players[player].Deck.Hand;
            int idx = hand.IndexOf(id);
            if (idx >= 0) return idx;
            hand[0] = id;
            return 0;
        }

        // ---------------------------------------------------------------- conteúdo

        [Test]
        public void Content_Has32CollectibleCards_5Barons_3Castles()
        {
            Assert.AreEqual(32, content.CollectibleCards.Count);
            Assert.AreEqual(24, content.CollectibleCards.Count(c => !c.IsSpell));
            Assert.AreEqual(8, content.CollectibleCards.Count(c => c.IsSpell));
            Assert.AreEqual(5, content.Barons.Count);
            Assert.AreEqual(3, content.Castles.Count);
        }

        [Test]
        public void Content_AllCardsAndBaronsHaveLocalizedNames()
        {
            Localization.Set("pt-BR");
            foreach (var c in content.AllCards) Assert.IsTrue(Localization.Has("card." + c.id + ".name"), c.id);
            foreach (var b in content.Barons) Assert.IsTrue(Localization.Has("baron." + b.id + ".ability"), b.id);
            foreach (var k in content.Castles) Assert.IsTrue(Localization.Has("castle." + k.id + ".ability"), k.id);
        }

        [Test]
        public void Content_InvalidDataIsRejected()
        {
            var file = new ContentFile { balance = new BalanceConfig(), cards = new[] { new CardDef { id = "x", type = "NotAType", cost = 3, hp = 10 } }, barons = new BaronDef[0], castles = new CastleDef[0] };
            Assert.Throws<ContentException>(() => new ContentDatabase(file));
        }

        // ---------------------------------------------------------------- baralho

        [Test]
        public void Deck_Requires14UniqueOwnedCards()
        {
            var deck = content.Balance.starterDeck.ToList();
            Assert.AreEqual(DeckError.Ok, DeckRules.Validate(deck, content, null));
            Assert.AreEqual(DeckError.WrongSize, DeckRules.Validate(deck.Take(13).ToList(), content, null));
            var dup = new List<string>(deck); dup[1] = dup[0];
            Assert.AreEqual(DeckError.Duplicate, DeckRules.Validate(dup, content, null));
            var token = new List<string>(deck); token[0] = "skeleton";
            Assert.AreEqual(DeckError.NotCollectible, DeckRules.Validate(token, content, null));
            var profile = Progression.CreateNewProfile(content, "t");
            var notOwned = new List<string>(deck); notOwned[0] = "phoenix";
            Assert.IsFalse(profile.Owns("phoenix"));
            Assert.AreEqual(DeckError.NotOwned, DeckRules.Validate(notOwned, content, profile));
        }

        [Test]
        public void Deck_PlayedCardCyclesToBackAndNextIsVisible()
        {
            var m = NewMatch();
            var p = m.Players[0];
            Assert.AreEqual(4, p.Deck.Hand.Count);
            string next = p.Deck.Next;
            string played = p.Deck.Hand[2];
            p.Deck.Play(2);
            Assert.AreEqual(next, p.Deck.Hand[2]);
            Assert.AreEqual(played, p.Deck.Pending.Last());
        }

        // ---------------------------------------------------------------- energia

        [Test]
        public void Energy_RegeneratesAndCapsAtMax()
        {
            var m = NewMatch();
            float start = m.Players[0].Energy;
            Run(m, 2f);
            Assert.Greater(m.Players[0].Energy, start);
            Run(m, 60f);
            Assert.AreEqual(m.B.maxEnergy, m.Players[0].Energy, 0.001f);
        }

        [Test]
        public void Energy_CannotPlayWithoutEnough()
        {
            var m = NewMatch();
            m.Players[0].Energy = 0f;
            var r = m.Execute(Command.Play(0, 0, null, 1));
            Assert.AreEqual(CommandResult.NotEnoughEnergy, r);
            Assert.AreEqual(0, m.Units.Count);
        }

        [Test]
        public void Energy_DoubleRateInFinalMinute()
        {
            var m = NewMatch();
            Run(m, m.B.matchSeconds - m.B.doubleEnergyLastSeconds + 1f);
            Assert.IsTrue(m.IsDoubleEnergy || m.IsOver);
        }

        [Test]
        public void Commands_RejectInvalidLaneHandAndMismatch()
        {
            var m = NewMatch();
            Assert.AreEqual(CommandResult.InvalidLane, m.Execute(Command.Play(0, 0, null, 3)));
            Assert.AreEqual(CommandResult.InvalidHandIndex, m.Execute(Command.Play(0, 9, null, 0)));
            Assert.AreEqual(CommandResult.CardMismatch, m.Execute(Command.Play(0, 0, "not_in_hand", 0)));
            Assert.AreEqual(CommandResult.InvalidPlayer, m.Execute(Command.Play(5, 0, null, 0)));
        }

        // ---------------------------------------------------------------- combate

        [Test]
        public void Troops_SpawnMoveAndAttackCastle()
        {
            var m = NewMatch();
            m.Players[0].Energy = 10f;
            int idx = ForceCard(m, 0, "royal_knight");
            Assert.AreEqual(CommandResult.Ok, m.Execute(Command.Play(0, idx, "royal_knight", 1)));
            var u = m.Units.Single();
            float x0 = u.X;
            Run(m, 3f);
            Assert.Greater(u.X, x0, "a tropa deve avançar em direção ao castelo inimigo");
            Run(m, 40f);
            Assert.Less(m.Players[1].CastleHp, m.Players[1].CastleMaxHp, "o castelo inimigo deve receber dano");
        }

        [Test]
        public void Troops_FightEachOtherInSameLaneOnly()
        {
            var m = NewMatch();
            var knight = content.Card("royal_knight");
            var a = m.SpawnUnit(0, knight, 0, 48f, 1);
            var b = m.SpawnUnit(1, knight, 0, 50f, 1);
            var c = m.SpawnUnit(1, knight, 2, 50f, 1);
            Run(m, 5f);
            Assert.Less(a.Hp, a.MaxHp);
            Assert.Less(b.Hp, b.MaxHp);
            Assert.AreEqual(c.MaxHp, c.Hp, 0.01f, "unidade de outra rota não deve ser atingida");
        }

        [Test]
        public void Troops_GroundMeleeCannotHitFlyers()
        {
            var m = NewMatch();
            var knight = m.SpawnUnit(0, content.Card("royal_knight"), 1, 50f, 1);
            var griffin = m.SpawnUnit(1, content.Card("royal_griffin"), 1, 50.5f, 1);
            griffin.StunTime = 100f; // grifo parado e sem atacar
            Run(m, 4f);
            Assert.AreEqual(griffin.MaxHp, griffin.Hp, 0.01f);
            Assert.Greater(knight.X, 50f, "o cavaleiro passa por baixo da unidade voadora");
        }

        [Test]
        public void Troops_GolemIgnoresUnitsAndTargetsCastle()
        {
            var m = NewMatch();
            var golem = m.SpawnUnit(0, content.Card("stone_golem"), 1, 50f, 1);
            var enemy = m.SpawnUnit(1, content.Card("royal_knight"), 1, 51f, 1);
            enemy.StunTime = 100f;
            Run(m, 3f);
            Assert.AreEqual(enemy.MaxHp, enemy.Hp, 0.01f);
            Assert.Greater(golem.X, 50f);
        }

        [Test]
        public void Phoenix_RebornOnce()
        {
            var m = NewMatch();
            var phoenix = m.SpawnUnit(0, content.Card("phoenix"), 1, 50f, 1);
            m.ApplyDamage(phoenix, 99999f, 1);
            Assert.IsTrue(phoenix.Alive);
            Assert.AreEqual(phoenix.MaxHp * 0.5f, phoenix.Hp, 1f);
            m.ApplyDamage(phoenix, 99999f, 1);
            Assert.IsFalse(phoenix.Alive);
        }

        [Test]
        public void Paladin_AuraReducesDamage()
        {
            var m = NewMatch();
            var ally = m.SpawnUnit(0, content.Card("royal_knight"), 0, 30f, 1);
            var lone = m.SpawnUnit(0, content.Card("royal_knight"), 2, 30f, 1);
            m.SpawnUnit(0, content.Card("paladin"), 0, 31f, 1);
            m.ApplyDamage(ally, 100f, 1);
            m.ApplyDamage(lone, 100f, 1);
            Assert.Greater(ally.Hp, lone.Hp);
        }

        [Test]
        public void Spells_FireballDamagesAndFreezeStuns()
        {
            var m = NewMatch();
            m.Players[0].Energy = 10f;
            var target = m.SpawnUnit(1, content.Card("red_orc"), 1, 60f, 1);
            int fb = ForceCard(m, 0, "fireball");
            Assert.AreEqual(CommandResult.Ok, m.Execute(Command.Play(0, fb, "fireball", 1)));
            Assert.Less(target.Hp, target.MaxHp);

            m.Players[0].Energy = 10f;
            int fr = ForceCard(m, 0, "freeze");
            Assert.AreEqual(CommandResult.Ok, m.Execute(Command.Play(0, fr, "freeze", 1)));
            Assert.Greater(target.StunTime, 0f);
        }

        [Test]
        public void Spells_SkeletonSummonCreatesTemporaryUnits()
        {
            var m = NewMatch();
            m.Players[0].Energy = 10f;
            int idx = ForceCard(m, 0, "skeleton_summon");
            m.Execute(Command.Play(0, idx, "skeleton_summon", 2));
            Assert.AreEqual(4, m.Units.Count(u => u.Def.id == "skeleton" && u.Lane == 2));
            Run(m, 30f);
            Assert.AreEqual(0, m.Units.Count(u => u.Def.id == "skeleton" && u.Owner == 0 && u.Lane == 2 && u.Alive));
        }

        // ---------------------------------------------------------------- Barões e castelos

        [Test]
        public void Baron_ChargesAndActivatesOnlyWhenReady()
        {
            var m = NewMatch(baron0: "eldrin");
            Assert.AreEqual(CommandResult.NotReady, m.Execute(Command.Baron(0, 1)));
            var enemy = m.SpawnUnit(1, content.Card("royal_knight"), 1, 60f, 1);
            enemy.StunTime = 1000f;
            m.Players[0].BaronCharge = m.Players[0].Baron.chargeSeconds;
            Assert.AreEqual(CommandResult.Ok, m.Execute(Command.Baron(0, 1)));
            Assert.Less(enemy.Hp, enemy.MaxHp);
            Assert.IsFalse(m.Players[0].BaronReady);
        }

        [Test]
        public void Baron_AllFiveAbilitiesExecute()
        {
            foreach (var b in content.Barons)
            {
                var m = NewMatch(baron0: b.id);
                m.SpawnUnit(0, content.Card("royal_knight"), 1, 40f, 1);
                m.SpawnUnit(0, content.Card("royal_knight"), 1, 41f, 1);
                var enemy = m.SpawnUnit(1, content.Card("red_orc"), 1, 70f, 1);
                enemy.StunTime = 1000f;
                m.Players[0].BaronCharge = b.chargeSeconds;
                int before = m.Units.Count;
                Assert.AreEqual(CommandResult.Ok, m.Execute(Command.Baron(0, 1)), b.id);
                Run(m, 4f);
                switch (b.Ability)
                {
                    case BaronAbility.ArmyOfDead: Assert.Greater(m.Units.Count(u => u.Def.id == "skeleton"), 0, b.id); break;
                    case BaronAbility.ArcaneStorm:
                    case BaronAbility.ElvenRain: Assert.Less(enemy.Hp, enemy.MaxHp, b.id); break;
                    default: Assert.Greater(m.Players[0].Stats.BaronUses, 0, b.id); break;
                }
            }
        }

        [Test]
        public void Baron_IsNeverAUnitAndCannotBeAttacked()
        {
            var m = NewMatch();
            Run(m, 10f);
            Assert.IsFalse(m.Units.Any(u => u.Def.id == m.Players[0].Baron.id));
        }

        [Test]
        public void Castle_ImperialShieldAbsorbsDamage()
        {
            var m = NewMatch();
            m.Players[0].CastleCooldown = 0f;
            Assert.AreEqual(CommandResult.Ok, m.Execute(Command.Castle(0, 0)));
            float hp = m.Players[0].CastleHp;
            m.DamageCastle(0, 300f, 1);
            Assert.AreEqual(hp, m.Players[0].CastleHp, 0.01f);
            Assert.AreEqual(CommandResult.NotReady, m.Execute(Command.Castle(0, 0)));
        }

        [Test]
        public void Castle_IceStormSlowsEnemiesInLane()
        {
            var m = NewMatch(castle0: "glacial_fortress");
            m.Players[0].CastleCooldown = 0f;
            var fast = m.SpawnUnit(1, content.Card("royal_knight"), 0, 70f, 1);
            var normal = m.SpawnUnit(1, content.Card("royal_knight"), 2, 70f, 1);
            Assert.AreEqual(CommandResult.Ok, m.Execute(Command.Castle(0, 0)));
            Run(m, 3f);
            Assert.Greater(fast.X, normal.X, "a unidade desacelerada avança menos (inimigo anda para X menor)");
        }

        // ---------------------------------------------------------------- vitória/derrota

        [Test]
        public void Victory_WhenCastleDestroyed()
        {
            var m = NewMatch();
            m.DamageCastle(1, 999999f, 0);
            m.Step();
            Assert.IsTrue(m.IsOver);
            Assert.AreEqual(0, m.Winner);
            Assert.AreEqual(MatchEndReason.CastleDestroyed, m.EndReason);
        }

        [Test]
        public void Timeout_HigherCastleHealthWins_ThenDraw()
        {
            var m = NewMatch();
            m.DamageCastle(0, 100f, 1);
            Run(m, m.B.matchSeconds + 1f);
            Assert.IsTrue(m.IsOver);
            Assert.AreEqual(1, m.Winner);
            Assert.AreEqual(MatchEndReason.TimeoutHp, m.EndReason);

            var d = NewMatch();
            Run(d, d.B.matchSeconds + 1f);
            Assert.AreEqual(-1, d.Winner);
            Assert.AreEqual(MatchEndReason.Draw, d.EndReason);
        }

        [Test]
        public void Surrender_GivesVictoryToOpponent()
        {
            var m = NewMatch();
            m.Surrender(0);
            Assert.AreEqual(1, m.Winner);
            Assert.AreEqual(CommandResult.MatchOver, m.Execute(Command.Baron(0, 0)));
        }

        [Test]
        public void Simulation_IsDeterministicForSameSeed()
        {
            float Play(int seed)
            {
                var m = NewMatch(seed: seed);
                var a = new AiController(m, 0, AiDifficulty.Normal, seed + 1);
                var b = new AiController(m, 1, AiDifficulty.Hard, seed + 2);
                for (int i = 0; i < 2000 && !m.IsOver; i++) { a.Tick(); b.Tick(); m.Step(); }
                return m.Players[0].CastleHp * 7f + m.Players[1].CastleHp + m.Units.Count;
            }
            Assert.AreEqual(Play(7), Play(7));
        }

        // ---------------------------------------------------------------- IA

        [Test]
        public void Ai_AllDifficultiesFinishFullMatches([Values(AiDifficulty.Easy, AiDifficulty.Normal, AiDifficulty.Hard)] AiDifficulty d)
        {
            for (int seed = 1; seed <= 3; seed++)
            {
                var m = NewMatch(baron0: content.Barons[seed % 5].id, castle0: content.Castles[seed % 3].id, baron1: content.Barons[(seed + 2) % 5].id, castle1: content.Castles[(seed + 1) % 3].id, seed: seed);
                var a = new AiController(m, 0, d, seed);
                var b = new AiController(m, 1, AiDifficulty.Normal, seed + 99);
                int guard = 0;
                while (!m.IsOver && guard++ < 10000) { a.Tick(); b.Tick(); m.Step(); }
                Assert.IsTrue(m.IsOver, "a partida deve terminar");
                Assert.Greater(a.CommandsIssued, 3, "a IA deve jogar cartas");
            }
        }

        // ---------------------------------------------------------------- progressão

        [Test]
        public void Progression_NewProfileHasValidStarterDeck()
        {
            var p = Progression.CreateNewProfile(content, "id");
            Assert.AreEqual(DeckError.Ok, DeckRules.Validate(p.ActiveDeck.cards, content, p));
            Assert.AreEqual("rei_bastion", p.selectedBaron);
            Assert.IsTrue(Progression.IsBaronUnlocked(p, content.Baron("elara")));
            Assert.IsFalse(Progression.IsBaronUnlocked(p, content.Baron("eldrin")));
        }

        [Test]
        public void Progression_UpgradeConsumesCopiesAndGold()
        {
            var p = Progression.CreateNewProfile(content, "id");
            var o = p.Owned("royal_knight");
            Assert.IsFalse(Progression.CanUpgrade(p, content, "royal_knight"));
            o.copies = 2; p.gold = 100;
            Assert.IsTrue(Progression.Upgrade(p, content, "royal_knight"));
            Assert.AreEqual(2, o.level);
            Assert.AreEqual(0, o.copies);
            Assert.AreEqual(100 - content.Balance.upgradeGold[0], p.gold);
        }

        [Test]
        public void Progression_HigherLevelMeansStrongerUnit()
        {
            Assert.Greater(content.LevelMultiplier(5), content.LevelMultiplier(1));
            Assert.AreEqual(1f, content.LevelMultiplier(1), 0.0001f);
        }

        [Test]
        public void Progression_RewardsAndLevelUpUnlockBarons()
        {
            var p = Progression.CreateNewProfile(content, "id");
            var rng = new Rng(3);
            int gold = p.gold;
            var r = Progression.ApplyBattleResult(p, content, 1, rng, new BattleRecord());
            Assert.AreEqual(gold + content.Balance.winGold, p.gold);
            Assert.IsNotNull(r.CardId);
            Assert.AreEqual(1, p.wins);
            Assert.AreEqual(1, p.history.Count);
            var unlocked = new List<string>();
            Progression.AddXp(p, content, 10000, unlocked);
            Assert.IsTrue(unlocked.Contains("baron:eldrin"));
        }

        [Test]
        public void Progression_PityGuaranteesEpicOrBetter()
        {
            var p = Progression.CreateNewProfile(content, "id");
            p.pityCounter = content.Balance.pityThreshold - 1;
            var id = Progression.RollCard(p, content, new Rng(1));
            Assert.GreaterOrEqual((int)content.Card(id).Rarity, (int)Rarity.Epic);
            Assert.AreEqual(0, p.pityCounter);
        }

        [Test]
        public void Progression_RarityOddsSumToOne()
        {
            float sum = 0f;
            foreach (Rarity r in System.Enum.GetValues(typeof(Rarity))) sum += Progression.RarityChance(content.Balance, r);
            Assert.AreEqual(1f, sum, 0.0001f);
        }

        [Test]
        public void Save_RepairFixesCorruptedProfile()
        {
            var p = Progression.CreateNewProfile(content, "id");
            p.decks[0].cards = new List<string> { "invalid" };
            p.selectedBaron = "nope";
            p.cards.Add(new OwnedCard { id = "skeleton" });
            Progression.Repair(p, content);
            Assert.AreEqual(DeckError.Ok, DeckRules.Validate(p.decks[0].cards, content, p));
            Assert.AreEqual("rei_bastion", p.selectedBaron);
            Assert.IsFalse(p.Owns("skeleton"));
        }
    }
}
