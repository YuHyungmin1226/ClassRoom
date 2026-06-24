class CombatSystem {
    constructor(game) {
        this.game = game;
    }

    get player() { return this.game.player; }
    get floaters() { return this.game.floaters; }
    get monsters() { return this.game.monsters; }
    get projectiles() { return this.game.projectiles; }
    get effects() { return this.game.effects; }

    attackMonster(monster) {
        const p = this.player;
        const dx = monster.x - p.x;
        const dy = monster.y - p.y;
        let angle = Math.atan2(dy, dx);
        if (angle < 0) angle += Math.PI * 2;
        p.direction = Math.round(angle / (Math.PI / 4)) % 8;

        if (p.meleeAttack()) {
            sfx.playSlash();

            const baseDamage = p.atk;
            const isCrit = Math.random() < (p.critChance || 0);
            let damage = baseDamage;
            if (isCrit) {
                damage = Math.floor(damage * (p.critMultiplier || 1));
                this.floaters.add(monster.x, monster.y - 10, 'CRIT!', '#ffdd55');
            }

            const expGained = monster.takeDamage(damage, this.floaters, 'physical');
            if (expGained > 0) {
                this.game.handleMonsterKill(monster);
            }
            this.game.updateUI();
        }
    }

    castSkill(key, tx, ty) {
        const p = this.player;
        if (this.game.currentMap === 'town') {
            this.floaters.add(p.x, p.y - 15, "마을은 안전지대입니다.", "#00ffff");
            return;
        }
        const def = SKILLS[key];
        const lvl = p.effectiveSkillLevel(key);
        if (!def || lvl === 0) {
            this.floaters.add(p.x, p.y - 15, "미습득 스킬!", "#888888");
            return;
        }

        const cost = skillCost(key, lvl);
        if (p.mp < cost) {
            this.floaters.add(p.x, p.y - 15, "마나 부족!", "#55aaff");
            return;
        }
        p.mp -= cost;

        let angle = Math.atan2(ty - p.y, tx - p.x);
        if (angle < 0) angle += Math.PI * 2;
        p.direction = Math.round(angle / (Math.PI / 4)) % 8;

        const damage = Math.floor(p.atk * skillMult(key, lvl));

        if (def.kind === 'projectile') {
            sfx.playFireball();
            this.projectiles.push(new Projectile(
                p.x, p.y, tx, ty, damage, lvl, def.damageType, key
            ));
        } else if (def.kind === 'chain') {
            this.castChainLightning(damage, def, lvl);
        } else if (def.kind === 'melee_aoe') {
            this.castWhirlwind(damage, def);
        }

        p.state = 'attack';
        p.attackTimer = 12;
        this.game.updateUI();
    }

    castChainLightning(baseDmg, def, lvl) {
        const p = this.player;
        const maxJumps = def.jumps + Math.floor((lvl - 1) / 5);
        const hitSet = new Set();
        let from = { x: p.x, y: p.y };
        const segments = [{ x: from.x, y: from.y }];
        let dmg = baseDmg;

        for (let j = 0; j <= maxJumps; j++) {
            const range = j === 0 ? 600 : def.jumpRange;
            let target = null;
            let best = range;
            for (const m of this.monsters) {
                if (m.state === 'death' || hitSet.has(m)) continue;
                const d = Math.hypot(m.x - from.x, m.y - from.y);
                if (d <= best) { best = d; target = m; }
            }
            if (!target) break;

            hitSet.add(target);
            segments.push({ x: target.x, y: target.y });
            const exp = target.takeDamage(Math.floor(dmg), this.floaters, def.damageType);
            if (exp > 0) this.game.handleMonsterKill(target);
            from = { x: target.x, y: target.y };
            dmg *= 0.8;
        }

        if (segments.length > 1) {
            sfx.playFireball();
            this.effects.push({ type: 'lightning', segments, color: def.color, life: 12, maxLife: 12 });
        } else {
            this.floaters.add(p.x, p.y - 15, "대상 없음", def.color);
        }
        this.game.updateUI();
    }

    castWhirlwind(dmg, def) {
        const p = this.player;
        sfx.playSlash();
        for (const m of this.monsters) {
            if (m.state === 'death') continue;
            if (Math.hypot(m.x - p.x, m.y - p.y) <= def.radius + m.radius) {
                let d = dmg;
                if (Math.random() < (p.critChance || 0)) {
                    d = Math.floor(d * (p.critMultiplier || 1));
                    this.floaters.add(m.x, m.y - 10, 'CRIT!', '#ffdd55');
                }
                const exp = m.takeDamage(d, this.floaters, def.damageType);
                if (exp > 0) this.game.handleMonsterKill(m);
            }
        }
        this.effects.push({ type: 'whirlwind', x: p.x, y: p.y, radius: def.radius, color: def.color, life: 14, maxLife: 14 });
        this.game.updateUI();
    }

    damagePlayer(amount) {
        const p = this.player;
        if (p.hp <= 0) return;
        p.hp = Math.max(0, p.hp - amount);
        this.floaters.add(p.x, p.y - 12, `-${amount}`, '#ff3333');
        sfx.playHit();
        this.game.updateUI();

        if (p.hp <= 0) {
            this.floaters.add(p.x, p.y - 15, "사망!", "#ff0000");
            this.game.isGameRunning = false;
            sfx.playMonsterDeath();
            this.game.showGameOver();
        }
    }

    findNearestMonster(maxDist) {
        if (this.game.currentMap !== 'dungeon') return null;
        let nearest = null;
        let nearestDist = maxDist;
        for (const m of this.monsters) {
            if (m.state === 'death') continue;
            const d = Math.hypot(m.x - this.player.x, m.y - this.player.y);
            if (d <= nearestDist) {
                nearestDist = d;
                nearest = m;
            }
        }
        return nearest;
    }
}
