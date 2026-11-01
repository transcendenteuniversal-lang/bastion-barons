using System;
using System.Collections.Generic;

namespace BastionBarons.Core
{
    public enum UnitState { Deploying, Moving, Attacking, AttackingCastle, Idle, Stunned, Dead }
    public enum MatchEndReason { None, CastleDestroyed, TimeoutHp, TimeoutKills, Draw, Surrender, Disconnect }
    public enum CommandType { PlayCard, Baron, CastlePower }
    public enum CommandResult { Ok, MatchOver, InvalidPlayer, InvalidLane, InvalidHandIndex, CardMismatch, NotEnoughEnergy, NotReady, UnitCap }

    public struct Command
    {
        public int Player;
        public CommandType Type;
        public int HandIndex;
        public string CardId;   // opcional: o servidor confere se a mão do cliente está sincronizada
        public int Lane;

        public static Command Play(int player, int handIndex, string cardId, int lane)
        { return new Command { Player = player, Type = CommandType.PlayCard, HandIndex = handIndex, CardId = cardId, Lane = lane }; }
        public static Command Baron(int player, int lane) { return new Command { Player = player, Type = CommandType.Baron, Lane = lane }; }
        public static Command Castle(int player, int lane) { return new Command { Player = player, Type = CommandType.CastlePower, Lane = lane }; }
    }

    public enum SimEventType
    {
        UnitSpawned, UnitAttack, UnitDied, UnitRevived, CardPlayed, SpellCast, BaronUsed,
        CastlePowerUsed, CastleDamaged, CastleAttack, Heal, MatchEnded, DoubleEnergy
    }

    public struct SimEvent
    {
        public SimEventType Type;
        public int Tick;
        public int Player;
        public int UnitId;
        public int TargetId;
        public int Lane;
        public float X;
        public float Value;
        public string Id;
    }

    public class PlayerSetup
    {
        public string BaronId;
        public string CastleId;
        public List<string> Deck = new List<string>();
        public Dictionary<string, int> CardLevels = new Dictionary<string, int>();
    }

    public class MatchSetup
    {
        public int Seed;
        public PlayerSetup[] Players = { new PlayerSetup(), new PlayerSetup() };
    }

    public class LaneModifier
    {
        public int Lane = -1; // -1 = todas as rotas
        public float DamageMult = 1f, MoveMult = 1f, AttackSpeedMult = 1f, TimeLeft;
    }

    public class MatchStats
    {
        public int CardsPlayed, SpellsCast, UnitsDeployed, UnitsLost, UnitsDestroyed, BaronUses, CastleUses;
        public float DamageToCastle, KillValue, EnergySpent;
    }

    public class Unit
    {
        public int Id;
        public int Owner;
        public int Lane;
        public float X;
        public float Hp, MaxHp, Damage, AbilityPower;
        public int Level;
        public CardDef Def;
        public UnitState State = UnitState.Deploying;
        public int TargetId;
        public float AttackCooldown, AbilityTimer, DeployTime, Life;
        public float Shield, ShieldTime, StunTime, SlowTime, SlowFactor = 1f, PoisonDps, PoisonTime;
        public bool RebirthUsed, Expired;

        public bool Alive { get { return Hp > 0f; } }
        public bool Flying { get { return Def.flying; } }
        public int Dir { get { return Owner == 0 ? 1 : -1; } }
    }

    public class PlayerState
    {
        public int Index;
        public BaronDef Baron;
        public CastleDef Castle;
        public DeckState Deck;
        public float Energy;
        public float CastleHp, CastleMaxHp, CastleShield, CastleShieldTime;
        public float BaronCharge;
        public float CastleCooldown;
        public float CastleAttackCooldown;
        public readonly List<LaneModifier> Modifiers = new List<LaneModifier>();
        public Dictionary<string, int> CardLevels = new Dictionary<string, int>();
        public readonly MatchStats Stats = new MatchStats();

        public bool BaronReady { get { return BaronCharge >= Baron.chargeSeconds; } }
        public float BaronProgress { get { return Baron.chargeSeconds <= 0f ? 1f : Math.Min(1f, BaronCharge / Baron.chargeSeconds); } }
        public bool CastleReady { get { return CastleCooldown <= 0f; } }
        public float CastleProgress
        {
            get
            {
                float total = Castle.cooldown > 0f ? Castle.cooldown : 1f;
                return CastleCooldown <= 0f ? 1f : Math.Max(0f, 1f - CastleCooldown / total);
            }
        }
        public float CastleHpPct { get { return CastleMaxHp <= 0f ? 0f : Math.Max(0f, CastleHp) / CastleMaxHp; } }
        public int Level(string cardId)
        {
            int l;
            return CardLevels != null && CardLevels.TryGetValue(cardId, out l) ? Math.Max(1, l) : 1;
        }
    }

    internal class TimedEffect
    {
        public int Player, Lane, WavesLeft;
        public float Interval, Timer, Damage;
    }
}
