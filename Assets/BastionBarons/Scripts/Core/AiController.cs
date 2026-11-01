using System;
using System.Collections.Generic;

namespace BastionBarons.Core
{
    public enum AiDifficulty { Easy, Normal, Hard }

    /// <summary>
    /// Adversário controlado por IA. Usa exatamente os mesmos comandos e validações do jogador humano —
    /// a dificuldade muda apenas a qualidade das decisões (tempo de reação, leitura de ameaça, contra-ataques), nunca atributos.
    /// </summary>
    public class AiController
    {
        struct LaneInfo
        {
            public float EnemyPower, MyPower, Threat, EnemyFrontDist;
            public int EnemyCount, MyCount, EnemyFlyers;
        }

        readonly Match m;
        readonly int me;
        readonly AiDifficulty diff;
        readonly Rng rng;
        float think;
        int pushLane = -1;
        float pushTimer;
        public int CommandsIssued { get; private set; }
        public int CommandsRejected { get; private set; }

        public AiController(Match match, int player, AiDifficulty difficulty, int seed)
        {
            m = match; me = player; diff = difficulty; rng = new Rng(seed);
            think = 1.5f;
        }

        float ReactionTime
        {
            get
            {
                switch (diff)
                {
                    case AiDifficulty.Easy: return 2.4f;
                    case AiDifficulty.Normal: return 1.2f;
                    default: return 0.6f;
                }
            }
        }

        /// <summary>Chamar uma vez por tick, antes de Match.Step().</summary>
        public void Tick()
        {
            if (m.IsOver) return;
            if (pushTimer > 0f) pushTimer -= m.Dt;
            think -= m.Dt;
            if (think > 0f) return;
            think = ReactionTime * (0.75f + 0.5f * rng.NextFloat());
            Decide();
        }

        LaneInfo[] Analyze()
        {
            var lanes = new LaneInfo[Match.LaneCount];
            int enemy = 1 - me;
            float myFront = m.CastleFrontOf(me);
            for (int l = 0; l < lanes.Length; l++) lanes[l].EnemyFrontDist = m.L;
            foreach (var u in m.Units)
            {
                if (!u.Alive) continue;
                float power = u.Hp + (u.Damage / u.Def.attackInterval) * 8f;
                if (u.Owner == enemy)
                {
                    float dist = Math.Abs(u.X - myFront);
                    float proximity = 1f + 2f * (1f - Math.Min(1f, dist / m.L));
                    lanes[u.Lane].EnemyPower += power * proximity;
                    lanes[u.Lane].EnemyCount++;
                    if (u.Flying) lanes[u.Lane].EnemyFlyers++;
                    lanes[u.Lane].EnemyFrontDist = Math.Min(lanes[u.Lane].EnemyFrontDist, dist);
                }
                else
                {
                    lanes[u.Lane].MyPower += power;
                    lanes[u.Lane].MyCount++;
                }
            }
            for (int l = 0; l < lanes.Length; l++) lanes[l].Threat = lanes[l].EnemyPower - lanes[l].MyPower * 0.8f;
            return lanes;
        }

        void Decide()
        {
            var p = m.Players[me];
            var lanes = Analyze();
            if (diff == AiDifficulty.Easy) { DecideEasy(p, lanes); return; }

            int threatLane = ArgMax(lanes, x => x.Threat);
            float defendThreshold = diff == AiDifficulty.Hard ? 200f : 320f;

            TryCastlePower(p, lanes, threatLane);
            TryBaron(p, lanes, threatLane);

            if (lanes[threatLane].Threat > defendThreshold)
            {
                if (TryPlayBest(p, threatLane, lanes[threatLane], true)) return;
            }

            // oportunidade de spell em aglomeração
            for (int l = 0; l < lanes.Length; l++)
                if (lanes[l].EnemyCount >= (diff == AiDifficulty.Hard ? 3 : 4) && TryPlaySpell(p, l, lanes[l])) return;

            float attackEnergy = diff == AiDifficulty.Hard ? 8f : 7f;
            if (pushTimer > 0f && pushLane >= 0 && p.Energy >= 3f)
            {
                if (TryPlayBest(p, pushLane, lanes[pushLane], false)) return;
            }
            if (p.Energy >= attackEnergy)
            {
                int attackLane = ArgMax(lanes, x => -x.EnemyPower + x.MyPower * 0.5f);
                if (TryPlayBest(p, attackLane, lanes[attackLane], false))
                {
                    pushLane = attackLane;
                    pushTimer = diff == AiDifficulty.Hard ? 4f : 0f;
                }
            }
        }

        void DecideEasy(PlayerState p, LaneInfo[] lanes)
        {
            if (p.BaronReady && rng.NextFloat() < 0.3f) Issue(Command.Baron(me, rng.Range(0, 3)));
            if (p.CastleReady && rng.NextFloat() < 0.25f) Issue(Command.Castle(me, rng.Range(0, 3)));
            if (rng.NextFloat() > 0.65f) return;
            int idx = rng.Range(0, p.Deck.Hand.Count);
            var def = m.Content.Card(p.Deck.Hand[idx]);
            if (p.Energy < def.cost) return;
            int lane = rng.NextFloat() < 0.4f ? ArgMax(lanes, x => x.Threat) : rng.Range(0, 3);
            if (def.IsSpell && def.Spell != SpellEffect.Summon && def.Spell != SpellEffect.Heal && def.Spell != SpellEffect.Shield && lanes[lane].EnemyCount == 0)
                return;
            Issue(Command.Play(me, idx, def.id, lane));
        }

        bool TryPlayBest(PlayerState p, int lane, LaneInfo info, bool defending)
        {
            int bestIdx = -1;
            float bestScore = 0f;
            for (int i = 0; i < p.Deck.Hand.Count; i++)
            {
                var def = m.Content.Card(p.Deck.Hand[i]);
                if (def.cost > p.Energy) continue;
                float s = ScoreCard(def, info, defending);
                if (s > bestScore) { bestScore = s; bestIdx = i; }
            }
            if (bestIdx < 0) return false;
            return Issue(Command.Play(me, bestIdx, p.Deck.Hand[bestIdx], lane));
        }

        bool TryPlaySpell(PlayerState p, int lane, LaneInfo info)
        {
            for (int i = 0; i < p.Deck.Hand.Count; i++)
            {
                var def = m.Content.Card(p.Deck.Hand[i]);
                if (!def.IsSpell || def.cost > p.Energy) continue;
                if (def.Spell == SpellEffect.Damage || def.Spell == SpellEffect.Stun || def.Spell == SpellEffect.Poison || def.Spell == SpellEffect.StrongestTargets)
                    return Issue(Command.Play(me, i, def.id, lane));
            }
            return false;
        }

        float ScoreCard(CardDef def, LaneInfo info, bool defending)
        {
            bool hard = diff == AiDifficulty.Hard;
            if (def.IsSpell)
            {
                switch (def.Spell)
                {
                    case SpellEffect.Damage:
                    case SpellEffect.StrongestTargets:
                    case SpellEffect.Poison:
                        if (info.EnemyCount == 0) return 0f;
                        return (def.spellValue * Math.Min(info.EnemyCount, def.spellRadius <= 0f ? 6 : 3)) / (def.cost * 60f);
                    case SpellEffect.Stun:
                        return info.EnemyCount >= 2 && defending ? 3f : 0f;
                    case SpellEffect.Heal:
                    case SpellEffect.Shield:
                        return info.MyCount >= 3 ? 2f : 0f;
                    case SpellEffect.Summon:
                        return defending ? 2.5f : 1.5f;
                }
                return 0f;
            }
            float dps = def.damage * def.count / def.attackInterval;
            float score = (def.hp * def.count) / 300f + dps / 40f;
            if (defending)
            {
                if (info.EnemyFlyers > 0) score *= def.CanHitAir ? (hard ? 2.2f : 1.5f) : 0.3f;
                if (def.Targets == TargetType.CastleOnly) score *= 0.2f;
                if (info.EnemyFrontDist < 20f && def.range > 6f) score *= 1.3f;
            }
            else
            {
                if (def.Targets == TargetType.CastleOnly) score *= hard ? 1.6f : 1.2f;
                if (hard && info.MyCount > 0 && def.range > 6f) score *= 1.3f; // ranged atrás do tanque
            }
            return score / (0.5f + def.cost * 0.15f);
        }

        void TryBaron(PlayerState p, LaneInfo[] lanes, int threatLane)
        {
            if (!p.BaronReady) return;
            switch (p.Baron.Ability)
            {
                case BaronAbility.ElvenRain:
                case BaronAbility.ArcaneStorm:
                {
                    int l = ArgMax(lanes, x => x.EnemyCount);
                    if (lanes[l].EnemyCount >= 2) Issue(Command.Baron(me, l));
                    break;
                }
                case BaronAbility.OrcFury:
                {
                    int l = ArgMax(lanes, x => x.MyCount);
                    if (lanes[l].MyCount >= 2) Issue(Command.Baron(me, l));
                    break;
                }
                case BaronAbility.RoyalCommand:
                {
                    int total = 0;
                    foreach (var x in lanes) total += x.MyCount;
                    if (total >= 4) Issue(Command.Baron(me, 0));
                    break;
                }
                case BaronAbility.ArmyOfDead:
                    if (lanes[threatLane].Threat > 150f) Issue(Command.Baron(me, threatLane));
                    else if (diff == AiDifficulty.Hard && pushLane >= 0) Issue(Command.Baron(me, pushLane));
                    break;
            }
        }

        void TryCastlePower(PlayerState p, LaneInfo[] lanes, int threatLane)
        {
            if (!p.CastleReady) return;
            switch (p.Castle.Ability)
            {
                case CastleAbility.ImperialShield:
                    if (lanes[threatLane].EnemyFrontDist < 12f && p.CastleHpPct < 0.95f) Issue(Command.Castle(me, threatLane));
                    break;
                case CastleAbility.DragonBreath:
                case CastleAbility.IceStorm:
                    if (lanes[threatLane].EnemyCount >= 2 && lanes[threatLane].Threat > 150f) Issue(Command.Castle(me, threatLane));
                    break;
            }
        }

        bool Issue(Command c)
        {
            var r = m.Execute(c);
            if (r == CommandResult.Ok) { CommandsIssued++; return true; }
            CommandsRejected++;
            return false;
        }

        static int ArgMax(LaneInfo[] lanes, Func<LaneInfo, float> f)
        {
            int best = 0;
            float bv = float.MinValue;
            for (int i = 0; i < lanes.Length; i++)
            {
                float v = f(lanes[i]);
                if (v > bv) { bv = v; best = i; }
            }
            return best;
        }
    }
}
