class MonsterFactory {
    constructor(game) {
        this.game = game;
    }

    get map() { return this.game.map; }
    get monsters() { return this.game.monsters; }
    get player() { return this.game.player; }
    get floor() { return this.game.floor; }

    spawnInitialMonsters() {
        for (let i = 0; i < 5; i++) {
            this.spawnMonster();
        }
    }

    spawnMonster() {
        if (this.monsters.length >= MAX_MONSTERS) return;

        let rx, ry;
        let attempts = 0;

        do {
            const row = Math.floor(2 + Math.random() * (this.map.rows - 4));
            const col = Math.floor(2 + Math.random() * (this.map.cols - 4));
            rx = col * this.map.tileSize + this.map.tileSize / 2;
            ry = row * this.map.tileSize + this.map.tileSize / 2;
            attempts++;
        } while ((this.map.isSolid(rx, ry) || Math.hypot(rx - this.player.x, ry - this.player.y) < 200) && attempts < 50);

        if (this.map.isSolid(rx, ry) || Math.hypot(rx - this.player.x, ry - this.player.y) < 200) {
            return;
        }

        const mLvl = this.floor * 2 - 1 + Math.floor(Math.random() * 2);
        const rank = Math.random() < 0.10 ? 'champion' : 'normal';
        this.monsters.push(new Monster(rx, ry, mLvl, rank, this.pickMonsterKind()));
    }

    pickMonsterKind() {
        const roll = Math.random();
        if (this.floor >= 2 && roll < 0.18) return 'slime';
        if (this.floor >= 3 && roll < 0.38) return 'zombie';
        if (this.floor >= 4 && roll < 0.55) return 'necromancer';
        return 'skeleton';
    }

    bossTypeForFloor(floor) {
        const stage = Math.floor(floor / BOSS_FLOOR_INTERVAL);
        if (stage <= 1) return 'butcher';
        if (stage === 2) return 'lich';
        return 'overlord';
    }

    spawnBoss() {
        if (this.monsters.some(m => m.rank === 'boss' && m.state !== 'death')) return false;

        const bossPos = this.game.dungeonMap.bossPoint || this.game.dungeonMap.spawnPoint;
        const cx = bossPos.x;
        const cy = bossPos.y;
        const bossType = this.bossTypeForFloor(this.floor);
        const boss = new Monster(cx, cy, this.floor * 2 + 1, 'boss', 'skeleton', bossType);
        this.monsters.push(boss);

        const cries = {
            butcher: '신선한 고기다!',
            lich: '죽음은 끝이 아니다...',
            overlord: '필멸자여, 무릎 꿇어라!'
        };
        sfx.playBossSpawn();
        this.game.floaters.add(this.player.x, this.player.y - 35, `⚠ ${boss.name}이(가) 깨어났습니다!`, '#ff2200');
        this.game.floaters.add(boss.x, boss.y - 30, cries[bossType], '#ff2200');
        return true;
    }
}
