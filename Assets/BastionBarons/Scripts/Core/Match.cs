using System;
using System.Collections.Generic;

namespace BastionBarons.Core
{
    /// <summary>
    /// Simulação autoritativa de uma partida. Não depende da Unity: roda no cliente (modo offline/IA)
    /// e pode rodar no servidor de partidas. Avança em ticks fixos (Step) e só muda de estado via Execute(Command).
    /// Coordenadas: cada rota é uma reta X ∈ [0, laneLength]. Castelo do jogador 0 em X=0, do jogador 1 em X=laneLength.
    /// </summary>
    public class Match
    {
        public const int LaneCount = 3;

        public readonly ContentDatabase Content;
        public readonly BalanceConfig B;
        public readonly PlayerState[] Players = new PlayerState[2];
        public readonly List<Unit> Units = new List<Unit>();
        public readonly float Dt;
        public int Tick { get; private set; }
        public bool IsOver { get; private set; }
        public int Winner { get; private set; }  // 0, 1 ou -1 (empate)
        public MatchEndReason EndReason { get; private set; }
        public bool RecordEvents = true;

        readonly List<SimEvent> events = new List<SimEvent>();
        readonly List<TimedEffect> effects = new List<TimedEffect>();
        readonly Rng rng;
        int nextUnitId = 1;
        bool doubleAnnounced;

        public Match(ContentDatabase content, MatchSetup setup)
        {
            Content = content;
            B = content.Balance;
            Dt = 1f / Math.Max(1, B.tickRate);
            rng = new Rng(setup.Seed);
            Winner = -1;
            for (int i = 0; i < 2; i++)
            {
                var ps = setup.Players[i];
                string err = DeckRules.ValidateComposition(ps.Deck, content);
                if (err != null) throw new ArgumentException("Baralho inválido do jogador " + i + ": " + err);
                var p = new PlayerState { Index = i };
                p.Baron = content.Baron(ps.BaronId);
                p.Castle = content.Castle(ps.CastleId);
                p.Deck = new DeckState(ps.Deck, B.handSize, rng);
                p.CardLevels = ps.CardLevels ?? new Dictionary<string, int>();
                p.Energy = B.startEnergy;
                p.CastleMaxHp = p.CastleHp = p.Castle.hp > 0f ? p.Castle.hp : B.castleHp;
                p.BaronCharge = p.Baron.initialCharge * p.Baron.chargeSeconds;
                p.CastleCooldown = p.Castle.initialCooldown;
                Players[i] = p;
            }
        }

        public float Time { get { return Tick * Dt; } }
        public float TimeRemaining { get { return Math.Max(0f, B.matchSeconds - Time); } }
        public bool IsDoubleEnergy { get { return TimeRemaining <= B.doubleEnergyLastSeconds; } }
        public float L { get { return B.laneLength; } }

        public static int Dir(int owner) { return owner == 0 ? 1 : -1; }
        /// <summary>Linha de frente do castelo do jogador 'owner' (ponto que as tropas inimigas atacam).</summary>
        public float CastleFrontOf(int owner) { return owner == 0 ? B.castleFront : L - B.castleFront; }
        public float SpawnX(int owner) { return owner == 0 ? B.spawnOffset : L - B.spawnOffset; }

        public List<SimEvent> DrainEvents()
        {
            var copy = new List<SimEvent>(events);
            events.Clear();
            return copy;
        }

        void Emit(SimEventType type, int player, int unitId = 0, int targetId = 0, int lane = -1, float x = 0f, float value = 0f, string id = null)
        {
            if (!RecordEvents) return;
            events.Add(new SimEvent { Type = type, Tick = Tick, Player = player, UnitId = unitId, TargetId = targetId, Lane = lane, X = x, Value = value, Id = id });
        }

        public int AliveUnitCount(int owner)
        {
            int n = 0;
            for (int i = 0; i < Units.Count; i++) if (Units[i].Owner == owner && Units[i].Alive) n++;
            return n;
        }

        public Unit FindUnit(int id)
        {
            for (int i = 0; i < Units.Count; i++) if (Units[i].Id == id) return Units[i];
            return null;
        }

        // ------------------------------------------------------------------ comandos

        public CommandResult Validate(Command c)
        {
            if (IsOver) return CommandResult.MatchOver;
            if (c.Player < 0 || c.Player > 1) return CommandResult.InvalidPlayer;
            var p = Players[c.Player];
            bool laneOk = c.Lane >= 0 && c.Lane < LaneCount;
            switch (c.Type)
            {
                case CommandType.PlayCard:
                    if (!laneOk) return CommandResult.InvalidLane;
                    if (c.HandIndex < 0 || c.HandIndex >= p.Deck.Hand.Count) return CommandResult.InvalidHandIndex;
                    string id = p.Deck.Hand[c.HandIndex];
                    if (!string.IsNullOrEmpty(c.CardId) && c.CardId != id) return CommandResult.CardMismatch;
                    var def = Content.Card(id);
                    if (p.Energy + 0.0001f < def.cost) return CommandResult.NotEnoughEnergy;
                    if (!def.IsSpell && AliveUnitCount(c.Player) + def.count > B.maxUnitsPerPlayer) return CommandResult.UnitCap;
                    return CommandResult.Ok;
                case CommandType.Baron:
                    if (!p.BaronReady) return CommandResult.NotReady;
                    if (p.Baron.requiresLane && !laneOk) return CommandResult.InvalidLane;
                    return CommandResult.Ok;
                case CommandType.CastlePower:
                    if (!p.CastleReady) return CommandResult.NotReady;
                    if (p.Castle.requiresLane && !laneOk) return CommandResult.InvalidLane;
                    return CommandResult.Ok;
            }
            return CommandResult.InvalidPlayer;
        }

        public CommandResult Execute(Command c)
        {
            var r = Validate(c);
            if (r != CommandResult.Ok) return r;
            var p = Players[c.Player];
            switch (c.Type)
            {
                case CommandType.PlayCard: PlayCard(p, c.HandIndex, c.Lane); break;
                case CommandType.Baron: UseBaron(p, c.Lane); break;
                case CommandType.CastlePower: UseCastlePower(p, c.Lane); break;
            }
            return r;
        }

        public void Surrender(int player)
        {
            if (IsOver || player < 0 || player > 1) return;
            End(1 - player, MatchEndReason.Surrender);
        }

        /// <summary>Usado pelo servidor quando um jogador não reconecta a tempo.</summary>
        public void ForfeitByDisconnect(int player)
        {
            if (IsOver || player < 0 || player > 1) return;
            End(1 - player, MatchEndReason.Disconnect);
        }

        void PlayCard(PlayerState p, int handIndex, int lane)
        {
            string id = p.Deck.Play(handIndex);
            var def = Content.Card(id);
            p.Energy -= def.cost;
            p.Stats.CardsPlayed++;
            p.Stats.EnergySpent += def.cost;
            Emit(SimEventType.CardPlayed, p.Index, lane: lane, id: id, value: def.cost);
            int level = p.Level(id);
            float mult = Content.LevelMultiplier(level);
            if (def.IsSpell)
            {
                p.Stats.SpellsCast++;
                CastSpell(p, def, lane, mult, level);
            }
            else
            {
                float x = SpawnX(p.Index);
                for (int i = 0; i < def.count; i++)
                {
                    SpawnUnit(p.Index, def, lane, x - Dir(p.Index) * 1.4f * i, level);
                    p.Stats.UnitsDeployed++;
                }
            }
        }

        public Unit SpawnUnit(int owner, CardDef def, int lane, float x, int level)
        {
            if (AliveUnitCount(owner) >= B.maxUnitsPerPlayer) return null;
            float mult = Content.LevelMultiplier(level);
            var u = new Unit
            {
                Id = nextUnitId++,
                Owner = owner,
                Lane = lane,
                X = Clamp(x, B.castleFront, L - B.castleFront),
                Def = def,
                Level = level,
                MaxHp = def.hp * mult,
                Damage = def.damage * mult,
                AbilityPower = def.abilityValue * (def.Ability == UnitAbility.HealAura || def.Ability == UnitAbility.Regen ? mult : 1f),
                AttackCooldown = def.attackInterval * 0.5f,
                DeployTime = B.deployDelay,
                Life = def.lifetime,
            };
            u.Hp = u.MaxHp;
            Units.Add(u);
            Emit(SimEventType.UnitSpawned, owner, u.Id, lane: lane, x: u.X, id: def.id);
            if (def.Ability == UnitAbility.BuildTurret && Content.HasCard(def.summonId))
            {
                var turret = Content.Card(def.summonId);
                for (int i = 0; i < Math.Max(1, def.summonCount); i++)
                    SpawnUnit(owner, turret, lane, u.X + Dir(owner) * (B.turretForwardOffset + i * 2f), level);
            }
            return u;
        }

        // ------------------------------------------------------------------ simulação

        public void Step()
        {
            if (IsOver) return;
            Tick++;
            float dt = Dt;
            if (IsDoubleEnergy && !doubleAnnounced) { doubleAnnounced = true; Emit(SimEventType.DoubleEnergy, -1); }

            for (int i = 0; i < 2; i++)
            {
                var p = Players[i];
                float rate = B.energyPerSecond * (IsDoubleEnergy ? 2f : 1f);
                p.Energy = Math.Min(B.maxEnergy, p.Energy + rate * dt);
                p.BaronCharge = Math.Min(p.Baron.chargeSeconds, p.BaronCharge + dt);
                if (p.CastleCooldown > 0f) p.CastleCooldown -= dt;
                if (p.CastleShieldTime > 0f) { p.CastleShieldTime -= dt; if (p.CastleShieldTime <= 0f) p.CastleShield = 0f; }
                for (int m = p.Modifiers.Count - 1; m >= 0; m--)
                {
                    p.Modifiers[m].TimeLeft -= dt;
                    if (p.Modifiers[m].TimeLeft <= 0f) p.Modifiers.RemoveAt(m);
                }
            }

            for (int e = effects.Count - 1; e >= 0; e--)
            {
                var fx = effects[e];
                fx.Timer -= dt;
                if (fx.Timer <= 0f)
                {
                    fx.Timer += fx.Interval;
                    fx.WavesLeft--;
                    DamageEnemiesInLane(fx.Player, fx.Lane, fx.Damage, -1f, 0f);
                    Emit(SimEventType.SpellCast, fx.Player, lane: fx.Lane, id: "elven_rain_wave", x: L * 0.5f);
                }
                if (fx.WavesLeft <= 0) effects.RemoveAt(e);
            }

            int count = Units.Count; // unidades criadas neste tick só agem no próximo
            for (int i = 0; i < count; i++) UpdateUnit(Units[i], dt);

            for (int i = 0; i < 2; i++) CastleDefense(Players[i], dt);

            Units.RemoveAll(u => !u.Alive);
            CheckEnd();
        }

        void UpdateUnit(Unit u, float dt)
        {
            if (!u.Alive) return;
            if (u.Def.lifetime > 0f)
            {
                u.Life -= dt;
                if (u.Life <= 0f) { u.Expired = true; u.Hp = 0f; u.State = UnitState.Dead; Emit(SimEventType.UnitDied, u.Owner, u.Id, lane: u.Lane, x: u.X); return; }
            }
            if (u.ShieldTime > 0f) { u.ShieldTime -= dt; if (u.ShieldTime <= 0f) u.Shield = 0f; }
            if (u.PoisonTime > 0f)
            {
                u.PoisonTime -= dt;
                ApplyDamage(u, u.PoisonDps * dt, 1 - u.Owner);
                if (!u.Alive) return;
            }
            if (u.SlowTime > 0f) { u.SlowTime -= dt; if (u.SlowTime <= 0f) u.SlowFactor = 1f; }
            if (u.Def.Ability == UnitAbility.Regen && u.Hp < u.MaxHp) u.Hp = Math.Min(u.MaxHp, u.Hp + u.AbilityPower * dt);

            if (u.DeployTime > 0f) { u.DeployTime -= dt; u.State = UnitState.Deploying; return; }
            if (u.StunTime > 0f) { u.StunTime -= dt; u.State = UnitState.Stunned; return; }

            float dmgMult, moveMult, atkMult;
            GetModifiers(u, out dmgMult, out moveMult, out atkMult);
            moveMult *= u.SlowFactor;
            atkMult *= u.SlowFactor;

            if ((u.Def.Ability == UnitAbility.HealAura || u.Def.Ability == UnitAbility.Summon) && u.Def.abilityInterval > 0f)
            {
                u.AbilityTimer += dt;
                if (u.AbilityTimer >= u.Def.abilityInterval)
                {
                    u.AbilityTimer -= u.Def.abilityInterval;
                    AbilityPulse(u);
                }
            }

            u.AttackCooldown -= dt * atkMult;
            var target = FindTarget(u);
            if (target != null)
            {
                u.State = UnitState.Attacking;
                u.TargetId = target.Id;
                if (u.AttackCooldown <= 0f)
                {
                    u.AttackCooldown += u.Def.attackInterval;
                    if (u.AttackCooldown < 0f) u.AttackCooldown = 0f;
                    Attack(u, target, dmgMult);
                }
                return;
            }

            float front = CastleFrontOf(1 - u.Owner);
            float distToCastle = (front - u.X) * u.Dir;
            if (distToCastle <= u.Def.range + 0.01f)
            {
                u.State = UnitState.AttackingCastle;
                u.TargetId = 0;
                if (u.AttackCooldown <= 0f)
                {
                    u.AttackCooldown += u.Def.attackInterval;
                    if (u.AttackCooldown < 0f) u.AttackCooldown = 0f;
                    float dmg = u.Damage * dmgMult;
                    Emit(SimEventType.UnitAttack, u.Owner, u.Id, 0, u.Lane, front, dmg, u.Def.id);
                    DamageCastle(1 - u.Owner, dmg, u.Owner);
                }
                return;
            }

            if (u.AttackCooldown < 0f) u.AttackCooldown = 0f;
            if (u.Def.moveSpeed <= 0f) { u.State = UnitState.Idle; return; }
            u.State = UnitState.Moving;
            float step = u.Def.moveSpeed * moveMult * dt;
            float maxStep = Math.Max(0f, distToCastle - u.Def.range);
            u.X += u.Dir * Math.Min(step, maxStep);
        }

        void GetModifiers(Unit u, out float dmg, out float move, out float atk)
        {
            dmg = 1f; move = 1f; atk = 1f;
            var mods = Players[u.Owner].Modifiers;
            for (int i = 0; i < mods.Count; i++)
            {
                var m = mods[i];
                if (m.Lane != -1 && m.Lane != u.Lane) continue;
                dmg *= m.DamageMult; move *= m.MoveMult; atk *= m.AttackSpeedMult;
            }
        }

        static bool CanTarget(CardDef attacker, Unit target)
        {
            if (attacker.Targets == TargetType.CastleOnly) return false;
            if (target.Flying && attacker.Targets == TargetType.Ground) return false;
            return true;
        }

        Unit FindTarget(Unit u)
        {
            if (u.Def.Targets == TargetType.CastleOnly) return null;
            Unit best = null;
            float bestD = float.MaxValue;
            for (int i = 0; i < Units.Count; i++)
            {
                var e = Units[i];
                if (!e.Alive || e.Owner == u.Owner || e.Lane != u.Lane) continue;
                if (!CanTarget(u.Def, e)) continue;
                float d = Math.Abs(e.X - u.X);
                if (d <= u.Def.range + 0.01f && d < bestD) { best = e; bestD = d; }
            }
            return best;
        }

        void Attack(Unit u, Unit target, float dmgMult)
        {
            float dmg = u.Damage * dmgMult;
            Emit(SimEventType.UnitAttack, u.Owner, u.Id, target.Id, u.Lane, target.X, dmg, u.Def.id);
            if (u.Def.Ability == UnitAbility.Splash && u.Def.abilityRadius > 0f)
            {
                float cx = target.X;
                for (int i = 0; i < Units.Count; i++)
                {
                    var e = Units[i];
                    if (!e.Alive || e.Owner == u.Owner || e.Lane != u.Lane || !CanTarget(u.Def, e)) continue;
                    if (Math.Abs(e.X - cx) <= u.Def.abilityRadius) { ApplyDamage(e, dmg, u.Owner); }
                }
            }
            else
            {
                ApplyDamage(target, dmg, u.Owner);
                if (u.Def.Ability == UnitAbility.SlowOnHit && target.Alive)
                {
                    target.SlowTime = Math.Max(target.SlowTime, u.Def.abilityDuration);
                    target.SlowFactor = Math.Min(target.SlowFactor, 1f - u.Def.abilityValue);
                }
            }
        }

        void AbilityPulse(Unit u)
        {
            if (u.Def.Ability == UnitAbility.HealAura)
            {
                for (int i = 0; i < Units.Count; i++)
                {
                    var a = Units[i];
                    if (!a.Alive || a.Owner != u.Owner || a.Lane != u.Lane) continue;
                    if (Math.Abs(a.X - u.X) > u.Def.abilityRadius || a.Hp >= a.MaxHp) continue;
                    a.Hp = Math.Min(a.MaxHp, a.Hp + u.AbilityPower);
                    Emit(SimEventType.Heal, u.Owner, a.Id, lane: a.Lane, x: a.X, value: u.AbilityPower);
                }
            }
            else if (u.Def.Ability == UnitAbility.Summon && Content.HasCard(u.Def.summonId))
            {
                var s = Content.Card(u.Def.summonId);
                for (int i = 0; i < Math.Max(1, u.Def.summonCount); i++)
                    SpawnUnit(u.Owner, s, u.Lane, u.X + u.Dir * (1f + i), u.Level);
            }
        }

        float AuraReduction(Unit t)
        {
            float best = 0f;
            for (int i = 0; i < Units.Count; i++)
            {
                var a = Units[i];
                if (!a.Alive || a.Owner != t.Owner || a.Lane != t.Lane || a.Def.Ability != UnitAbility.ProtectAura) continue;
                if (Math.Abs(a.X - t.X) <= a.Def.abilityRadius) best = Math.Max(best, a.Def.abilityValue);
            }
            return Math.Min(0.9f, best);
        }

        public void ApplyDamage(Unit t, float amount, int sourceOwner)
        {
            if (!t.Alive || amount <= 0f) return;
            amount *= 1f - AuraReduction(t);
            if (t.Shield > 0f)
            {
                float absorbed = Math.Min(t.Shield, amount);
                t.Shield -= absorbed;
                amount -= absorbed;
            }
            t.Hp -= amount;
            if (t.Hp <= 0f) OnUnitKilled(t, sourceOwner);
        }

        void OnUnitKilled(Unit t, int sourceOwner)
        {
            if (t.Def.Ability == UnitAbility.Rebirth && !t.RebirthUsed)
            {
                t.RebirthUsed = true;
                t.Hp = t.MaxHp * Math.Max(0.1f, t.Def.abilityValue);
                t.DeployTime = 1f;
                t.PoisonTime = 0f; t.StunTime = 0f;
                Emit(SimEventType.UnitRevived, t.Owner, t.Id, lane: t.Lane, x: t.X);
                return;
            }
            t.Hp = 0f;
            t.State = UnitState.Dead;
            if (sourceOwner >= 0 && sourceOwner <= 1 && sourceOwner != t.Owner)
            {
                Players[sourceOwner].Stats.UnitsDestroyed++;
                Players[sourceOwner].Stats.KillValue += t.Def.token ? 0.5f : t.Def.cost / (float)t.Def.count;
            }
            Players[t.Owner].Stats.UnitsLost++;
            Emit(SimEventType.UnitDied, t.Owner, t.Id, lane: t.Lane, x: t.X);
        }

        public void DamageCastle(int victim, float amount, int source)
        {
            var p = Players[victim];
            if (amount <= 0f || p.CastleHp <= 0f) return;
            if (p.CastleShield > 0f)
            {
                float a = Math.Min(p.CastleShield, amount);
                p.CastleShield -= a;
                amount -= a;
            }
            if (amount <= 0f) return;
            p.CastleHp -= amount;
            if (source >= 0 && source <= 1) Players[source].Stats.DamageToCastle += amount;
            Emit(SimEventType.CastleDamaged, victim, value: amount);
        }

        void CastleDefense(PlayerState p, float dt)
        {
            if (B.castleAttackDamage <= 0f || p.CastleHp <= 0f) return;
            p.CastleAttackCooldown -= dt;
            if (p.CastleAttackCooldown > 0f) return;
            float front = CastleFrontOf(p.Index);
            Unit best = null;
            float bestD = float.MaxValue;
            for (int i = 0; i < Units.Count; i++)
            {
                var e = Units[i];
                if (!e.Alive || e.Owner == p.Index) continue;
                float d = Math.Abs(e.X - front);
                if (d <= B.castleAttackRange && d < bestD) { best = e; bestD = d; }
            }
            if (best == null) { p.CastleAttackCooldown = 0f; return; }
            p.CastleAttackCooldown = B.castleAttackInterval;
            Emit(SimEventType.CastleAttack, p.Index, 0, best.Id, best.Lane, best.X, B.castleAttackDamage);
            ApplyDamage(best, B.castleAttackDamage, p.Index);
        }

        // ------------------------------------------------------------------ feitiços e poderes

        /// <summary>Posição da unidade mais avançada de 'owner' na rota (a mais próxima do castelo inimigo).</summary>
        public bool FrontUnit(int owner, int lane, out float x)
        {
            bool found = false;
            float best = float.MinValue;
            x = 0f;
            for (int i = 0; i < Units.Count; i++)
            {
                var u = Units[i];
                if (!u.Alive || u.Owner != owner || u.Lane != lane) continue;
                float adv = u.X * Dir(owner);
                if (adv > best) { best = adv; x = u.X; found = true; }
            }
            return found;
        }

        int DamageEnemiesInLane(int caster, int lane, float dmg, float center, float radius)
        {
            int hits = 0;
            for (int i = 0; i < Units.Count; i++)
            {
                var e = Units[i];
                if (!e.Alive || e.Owner == caster || e.Lane != lane) continue;
                if (radius > 0f && Math.Abs(e.X - center) > radius) continue;
                ApplyDamage(e, dmg, caster);
                hits++;
            }
            return hits;
        }

        void CastSpell(PlayerState p, CardDef def, int lane, float mult, int level)
        {
            int enemy = 1 - p.Index;
            float value = def.spellValue * mult;
            float r = def.spellRadius;
            float center;
            switch (def.Spell)
            {
                case SpellEffect.Damage:
                {
                    if (!FrontUnit(enemy, lane, out center)) center = CastleFrontOf(enemy);
                    DamageEnemiesInLane(p.Index, lane, value, center, r);
                    if (def.castleDamageRatio > 0f && (r <= 0f || Math.Abs(CastleFrontOf(enemy) - center) <= r + 2f))
                        DamageCastle(enemy, value * def.castleDamageRatio, p.Index);
                    break;
                }
                case SpellEffect.Stun:
                case SpellEffect.Poison:
                {
                    if (!FrontUnit(enemy, lane, out center)) center = CastleFrontOf(enemy);
                    for (int i = 0; i < Units.Count; i++)
                    {
                        var e = Units[i];
                        if (!e.Alive || e.Owner == p.Index || e.Lane != lane) continue;
                        if (r > 0f && Math.Abs(e.X - center) > r) continue;
                        if (def.Spell == SpellEffect.Stun) e.StunTime = Math.Max(e.StunTime, def.spellDuration);
                        else { e.PoisonDps = Math.Max(e.PoisonTime > 0f ? e.PoisonDps : 0f, value); e.PoisonTime = def.spellDuration; }
                    }
                    break;
                }
                case SpellEffect.Heal:
                case SpellEffect.Shield:
                {
                    if (!FrontUnit(p.Index, lane, out center)) center = SpawnX(p.Index);
                    for (int i = 0; i < Units.Count; i++)
                    {
                        var a = Units[i];
                        if (!a.Alive || a.Owner != p.Index || a.Lane != lane) continue;
                        if (r > 0f && Math.Abs(a.X - center) > r) continue;
                        if (def.Spell == SpellEffect.Heal)
                        {
                            a.Hp = Math.Min(a.MaxHp, a.Hp + value);
                            Emit(SimEventType.Heal, p.Index, a.Id, lane: lane, x: a.X, value: value);
                        }
                        else { a.Shield = Math.Max(a.Shield, value); a.ShieldTime = def.spellDuration; }
                    }
                    break;
                }
                case SpellEffect.StrongestTargets:
                {
                    var list = new List<Unit>();
                    for (int i = 0; i < Units.Count; i++)
                    {
                        var e = Units[i];
                        if (e.Alive && e.Owner != p.Index && e.Lane == lane) list.Add(e);
                    }
                    list.Sort((a, b) => b.Hp.CompareTo(a.Hp));
                    int hits = Math.Max(1, def.spellHits);
                    for (int i = 0; i < list.Count && i < hits; i++) ApplyDamage(list[i], value, p.Index);
                    center = list.Count > 0 ? list[0].X : CastleFrontOf(enemy);
                    if (list.Count < hits && def.castleDamageRatio > 0f) DamageCastle(enemy, value * def.castleDamageRatio, p.Index);
                    break;
                }
                case SpellEffect.Summon:
                {
                    center = SpawnX(p.Index);
                    if (Content.HasCard(def.summonId))
                    {
                        var s = Content.Card(def.summonId);
                        for (int i = 0; i < Math.Max(1, def.summonCount); i++)
                            SpawnUnit(p.Index, s, lane, center - Dir(p.Index) * 1.2f * i, level);
                    }
                    break;
                }
                default:
                    center = L * 0.5f;
                    break;
            }
            Emit(SimEventType.SpellCast, p.Index, lane: lane, x: center, id: def.id, value: r);
        }

        void UseBaron(PlayerState p, int lane)
        {
            var b = p.Baron;
            int l = Math.Max(0, Math.Min(LaneCount - 1, lane));
            switch (b.Ability)
            {
                case BaronAbility.RoyalCommand:
                    p.Modifiers.Add(new LaneModifier { Lane = -1, DamageMult = 1f + b.value, MoveMult = 1f + b.value2, AttackSpeedMult = 1f, TimeLeft = b.duration });
                    break;
                case BaronAbility.OrcFury:
                    p.Modifiers.Add(new LaneModifier { Lane = l, DamageMult = 1f + b.value, MoveMult = 1f, AttackSpeedMult = 1f + b.value2, TimeLeft = b.duration });
                    break;
                case BaronAbility.ElvenRain:
                    effects.Add(new TimedEffect { Player = p.Index, Lane = l, WavesLeft = Math.Max(1, b.count), Interval = Math.Max(0.05f, b.interval), Timer = 0f, Damage = b.value });
                    break;
                case BaronAbility.ArmyOfDead:
                    if (Content.HasCard(b.summonId))
                    {
                        var s = Content.Card(b.summonId);
                        for (int i = 0; i < Math.Max(1, b.count); i++)
                            SpawnUnit(p.Index, s, l, SpawnX(p.Index) - Dir(p.Index) * 1.2f * i, 1);
                    }
                    break;
                case BaronAbility.ArcaneStorm:
                    DamageEnemiesInLane(p.Index, l, b.value, -1f, 0f);
                    break;
            }
            p.BaronCharge = 0f;
            p.Stats.BaronUses++;
            Emit(SimEventType.BaronUsed, p.Index, lane: b.requiresLane ? l : -1, id: b.id);
        }

        void UseCastlePower(PlayerState p, int lane)
        {
            var c = p.Castle;
            int l = Math.Max(0, Math.Min(LaneCount - 1, lane));
            switch (c.Ability)
            {
                case CastleAbility.ImperialShield:
                    p.CastleShield = c.value;
                    p.CastleShieldTime = c.duration;
                    break;
                case CastleAbility.DragonBreath:
                    DamageEnemiesInLane(p.Index, l, c.value, -1f, 0f);
                    break;
                case CastleAbility.IceStorm:
                    Players[1 - p.Index].Modifiers.Add(new LaneModifier { Lane = l, DamageMult = 1f, MoveMult = 1f - c.value, AttackSpeedMult = 1f - c.value2, TimeLeft = c.duration });
                    break;
            }
            p.CastleCooldown = c.cooldown;
            p.Stats.CastleUses++;
            Emit(SimEventType.CastlePowerUsed, p.Index, lane: c.requiresLane ? l : -1, id: c.id);
        }

        // ------------------------------------------------------------------ fim de partida

        void CheckEnd()
        {
            bool d0 = Players[0].CastleHp <= 0f, d1 = Players[1].CastleHp <= 0f;
            if (d0 || d1)
            {
                if (d0 && d1) End(-1, MatchEndReason.Draw);
                else End(d0 ? 1 : 0, MatchEndReason.CastleDestroyed);
                return;
            }
            if (Time >= B.matchSeconds) DecideByTimeout();
        }

        /// <summary>
        /// Desempate ao fim do tempo: 1) maior % de vida restante no próprio castelo;
        /// 2) maior valor de tropas inimigas destruídas (custo de energia); 3) empate.
        /// </summary>
        void DecideByTimeout()
        {
            float a = Players[0].CastleHpPct, b = Players[1].CastleHpPct;
            if (Math.Abs(a - b) > 0.0001f) { End(a > b ? 0 : 1, MatchEndReason.TimeoutHp); return; }
            float ka = Players[0].Stats.KillValue, kb = Players[1].Stats.KillValue;
            if (Math.Abs(ka - kb) > 0.0001f) { End(ka > kb ? 0 : 1, MatchEndReason.TimeoutKills); return; }
            End(-1, MatchEndReason.Draw);
        }

        void End(int winner, MatchEndReason reason)
        {
            if (IsOver) return;
            IsOver = true;
            Winner = winner;
            EndReason = reason;
            Emit(SimEventType.MatchEnded, winner, id: reason.ToString());
        }

        static float Clamp(float v, float min, float max) { return v < min ? min : (v > max ? max : v); }
    }
}
